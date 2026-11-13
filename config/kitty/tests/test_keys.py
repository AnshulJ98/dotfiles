"""Kitty's keymap and launcher."""
from pathlib import Path
import shlex
import os
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[3]


class KeyConfigTests(unittest.TestCase):
    def test_plain_keys(self):
        maps = [shlex.split(line) for line in (ROOT / "config/kitty/kitty.conf").read_text().splitlines()
                if line.startswith("map ")]
        plain = {parts[1]: parts[2:] for parts in maps if parts[1] != "--when-focus-on"}
        self.assertEqual(plain["cmd+t"], ["kitten", "zdo.py", "tab", "here"])
        self.assertEqual(plain["cmd+w"], ["close_window"])
        self.assertEqual(plain["cmd+shift+w"], ["close_tab"])
        self.assertEqual(plain["cmd+0"], ["change_font_size", "all", "0"])
        self.assertEqual(plain["cmd+alt+l"], [
            "launch", "--type=tab", "--tab-title", "hunk", "--add-to-session=!",
            "--cwd=current", "/opt/homebrew/bin/hunk", "diff",
        ])

    def test_intent_maps(self):
        lines = (ROOT / "config/kitty/kitty.conf").read_text().splitlines()
        expected = [
            *(f"map cmd+alt+{n} kitten zdo.py switch {n}" for n in range(1, 10)),
            "map ctrl+alt+[ kitten zdo.py prev", "map ctrl+alt+] kitten zdo.py next",
            *(f"map ctrl+alt+{n} kitten zdo.py agent {n}" for n in range(1, 10)),
            "map cmd+t kitten zdo.py tab here", "map cmd+shift+t kitten zdo.py tab",
            "map cmd+alt+n kitten zdo.py new", "map cmd+alt+shift+n kitten zdo.py new ask",
            "map cmd+shift+n kitten zdo.py new window",
        ]
        self.assertEqual(len(expected), 25)
        for mapping in expected:
            self.assertEqual(lines.count(mapping), 1, mapping)
        for line in lines:
            if line.startswith("map "):
                self.assertFalse(any("bin/zws " + word in line for word in ('switch', 'next', 'prev', 'agent', 'new')))
        self.assertFalse([line for line in lines if "--when-focus-on" in line])

    def test_zws_retired_switch_is_usage_error_and_shell_syntax_is_valid(self):
        script = ROOT / "config/kitty/bin/zws"
        syntax = subprocess.run(['bash', '-n', str(script)], capture_output=True, text=True, timeout=10)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([str(script), 'switch', '1'], capture_output=True, text=True,
                                    env=dict(os.environ, ZWS_DIR=directory), timeout=10)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(result.stdout, '')
        self.assertIn('zws new [--ask | --window] CWD', result.stderr)
        self.assertIn('home if absent', result.stderr)
        self.assertNotIn('zws switch', result.stderr)
        self.assertNotIn('set -u', result.stderr)

    def test_rename_and_scrollback(self):
        maps = [shlex.split(line) for line in (ROOT / "config/kitty/kitty.conf").read_text().splitlines()
                if line.startswith("map ")]
        plain = {parts[1]: parts[2:] for parts in maps if parts[1] != "--when-focus-on"}
        self.assertEqual(plain.get("cmd+shift+i"), ["set_tab_title"])
        self.assertEqual(plain.get("cmd+alt+e"), ["kitty_scrollback_nvim"])
        self.assertEqual(plain["cmd+alt+e"], plain["kitty_mod+h"])

    def test_keys_popup_lists_kitty_command_keys(self):
        maps = [line.split(None, 2) for line in (ROOT / "config/kitty/kitty.conf").read_text().splitlines()
                if line.startswith("map ") and "--when-focus-on" not in line]
        mapped = {m[1].replace("kitty_mod", "ctrl+shift") for m in maps
                  if len(m) == 3 and not m[2].startswith("send_text")}
        listed = set()
        for line in (ROOT / "config/kitty/keys.txt").read_text().splitlines():
            key, _, where = (line.split("\t") + ["", ""])[:3]
            if not line or line.startswith("#") or where:
                continue  # a heading, or a key bound outside kitty.conf
            head, _, last = key.rpartition("+")
            lasts = [str(n) for n in range(1, 10)] if last == "1..9" else last.split("|")
            listed |= {f"{head}+{name}" for name in lasts}
        self.assertEqual(listed, mapped)

    def test_aerospace_workspace_and_plain_launchers(self):
        config = tomllib.loads((ROOT / "config/aerospace/aerospace.toml").read_text())
        bindings = config["mode"]["main"]["binding"]
        self.assertEqual(bindings["cmd-enter"], "exec-and-forget $HOME/.config/kitty/bin/kmain")
        self.assertEqual(bindings["cmd-alt-enter"], "exec-and-forget open -n -a kitty")
        # kitty puts its own folder on its children's PATH, and macOS finds the app by name.
        for name in ("zshell", "zside"):
            self.assertNotIn("Contents/MacOS", (ROOT / "config/kitty/bin" / name).read_text(), name)
        self.assertIn('"open", "-n", "-a", "kitty"', (ROOT / "config/kitty/bin/kmain").read_text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
