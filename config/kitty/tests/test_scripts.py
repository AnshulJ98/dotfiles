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
import termios
import tempfile
import time
import unittest
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
    # Match the requested deadline: Python fake startup can exceed 0.2s under load.
    try: sys.exit(subprocess.run(args[1:], timeout=float(args[0])).returncode)
    except subprocess.TimeoutExpired: sys.exit(124)
if cmd == "zmx":
    if mode == "slow-discovery" and args == ["ls", "--short"]: time.sleep(.4)
    if mode == "hang": time.sleep(30)
    if mode == "fail": sys.exit(1)
    if args == ["ls"]: print("name=old-1\tpid=123\tclients=0")
    if args == ["ls", "--short"]: print(os.environ.get("SESSIONS", "old-1"))
    sys.exit(0)
if cmd == "ssh" and (root / "ssh-codes").exists():
    codes = (root / "ssh-codes").read_text().splitlines()
    code = codes.pop(0)
    (root / "ssh-codes").write_text("\n".join(codes))
    sys.exit(int(code))
if cmd == "ps":
    print(os.environ.get("PS_OUT", ""), end="")
if cmd == "lsof":
    if mode == "lsof-hang": time.sleep(30)
    print("n" + str(root / "live cwd"))
if cmd == "kitten":
    if "focus-window" in args and mode == "focus-fail-both": sys.exit(1)
    if "--to" in args:
        ready = root / "ready"
        if ready.exists() and time.time() >= float(ready.read_text()):
            print('[{"platform_window_id": 42}]')
        sys.exit(0)
    if "ls" in args and os.environ.get("KITTY_LS"):
        print(os.environ["KITTY_LS"])
    elif "ls" in args:
        print(json.dumps([{"is_active": True, "tabs": [{"is_active": True, "windows": [{
            "is_active": True, "cwd": str(root / "cwd space"), "session_name": "",
            "user_vars": {"holder": os.environ.get("HOLDER", "")}}]}]}]))
    if "goto_session" in args:
        assert pathlib.Path(args[-1]).read_text().endswith("\n")
if cmd == "open" and mode == "no-app": sys.exit(1)
if cmd in ("open", "kitty"):
    (root / "started-env").write_text(json.dumps({k: os.environ.get(k) for k in ("ZWS_HOST", "ZWS_DIR")}))
    (root / "ready").write_text(str(time.time() + .3))
if cmd == "aerospace" and mode.startswith("focus-fail"): sys.exit(1)
if cmd == "pgrep": sys.exit(0 if mode == "starting" else 1)
if cmd == "fzf":
    view = pathlib.Path(os.environ["ZPICK_VIEW"])
    for suffix in ("", ".ask", ".pos"): pathlib.Path(str(view) + suffix).write_text("all")
    subprocess.run([str(root / "zpick"), "--list"], check=True, stdout=subprocess.DEVNULL)
    assert view.exists()  # helpers must not remove the interactive owner's scratch
    (root / "view").write_text(str(view))
    if mode == "interrupt": time.sleep(30)
    if mode.startswith("pick:"):  # zpick --zmx: query, key and the selected row, as fzf prints them
        rc, query, key, sel = mode[5:].split("|")
        print(query); print(key)
        if sel: print("det\t" + sel + "\t" + sel + "\t/x\t0\tshown")
        sys.exit(int(rc))
    sys.exit(1)
"""


class ScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        colors = self.root / ".config/themes/current/colors.sh"
        colors.parent.mkdir(parents=True)
        colors.write_text("THEME_ACCENT=\'#aabbcc\'\nTHEME_SEL=\'#123456\'\n")
        self.env = dict(os.environ, HOME=str(self.root), TMPDIR=str(self.root),
                        ZWS_DIR=str(self.root / "workspaces"), ZWS_HOST="", FAKE_ROOT=str(self.root),
                        PATH=str(self.root) + ":" + os.environ["PATH"])
        for name in ("KITTY_WINDOW_ID", "KITTY_LISTEN_ON", "KITTY_PID", "ZMX_SESSION"):
            self.env.pop(name, None)
        for cmd in ("kitten", "zmx", "timeout", "lsof", "open", "pgrep", "aerospace",
                    "fzf", "plain-shell", "find", "zpick-rows", "kitty", "ps", "ssh"):
            path = self.root / cmd
            path.write_text("#!" + sys.executable + "\n" + FAKE)
            path.chmod(0o700)
        for name in ("zshell", "kmain", "zws", "zpick", "zgoto"):
            source = (BIN / name).read_text()
            # Preserve logic; redirect fixed production paths and PATH additions to fakes.
            source = source.replace("/opt/homebrew/bin", str(self.root))
            source = source.replace("/bin/zsh", str(self.root / "plain-shell"))
            source = source.replace('"/tmp/kitty-" + host', repr(str(self.root / "socket-")) + " + host")
            source = source.replace("/tmp/kitty-main", str(self.root / "socket"))
            if name == "zshell":
                source = source.replace("/tmp/zcm-", str(self.root / "zcm-"))
                source = source.replace("SECONDS + 10", "SECONDS + 2")
                source = source.replace("SECONDS + 120", "SECONDS + 5")
                source = source.replace("sleep 2", "sleep 0.1")
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

    def pane_start(self, reply, wait_for=None, **env):
        code, output = self.pane_run(reply, wait_for=wait_for, **env)
        self.assertEqual(code, 0, output)
        return output

    def pane_run(self, reply, wait_for=None, **env):
        # Only these logging fakes are reachable from the pane's PATH.
        for cmd in ("sed", "basename", "tr", "base64", "grep", "find", "head", "python3",
                    "sleep", "mkdir", "rmdir"):
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
                        # Bash prints read's prompt before disabling echo. Wait for
                        # read -s to be ready so an early reply isn't echoed or flushed.
                        while termios.tcgetattr(master)[3] & termios.ECHO:
                            self.assertIsNone(proc.poll(), bytes(output))
                            self.assertLess(time.monotonic(), deadline, bytes(output))
                            time.sleep(.001)
                        os.write(master, reply)
                if wait_for is not None and wait_for in output:
                    # The prompt must block, without spinning ssh or falling back.
                    calls = self.calls("ssh")
                    time.sleep(.15)
                    self.assertIsNone(proc.poll(), bytes(output))
                    self.assertEqual(self.calls("ssh"), calls)
                    self.assertFalse(termios.tcgetattr(master)[3] & termios.ECHO)
                    os.write(master, b"x")
                    wait_for = None
            self.assertTrue(queried, bytes(output))
            self.assertIsNone(wait_for, bytes(output))
            code = proc.wait(timeout=2)
            if reply is not None:
                self.assertNotIn(reply.rstrip(b'\n'), output)
            return code, bytes(output)
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

    def test_pane_host_answer_runs_zmx_on_the_host_over_shared_ssh(self):
        host = self.root / "host"
        folder = host / "my dir"
        folder.mkdir(parents=True)
        (self.root / "ssh-codes").write_text("255\n255\n0\n0")
        self.pane_start(f': zq box%20name - box {quote(str(folder), safe="")}\n'.encode())
        check, locked_check, opened, args = self.calls("ssh")
        opts = ["-o", "ControlPath=" + str(self.root / "zcm-%C"), "-o", "ControlPersist=600",
                "-o", "ConnectTimeout=5", "-o", "ServerAliveInterval=15",
                "-o", "ServerAliveCountMax=2"]
        self.assertEqual(check, ["-q", *opts, "-O", "check", "box"])
        self.assertEqual(locked_check, check)
        self.assertEqual(opened, ["-q", *opts, "-o", "ControlMaster=auto", "-Nf", "box"])
        self.assertEqual(args[:-1], ["-tt", "-q", *opts, "-o", "ControlMaster=no", "box"])
        self.assertFalse((self.root / "zcm-lock-box").exists())
        remote = args[-1]
        self.assertIn(" attach box\\ name", remote)
        self.assertEqual(self.calls("zmx"), [])
        self.assertEqual(self.calls("timeout"), [])
        self.assertEqual(self.calls("plain-shell"), [])
        # Run it as the host's non-interactive shell would, with zmx only in ~/.local/bin.
        zmx = host / ".local/bin/zmx"
        zmx.parent.mkdir(parents=True)
        zmx.write_text('#!/bin/sh\nprintf "%s\\n" "$PWD" "$ZDOTDIR" "$ZMX_NO_DETACH_KEY" '
                       '"$KITTY_SHELL_INTEGRATION" "$@" > "$HOME/ran"\n')
        zmx.chmod(0o700)
        integration = host / ".local/kitty.app/lib/kitty/shell-integration/zsh"
        integration.mkdir(parents=True)
        linux = "/usr/lib/kitty/shell-integration/zsh"
        result = subprocess.run(["/bin/sh", "-c", remote], env={"HOME": str(host), "PATH": "/usr/bin:/bin"},
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        ran = (host / "ran").read_text().splitlines()
        self.assertEqual(os.path.realpath(ran[0]), os.path.realpath(folder))
        self.assertEqual(ran[1:], [linux if os.path.isdir(linux) else str(integration),
                                   "1", "enabled", "attach", "box name"])

    def host_pane(self, codes, wait_for=None):
        (self.root / "ssh-codes").write_text("\n".join(map(str, codes)))
        output = self.pane_start(b': zq n - box -\n', wait_for=wait_for)
        self.assertEqual((self.root / "ssh-codes").read_text(), "")
        self.assertEqual(self.calls("plain-shell"), [])
        self.assertEqual(self.calls("zmx"), [])
        return output

    def test_pane_host_live_connection_only_checks_and_attaches(self):
        self.host_pane([0, 0])
        check, attach = self.calls("ssh")
        self.assertIn("check", check)
        self.assertIn("ControlMaster=no", attach)
        self.assertEqual(self.calls("mkdir"), [])

    def test_pane_host_rechecks_connection_under_lock(self):
        self.host_pane([255, 0, 0])
        first, second, attach = self.calls("ssh")
        self.assertEqual(first, second)
        self.assertIn("check", second)
        self.assertIn("ControlMaster=no", attach)
        self.assertFalse((self.root / "zcm-lock-box").exists())

    def test_pane_host_takes_over_leftover_lock(self):
        lock = self.root / "zcm-lock-box"
        lock.mkdir()
        self.host_pane([255, 255, 0, 0])
        self.assertFalse(lock.exists())
        self.assertTrue(self.calls("sleep"))
        self.assertIn("-Nf", self.calls("ssh")[-2])

    def test_pane_host_255_reattaches_without_clearing_screen(self):
        output = self.host_pane([0, 255, 0, 0])
        self.assertEqual(output.count(b"[box: no link, retrying]"), 1)
        self.assertNotIn(b"\x1b[", output)
        self.assertEqual(len(self.calls("ssh")), 4)
        self.assertEqual(self.calls("sleep"), [["0.1"]])

    def test_pane_host_failed_opens_share_one_outage_line(self):
        output = self.host_pane([255, 255, 255, 255, 255, 255, 0, 0])
        self.assertEqual(output.count(b"no link, retrying"), 1)
        self.assertEqual(self.calls("sleep"), [["0.1"], ["0.1"]])
        self.assertFalse((self.root / "zcm-lock-box").exists())

    def test_pane_host_successful_open_resets_outage(self):
        output = self.host_pane([0, 255, 0, 255, 0, 0])
        self.assertEqual(output.count(b"no link, retrying"), 2)
        self.assertEqual(self.calls("sleep"), [["0.1"], ["0.1"]])

    def test_pane_host_down_waits_for_key_then_retries(self):
        # One failed open crosses the shortened outage deadline.
        script = self.root / "zshell"
        script.write_text(script.read_text().replace("SECONDS + 5", "SECONDS + 0"))
        output = self.host_pane([255, 255, 255, 0, 0],
                                wait_for=b"[box unreachable, enter retries]")
        self.assertEqual(output.count(b"no link, retrying"), 1)
        self.assertEqual(output.count(b"unreachable, enter retries"), 1)

    def test_pane_host_session_exit_one_does_not_retry(self):
        (self.root / "ssh-codes").write_text("0\n1")
        code, output = self.pane_run(b': zq n - box -\n')
        self.assertEqual(code, 1, output)
        self.assertNotIn(b"retry", output)
        self.assertEqual(len(self.calls("ssh")), 2)
        self.assertEqual(self.calls("plain-shell"), [])

    def test_pane_host_missing_zmx_waits_for_key_then_attaches(self):
        output = self.host_pane([0, 97, 0, 0],
                                wait_for=b"[box has no zmx (PATH, ~/.local/bin); enter retries]")
        self.assertNotIn(b"no link", output)
        self.assertEqual(len(self.calls("ssh")), 4)

    def test_pane_host_remote_missing_zmx_exits_97(self):
        self.host_pane([0, 0])
        remote = self.calls("ssh")[-1][-1]
        result = subprocess.run(["/bin/sh", "-c", remote],
                                env={"HOME": str(self.root / "empty"), "PATH": ""},
                                capture_output=True, timeout=2)
        self.assertEqual(result.returncode, 97, result.stderr)

    def test_pane_host_answer_without_folder_and_option_like_host(self):
        self.pane_start(b': zq n - box -\n')
        check, args = self.calls("ssh")
        self.assertIn("check", check)
        self.assertNotIn("cd ", args[-1])
        (self.root / "calls").unlink()
        output = self.pane_start(b': zq n - -oProxyCommand%3Dtouch%20x -\n')
        self.assertIn(b"refusing ssh host", output)
        self.assert_plain_shell_only()

    def test_pane_reply_waits_for_silent_read_after_prompt(self):
        script = self.root / "zshell"
        prompt = r"$'\033]1337;SetUserVar=zq=MQ==\007'"
        original = "IFS=' ' read -r -s -t 2 -p " + prompt + " a b c d"
        delayed = ("{ printf '%s' " + prompt + "; " + shlex.quote(sys.executable) +
                   " -c 'import time; time.sleep(.1)'; IFS=' ' read -r -s -t 2 a b c d; }")
        source = script.read_text()
        self.assertEqual(source.count(original), 1)
        script.write_text(source.replace(original, delayed))
        self.pane_start(b': zq saved%20name -\n')
        self.assertEqual(self.calls("zmx"), [["ls", "--short"], ["attach", "saved name"]])
        self.assertEqual(self.calls("plain-shell"), [])

    def test_pane_discovery_allows_slow_fake_startup_within_requested_timeout(self):
        output = self.pane_start(b': zq saved%20name -\n', MODE="slow-discovery")
        self.assertEqual(self.calls("timeout"), [["3", str(self.root / "zmx"), "ls", "--short"]])
        self.assertEqual(self.calls("zmx"), [["ls", "--short"], ["attach", "saved name"]])
        self.assertEqual(self.calls("plain-shell"), [])
        self.assertNotIn(b"discovery failed or timed out", output)

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

    def assert_plain_shell_only(self):
        commands = [cmd for cmd, args in map(json.loads, (self.root / "calls").read_text().splitlines())]
        self.assertEqual(commands, ["plain-shell"])
        self.assertEqual(self.calls("plain-shell"), [["-il"]])

    def test_pane_invalid_answer_starts_plain_shell(self):
        output = self.pane_start(b'hello\n', HOLDER="saved")
        self.assertIn(b"watcher did not answer", output)
        self.assert_plain_shell_only()

    def test_pane_query_timeout_starts_plain_shell(self):
        started = time.monotonic()
        output = self.pane_start(None, HOLDER="saved")
        self.assertGreaterEqual(time.monotonic() - started, 2)
        self.assertIn(b"watcher did not answer", output)
        self.assert_plain_shell_only()

    def test_without_a_terminal_starts_plain_shell(self):
        result = self.run_script("zshell", HOLDER="saved")
        self.assertEqual(result.returncode, 0)
        self.assertIn("watcher did not answer", result.stderr)
        self.assert_plain_shell_only()

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
        result = self.run_script("kmain", MODE="focus-fail-both")
        self.assertEqual(result.returncode, 1)
        self.assertIn("CalledProcessError", result.stderr)
        self.assertFalse(old.exists())

    def test_main_focuses_through_kitty_when_aerospace_cannot(self):
        (self.root / "ready").write_text("0")
        result = self.run_script("kmain", MODE="focus-fail")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls("aerospace"), [["focus", "--window-id", "42"]])
        self.assertEqual(self.calls("kitten")[-1][-1], "focus-window")
        (self.root / "calls").unlink()
        (self.root / "aerospace").unlink()  # not installed at all
        result = self.run_script("kmain", PATH=str(self.root) + ":/usr/bin:/bin")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls("kitten")[-1][-1], "focus-window")

    def test_main_starts_kitty_from_path_when_the_app_is_not_found_by_name(self):
        result = self.run_script("kmain", MODE="no-app")
        self.assertEqual(result.returncode, 0, result.stderr)
        session = str(self.root / ".local/state/kitty/workspaces/main.kitty-session")
        self.assertEqual(self.calls("kitty"), [["--listen-on", "unix:" + str(self.root / "socket"),
                                                "--session", session]])

    def test_main_removes_a_dead_socket_but_never_a_live_one(self):
        import socket
        path = self.root / "socket"
        with socket.socket(socket.AF_UNIX) as dead:
            dead.bind(str(path))  # closed without unlinking: what a crashed kitty leaves
        self.assertEqual(self.run_script("kmain").returncode, 0)
        self.assertFalse(path.exists())
        self.assertEqual(len(self.calls("open")), 1)
        (self.root / "calls").unlink()
        (self.root / "ready").unlink()
        with socket.socket(socket.AF_UNIX) as live:
            live.bind(str(path))
            live.listen()
            self.assertEqual(self.run_script("kmain").returncode, 0)
            self.assertTrue(path.exists())

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
        with patch.dict(os.environ, self.env), patch("sys.argv", ["kmain"]), patch("subprocess.run") as run:
            run.return_value = subprocess.CompletedProcess([], 0, stdout='[]')
            with patch("os.unlink", side_effect=unlink):
                runpy.run_path(str(self.root / "kmain"))
        self.assertCountEqual(attempted, paths)
        self.assertTrue(all(path.exists() for path in paths))

    def test_failed_and_hung_discovery_falls_back(self):
        for mode in ("fail", "hang"):
            output = self.pane_start(b': zq saved -\n', MODE=mode)
            self.assertIn(b"discovery failed or timed out", output)
        self.assertEqual(self.calls("plain-shell"), [["-il"], ["-il"]])
        self.assertEqual(self.calls("kitten"), [])
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

    def test_main_host_starts_with_instance_paths_and_environment_then_focuses(self):
        for mode in ("", "no-app"):
            with self.subTest(mode=mode):
                (self.root / "calls").unlink(missing_ok=True)
                (self.root / "ready").unlink(missing_ok=True)
                result = self.run_script("kmain", "box", MODE=mode)
                self.assertEqual(result.returncode, 0, result.stderr)
                directory = self.root / ".local/state/kitty/hosts/box"
                args = ["--listen-on", "unix:" + str(self.root / "socket-box"),
                        "--session", str(directory / "main.kitty-session")]
                if sys.platform == "darwin":
                    self.assertEqual(self.calls("open"), [["-n", "-a", "kitty", "--env", "ZWS_HOST=box",
                                                          "--env", "ZWS_DIR=" + str(directory), "--args", *args]])
                if sys.platform != "darwin" or mode == "no-app":
                    self.assertEqual(self.calls("kitty"), [args])
                    self.assertEqual(json.loads((self.root / "started-env").read_text()),
                                     dict(ZWS_HOST="box", ZWS_DIR=str(directory)))
                self.assertEqual((directory / "main.kitty-session").read_text(), "cd ~\nlaunch\n")
                self.assertTrue((self.root / "socket-box.lock").exists())
                self.assertEqual(self.run_script("kmain", "box").returncode, 0)
                self.assertEqual(self.calls("aerospace"), [["focus", "--window-id", "42"]])
                self.assertTrue(all(a[2] == "unix:" + str(self.root / "socket-box") for a in self.calls("kitten")))
                self.assertEqual(self.calls("ssh"), [])

    def test_main_rejects_invalid_hosts_without_calls(self):
        for host in ("-oProxyCommand=x", "../box", "a b", "a@box", "", "box\n"):
            result = self.run_script("kmain", host)
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIn("host", result.stderr)
        self.assertFalse((self.root / "calls").exists())

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
            with patch.dict(os.environ, self.env), patch("sys.argv", ["kmain"]), \
                    patch("subprocess.run", side_effect=boundary) as run:
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
        result = self.run_script("zws", "new", "--window", "/cwd space")
        self.assertEqual(result.returncode, 0, result.stderr)
        destination = self.calls("kitten")[-1][-1]
        self.assertEqual(Path(destination).read_text(), "new_os_window\ncd /cwd space\nlaunch\n")

    def test_new_host_writes_host_vars_and_keeps_kitty_on_a_local_folder(self):
        result = self.run_script("zws", "new", "/home/a/proj", ZWS_HOST="box")
        self.assertEqual(result.returncode, 0, result.stderr)
        path = Path(self.calls("kitten")[-1][-1])
        self.assertEqual(path.name, "proj.kitty-session")
        lines = path.read_text().splitlines()
        self.assertEqual(lines[0], "cd " + str(self.root))
        self.assertEqual(shlex.split(lines[1]), ["launch", "--var", "host=box", "--var", "host_dir=/home/a/proj"])
        result = self.run_script("zws", "new", "--window", ZWS_HOST="box")
        self.assertEqual(result.returncode, 0, result.stderr)
        path = Path(self.calls("kitten")[-1][-1])
        self.assertEqual(path.name, "home.kitty-session")
        self.assertEqual(path.read_text(), "new_os_window\ncd " + str(self.root) + "\nlaunch --var host=box\n")
        result = self.run_script("zws", "new", "--ask", "/srv/app", ZWS_HOST="box")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls("kitten")[-1][-4:], ["app", str(self.root), "box", "/srv/app"])
        result = self.run_script("zws", "create", "named", str(self.root), "Shown", "box", "/srv/app")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = (Path(self.env["ZWS_DIR"]) / "named.kitty-session").read_text().splitlines()
        self.assertEqual(shlex.split(lines[1]), ["launch", "--var", "ws_name=Shown", "--var", "host=box",
                                                 "--var", "host_dir=/srv/app"])
        self.assertEqual(self.calls("zmx"), [])
        self.assertEqual(self.calls("ssh"), [])

    def test_new_host_rejects_invalid_instance_host(self):
        for host in ("-oProxyCommand=x", "a b", "a@box"):
            with self.subTest(host=host):
                result = self.run_script("zws", "new", ZWS_HOST=host)
                self.assertNotEqual(result.returncode, 0)
        self.assertFalse(Path(self.env["ZWS_DIR"], "home.kitty-session").exists())
        self.assertFalse((self.root / "calls").exists())

    def test_new_host_flag_is_only_an_unknown_folder_argument(self):
        result = self.run_script("zws", "new", "--host", "box", "/x")
        self.assertEqual(result.returncode, 0, result.stderr)
        text = Path(self.calls("kitten")[-1][-1]).read_text()
        self.assertEqual(text, "cd --host\nlaunch\n")
        self.assertNotIn("host=", text)

    def test_create_rejects_traversal_and_controls_without_navigation(self):
        for args in (("../escape", "/cwd"), ("..", "/cwd"), ("bad\nlaunch", "/cwd"),
                     ("good", "/cwd\nlaunch"), ("good", "/cwd", "bad\x01")):
            result = self.run_script("zws", "create", *args)
            self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(Path(self.env["ZWS_DIR"]).iterdir()), [])
        self.assertFalse((self.root / "calls").exists())

    def test_new_uses_argument_and_open_file_without_live_probes(self):
        directory = Path(self.env["ZWS_DIR"])
        directory.mkdir()
        (directory / ".open").write_text("cwd-space\n")
        existing = directory / "cwd-space-2.kitty-session"
        existing.write_text("keep\n")
        result = self.run_script("zws", "new", "/cwd space", HOLDER="old-1")
        self.assertEqual(result.returncode, 0, result.stderr)
        destination = directory / "cwd-space-3.kitty-session"
        self.assertEqual(destination.read_text(), "cd /cwd space\nlaunch\n")
        self.assertEqual(existing.read_text(), "keep\n")
        self.assertEqual(self.calls("kitten"), [["@", "action", "goto_session", str(destination)]])
        self.assertEqual(self.calls("zmx"), [])
        self.assertEqual(self.calls("lsof"), [])

    def test_new_home_default_and_no_discovery_for_all_modes(self):
        for flag in ((), ("--window",), ("--ask",)):
            with self.subTest(flag=flag):
                result = self.run_script("zws", "new", *flag)
                self.assertEqual(result.returncode, 0, result.stderr)
                call = self.calls("kitten")[-1]
                if flag == ("--ask",):
                    self.assertEqual(call[:5], ["@", "launch", "--type=overlay", "--cwd", str(self.root)])
                    self.assertEqual(call[-2:], ["home-3", str(self.root)])
                else:
                    prefix = "new_os_window\n" if flag else ""
                    self.assertEqual(Path(call[-1]).read_text(),
                                     prefix + "cd " + str(self.root) + "\nlaunch\n")
        self.assertEqual(self.calls("zmx"), [])
        self.assertEqual(self.calls("lsof"), [])
        self.assertFalse(any("ls" in args for args in self.calls("kitten")))

    def test_new_ask_passes_cwd_and_name_as_whole_overlay_arguments(self):
        result = self.run_script("zws", "new", "--ask", "/cwd space")
        self.assertEqual(result.returncode, 0, result.stderr)
        call, = self.calls("kitten")
        self.assertEqual(call[:5], ["@", "launch", "--type=overlay", "--cwd", "/cwd space"])
        self.assertEqual(call[-3:], [str((self.root / "zws").resolve()), "cwd-space", "/cwd space"])
        self.assertEqual(self.calls("zmx"), [])
        self.assertEqual(self.calls("lsof"), [])

    def test_picker_uses_active_theme_colors(self):
        result = self.run_script("zpick", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        args, = self.calls("fzf")
        self.assertIn("fg:-1,bg:-1,hl:#aabbcc,hl+:#aabbcc,fg+:-1:bold,bg+:#123456,gutter:-1,border:#aabbcc,label:#aabbcc:bold", args)

    def test_picker_zmx_mode_prints_the_session_and_never_calls_kitty(self):
        for mode, printed in (("pick:0|||logs", "logs"),             # enter on a row
                              ("pick:1|newbox||", "newbox"),         # typed name, no match
                              ("pick:0|dot|ctrl-n|dotfiles", "dot"),  # ctrl-n: the typed name
                              ("pick:130|||", None)):                # esc
            with self.subTest(mode=mode):
                (self.root / "calls").unlink(missing_ok=True)
                result = self.run_script("zpick", "--zmx", MODE=mode)
                self.assertEqual(result.returncode, 0 if printed else 1, result.stderr)
                self.assertEqual(result.stdout, printed + "\n" if printed else "")
                self.assertEqual(self.calls("kitten"), [])
                args, = self.calls("fzf")
                self.assertIn("--print-query", args)
                self.assertNotIn("ctrl-s", " ".join(args))
                self.assertTrue(any(a.startswith("ctrl-t:") for a in args))  # all <-> detached, as in kitty

    def test_picker_keeps_its_list_current(self):
        # a ticker reloads the list over fzf's socket; the cursor stays on its row by kind and target
        for extra in ((), ("--zmx",)):
            (self.root / "calls").unlink(missing_ok=True)
            self.run_script("zpick", *extra, MODE="pick:130|||")
            args, = self.calls("fzf")
            self.assertIn("--track", args)
            self.assertEqual(args[args.index("--id-nth") + 1], "1,2")
            sock = Path(args[args.index("--listen") + 1])
            self.assertEqual(sock.name, "view.sock")
            self.assertFalse(sock.parent.exists())

    def test_ctrl_backslash_opens_the_picker_but_reaches_ssh_untouched(self):
        # kitty maps ctrl+\ to bin/zgoto --key: the picker, as cmd+alt+g, unless the pane runs ssh,
        # whose remote zmx-pick owns the key. ssh runs in kitty's pane or inside its zmx session.
        # A pane of a host workspace is ours although it runs ssh: its remote zmx has the key off.
        def ls(fg, holder, host):
            return json.dumps([{"is_focused": True, "tabs": [{"is_focused": True, "windows": [{
                "id": 7, "is_focused": True, "user_vars": {"holder": holder, **({"host": host} if host else {})},
                "foreground_processes": [{"pid": 1, "cmdline": fg}]}]}]}])
        zmx = ["/opt/homebrew/bin/zmx", "attach", "old-1"]
        for fg, holder, ps, host, sent in ((["ssh", "-t", "box"], "", "", "", True),
                                           (zmx, "old-1", "123 456 -zsh\n456 456 ssh\n", "", True),
                                           (zmx, "old-1", "123 456 -zsh\n456 456 nvim\n", "", False),
                                           (["ssh", "-tt", "box", "zmx attach old-1"], "old-1", "", "box", False),
                                           (["/bin/zsh"], "", "", "", False)):
            with self.subTest(fg=fg, ps=ps, host=host):
                (self.root / "calls").unlink(missing_ok=True)
                # kitty does not fill in @active-kitty-window-id for remote_control_script (0.50.0,
                # boss.py remote_control_script); zgoto finds the focused window itself
                result = self.run_script("zgoto", "@active-kitty-window-id", "--key",
                                         KITTY_LS=ls(fg, holder, host), PS_OUT=ps)
                self.assertEqual(result.returncode, 0, result.stderr)
                kitten = [a for a in self.calls("kitten") if "ls" not in a]
                self.assertEqual(kitten[0][:2] == ["@", "send-key"], sent, kitten)
                if sent:
                    self.assertEqual(kitten, [["@", "send-key", "--match", "id:7", "ctrl+backslash"]])
                else:
                    self.assertEqual(kitten[0][:2], ["@", "launch"])
                    self.assertEqual(kitten[0][-1], "7")  # zpick starts on the pane it came from

    def test_picker_fills_the_terminal(self):
        for extra in ((), ("--zmx",)):
            (self.root / "calls").unlink(missing_ok=True)
            self.run_script("zpick", *extra, MODE="pick:130|||")
            args, = self.calls("fzf")
            self.assertNotIn("--margin", args)
            self.assertTrue(any(a.startswith("right,55%") for a in args), args)

    def test_picker_zmx_ctrl_t_switches_between_all_and_detached_sessions(self):
        env = dict(ZPICK_MODE="zmx", ZPICK_VIEW=str(self.root / "zview"))
        labels = []
        for _ in range(3):
            labels.append(self.run_script("zpick", "--label", **env).stdout.strip())
            self.run_script("zpick", "--toggle", **env)
        self.assertEqual(labels, ["zmx", "zmx · detached", "zmx"])

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
