"""Session-safety regressions: all external/session boundaries live in a temp directory."""
import concurrent.futures
import json
import os
from pathlib import Path
import pty
import select
import shutil
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from urllib.parse import quote

BIN = Path(__file__).resolve().parents[1] / "bin"
FAKE = r"""
import json, os, pathlib, signal, subprocess, sys, time
root = pathlib.Path(os.environ["FAKE_ROOT"])
cmd, args = pathlib.Path(sys.argv[0]).name, sys.argv[1:]
with (root / "calls").open("a") as log:
    log.write(json.dumps([cmd, args]) + "\n")
mode = os.environ.get("MODE", "")
if cmd == "timeout":
    assert args[0] == "3"
    try: sys.exit(subprocess.run(args[1:], timeout=.2).returncode)
    except subprocess.TimeoutExpired: sys.exit(124)
if cmd == "zmx":
    if mode == "hang": time.sleep(30)
    if mode == "fail": sys.exit(1)
    if args == ["ls"]: print("name=old-1\tpid=123\tclients=0")
    if args == ["ls", "--short"]: print(os.environ.get("SESSIONS", "old-1"))
    sys.exit(0)
if cmd == "lsof":
    if mode == "lsof-hang": time.sleep(30)
    print("n" + str(root / "live cwd"))
if cmd == "kitten":
    if "--to" in args:
        ready = root / "ready"
        if ready.exists() and time.time() >= float(ready.read_text()):
            print('[{"platform_window_id": 42}]')
        sys.exit(0)
    if "ls" in args:
        print(json.dumps([{"is_active": True, "tabs": [{"is_active": True, "windows": [{
            "is_active": True, "cwd": str(root / "cwd space"), "session_name": "",
            "user_vars": {"holder": os.environ.get("HOLDER", "")}}]}]}]))
    if "goto_session" in args:
        assert pathlib.Path(args[-1]).read_text().endswith("\n")
if cmd == "open":
    (root / "ready").write_text(str(time.time() + .3))
if cmd == "aerospace" and mode == "focus-fail": sys.exit(1)
if cmd == "pgrep": sys.exit(0 if mode == "starting" else 1)
if cmd == "fzf":
    view = pathlib.Path(os.environ["ZPICK_VIEW"])
    for suffix in ("", ".ask", ".pos"): pathlib.Path(str(view) + suffix).write_text("all")
    subprocess.run([str(root / "zpick"), "--list"], check=True)
    assert view.exists()  # helpers must not remove the interactive owner's scratch
    (root / "view").write_text(str(view))
    if mode == "interrupt": time.sleep(30)
    sys.exit(1)
"""


class ScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, HOME=str(self.root), TMPDIR=str(self.root),
                        ZWS_DIR=str(self.root / "workspaces"), FAKE_ROOT=str(self.root),
                        PATH=str(self.root) + ":" + os.environ["PATH"])
        for cmd in ("kitten", "zmx", "timeout", "lsof", "open", "pgrep", "aerospace",
                    "fzf", "plain-shell", "find", "zpick-rows"):
            path = self.root / cmd
            path.write_text("#!" + sys.executable + "\n" + FAKE)
            path.chmod(0o700)
        for name in ("zshell", "kmain", "zws", "zpick"):
            source = (BIN / name).read_text()
            # Preserve logic; redirect fixed production paths and PATH additions to fakes.
            source = source.replace("/opt/homebrew/bin", str(self.root))
            source = source.replace("/Applications/kitty.app/Contents/MacOS", str(self.root))
            source = source.replace("/bin/zsh", str(self.root / "plain-shell"))
            source = source.replace("/tmp/kitty-main", str(self.root / "socket"))
            if name == "zws":
                for probe in ("zmx", "lsof"):
                    source = source.replace('["' + probe + '",', '["' + str(self.root / probe) + '",')
            path = self.root / name
            path.write_text(source)
            path.chmod(0o700)

    def run_script(self, name, *args, **env):
        return subprocess.run([str(self.root / name), *args], cwd=self.root,
                              env=dict(self.env, **env), capture_output=True, text=True, timeout=12)

    def calls(self, command):
        return [args for cmd, args in map(json.loads, (self.root / "calls").read_text().splitlines())
                if cmd == command]

    def pane_start(self, reply, **env):
        # Only these logging fakes are reachable from the pane's PATH.
        for cmd in ("sed", "basename", "tr", "base64", "grep", "find", "head", "python3"):
            real = sys.executable if cmd == "python3" else shutil.which(cmd)
            self.assertIsNotNone(real, cmd)
            path = self.root / cmd
            path.write_text("#!" + sys.executable + "\n" +
                            "import json, os, sys\n" +
                            f"with open({str(self.root / 'calls')!r}, 'a') as log:\n" +
                            f"    log.write(json.dumps([{cmd!r}, sys.argv[1:]]) + '\\n')\n" +
                            f"os.execv({real!r}, [{real!r}] + sys.argv[1:])\n")
            path.chmod(0o700)
        script = self.root / "zshell"
        script.write_text(script.read_text().replace("/usr/bin/python3", str(self.root / "python3")))
        master, slave = pty.openpty()
        proc = None
        output = bytearray()
        try:
            proc = subprocess.Popen([str(script)], cwd=self.root,
                                    env=dict(self.env, PATH=str(self.root), **env),
                                    stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
            os.close(slave)
            slave = None
            deadline = time.monotonic() + 10
            query = b'\x1b]1337;SetUserVar=zq=MQ==\x07'
            queried = False
            while True:
                remaining = deadline - time.monotonic()
                self.assertGreater(remaining, 0, bytes(output))
                ready, _, _ = select.select([master], [], [], remaining)
                self.assertTrue(ready, bytes(output))
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno != 5:  # Linux PTYs report EIO at EOF.
                        raise
                    break
                if not chunk:
                    break
                output.extend(chunk)
                if not queried and query in output:
                    queried = True
                    if reply is not None:
                        os.write(master, reply)
            self.assertTrue(queried, bytes(output))
            self.assertEqual(proc.wait(timeout=2), 0, bytes(output))
            if reply is not None:
                self.assertNotIn(reply.rstrip(b'\n'), output)
            return bytes(output)
        finally:
            if proc is not None:
                if proc.poll() is None:
                    os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
            if slave is not None:
                os.close(slave)
            os.close(master)

    def test_pane_query_fast_path_starts_only_discovery_and_attach(self):
        output = self.pane_start(b': zq saved%20name -\n')
        self.assertEqual(self.calls("timeout"), [["3", str(self.root / "zmx"), "ls", "--short"]])
        self.assertEqual(self.calls("zmx"), [["ls", "--short"], ["attach", "saved name"]])
        commands = [cmd for cmd, args in map(json.loads, (self.root / "calls").read_text().splitlines())]
        self.assertEqual(commands, ["timeout", "zmx", "zmx"])
        self.assertNotIn(b"SetUserVar=holder", output)

    def test_pane_query_missing_pi_file_does_not_resume(self):
        self.pane_start(b': zq old-1 %2Fno%2Fsuch%2Ffile\n')
        self.assertEqual(self.calls("zmx")[-1], ["attach", "old-1"])
        self.assertEqual(self.calls("python3"), [])
        self.assertEqual(self.calls("head"), [])

    def test_pane_query_lost_session_resumes_pi(self):
        pi = self.root / "pi session.jsonl"
        pi.write_text('{"cwd": "/tmp"}\n{"ignored": true}\n')
        self.pane_start(f': zq lost {quote(str(pi), safe="")}\n'.encode())
        self.assertEqual(self.calls("zmx")[-1], [
            "attach", "lost", str(self.root / "plain-shell"), "-lc",
            'cd "$1" 2>/dev/null; pi --session "$2"; exec "$0" -il',
            str(self.root / "plain-shell"), "/tmp", str(pi)])
        self.assertEqual(self.calls("head"), [["-1", str(pi)]])
        self.assertEqual(len(self.calls("python3")), 1)
        self.assertEqual(self.calls("kitten"), [])

    def test_pane_query_existing_session_matches_literal_whole_line(self):
        pi = self.root / "pi.jsonl"
        pi.write_text('{"cwd": "/tmp"}\n')
        self.pane_start(f': zq a%2Ab {quote(str(pi), safe="")}\n'.encode(),
                        SESSIONS="prefix\na*b\nsuffix")
        self.assertEqual(self.calls("zmx")[-1], ["attach", "a*b"])
        self.assertEqual(self.calls("python3"), [])

    def test_pane_invalid_answer_uses_remote_control_fallback(self):
        self.pane_start(b'hello\n', HOLDER="saved")
        self.assertEqual(len(self.calls("kitten")), 1)
        self.assertEqual(self.calls("zmx")[-1], ["attach", "saved"])

    def test_pane_query_timeout_uses_remote_control_fallback(self):
        started = time.monotonic()
        self.pane_start(None, HOLDER="saved")
        self.assertGreaterEqual(time.monotonic() - started, 2)
        self.assertEqual(len(self.calls("kitten")), 1)
        self.assertEqual(self.calls("zmx")[-1], ["attach", "saved"])

    def test_main_removes_only_old_zmx_crash_reports_and_missing_folder_is_safe(self):
        self.assertEqual(self.run_script("kmain", MODE="starting").returncode, 0)
        reports = self.root / "Library/Logs/DiagnosticReports"
        reports.mkdir(parents=True)
        old, fresh, other = (reports / n for n in ("zmx-a.ips", "zmx-b.ips", "other.ips"))
        for path in (old, fresh, other):
            path.touch()
        ago = time.time() - 2 * 60 * 60
        os.utime(old, (ago, ago))
        os.utime(other, (ago, ago))
        self.assertEqual(self.run_script("kmain", MODE="starting").returncode, 0)
        self.assertFalse(old.exists())
        self.assertTrue(fresh.exists())
        self.assertTrue(other.exists())

    def test_main_sweeps_even_when_focus_fails(self):
        (self.root / "ready").write_text("0")
        reports = self.root / "Library/Logs/DiagnosticReports"
        reports.mkdir(parents=True)
        old = reports / "zmx-a.ips"
        old.touch()
        os.utime(old, (0, 0))
        result = self.run_script("kmain", MODE="focus-fail")
        self.assertEqual(result.returncode, 1)
        self.assertIn("CalledProcessError", result.stderr)
        self.assertFalse(old.exists())

    def test_main_cleanup_ignores_each_file_error_outside_lock(self):
        import fcntl
        import runpy
        from unittest.mock import patch
        reports = self.root / "Library/Logs/DiagnosticReports"
        reports.mkdir(parents=True)
        paths = [reports / name for name in ("zmx-a.ips", "zmx-b.ips")]
        for path in paths:
            path.touch()
            os.utime(path, (0, 0))
        attempted = []
        def unlink(path):
            # A separate open description can acquire the lock only after kmain releases it.
            with (self.root / "socket.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            attempted.append(path)
            raise OSError("cannot delete this report")
        with patch.dict(os.environ, self.env), patch("subprocess.run") as run:
            run.return_value = subprocess.CompletedProcess([], 0, stdout='[]')
            with patch("os.unlink", side_effect=unlink):
                runpy.run_path(str(self.root / "kmain"))
        self.assertCountEqual(attempted, paths)
        self.assertTrue(all(path.exists() for path in paths))

    def test_fresh_holders_are_unique_and_saved_names_reattach(self):
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results = list(pool.map(lambda _: self.run_script("zshell"), range(6)))
        self.assertTrue(all(r.returncode == 0 for r in results))
        names = [a[1] for a in self.calls("zmx") if a[0] == "attach"]
        self.assertEqual(len(set(names)), 6)
        for name in names:
            self.assertTrue(name.startswith(self.root.name.lower() + "-"))
            self.assertEqual(str(uuid.UUID(name[-36:])), name[-36:])
        for holder in ("old-1", "saved-exact-name"):
            self.assertEqual(self.run_script("zshell", HOLDER=holder).returncode, 0)
            self.assertIn(["attach", holder], self.calls("zmx"))
        self.assertTrue(all(a[1:] == [str(self.root / "zmx"), "ls", "--short"]
                            for a in self.calls("timeout")))

    def test_failed_and_hung_discovery_falls_back(self):
        for mode in ("fail", "hang"):
            result = self.run_script("zshell", MODE=mode)
            self.assertEqual(result.returncode, 0)
            self.assertIn("discovery failed or timed out", result.stderr)
        self.assertEqual(self.calls("plain-shell"), [["-il"], ["-il"]])
        self.assertFalse(any(a[0] == "attach" for a in self.calls("zmx")))

    def test_concurrent_main_starts_once_then_focuses_without_unlinking(self):
        socket = self.root / "socket"
        socket.write_text("do not unlink")
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results = list(pool.map(lambda _: self.run_script("kmain"), range(4)))
        self.assertTrue(all(r.returncode == 0 for r in results), results)
        self.assertEqual(len(self.calls("open")), 1)
        self.assertEqual(self.calls("aerospace"), [["focus", "--window-id", "42"]] * 3)
        self.assertEqual(socket.read_text(), "do not unlink")
        self.assertEqual((self.root / ".local/state/kitty/workspaces/main.kitty-session").read_text(),
                         "cd ~\nlaunch\n")

    def test_main_keeps_process_guard(self):
        result = self.run_script("kmain", MODE="starting")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls("open"), [])

    def test_main_startup_wait_is_bounded_and_discovery_errors_are_safe(self):
        import runpy
        from unittest.mock import patch
        for error in (OSError("missing"), subprocess.TimeoutExpired("kitten", 1)):
            def boundary(args, **kwargs):
                if args[0] == "kitten":
                    self.assertEqual(kwargs["timeout"], 1)
                    raise error
                return subprocess.CompletedProcess(args, 1 if args[0] == "pgrep" else 0)
            with patch.dict(os.environ, self.env), patch("subprocess.run", side_effect=boundary) as run:
                with patch("time.monotonic", side_effect=[0, 0, 11]), patch("time.sleep"):
                    runpy.run_path(str(self.root / "kmain"))
            self.assertEqual([c.args[0][0] for c in run.call_args_list],
                             ["kitten", "pgrep", "open", "kitten"])

    def test_create_publishes_without_clobber_and_quotes_display_name(self):
        directory = Path(self.env["ZWS_DIR"])
        directory.mkdir()
        existing = directory / "repo.kitty-session"
        existing.write_bytes(b"original bytes")
        shown = "l'été 'quoted'"
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results = list(pool.map(lambda _: self.run_script("zws", "create", "repo",
                                                             "/cwd with spaces", shown), range(5)))
        self.assertTrue(all(r.returncode == 0 for r in results), results)
        self.assertEqual(existing.read_bytes(), b"original bytes")
        files = list(directory.glob("repo-*.kitty-session"))
        self.assertEqual(len(files), 5)
        for path in files:
            lines = path.read_text().splitlines()
            self.assertEqual(lines[0], "cd /cwd with spaces")
            self.assertEqual(shlex.split(lines[1]), ["launch", "--var", "ws_name=" + shown])
        self.assertEqual(len(self.calls("kitten")), 5)
        self.assertEqual(len(list(directory.iterdir())), 6)

    def test_hidden_folder_and_new_window_keep_session_syntax(self):
        result = self.run_script("zws", "create", ".config", "/cwd space")
        self.assertEqual(result.returncode, 0, result.stderr)
        result = self.run_script("zws", "new", "--window")
        self.assertEqual(result.returncode, 0, result.stderr)
        destination = self.calls("kitten")[-1][-1]
        self.assertEqual(Path(destination).read_text(),
                         "new_os_window\ncd " + str(self.root / "cwd space") + "\nlaunch\n")

    def test_create_rejects_traversal_and_controls_without_navigation(self):
        for args in (("../escape", "/cwd"), ("..", "/cwd"), ("bad\nlaunch", "/cwd"),
                     ("good", "/cwd\nlaunch"), ("good", "/cwd", "bad\x01")):
            result = self.run_script("zws", "create", *args)
            self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(Path(self.env["ZWS_DIR"]).iterdir()), [])
        self.assertFalse((self.root / "calls").exists())

    def test_state_missing_and_hung_probes_keep_kitty_cwd(self):
        # Python raises OSError on an invalid executable; do not fall through to real tools.
        for probe, mode in (("zmx", ""), ("lsof", ""), ("zmx", "hang"), ("lsof", "lsof-hang")):
            with self.subTest(probe=probe, mode=mode):
                path = self.root / probe
                original = path.read_text()
                if not mode: path.write_text("#!/nonexistent-interpreter\n")
                try:
                    result = self.run_script("zws", "new", HOLDER="old-1", MODE=mode)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    destination = self.calls("kitten")[-1][-1]
                    self.assertEqual(Path(destination).read_text(),
                                     "cd " + str(self.root / "cwd space") + "\nlaunch\n")
                finally:
                    path.write_text(original)

    def test_picker_interrupt_cleans_only_owned_directory(self):
        neighbor = self.root / "zpick-view.neighbor"
        neighbor.write_text("keep")
        proc = subprocess.Popen([str(self.root / "zpick"), "1"], env=dict(self.env, MODE="interrupt"),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            deadline = time.monotonic() + 5
            while not (self.root / "view").exists() and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue((self.root / "view").exists())
            view = Path((self.root / "view").read_text())
            self.assertEqual(view.parent.stat().st_mode & 0o777, 0o700)
            os.killpg(proc.pid, signal.SIGTERM)
            proc.communicate(timeout=5)
            self.assertFalse(view.parent.exists())
            self.assertEqual(neighbor.read_text(), "keep")
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.communicate()

    def test_preview_timeout_does_not_own_or_clean_scratch(self):
        view = self.root / "helper-view"
        view.write_text("keep")
        result = self.run_script("zpick", "--preview", "det", "old-1", "old-1", "10",
                                 MODE="hang", ZPICK_VIEW=str(view))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(view.read_text(), "keep")
        self.assertEqual(self.calls("timeout"), [["3", "zmx", "history", "old-1", "--vt"]])
