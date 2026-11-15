"""workspaces.py's saving, and the undocumented kitty and zmx behaviour the workspace layer uses.

Run by config/kitty/check.sh; re-run after a kitty or zmx upgrade."""
import importlib.util
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import sys
import tempfile
import types
import unittest

sys.dont_write_bytecode = True  # config/kitty is kitty's live config folder
KITTY_DIR = Path(__file__).resolve().parents[1]
KITTY = shutil.which("kitty") or "/Applications/kitty.app/Contents/MacOS/kitty"



class Window:
    def __init__(self, session: str, os_window_id: int):
        self.created_in_session_name = session
        self.os_window_id = os_window_id
        self.id = 0
        self.user_vars: dict[str, str] = {}


class Boss:
    """Stands in for kitty: save_as_session writes the file, as kitty does."""

    def __init__(self, windows: list[Window], active: Window, saved: str):
        self.all_windows = windows
        self.active_window = active
        self.saved = saved
        self.calls: list[tuple[str, ...]] = []

    def call_remote_control(self, window, args: tuple[str, ...]) -> None:
        self.calls.append(args)
        if args[:2] == ("action", "save_as_session"):
            Path(args[-1]).write_text(self.saved)


def load(state_dir: str, boss: Boss | None = None) -> types.ModuleType:
    stub = types.ModuleType("kitty.fast_data_types")
    stub.add_timer = lambda *args: None
    stub.get_boss = lambda: boss
    stub.mark_tab_bar_dirty = lambda *args: None
    stub.wakeup_main_loop = lambda: None
    sys.modules["kitty"] = types.ModuleType("kitty")
    sys.modules["kitty.fast_data_types"] = stub
    os.environ["ZWS_DIR"] = state_dir
    spec = importlib.util.spec_from_file_location("workspaces", KITTY_DIR / "workspaces.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    state = tempfile.TemporaryDirectory()
    unittest.addModuleCleanup(state.cleanup)
    module.STATE = state.name
    return module


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        env = patch.dict(os.environ, ZWS_HOST="box")
        env.start()
        self.addCleanup(env.stop)
        self.window = Window("dev", 1)
        self.boss = Boss([self.window], self.window, "launch\n")
        self.directory = self.root / "hosts/box"
        self.directory.mkdir(parents=True)
        self.record = self.directory / ".attached"
        self.record.write_text("attached")
        self.module = load(str(self.directory), self.boss)
        self.module.STATE = str(self.root)
        self.module._owner = True

    def test_whole_os_window_close_detaches_even_when_kitty_already_emptied_it(self):
        windows = [self.window, Window("dev", 1), Window("other", 1), Window("other", 1)]
        windows[1].user_vars["role"] = windows[3].user_vars["role"] = "sidebar"
        self.boss.all_windows = []
        self.boss.os_window_map = {}
        for window in windows:
            self.module.on_close(self.boss, window, {})
            self.assertFalse(self.record.exists())

    def test_one_by_one_closes_only_detach_at_last_pane(self):
        windows = [self.window, Window("other", 1), Window("other", 1)]
        for index, window in enumerate(windows):
            self.boss.all_windows = windows[index:]
            self.module.on_close(self.boss, window, {})
            self.assertEqual(self.record.exists(), index < 2)

    def test_permission_to_signal_main_is_not_required_to_keep_host_alive(self):
        from unittest.mock import patch
        m = self.module
        m._seen_main = True
        (self.root / ".main-pid").write_text("123")
        with patch.object(m.os, "kill", side_effect=PermissionError) as kill:
            m._lifecycle()
            kill.assert_called_once_with(123, 0)
        self.assertFalse(m._quitting)
        self.assertEqual(self.record.read_text(), "attached")

    def test_user_close_only_detaches_on_confirmed_quit_or_last_live_window(self):
        m = self.module
        m.on_quit(self.boss, None, {"confirmed": False})
        m.on_quit(self.boss, None, {"confirmed": True, "aborted": True})
        self.assertFalse(m._quitting)
        self.assertEqual(self.record.read_text(), "attached")
        m.on_close(self.boss, self.window, {})
        self.assertFalse(self.record.exists())
        self.record.write_text("attached")
        self.boss.all_windows = []  # Outside SIGTERM is indistinguishable from an OS window close.
        m.on_close(self.boss, self.window, {})
        self.assertFalse(self.record.exists())
        self.record.write_text("attached")
        self.boss.all_windows = [self.window]
        m.on_quit(self.boss, None, {"confirmed": True})
        self.assertNotEqual(self.record.read_text(), "attached")
        m.on_close(self.boss, self.window, {})
        self.assertTrue(self.record.exists())

    def test_host_closed_before_restore_is_still_detached(self):
        m = self.module
        m._owner = False
        m.on_close(self.boss, self.window, {})
        self.assertFalse(self.record.exists())
        self.record.write_text("attached")
        m.on_quit(self.boss, None, {"confirmed": True})
        self.assertNotEqual(self.record.read_text(), "attached")

    def test_nonlast_and_mac_close_do_not_change_attachment(self):
        from unittest.mock import patch
        self.boss.all_windows.append(Window("other", 1))
        self.module.on_close(self.boss, self.window, {})
        self.assertEqual(self.record.read_text(), "attached")
        with patch.dict(os.environ, ZWS_HOST=""):
            self.boss.all_windows = [self.window]
            self.module.on_close(self.boss, self.window, {})
            self.module.on_quit(self.boss, None, {"confirmed": True})
        self.assertEqual(self.record.read_text(), "attached")

    def test_follow_waits_for_live_main_then_saves_and_terminates_without_detaching(self):
        from unittest.mock import patch
        m = self.module
        pidfile = self.root / ".main-pid"
        with patch.object(m.os, "kill") as kill:
            m._lifecycle()
            kill.assert_not_called()
            pidfile.write_text("123")
            kill.side_effect = ProcessLookupError
            m._lifecycle()  # stale record, never seen
            self.assertFalse(m._quitting)
            kill.side_effect = None
            m._lifecycle()
            pidfile.write_text("456")  # replacement is alive
            m._lifecycle()
            self.assertFalse(m._quitting)
            self.assertNotIn((os.getpid(), 15), [c.args for c in kill.call_args_list])
            kill.side_effect = lambda pid, sig: (_ for _ in ()).throw(ProcessLookupError()) if sig == 0 else None
            m._lifecycle()
            self.assertTrue(m._quitting)
            kill.assert_called_with(os.getpid(), 15)
        self.assertEqual(self.record.read_text(), "attached")
        self.assertEqual((self.directory / ".open").read_text(), "dev\n")
        self.boss.all_windows = []
        m.on_close(self.boss, self.window, {})
        m._save()
        self.assertEqual((self.directory / ".open").read_text(), "dev\n")
        self.assertEqual(self.record.read_text(), "attached")

    def test_only_workspace_main_publishes_and_host_checks_every_two_seconds(self):
        from unittest.mock import patch
        m = self.module
        with patch.object(m, "add_timer") as timer, patch.object(m.os, "kill") as kill:
            m._restore()
            self.assertIn((2.0, True), [c.args[1:] for c in timer.call_args_list])
            kill.assert_not_called()
        with patch.dict(os.environ, ZWS_HOST=""), patch.object(m.os, "kill") as kill:
            m._owner = False
            self.boss.all_windows = []
            m._restore()
            self.assertFalse((self.root / ".main-pid").exists())
            self.boss.all_windows = [self.window]
            with patch.object(m, "add_timer") as timer:
                m._restore()
                self.assertIn((2.0, True), [c.args[1:] for c in timer.call_args_list])
            self.assertEqual((self.root / ".main-pid").read_text(), str(os.getpid()))
            kill.assert_not_called()

    def test_quit_order_is_recorded_for_restore_in_both_orders(self):
        from unittest.mock import patch
        for host_time, main_time in ((100, 104), (104, 100), (100, 106)):
            with self.subTest(host_time=host_time, main_time=main_time):
                host = load(str(self.directory), self.boss)
                mac_dir = self.root / "workspaces"
                mac_dir.mkdir(exist_ok=True)
                mac = load(str(mac_dir), self.boss)
                host.STATE = mac.STATE = str(self.root)
                host._owner = mac._owner = True
                events = sorted([(host_time, "box", host), (main_time, "", mac)], key=lambda e: e[0])
                for when, name, module in events:
                    with patch.dict(os.environ, ZWS_HOST=name), patch.object(module.time, "time", return_value=when):
                        module.on_quit(self.boss, None, {"confirmed": True})
                self.assertEqual(float(self.record.read_text()), host_time)
                self.assertEqual(float((self.root / ".main-quit").read_text()), main_time)


class HostLinkTests(unittest.TestCase):
    def test_url_hints_use_same_host_hook_and_mac_keeps_default(self):
        from unittest.mock import Mock, patch
        with tempfile.TemporaryDirectory() as directory:
            m = load(directory)
            w = Window("dev", 1)
            boss = types.SimpleNamespace(window_id_map={7: w})
            original = Mock()
            data = dict(customize_processing="zkitty.py", type="url",
                        match=["file:///host/a.py", "https://example.org"],
                        groupdicts=[{}, {}])
            hints = types.SimpleNamespace(handle_result=original)
            with patch.dict(sys.modules, {"kittens.hints.main": hints}), \
                    patch.object(m.zkitty, "open_url", side_effect=[True, False]) as opener:
                with patch.dict(os.environ, ZWS_HOST="winpc"):
                    m.zkitty.handle_result([], data, 7, boss, [])
                self.assertEqual(opener.call_count, 2)
                forwarded = original.call_args.args[1]
                self.assertEqual(forwarded["match"], ["https://example.org"])
                self.assertEqual(forwarded["groupdicts"], [{}])
                self.assertEqual(forwarded["customize_processing"], "")
                original.reset_mock()
                opener.reset_mock()
                with patch.dict(os.environ, ZWS_HOST=""):
                    m.zkitty.handle_result([], data, 7, boss, [])
                opener.assert_not_called()
                self.assertEqual(original.call_args.args[1]["match"], data["match"])
                self.assertEqual(data["customize_processing"], "zkitty.py")

    def test_host_hook_routes_files_and_paths_without_mac_fallback(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, ZWS_HOST="winpc"):
            w = Window("dev", 1)
            w.id = 7
            w.screen = types.SimpleNamespace(last_reported_cwd=b"kitty-shell-cwd://box/home/x")
            boss = Boss([w], w, "")
            m = load(directory, boss)
            m.on_resize(boss, w, {})
            self.assertIs(w.open_url_handler, m.zkitty.open_url)
            for url, args in (
                ("file://AnshulJoshi/home/x/a%20b.py#12", ("+12", "--", "/home/x/a b.py")),
                ("file:///home/x/a.md", ("--", "/home/x/a.md")),
                ("src/a.ts:7", ("+7", "--", "src/a.ts")),
                ("a.py:7", ("+7", "--", "a.py")),
                ("src/a.ts", ("--", "src/a.ts")),
            ):
                boss.calls.clear()
                self.assertTrue(w.open_url_handler(boss, w, url, 0, "/mac/wrong"))
                self.assertEqual(boss.calls, [(
                    "launch", "--type=overlay", "--match=id:7", "/bin/bash",
                    str(KITTY_DIR / "bin/zrun"), "/home/x", "nvim", *args)])
            boss.calls.clear()
            self.assertTrue(w.open_url_handler(boss, w, "file:///host/a.png#12", 1, ""))
            self.assertEqual(len(boss.calls), 1)
            self.assertNotIn("nvim", boss.calls[0])
            self.assertIn("/host/a.png lives on winpc", boss.calls[0])
            boss.calls.clear()
            self.assertFalse(w.open_url_handler(boss, w, "https://example.org/a.md", 0, ""))
            self.assertFalse(w.open_url_handler(boss, w, "http://example.org", 0, ""))
            with patch.dict(os.environ, ZWS_HOST=""):
                self.assertFalse(w.open_url_handler(boss, w, "file:///host/a.md", 0, ""))
                mac = Window("dev", 2)
                m.on_resize(boss, mac, {})
                self.assertFalse(hasattr(mac, "open_url_handler"))
            self.assertEqual(boss.calls, [])


class SavingTests(unittest.TestCase):
    def test_place_sets_the_leading_new_os_window_from_the_layout(self):
        cases = [
            ("launch\n", False, "launch\n"),
            ("new_os_window\nlaunch\n", False, "launch\n"),
            ("\n\nnew_os_window\nlaunch\n", False, "launch\n"),
            ("launch\n", True, "new_os_window\nlaunch\n"),
            ("new_os_window\nlaunch\n", True, "new_os_window\nlaunch\n"),
            ("new_tab\nlaunch\nnew_os_window\nlaunch\n", False, "new_tab\nlaunch\nnew_os_window\nlaunch\n"),
        ]
        with tempfile.TemporaryDirectory() as directory:
            module = load(directory)
            path = Path(directory) / "a.kitty-session"
            for before, own_window, after in cases:
                with self.subTest(before=before, own_window=own_window):
                    path.write_text(before)
                    module._place(str(path), own_window)
                    self.assertEqual(path.read_text(), after)
            module._place(str(Path(directory) / "missing.kitty-session"), True)  # no file: no error

    def test_quit_saves_each_workspace_and_the_open_list_then_stops_saving(self):
        with tempfile.TemporaryDirectory() as directory:
            a, b = Window("a", 1), Window("b", 2)
            boss = Boss([a, b, Window("", 3)], active=a, saved="new_os_window\nlaunch\n")
            module = load(directory, boss)
            module._restore()  # a kitty that started on a workspace keeps .open
            module.on_quit(boss, None, {"confirmed": False})
            self.assertEqual(boss.calls, [])
            module.on_quit(boss, None, {"confirmed": True})
            files = Path(directory)
            self.assertEqual((files / ".open").read_text(), "b\na\n")  # the active one last
            self.assertEqual((files / "a.kitty-session").read_text(), "launch\n")
            self.assertEqual((files / "b.kitty-session").read_text(), "new_os_window\nlaunch\n")
            self.assertEqual(sorted(p.name for p in files.iterdir()),
                             [".open", "a.kitty-session", "b.kitty-session"])
            saves = len(boss.calls)
            module._save()  # windows closing during the quit must not shrink .open
            self.assertEqual(len(boss.calls), saves)


    def test_save_labels_each_zmx_session_with_its_workspace_once(self):
        # the label outlives the pane, so zmx-pick can put a detached session under its workspace
        with tempfile.TemporaryDirectory() as directory:
            a, b, plain = Window("my space", 1), Window("b", 1), Window("", 1)
            a.user_vars["holder"], b.user_vars["holder"], plain.user_vars["holder"] = "a-1", "b-1", "p-1"
            boss = Boss([a, b, plain], active=a, saved="launch\n")
            module = load(directory, boss)
            def labels():
                found = [tuple(c[-3:-1]) for c in boss.calls if c[:2] == ("launch", "--type=background")]
                del boss.calls[:]
                return found
            module._save()
            self.assertEqual(labels(), [("a-1", "space=6d79207370616365"), ("b-1", "space=62")])
            module._save()
            self.assertEqual(labels(), [])
            a.created_in_session_name = "b"
            module._save()  # a pane moved to another workspace is labelled again
            self.assertEqual(labels(), [("a-1", "space=62")])

    def test_host_label_uses_zhost_and_keeps_retry_and_bookkeeping(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, ZWS_HOST="box"):
            a = Window("my space", 1)
            a.id, a.user_vars["holder"] = 5, "a-1"
            boss = Boss([a], a, "")
            module = load(directory, boss)
            module._label(boss)
            call, = boss.calls
            self.assertIn("zlabel=retry", call[5])
            self.assertEqual(call[-7:], (str(KITTY_DIR / "bin/zhost"), "box", "zmx", "set",
                                         "a-1", "space=6d79207370616365", "5"))
            module._label(boss)
            self.assertEqual(len(boss.calls), 1)
            fake = Path(directory) / "zhost"
            fake.write_text("#!/bin/sh\nexit 1\n")
            fake.chmod(0o700)
            kitten = Path(directory) / "kitten"
            kitten.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
            kitten.chmod(0o700)
            result = subprocess.run(["sh", "-c", call[5], "sh", str(fake), *call[-6:]],
                                    env=dict(os.environ, PATH=directory + ":/usr/bin:/bin"),
                                    capture_output=True, text=True, timeout=4)
            self.assertEqual(result.stdout.splitlines(), ["@", "set-user-vars", "--match",
                                                         "id:5", "zlabel=retry"])

    def test_a_label_zmx_refused_is_retried_a_few_times(self):
        with tempfile.TemporaryDirectory() as directory:
            a = Window("a", 1)
            a.id, a.user_vars["holder"] = 5, "a-1"
            boss = Boss([a], active=a, saved="launch\n")
            module = load(directory, boss)
            def labels():
                found = [c for c in boss.calls if c[:2] == ("launch", "--type=background")]
                del boss.calls[:]
                return found
            module._save()
            first, = labels()
            self.assertIn("--allow-remote-control", first)  # a refusal comes back as zlabel=retry
            self.assertEqual(first[-1], "5")
            for _ in range(3):
                module.on_set_user_var(boss, a, {"key": "zlabel", "value": "retry"})
                self.assertIn(("set-user-vars", "--match=id:5", "zlabel"), boss.calls)  # never saved
                del boss.calls[:]
                module._save()
                self.assertEqual(len(labels()), 1)
            module.on_set_user_var(boss, a, {"key": "zlabel", "value": "retry"})
            del boss.calls[:]
            module._save()
            self.assertEqual(labels(), [])  # a session that never comes up is not chased forever

    def test_empty_owner_replaces_open_atomically_nonowner_leaves_it(self):
        from unittest.mock import patch
        for owner in (True, False):
            with self.subTest(owner=owner), tempfile.TemporaryDirectory() as directory:
                module = load(directory, Boss([], active=None, saved=""))
                module._owner = owner
                path = Path(directory) / ".open"
                path.write_text("old\n")
                replace = os.replace

                def publish(source, target):
                    self.assertEqual(path.read_text(), "old\n")
                    self.assertEqual(Path(source).read_bytes(), b"")
                    replace(source, target)

                with patch.object(module.os, "replace", side_effect=publish) as atomic:
                    module._save()
                self.assertEqual(atomic.call_count, int(owner))
                self.assertEqual(path.read_text(), "" if owner else "old\n")
                self.assertFalse(Path(str(path) + ".tmp").exists())


    def test_transient_scouts_are_not_replayed_from_saved_workspaces(self):
        with tempfile.TemporaryDirectory() as directory:
            a, scout = Window("a", 1), Window("a", 1)
            scout.user_vars["transient"] = "1"
            boss = Boss([a, scout], active=scout, saved="launch\n")
            module = load(directory, boss)
            module._owner = True
            module._save()
            # The action remote command joins and re-parses its argv: keep the match one argument.
            action = shlex.split(" ".join(boss.calls[0][1:]))
            self.assertIn("--match=session:^a$ and not var:transient=1", action)
            boss.all_windows = [scout]
            module._save()
            self.assertEqual((Path(directory) / ".open").read_text(), "")


class IntentWatcherTests(unittest.TestCase):
    def test_unset_worktree_report_does_nothing_and_logs_nothing(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            boss = Boss([], None, '')
            module = load(directory, boss)
            with patch.dict(os.environ, ZWS_HOST="box"), patch.object(module, "add_timer") as timer:
                for value in (None, ""):
                    module.on_set_user_var(boss, Window("dev", 1),
                                           {"key": "zworktree", "value": value})
                    self.assertEqual(boss.calls, [])
                    self.assertEqual(list(Path(directory).iterdir()), [])
                    timer.assert_not_called()

    def test_worktree_report_is_cleared_and_forwarded_only_on_host(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            boss = Boss([], None, '')
            module = load(directory, boss)
            window = Window("dev", 1)
            window.id = 7
            folder = "/remote/worktree space ' quoted"
            with patch.dict(os.environ, ZWS_HOST="box"), patch.object(module, "add_timer") as timer:
                module.on_set_user_var(boss, window, {"key": "zworktree", "value": folder})
                self.assertEqual(boss.calls, [
                    ("set-user-vars", "--match=id:7", "zworktree"),
                    ("launch", "--type=background", "--allow-remote-control",
                     module.zkitty.ZWS, "here", folder)])
                timer.assert_not_called()
                for invalid in ("", "relative", "L3JlbW90ZQ==", "/bad\nlaunch", "/bad\x00",
                                "/bad\x1b", "/bad\x7f", "/bad\u0085", "/bad\u2028"):
                    boss.calls.clear()
                    module.on_set_user_var(boss, window, {"key": "zworktree", "value": invalid})
                    self.assertFalse(any(c[0] in ("launch", "action") for c in boss.calls))
                    timer.assert_not_called()
            with patch.dict(os.environ, ZWS_HOST=""):
                boss.calls.clear()
                module.on_set_user_var(boss, window, {"key": "zworktree", "value": folder})
                self.assertFalse(any(c[0] in ("launch", "action") for c in boss.calls))

    def test_pane_query_answers_and_empty_callback_is_ignored(self):
        from types import SimpleNamespace as NS
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            boss = Boss([], None, '')
            module = load(directory, boss)
            events = []
            original = boss.call_remote_control
            def remote(window, args):
                events.append(args)
                original(window, args)
            boss.call_remote_control = remote
            window = NS(id=7, user_vars={}, cwd_of_child='/x/My Repo',
                        write_to_child=events.append)
            with patch.object(module, 'add_timer') as timer:
                module.on_set_user_var(boss, window, {'key': 'zq', 'value': '1'})
                name = events[0].decode().split()[2]
                self.assertTrue(name.startswith('my-repo-'))
                self.assertEqual(events, [
                    f': zq {name} -\n'.encode(),
                    ('set-user-vars', '--match=id:7', 'zq'),
                    ('set-user-vars', '--match=id:7', 'holder=' + name)])
                events.clear()
                module.on_set_user_var(boss, window, {'key': 'zq', 'value': '1'})
                self.assertEqual(events, [('set-user-vars', '--match=id:7', 'zq')])
                window.id = 8
                window.user_vars = {'holder': 'saved', 'pi_session': '/p/s.jsonl'}
                events.clear()
                module.on_set_user_var(boss, window, {'key': 'zq', 'value': '1'})
                self.assertEqual(events, [b': zq saved %2Fp%2Fs.jsonl\n',
                                          ('set-user-vars', '--match=id:8', 'zq')])
                events.clear()
                module.on_set_user_var(boss, window, {'key': 'zq', 'value': ''})
                self.assertEqual(events, [])
                timer.assert_not_called()
            boss.all_tabs = []
            module._push(boss)
            self.assertNotIn(7, module._named)

    def test_dispatch_clears_first_empty_callbacks_do_nothing_and_rename_schedules(self):
        from types import SimpleNamespace as NS
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            boss = Boss([], None, '')
            module = load(directory, boss)
            window = NS(id=7, user_vars={'role': 'sidebar'}, child=NS(argv=['/any/zside']))
            pane = NS(id=41, created_in_session_name='beta', user_vars={},
                      program_status=NS(as_list=lambda: []),
                      screen=NS(last_reported_cwd=None), cwd_of_child='')
            class Tab(list):
                id, active_window = 8, pane
            boss.all_tabs = [Tab([pane])]
            run = module.zkitty.run
            def intent(boss_arg, words):
                self.assertIs(boss_arg, boss)
                self.assertEqual(words, ['space', 'beta'])
                self.assertEqual(boss.calls, [('set-user-vars', '--match=id:7', 'zdo')])
                self.assertEqual(run(boss_arg, words), [('goto', 'beta')])
            with patch.object(module.zkitty, 'run', side_effect=intent), patch.object(module, 'add_timer') as timer:
                module.on_set_user_var(boss, window, {'key': 'zdo', 'value': 'space beta'})
                self.assertEqual(boss.calls[-1], ('action', 'goto_session', module._file('beta')))
                for key, value in [('zdo', ''), ('zside', ''), ('zside', 'junk')]:
                    module.on_set_user_var(boss, window, {'key': key, 'value': value})
                timer.assert_not_called()
                module.on_set_user_var(boss, window, {'key': 'ws_name', 'value': 'Bee'})
                self.assertEqual(timer.call_count, 2)
                self.assertEqual([c.args[1] for c in timer.call_args_list], [0.05, 2.0])
            with patch.object(module.zkitty, 'run', side_effect=RuntimeError('intent failed')):
                self.assertIsNone(module.on_set_user_var(boss, window, {'key': 'zdo', 'value': 'next'}))
            self.assertIn('intent failed', Path(directory, 'watcher.log').read_text())

    def test_untrusted_sidebar_vars_are_only_cleared(self):
        from types import SimpleNamespace as NS
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            module = load(directory)
            window = NS(id=7, user_vars={'role': 'sidebar'}, child=NS(argv=['/bin/zsh']),
                        written=[], created_in_session_name='a', cwd_of_child='',
                        program_status=NS(as_list=lambda: []))
            window.write_to_child = window.written.append
            tab = type('Tab', (list,), {})([window])
            tab.id, tab.active_window = 1, window
            tab.tab_manager_ref = lambda: NS(active_tab=tab)
            boss = Boss([window], window, '')
            boss.all_tabs = [tab]
            with patch.object(module.zkitty, 'run') as run:
                for key, value in [('zdo', 'next'), ('zside', 'ready')]:
                    boss.calls.clear()
                    module.on_set_user_var(boss, window, {'key': key, 'value': value})
                    self.assertEqual(boss.calls, [('set-user-vars', '--match=id:7', key)])
                run.assert_not_called()
            self.assertNotIn(7, module._ready)
            module._refresh(boss)
            self.assertEqual(window.written, [])
            with patch.object(module.zkitty, 'snapshot', return_value=[{'session': 'x', 'vars': None}]):
                self.assertIsNone(module.on_program_status_change(boss, window, {}))
            self.assertIn('AttributeError', Path(directory, 'watcher.log').read_text())

    def test_sync_uses_shared_dock_and_keeps_launch_guard(self):
        from unittest.mock import patch
        class Tab(list):
            id = 8
        with tempfile.TemporaryDirectory() as directory:
            pane = Window('alpha', 1)
            boss = Boss([pane], pane, '')
            boss.all_tabs = [Tab([pane])]
            module = load(directory, boss)
            with patch.object(module.zkitty, 'dock') as dock, patch.object(module, '_refresh'):
                for _ in range(4):
                    module._sync()
                self.assertEqual(dock.call_count, 3)
                dock.assert_called_with(boss, 8, 'alpha')


class PushTests(unittest.TestCase):
    def test_ready_views_dedup_status_ticks_and_pruning(self):
        import json
        from types import SimpleNamespace as NS
        with tempfile.TemporaryDirectory() as directory:
            def pane(wid, name, dock=False):
                return NS(id=wid, created_in_session_name=name,
                          user_vars={'role': 'sidebar'} if dock else {},
                          child=NS(argv=['/any/zside'] if dock else ['/bin/zsh']),
                          program_status=NS(as_list=lambda: records if wid == 1 else []),
                          screen=NS(last_reported_cwd=None), cwd_of_child='/tmp',
                          written=[], write_to_child=lambda data: windows[wid].written.append(data))
            records = [{'state': 'working', 'app': 'pi'}]
            windows = {i: pane(i, 'a' if i < 3 else 'b', i in (2, 4)) for i in range(1, 5)}
            class Tab(list):
                pass
            a, b = Tab([windows[1], windows[2]]), Tab([windows[3], windows[4]])
            a.id, b.id = 11, 12
            a.active_window, b.active_window = windows[1], windows[3]
            manager = NS(active_tab=a)
            a.tab_manager_ref = b.tab_manager_ref = lambda: manager
            boss = Boss(list(windows.values()), windows[1], '')
            boss.all_tabs = [a, b]
            module = load(directory, boss)
            module._refresh(boss)
            self.assertEqual([w.written for w in windows.values()], [[], [], [], []])
            for wid in (2, 4):
                module.on_set_user_var(boss, windows[wid], {'key': 'zside', 'value': 'ready'})
                self.assertEqual(boss.calls[-1], ('set-user-vars', f'--match=id:{wid}', 'zside'))
            va, vb = (json.loads(windows[i].written[-1][4:-2]) for i in (2, 4))
            self.assertEqual([va['current'], vb['current']], ['a', 'b'])
            self.assertEqual([va['agents'][0]['on'], vb['agents'][0]['on']], [True, False])
            self.assertEqual([s['name'] for s in va['spaces']], ['a', 'b'])
            module._push(boss)
            self.assertEqual([len(windows[i].written) for i in (2, 4)], [1, 1])
            records[0]['state'] = 'done'
            module._push(boss)
            self.assertEqual([len(windows[i].written) for i in (2, 4)], [2, 2])
            module._tick(boss)
            self.assertEqual(windows[2].written[-1], module.zcore.TICK)
            self.assertEqual(len(windows[4].written), 2)
            module._ready.discard(2)
            module._tick(boss)
            self.assertEqual(len(windows[2].written), 3)
            boss.all_tabs = []
            module._push(boss)
            self.assertEqual(module._ready, set())
            self.assertEqual(module._sent, {})

    def test_callbacks_and_timers_log_exceptions_and_log_rotates(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            module = load(directory)
            class Broken:
                @property
                def all_tabs(self):
                    raise RuntimeError('broken tabs')
            self.assertIsNone(module.on_focus_change(Broken(), None, {'focused': True}))
            path = Path(directory) / 'watcher.log'
            self.assertIn('Traceback', path.read_text())
            self.assertIn('broken tabs', path.read_text())
            with patch.object(module, 'add_timer') as timer:
                module.on_load(None, {})
                self.assertIsNone(timer.call_args_list[0].args[0](0))
            self.assertIn('AttributeError', path.read_text())
            path.write_text('x' * (256 * 1024 + 1))
            module._log('rotated')
            self.assertIn('rotated', path.read_text())
            self.assertLess(path.stat().st_size, 100)
            with patch('builtins.open', side_effect=OSError):
                module._log('unwritable')  # The only deliberately dropped error.

    def test_clock_redraws_tab_bars_without_watchers_each_minute(self):
        # tab_bar.py's clock: the C call, not TabManager.mark_tab_bar_dirty, which would run
        # on_tab_bar_dirty and save every workspace each minute. An idle kitty renders the
        # dirty bar only once its main loop wakes (spike /tmp/kt/run9.sh, kitty 0.50.0).
        from unittest.mock import call, patch
        shown = types.SimpleNamespace(os_window_id=3, tab_bar_hidden=False, tab_bar_should_be_visible=True)
        hidden = types.SimpleNamespace(os_window_id=4, tab_bar_hidden=True, tab_bar_should_be_visible=True)
        boss = types.SimpleNamespace(all_tab_managers=[shown, hidden])
        with tempfile.TemporaryDirectory() as directory:
            module = load(directory, boss)
            with patch.object(module, 'mark_tab_bar_dirty') as mark, \
                 patch.object(module, 'wakeup_main_loop') as wake, \
                 patch.object(module, 'add_timer') as timer, \
                 patch.object(module.time, 'time', return_value=120.5):
                module._clock()
                self.assertEqual(mark.call_args_list, [call(3, True), call(4, False)])
                wake.assert_called_once_with()
                self.assertAlmostEqual(timer.call_args.args[1], 59.55)  # just after the next minute
                self.assertFalse(timer.call_args.args[2])
                timer.reset_mock()
                module.on_load(None, {})
                self.assertIn(1.0, [c.args[1] for c in timer.call_args_list])
                self.assertEqual(len(timer.call_args_list), 3)
            self.assertFalse(module._save_pending)
            self.assertEqual(list(Path(directory).iterdir()), [])


class NamesTests(unittest.TestCase):
    def test_missing_names_imports_constants_and_functions(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            module = load(directory)
            modules = {}
            classes = {}
            for path, names in module.INTERNALS:
                mod, name = path.split(':')
                stub = modules.setdefault(mod, types.ModuleType(mod))
                cls = type(name, (), dict.fromkeys(names.split()))
                setattr(stub, name, cls)
                classes[name] = cls
            def init(self):
                self.argv = []
            del classes['Child'].argv
            classes['Child'].__init__ = init
            for mod, names in module.FUNCTIONS:
                for name in names.split():
                    setattr(modules.setdefault(mod, types.ModuleType(mod)), name, lambda *a: None)
            modules['kitty.constants'] = types.SimpleNamespace(config_dir=directory)
            with patch.dict(sys.modules, modules):
                self.assertEqual(module._missing(), [])
                del classes['Boss'].active_tab
                sys.modules['kitty.child'] = None
                del modules['kitty.constants'].config_dir
                modules['kitty.fast_data_types'].add_timer = None
                modules['kitty.fast_data_types'].get_boss = None
                self.assertEqual(module._missing(), [
                    'Boss.active_tab', 'Child.argv', 'kitty.constants.config_dir',
                    'kitty.fast_data_types.add_timer', 'kitty.fast_data_types.get_boss'])
                modules['kitty.constants'].config_dir = 1
                self.assertIn('kitty.constants.config_dir', module._missing())

    def test_load_checks_once_and_opens_only_one_error_tab(self):
        from unittest.mock import patch
        for missing in ([], ['Boss.active_tab', 'Child.argv']):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as directory:
                window = Window('', 1)  # this check has a window ready for the error tab
                boss = Boss([window], window, '')
                module = load(directory, boss)
                with patch.object(module, 'add_timer') as timer, patch.object(module, '_missing', return_value=missing):
                    module.on_load(boss, {})
                    self.assertEqual(timer.call_count, 3)
                    self.assertEqual([c.args[0].__name__ for c in timer.call_args_list], ['_restore', '_check', '_clock'])
                    for call in timer.call_args_list:
                        self.assertEqual(call.args[1:], (1.0, False))
                    timer.call_args_list[1].args[0](0)
                    self.assertEqual(timer.call_count, 3)  # clean or launched: no retry
                log = Path(directory, 'watcher.log')
                if missing:
                    self.assertEqual(boss.calls, [('launch', '--type=tab', '--tab-title',
                                     'watcher error', '/usr/bin/less', '+G', str(log))])
                    self.assertEqual(len(log.read_text().splitlines()), 1)
                    self.assertIn('kitty no longer has: ' + ', '.join(missing), log.read_text())
                else:
                    self.assertEqual(boss.calls, [])
                    self.assertFalse(log.exists())


    def test_check_waits_for_window_and_logs_missing_names_once(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            boss = Boss([], None, '')
            module = load(directory, boss)
            timers = []
            with patch.object(module, 'add_timer', side_effect=lambda *args: timers.append(args)), \
                 patch.object(module, '_missing', return_value=['Boss.active_tab']):
                module._safe(module._check)(0)
                self.assertEqual(boss.calls, [])
                self.assertEqual(len(timers), 1)
                timers[0][0](0)
                self.assertEqual(boss.calls, [])
                self.assertEqual(len(timers), 2)
                boss.all_windows = [Window('', 1)]
                timers[1][0](0)
                self.assertEqual(len(boss.calls), 1)
                self.assertEqual(boss.calls[0][:4], ('launch', '--type=tab', '--tab-title', 'watcher error'))
                self.assertEqual([t[1:] for t in timers], [(0.3, False)] * 2)
            log = Path(directory, 'watcher.log').read_text()
            self.assertEqual(log.count('kitty no longer has:'), 1)
            self.assertEqual(len(log.splitlines()), 1)

    def test_check_retries_launch_ten_times_then_logs_last_error(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            boss = Boss([Window('', 1)], None, '')
            module = load(directory, boss)
            timers = []
            with patch.object(module, 'add_timer', side_effect=lambda *args: timers.append(args)), \
                 patch.object(module, '_missing', return_value=['Boss.active_tab']), \
                 patch.object(boss, 'call_remote_control', side_effect=RuntimeError('launch failed')) as launch:
                module._safe(module._check)(0)
                for i in range(10):
                    self.assertEqual(len(timers), i + 1)
                    self.assertNotIn('Traceback', Path(directory, 'watcher.log').read_text())
                    timers[i][0](0)
                self.assertEqual(len(timers), 10)
                self.assertEqual(launch.call_count, 11)
                self.assertEqual([t[1:] for t in timers], [(0.3, False)] * 10)
            log = Path(directory, 'watcher.log').read_text()
            self.assertEqual(log.count('kitty no longer has:'), 1)
            self.assertEqual(log.count('Traceback'), 1)
            self.assertIn('RuntimeError: launch failed', log)

    def test_check_without_all_windows_launches_immediately(self):
        from unittest.mock import Mock, patch
        with tempfile.TemporaryDirectory() as directory:
            boss = types.SimpleNamespace(call_remote_control=Mock())
            module = load(directory, boss)
            with patch.object(module, 'add_timer') as timer, \
                 patch.object(module, '_missing', return_value=['Boss.all_windows']):
                module._safe(module._check)(0)
                boss.call_remote_control.assert_called_once()
                timer.assert_not_called()


class ContractTests(unittest.TestCase):
    def test_real_kitty_open_actions_and_hint_processor_contract(self):
        code = f"""
import os, sys
sys.dont_write_bytecode = True
from pathlib import Path
from types import SimpleNamespace as NS
from kitty.open_actions import actions_for_url
from kitty.fast_data_types import set_options
from kitty.options.types import defaults
set_options(defaults)
from kittens.hints.main import load_custom_processor
processor = load_custom_processor({str(KITTY_DIR / 'zkitty.py')!r})
import zkitty
text = Path({str(KITTY_DIR / 'open-actions.conf')!r}).read_text()
for url, expected in [
    ('src/a.ts:7', ('sh', '-c', 'exec nvim "+$' + '{{1##*:}}" -- "$' + '{{1%:*}}"', '_', 'src/a.ts:7')),
    ('file:///a.py#12', ('nvim', '+12', '--', '/a.py')),
    ('file:///a.ts', ('nvim', '--', '/a.ts')),
    ('file:///a.csv', ('nvim', '--', '/a.csv')),
]:
    action, = actions_for_url(url, text)
    assert action.func == 'launch', action
    assert action.args[:8] == ('--type=overlay', '--cwd=current', '/bin/bash', '-c',
        'exec /bin/bash ~/.config/kitty/bin/zrun "$@"', '_', '.', expected[0]), action
    assert action.args[7:] == expected, action
calls = []
window = NS(id=7, screen=NS(last_reported_cwd=b'kitty-shell-cwd://box/host/folder'))
boss = NS(window_id_map={{7: window}}, call_remote_control=lambda w, args: calls.append(args))
os.environ['ZWS_HOST'] = 'winpc'
processor['handle_result']([], dict(customize_processing='zkitty.py', type='url', programs=[],
    match=['file://AnshulJoshi/host/a.py#12'], groupdicts=[{{}}]), 7, boss, [])
assert calls == [('launch', '--type=overlay', '--match=id:7', '/bin/bash', zkitty.ZRUN,
                  '/host/folder', 'nvim', '+12', '--', '/host/a.py')], calls
"""
        result = subprocess.run([KITTY, "+runpy", code], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(os.path.exists(KITTY), "kitty is not installed")
    def test_kitty_still_has_the_internals_workspaces_py_uses(self):
        code = (f"import sys; sys.dont_write_bytecode = True; sys.path.insert(0, {str(KITTY_DIR)!r}); "
                "import workspaces; missing = workspaces._missing(); "
                "sys.exit('kitty no longer has: ' + ', '.join(missing) if missing else 0)")
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([KITTY, "+runpy", code], capture_output=True, text=True,
                                    env=dict(os.environ, ZWS_DIR=directory), timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(list(Path(directory).iterdir()), [])

    @unittest.skipUnless(shutil.which("zmx"), "zmx is not installed")
    def test_zmx_ls_lines_keep_the_fields_the_scripts_parse(self):
        lines = subprocess.run(["zmx", "ls"], capture_output=True, text=True, timeout=30).stdout.splitlines()
        if not lines:
            self.skipTest("no zmx session to list")
        for line in lines:
            with self.subTest(line=line):
                fields = dict(part.strip().lstrip("→ ").split("=", 1) for part in line.split("\t") if "=" in part)
                self.assertLessEqual({"name", "pid", "clients", "created", "cwd"}, set(fields))
                self.assertTrue(fields["pid"].isdigit(), fields)


if __name__ == "__main__":
    unittest.main(verbosity=2)
