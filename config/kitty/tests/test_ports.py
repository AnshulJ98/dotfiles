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


class PortsTests(unittest.TestCase):  # Real CLI, isolated by a socket-owning fake master.
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
        fake.write_text("#!" + sys.executable + "\n" + """
import json
import os
import socket
import sys

with socket.socket(socket.AF_UNIX) as s:
    s.connect(os.environ["FAKE_MASTER"])
    s.sendall(json.dumps(sys.argv[1:]).encode() + b"\\n")
    code, message = json.loads(s.makefile("r").readline())
print(message, file=sys.stderr)
sys.exit(code)
""")
        fake.chmod(0o755)
        self.env = dict(os.environ, HOME=str(self.root), ZWS_DIR=str(self.root), ZWS_HOST="box",
                        PATH=str(self.root), FAKE_MASTER=str(self.root / "ssh.sock"))
        self.processes = []

        def reap():
            for process in reversed(self.processes):
                if process.poll() is None:
                    process.terminate()
                process.wait(timeout=8)

        self.addCleanup(reap)

    def cli(self, *args, **env):
        return subprocess.run([str(SCRIPT), *args], env=dict(self.env, **env),
                              capture_output=True, text=True, timeout=8)

    def start(self, owner=None):
        process = subprocess.Popen([str(SCRIPT), "run", str(owner or os.getpid())],
                                   env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.processes.append(process)
        self.wait(lambda: (self.root / ".ports.sock").exists())
        return process

    def wait(self, predicate):
        deadline = time.monotonic() + 4
        while not predicate() and time.monotonic() < deadline:
            time.sleep(.02)
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
        self.assertEqual(state["forwards"]["8000"], dict(local=8000, target="127.0.0.1", active=True))
        self.assertEqual(self.forwards(), [["-o", "ControlPath=/tmp/zcm-%C", "-o", "ControlMaster=no",
                                          "-o", "BatchMode=yes", "-O", "forward",
                                          "-L", "127.0.0.1:8000:127.0.0.1:8000", "box"]])
        self.command("forward", "8001", "[::1]")
        self.assertIn("127.0.0.1:8001:[::1]:8001", self.forwards()[-1])
        for listener in self.listeners.values():
            listener.close()
        self.listeners.clear()
        self.pid = None
        time.sleep(.7)
        before = len(self.forwards())
        time.sleep(.7)
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
        self.assertEqual(json.loads((self.root / "ports.json").read_text())["forwards"]["8000"]["local"], 8000)

    def test_collision_singleton_and_killed_owner_cleanup(self):
        owner = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        self.processes.append(owner)
        process = self.start(owner.pid)
        self.assertEqual(self.cli("run", str(owner.pid)).returncode, 0)
        self.assertIsNone(process.poll())
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

    def test_stop_retries_a_busy_probe_and_forward_readds(self):
        self.start()
        self.command("forward", "8000")
        self.cancel_delay = .1  # The real listener holds the port through the first probe.
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

    def test_validation_never_calls_ssh(self):
        for args, host in [(("forward", p), "box") for p in ("abc", "0", "-1", "65536")] + [
                (("forward", "8000"), h) for h in ("", "-box", "a b", "box;true")]:
            with self.subTest(args=args, host=host):
                self.assertNotEqual(self.cli(*args, ZWS_HOST=host).returncode, 0)
        self.assertEqual(self.calls, [])
