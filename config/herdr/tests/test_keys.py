import errno
import os
from pathlib import Path
import pty
import shlex
import subprocess
import tempfile
import tomllib
import unittest


HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[1]
LAUNCHER = HERE / "kitty-herdr"
MARK = b"\x1b]1337;SetUserVar=herdr=MQ==\x07"
CLEAR = b"\x1b]1337;SetUserVar=herdr\x07"


class KeyConfigTests(unittest.TestCase):
    def test_herdr_direct_keys(self):
        config = tomllib.loads((HERE / "config.toml").read_text())
        expected = {
            "new_tab": "cmd+t", "close_pane": "cmd+w",
            "close_tab": "cmd+shift+w", "rename_tab": "cmd+shift+i",
            "switch_tab": "cmd+1..9",
            "switch_workspace": "cmd+alt+1..9", "focus_agent": "ctrl+alt+1..9",
            "split_vertical": "cmd+d", "split_horizontal": "cmd+shift+d",
            "zoom": "cmd+alt+f", "toggle_sidebar": "cmd+alt+b",
            "goto": "cmd+alt+g", "edit_scrollback": "cmd+alt+e",
            "new_workspace": "cmd+alt+n", "new_worktree": "cmd+alt+shift+n",
            "close_workspace": "cmd+alt+w", "help": "cmd+/",
        }
        for direction in ("left", "right", "up", "down"):
            expected[f"focus_pane_{direction}"] = f"cmd+alt+{direction}"
            expected[f"resize_pane_{direction}"] = f"cmd+ctrl+{direction}"
        for action, key in expected.items():
            with self.subTest(action=action):
                bindings = config["keys"][action]
                # Herdr's help lists bindings in config order; the direct chord leads.
                self.assertEqual((bindings if isinstance(bindings, list) else [bindings])[0], key)
        self.assertTrue(any(
            command["key"] == "cmd+alt+l" and command["command"] == "lazygit"
            for command in config["keys"]["command"]
        ))

    def test_kitty_scopes_overrides_and_normalizes_resize_and_agent_keys(self):
        text = (ROOT / "config/kitty/kitty.conf").read_text()
        maps = [shlex.split(line) for line in text.splitlines() if line.startswith("map ")]
        scoped = {parts[3]: parts[4:] for parts in maps
                  if parts[1:3] == ["--when-focus-on", "var:herdr=1"]}
        passthrough = ["cmd+t", "cmd+w", "cmd+shift+w", "cmd+shift+i", "cmd+d", "cmd+shift+d", "cmd+alt+f"]
        passthrough += [f"cmd+{n}" for n in range(1, 10)]
        passthrough += [f"cmd+opt+{d}" for d in ("left", "right", "up", "down")]
        # kitty's own workspace keys must not shadow Herdr's
        passthrough += ["cmd+alt+n", "cmd+alt+shift+n", "cmd+alt+w", "cmd+alt+b", "cmd+/", "cmd+alt+l", "ctrl+alt+[", "ctrl+alt+]"]
        passthrough += [f"cmd+alt+{n}" for n in range(1, 10)]
        for key in passthrough:
            with self.subTest(key=key):
                self.assertEqual(scoped[key], [])
        normalized = [f"cmd+ctrl+{d}" for d in ("left", "right", "up", "down")]
        normalized += [f"ctrl+alt+{n}" for n in range(1, 10)]
        for key in normalized:
            with self.subTest(key=key):
                self.assertEqual(scoped[key], ["send_key", key])

    def test_installer_and_aerospace_use_launcher(self):
        self.assertIn('link "$DOT/config/herdr/kitty-herdr" "$HOME/bin/herdr"',
                      (ROOT / "install.sh").read_text())
        config = tomllib.loads((ROOT / "config/aerospace/aerospace.toml").read_text())
        bindings = config["mode"]["main"]["binding"]
        self.assertIn("$HOME/bin/herdr", bindings["ctrl-alt-enter"])


class LauncherTests(unittest.TestCase):
    def invoke(self, *, tty=False, nested=False, kitty=True, status=0, child_signal=False, args=()):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shim = root / "shim"
            real = root / "real"
            shim.mkdir()
            real.mkdir()
            (shim / "herdr").symlink_to(LAUNCHER)
            binary = real / "herdr"
            binary.write_text('#!/bin/sh\nprintf "child:%s\\n" "$@"\n' +
                              ("kill -TERM $$\n" if child_signal else f"exit {status}\n"))
            binary.chmod(0o755)
            env = {"PATH": f"{shim}:{real}", "HOME": directory}
            if kitty:
                env["KITTY_WINDOW_ID"] = "42"
            if nested:
                env["HERDR_PANE_ID"] = "w1:p1"
            if not tty:
                return subprocess.run([str(shim / "herdr"), *args], env=env, capture_output=True)
            master, slave = pty.openpty()
            try:
                process = subprocess.Popen([str(shim / "herdr"), *args], env=env,
                                           stdout=slave, stderr=subprocess.PIPE)
                os.close(slave)
                slave = -1
                output = bytearray()
                while True:
                    try:
                        chunk = os.read(master, 4096)
                    except OSError as error:
                        if error.errno == errno.EIO:
                            break
                        raise
                    if not chunk:
                        break
                    output.extend(chunk)
                _, stderr = process.communicate(timeout=5)
                return subprocess.CompletedProcess(process.args, process.returncode, bytes(output), stderr)
            finally:
                os.close(master)
                if slave != -1:
                    os.close(slave)

    def test_piped_cli_output_has_no_markers_and_preserves_arguments(self):
        result = self.invoke(args=("--session", "a b", "workspace", "list"), status=7)
        self.assertEqual(result.stdout, b"child:--session\nchild:a b\nchild:workspace\nchild:list\n")
        self.assertEqual(result.returncode, 7)

    def test_tui_marks_then_clears_on_exit(self):
        result = self.invoke(tty=True, args=("--session", "test"))
        self.assertEqual(result.returncode, 0)
        self.assertTrue(result.stdout.startswith(MARK), result.stdout)
        self.assertTrue(result.stdout.endswith(CLEAR), result.stdout)

    def test_tui_clears_after_failure(self):
        result = self.invoke(tty=True, status=7)
        self.assertEqual(result.returncode, 7)
        self.assertTrue(result.stdout.endswith(CLEAR), result.stdout)

    def test_tui_clears_after_client_termination(self):
        result = self.invoke(tty=True, child_signal=True)
        self.assertEqual(result.returncode, 143)
        self.assertTrue(result.stdout.endswith(CLEAR), result.stdout)

    def test_nested_herdr_does_not_change_outer_marker(self):
        result = self.invoke(tty=True, nested=True)
        self.assertEqual(result.returncode, 0)
        self.assertNotIn(b"SetUserVar", result.stdout)

    def test_other_terminals_do_not_get_kitty_markers(self):
        result = self.invoke(tty=True, kitty=False)
        self.assertEqual(result.returncode, 0)
        self.assertNotIn(b"SetUserVar", result.stdout)

    def test_missing_binary_fails_without_recursing(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "herdr").symlink_to(LAUNCHER)
            result = subprocess.run([str(LAUNCHER)], env={"PATH": directory}, capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 127)
            self.assertIn(b"not found", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
