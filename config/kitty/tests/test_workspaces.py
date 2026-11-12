"""workspaces.py's saving, and the undocumented kitty and zmx behaviour the workspace layer uses.

Run by config/herdr/check.sh; re-run after a kitty or zmx upgrade."""
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

# Every kitty internal workspaces.py touches. Checked against kitty 0.50.0.
# No assert in here: kitty's Python strips them.
CONTRACT = """
from kitty.fast_data_types import add_timer, get_boss
from kitty.boss import Boss
from kitty.tabs import Tab, TabManager
from kitty.window import Window
used = (
    (Boss, "all_windows all_tabs active_window call_remote_control"),
    (Window, "created_in_session_name os_window_id user_vars id write_to_child"),
    (Tab, "tab_manager_ref id __iter__"),
    (TabManager, "active_tab"),
)
missing = [f"{cls.__name__}.{name}" for cls, names in used for name in names.split()
           if not hasattr(cls, name) and name not in cls.__init__.__code__.co_names]
if missing or not (callable(add_timer) and callable(get_boss)):
    raise SystemExit(f"kitty no longer has: {missing}")
"""


class Window:
    def __init__(self, session: str, os_window_id: int):
        self.created_in_session_name = session
        self.os_window_id = os_window_id
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
    sys.modules["kitty"] = types.ModuleType("kitty")
    sys.modules["kitty.fast_data_types"] = stub
    os.environ["ZWS_DIR"] = state_dir
    spec = importlib.util.spec_from_file_location("workspaces", KITTY_DIR / "workspaces.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


class ContractTests(unittest.TestCase):
    @unittest.skipUnless(os.path.exists(KITTY), "kitty is not installed")
    def test_kitty_still_has_the_internals_workspaces_py_uses(self):
        result = subprocess.run([KITTY, "+runpy", CONTRACT], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)

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
