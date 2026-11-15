import fcntl
import json
import os
import runpy
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "bin/zports"


class PortsTests(
    unittest.TestCase
):  # Real CLI, isolated by a socket-owning fake master.
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.calls, self.listeners, self.pid = [], {}, 123
        self.check_times, self.cancel_error, self.cancel_delay = [], False, 0
        outer = self

        class Master(socketserver.StreamRequestHandler):
            def handle(self):
                args = json.loads(self.rfile.readline())
                outer.calls.append(args)
                op = args[args.index("-O") + 1]
                code, message = 0, ""
                if not outer.pid:
                    code = 255
                elif op == "check":
                    outer.check_times.append(time.monotonic())
                    message = f"Master running (pid={outer.pid})"
                else:
                    local = int(args[args.index("-L") + 1].split(":")[1])
                    if op == "forward" and local not in outer.listeners:
                        listener = socket.socket()
                        try:
                            listener.bind(("127.0.0.1", local))
                            listener.listen()
                            outer.listeners[local] = listener
                        except OSError:
                            listener.close()
                            code = 255
                    elif op == "cancel" and local in outer.listeners:
                        listener = outer.listeners.pop(local)
                        if outer.cancel_delay:
                            threading.Timer(outer.cancel_delay, listener.close).start()
                        else:
                            listener.close()
                        if outer.cancel_error:
                            code, message = 255, "lost cancel reply"
                self.wfile.write(json.dumps([code, message]).encode() + b"\n")

        server = socketserver.UnixStreamServer(str(self.root / "ssh.sock"), Master)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def close():
            server.shutdown()
            thread.join()
            server.server_close()
            for listener in self.listeners.values():
                listener.close()

        self.addCleanup(close)
        fake = self.root / "ssh"
        fake.write_text(
            "#!"
            + sys.executable
            + "\n"
            + """
import json
import os
import socket
import sys

from pathlib import Path
import time

root = Path(os.environ["HOME"])
if "-G" in sys.argv:
    print("port 2222")
    sys.exit()
if "--ports-scan" in sys.argv[-1]:
    assert "def listeners(" in sys.stdin.read()
    with (root / "scans").open("a") as log:
        log.write(str(time.monotonic()) + "\\n")
    content = (root / "scan").read_text() if (root / "scan").exists() else "[]"
    if content == "hang":
        time.sleep(30)
    if content == "fail":
        sys.exit(255)
    print(content)
    sys.exit()
with socket.socket(socket.AF_UNIX) as s:
    s.connect(os.environ["FAKE_MASTER"])
    s.sendall(json.dumps(sys.argv[1:]).encode() + b"\\n")
    code, message = json.loads(s.makefile("r").readline())
print(message, file=sys.stderr)
sys.exit(code)
"""
        )
        fake.chmod(0o755)
        notifier = self.root / "osascript"
        notifier.write_text(
            "#!"
            + sys.executable
            + "\n"
            + """
import json
import os
import sys
from pathlib import Path
with (Path(os.environ["HOME"]) / "notifications").open("a") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
"""
        )
        notifier.chmod(0o755)
        self.env = dict(
            os.environ,
            HOME=str(self.root),
            ZWS_DIR=str(self.root),
            ZWS_HOST="box",
            PATH=str(self.root),
            FAKE_MASTER=str(self.root / "ssh.sock"),
        )
        self.processes = []

        def reap():
            for process in reversed(self.processes):
                if process.poll() is None:
                    process.terminate()
                process.wait(timeout=8)

        self.addCleanup(reap)

    def cli(self, *args, **env):
        return subprocess.run(
            [str(SCRIPT), *args],
            env=dict(self.env, **env),
            capture_output=True,
            text=True,
            timeout=8,
        )

    def start(self, owner=None):
        process = subprocess.Popen(
            [str(SCRIPT), "run", str(owner or os.getpid())],
            env=self.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.processes.append(process)
        self.wait(lambda: (self.root / ".ports.sock").exists())
        return process

    def wait(self, predicate):
        deadline = time.monotonic() + 4
        while not predicate() and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(predicate())

    def command(self, *args):
        result = self.cli(*args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def forwards(self):
        return [args for args in self.calls if args[args.index("-O") + 1] == "forward"]

    def test_forward_stop_restart_and_master_recovery(self):
        process = self.start()
        state = self.command("forward", "8000")
        self.assertEqual(
            state["forwards"]["8000"],
            dict(
                local=8000,
                target="127.0.0.1",
                active=True,
                automatic=False,
                program=None,
            ),
        )
        self.assertEqual(
            self.forwards(),
            [
                [
                    "-o",
                    "ControlPath=/tmp/zcm-%C",
                    "-o",
                    "ControlMaster=no",
                    "-o",
                    "BatchMode=yes",
                    "-O",
                    "forward",
                    "-L",
                    "127.0.0.1:8000:127.0.0.1:8000",
                    "box",
                ]
            ],
        )
        self.command("forward", "8001", "[::1]")
        self.assertIn("127.0.0.1:8001:[::1]:8001", self.forwards()[-1])
        for listener in self.listeners.values():
            listener.close()
        self.listeners.clear()
        self.pid = None
        time.sleep(0.7)
        before = len(self.forwards())
        time.sleep(0.7)
        self.assertEqual(len(self.forwards()), before)
        self.pid = 456
        self.wait(lambda: len(self.forwards()) == before + 2)
        state = self.command("stop", "8000")
        self.assertEqual(state["stopped"], [8000])
        self.assertNotIn("8000", state["forwards"])
        self.assertNotIn(8000, self.listeners)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 8000))
        process.terminate()
        process.wait(timeout=5)
        self.assertEqual(self.listeners, {})
        self.start()
        self.assertEqual(self.command("list")["stopped"], [8000])
        self.assertNotIn("8000", self.command("list")["forwards"])
        self.assertEqual(self.command("forward", "8000")["stopped"], [])
        self.assertEqual(
            json.loads((self.root / "ports.json").read_text())["forwards"]["8000"][
                "local"
            ],
            8000,
        )

    def test_collision_singleton_and_killed_owner_cleanup(self):
        owner = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        self.processes.append(owner)
        process = self.start(owner.pid)
        started = time.monotonic()
        self.assertEqual(self.cli("run", str(owner.pid)).returncode, 0)
        self.assertGreaterEqual(time.monotonic() - started, 3)
        self.assertIsNone(process.poll())
        self.assertEqual(self.listeners, {})
        with socket.socket() as taken:
            taken.bind(("127.0.0.1", 0))
            remote = taken.getsockname()[1]
            item = self.command("forward", str(remote))["forwards"][str(remote)]
            self.assertEqual(item["local"], remote + 1)
        owner.kill()
        owner.wait(timeout=5)
        process.wait(timeout=5)
        self.assertEqual(self.listeners, {})
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", item["local"]))
        self.assertTrue(any("cancel" in call for call in self.calls))

    def test_time_wait_does_not_hide_a_free_port_or_a_listener(self):
        free = runpy.run_path(str(SCRIPT))["free"]
        with socket.socket() as listener, socket.socket() as client:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 0))
            local = listener.getsockname()[1]
            listener.listen()
            self.assertFalse(free(local))
            client.connect(("127.0.0.1", local))
            connection, _ = listener.accept()
            connection.close()  # The server end enters TIME_WAIT after the client closes.
            self.assertEqual(client.recv(1), b"")
            client.close()
        self.assertTrue(free(local))
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", local))

    def test_wildcard_listeners_reserve_local_ports(self):
        free = runpy.run_path(str(SCRIPT))["free"]
        for family, address in ((socket.AF_INET, "0.0.0.0"), (socket.AF_INET6, "::")):
            with self.subTest(address=address):
                taken = socket.socket(family)
                try:
                    taken.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    if family == socket.AF_INET6:
                        taken.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                    taken.bind((address, 0))
                except OSError:
                    taken.close()
                    if family == socket.AF_INET:
                        raise
                    continue  # IPv6 may be disabled.
                with taken:
                    taken.listen()
                    remote = taken.getsockname()[1]
                    self.assertFalse(free(remote))
                    process = self.start()
                    item = self.command("forward", str(remote))["forwards"][str(remote)]
                    self.assertEqual(item["local"], remote + 1)
                    process.terminate()
                    process.wait(timeout=5)

    def test_engine_waits_for_previous_lock_then_serves_requests(self):
        with (self.root / ".ports.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen(
                [str(SCRIPT), "run", str(os.getpid())],
                env=self.env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.processes.append(process)
            time.sleep(1)
            self.assertIsNone(process.poll())
            self.assertFalse((self.root / ".ports.sock").exists())
            fcntl.flock(lock, fcntl.LOCK_UN)
            self.wait(lambda: (self.root / ".ports.sock").exists())
            self.assertEqual(self.command("list")["forwards"], {})

    def test_invalid_requests_do_not_kill_engine_or_cancel_forwards(self):
        process = self.start()
        self.command("forward", "8000")
        for data in (
            [],
            {"command": "forward", "port": "x"},
            {"command": "forward", "port": 8000, "target": 5},
            {"command": "forward", "port": []},
            None,
        ):
            with self.subTest(data=data), socket.socket(socket.AF_UNIX) as client:
                client.settimeout(3)
                client.connect(str(self.root / ".ports.sock"))
                client.sendall((json.dumps(data) + "\n").encode())
                with client.makefile("r") as stream:
                    self.assertIn("error", json.loads(stream.readline()))
            self.assertIsNone(process.poll())
            self.assertTrue(self.command("list")["forwards"]["8000"]["active"])
            self.assertIn(8000, self.listeners)
        self.assertTrue(self.command("forward", "8001")["forwards"]["8001"]["active"])
        self.assertFalse(any("cancel" in call for call in self.calls))

    def test_mapped_and_other_loopback_addresses_use_the_right_target(self):
        self.scan(
            (8160, "::ffff:127.0.0.1", None),
            (8161, "::ffff:0.0.0.0", None),
            (8162, "127.0.0.2", None),
            (8163, "::ffff:192.168.1.2", None),
        )
        self.start()
        self.wait(lambda: self.detected(8160, 8161, 8162))
        forwards = self.command("list")["forwards"]
        self.assertEqual(set(forwards), {"8160", "8161", "8162"})
        for remote, target in (
            ("8160", "127.0.0.1"),
            ("8161", "127.0.0.1"),
            ("8162", "127.0.0.2"),
        ):
            self.assertEqual(forwards[remote]["target"], target)

    def test_stop_retries_a_busy_probe_and_forward_readds(self):
        self.start()
        self.command("forward", "8000")
        self.cancel_delay = (
            0.1  # The real listener holds the port through the first probe.
        )
        started = time.monotonic()
        state = self.command("stop", "8000")
        self.assertEqual(state["stopped"], [8000])
        self.assertEqual(state["forwards"], {})
        self.assertNotIn(8000, self.listeners)
        self.assertGreaterEqual(time.monotonic() - started, self.cancel_delay)
        self.command("forward", "8000")
        self.assertEqual(len(self.forwards()), 2)
        self.assertIn(8000, self.listeners)

    def test_partial_cancel_never_leaves_active_record(self):
        self.start()
        self.command("forward", "8000")
        self.cancel_error = True
        self.assertNotEqual(self.cli("stop", "8000").returncode, 0)
        state = json.loads((self.root / "ports.json").read_text())
        self.assertFalse(state["forwards"]["8000"]["active"])
        self.assertNotIn(8000, self.listeners)
        self.cancel_error = False
        state = self.command("forward", "8000")
        self.assertTrue(state["forwards"]["8000"]["active"])
        self.assertEqual(len(self.forwards()), 2)
        self.assertIn(8000, self.listeners)

    def test_idle_checks_are_two_seconds_apart_but_requests_sync_immediately(self):
        self.start()
        self.wait(lambda: len(self.check_times) >= 2)
        self.assertGreaterEqual(self.check_times[1] - self.check_times[0], 2)
        self.command("forward", "8000")
        before = len(self.check_times)
        self.command("list")
        self.assertEqual(len(self.check_times), before + 1)
        self.assertLess(self.check_times[-1] - self.check_times[-2], 2)

    def scan(self, *items):
        (self.root / "scan").write_text(
            json.dumps([dict(port=p, address=a, program=name) for p, a, name in items])
        )

    def record(self):
        path = self.root / "ports.json"
        return json.loads(path.read_text()) if path.exists() else {"forwards": {}}

    def notifications(self):
        path = self.root / "notifications"
        return (
            [json.loads(line) for line in path.read_text().splitlines()]
            if path.exists()
            else []
        )

    def detected(self, *ports):
        return all(
            self.record()["forwards"].get(str(p), {}).get("active") for p in ports
        )

    def test_auto_addresses_owners_collision_and_single_notification(self):
        self.scan(
            (8000, "127.0.0.1", "python"),
            (8001, "0.0.0.0", None),
            (8002, "::", None),
            (8003, "::1", "node"),
            (8004, "192.168.1.2", "lan"),
            (53, "127.0.0.1", None),
            (2222, "::", None),
            (8002, "::1", "dual"),
        )
        with socket.socket() as taken:
            taken.bind(("127.0.0.1", 8000))
            taken.listen()
            self.start()
            self.wait(lambda: self.detected(8000, 8001, 8002, 8003))
            state = self.record()
            self.assertEqual(set(state["forwards"]), {"8000", "8001", "8002", "8003"})
            self.assertTrue(all(i["automatic"] for i in state["forwards"].values()))
            self.assertEqual(state["forwards"]["8000"]["program"], "python")
            self.assertIsNone(state["forwards"]["8001"]["program"])
            self.assertEqual(state["forwards"]["8002"]["target"], "127.0.0.1")
            self.assertEqual(state["forwards"]["8003"]["target"], "[::1]")
            self.assertGreater(state["forwards"]["8000"]["local"], 8000)
            self.wait(lambda: len(self.notifications()) == 1)
            (notification,) = self.notifications()
            self.assertEqual(notification[-2], "box")
            for remote, item in state["forwards"].items():
                self.assertIn(f"{remote}→{item['local']}", notification[-1])

    def test_disappearance_preserves_manual_and_stop_survives_restart(self):
        self.scan((8100, "127.0.0.1", "server"), (8101, "::1", None))
        process = self.start()
        self.wait(lambda: self.detected(8100, 8101))
        self.wait(lambda: len(self.notifications()) == 1)
        self.command(
            "forward", "8101", "[::1]"
        )  # Promote an automatic forward to manual.
        self.command("forward", "8102")
        self.assertFalse(self.record()["forwards"]["8101"]["automatic"])
        self.command("stop", "8100")
        time.sleep(2.2)
        self.assertNotIn("8100", self.record()["forwards"])
        self.assertEqual(self.record()["stopped"], [8100])
        process.terminate()
        process.wait(timeout=5)
        self.start()
        self.wait(lambda: self.detected(8101, 8102))
        time.sleep(2.2)
        self.assertNotIn("8100", self.record()["forwards"])
        self.assertEqual(len(self.notifications()), 1)
        self.command("forward", "8100")
        self.assertEqual(self.record()["stopped"], [])
        self.assertFalse(self.record()["forwards"]["8100"]["automatic"])
        self.scan()
        time.sleep(2.3)
        self.assertTrue(self.detected(8100, 8101, 8102))
        self.assertEqual(len(self.notifications()), 1)

    def test_forward_without_target_uses_scanned_ipv6_after_stop_and_restart(self):
        self.scan((8150, "::1", "server"))
        process = self.start()
        self.wait(lambda: self.detected(8150))
        self.wait(lambda: len(self.notifications()) == 1)
        self.command("stop", "8150")
        process.terminate()
        process.wait(timeout=5)
        self.start()
        self.command("list")  # The initial scan completes before requests are served.
        self.assertNotIn("8150", self.record()["forwards"])
        state = self.command("forward", "8150")
        self.assertEqual(state["forwards"]["8150"]["target"], "[::1]")
        self.assertFalse(state["forwards"]["8150"]["automatic"])
        self.assertEqual(state["stopped"], [])
        self.assertIn("127.0.0.1:8150:[::1]:8150", self.forwards()[-1])
        self.command("stop", "8150")
        state = self.command("forward", "8150", "127.0.0.1")
        self.assertEqual(state["forwards"]["8150"]["target"], "127.0.0.1")
        self.assertIn("127.0.0.1:8150:127.0.0.1:8150", self.forwards()[-1])
        state = self.command("forward", "8151")
        self.assertEqual(state["forwards"]["8151"]["target"], "127.0.0.1")
        self.assertEqual(len(self.notifications()), 1)

    def test_stopped_port_target_refreshes_only_after_a_good_scan(self):
        self.scan((8152, "::1", "server"))
        self.start()
        self.wait(lambda: self.detected(8152))
        self.wait(lambda: len(self.notifications()) == 1)
        self.command("stop", "8152")
        before = len((self.root / "scans").read_text().splitlines())
        (self.root / "scan").write_text("fail")
        self.wait(lambda: len((self.root / "scans").read_text().splitlines()) > before)
        state = self.command("forward", "8152")
        self.assertEqual(state["forwards"]["8152"]["target"], "[::1]")
        self.command("stop", "8152")
        before = len((self.root / "scans").read_text().splitlines())
        self.scan((8152, "127.0.0.1", "server"))
        self.wait(lambda: len((self.root / "scans").read_text().splitlines()) > before)
        self.command("list")
        self.assertNotIn("8152", self.record()["forwards"])
        state = self.command("forward", "8152")
        self.assertEqual(state["forwards"]["8152"]["target"], "127.0.0.1")
        self.assertTrue(state["forwards"]["8152"]["active"])
        self.assertEqual(len(self.notifications()), 1)

    def test_automatic_removal_and_waiting_cap(self):
        self.scan(*[(p, "127.0.0.1", None) for p in range(8200, 8222)])
        self.start()
        self.wait(lambda: self.detected(*range(8200, 8220)))
        self.wait(lambda: len(self.notifications()) == 1)
        self.assertEqual(len(self.record()["forwards"]), 20)
        self.assertEqual(self.record()["waiting"], [8220, 8221])
        self.command("forward", "8299")
        self.assertEqual(len(self.record()["forwards"]), 21)
        self.command("stop", "8299")
        self.scan(*[(p, "127.0.0.1", None) for p in range(8201, 8222)])
        self.wait(lambda: self.detected(8220))
        self.assertNotIn("8200", self.record()["forwards"])
        self.assertNotIn(8200, self.listeners)
        self.assertEqual(self.record()["waiting"], [8221])
        self.wait(lambda: len(self.notifications()) == 2)
        self.assertEqual(self.notifications()[-1][-1], "8220→8220")
        self.scan()
        self.wait(lambda: not self.record()["forwards"])
        self.assertEqual(self.listeners, {})
        self.assertEqual(len(self.notifications()), 2)

    def test_restart_and_master_recovery_do_not_notify(self):
        self.scan((8300, "::1", "python"))
        process = self.start()
        self.wait(lambda: self.detected(8300))
        self.wait(lambda: len(self.notifications()) == 1)
        self.listeners.pop(8300).close()
        self.pid = 456
        self.wait(lambda: len(self.forwards()) == 2)
        self.assertTrue(self.detected(8300))
        process.terminate()
        process.wait(timeout=5)
        self.start()
        self.wait(lambda: self.detected(8300))
        time.sleep(2.2)
        self.assertEqual(len(self.notifications()), 1)
        self.assertTrue(self.record()["forwards"]["8300"]["automatic"])

    def test_failed_malformed_and_timed_out_scans_preserve_state_then_recover(self):
        self.scan((8400, "127.0.0.1", None))
        self.start()
        self.wait(lambda: self.detected(8400))
        self.wait(lambda: len(self.notifications()) == 1)
        initial = self.record()
        for failure in ("fail", "{broken", "hang"):
            with self.subTest(failure=failure):
                before = len((self.root / "scans").read_text().splitlines())
                (self.root / "scan").write_text(failure)
                self.wait(
                    lambda: len((self.root / "scans").read_text().splitlines()) > before
                )
                started = time.monotonic()
                self.command(
                    "list"
                )  # Even a hung remote scan has a two-second deadline.
                self.assertLess(time.monotonic() - started, 2.5)
                self.assertEqual(self.record(), initial)
                self.assertEqual(len(self.notifications()), 1)
        self.scan((8401, "0.0.0.0", "new"))
        self.wait(lambda: self.detected(8401))
        self.assertNotIn("8400", self.record()["forwards"])
        self.wait(lambda: len(self.notifications()) == 2)

    def test_new_forward_waits_for_master_before_announcing(self):
        self.scan((8450, "127.0.0.1", "server"))
        self.pid = None
        self.start()
        self.wait(lambda: len([call for call in self.calls if "check" in call]) >= 2)
        self.assertFalse((self.root / "scans").exists())
        self.assertNotIn("8450", self.record()["forwards"])
        self.assertFalse(self.detected(8450))
        self.assertEqual(self.notifications(), [])
        self.pid = 456
        self.wait(lambda: self.detected(8450))
        self.wait(lambda: len(self.notifications()) == 1)
        self.assertEqual(self.notifications()[0][-1], "8450→8450")

    def test_scans_are_two_seconds_apart_even_with_requests(self):
        self.start()
        self.wait(lambda: (self.root / "scans").exists())
        self.command("list")
        self.command("forward", "8500")
        self.command("list")
        self.assertEqual(len((self.root / "scans").read_text().splitlines()), 1)
        self.wait(lambda: len((self.root / "scans").read_text().splitlines()) >= 2)
        times = list(map(float, (self.root / "scans").read_text().splitlines()))
        self.assertGreaterEqual(times[1] - times[0], 2)
        self.assertEqual(self.notifications(), [])

    def test_proc_scanner_reads_both_families_and_keeps_invisible_owners(self):
        scan = runpy.run_path(str(SCRIPT))["SCAN"]
        namespace = {"__name__": "scanner_test"}
        exec(scan, namespace)
        proc = self.root / "proc"
        (proc / "net").mkdir(parents=True)

        def row(address, remote, state, inode):
            return f"0: {address}:{remote:04X} 0:0 {state} 0 0 0 0 0 {inode}\n"

        (proc / "net/tcp").write_text(
            "header\n"
            + row("0100007F", 8000, "0A", 100)
            + row("00000000", 4317, "0A", 101)
            + row("0201A8C0", 8004, "0A", 102)
            + row("0100007F", 9000, "01", 103)
        )
        (proc / "net/tcp6").write_text(
            "header\n"
            + row("00000000000000000000000001000000", 8003, "0A", 104)
            + row("00000000000000000000000000000000", 4318, "0A", 105)
        )
        (proc / "12/fd").mkdir(parents=True)
        (proc / "12/comm").write_text("python3\n")
        (proc / "12/fd/3").symlink_to("socket:[100]")
        (proc / "12/fd/4").symlink_to("disappeared")
        rows = namespace["listeners"](proc)
        self.assertEqual(
            rows,
            [
                dict(port=8000, address="127.0.0.1", program="python3"),
                dict(port=4317, address="0.0.0.0", program=None),
                dict(port=8004, address="192.168.1.2", program=None),
                dict(port=8003, address="::1", program=None),
                dict(port=4318, address="::", program=None),
            ],
        )
        (proc / "net/tcp6").unlink()  # IPv6 may be disabled.
        self.assertEqual(len(namespace["listeners"](proc)), 3)

    def test_validation_never_calls_ssh(self):
        for args, host in [
            (("forward", p), "box") for p in ("abc", "0", "-1", "65536")
        ] + [(("forward", "8000"), h) for h in ("", "-box", "a b", "box;true")]:
            with self.subTest(args=args, host=host):
                self.assertNotEqual(self.cli(*args, ZWS_HOST=host).returncode, 0)
        self.assertEqual(self.calls, [])
