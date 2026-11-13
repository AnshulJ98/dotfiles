"""The kitty boundary is read-only and never starts processes."""
import ast
from pathlib import Path
import sys
from types import SimpleNamespace as NS
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import zkitty


class Pane:
    id = 7
    created_in_session_name = None
    user_vars = {}
    program_status = NS(as_list=lambda: [{'state': 'working', 'app': 'pi'}])
    screen = NS(last_reported_cwd=b'kitty-shell-cwd://host/reported path')

    @property
    def cwd_of_child(self):
        raise AssertionError('unnecessary child cwd read')


class Sidebar(Pane):
    user_vars = {'role': 'sidebar'}

    @property
    def screen(self):
        raise AssertionError('sidebar screen read')


class KittyTests(unittest.TestCase):
    def test_snapshot_all_fields_and_lazy_cwd(self):
        w, dock = Pane(), Sidebar()
        tab = type('Tab', (list,), {})([w, dock])
        tab.id, tab.active_window = 3, w
        panes = zkitty.snapshot(NS(all_tabs=[tab]))
        self.assertEqual(panes[0], dict(id=7, tab=3, session='', vars={},
                                       status=[{'state': 'working', 'app': 'pi'}],
                                       active=True, cwd='/reported path'))
        self.assertEqual(panes[1]['cwd'], '')
        self.assertFalse(panes[1]['active'])
        self.assertIsNot(panes[1]['vars'], dock.user_vars)
        fallback = NS(**{k: getattr(w, k) for k in
                        ('id', 'created_in_session_name', 'user_vars', 'program_status')},
                      screen=NS(last_reported_cwd=None), cwd_of_child='/fallback')
        tab[:] = [fallback]
        self.assertEqual(zkitty.snapshot(NS(all_tabs=[tab]))[0]['cwd'], '/fallback')

    def test_no_process_api_in_kitty_thread(self):
        for name in ('workspaces.py', 'zcore.py', 'zkitty.py', 'zdo.py'):
            path = ROOT / name
            if not path.exists():
                continue
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                with self.subTest(file=name, line=getattr(node, 'lineno', 0)):
                    if isinstance(node, (ast.Import, ast.ImportFrom)):
                        modules = ([node.module or ''] if isinstance(node, ast.ImportFrom)
                                   else [a.name for a in node.names])
                        self.assertFalse(any(m.split('.')[0] in
                                             {'subprocess', 'multiprocessing', 'pty', 'socket'} for m in modules))
                    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == 'os':
                        self.assertFalse(node.attr in {'system', 'popen', 'fork', 'posix_spawn'}
                                         or node.attr.startswith(('exec', 'spawn', 'posix_spawn')))
            if name == 'workspaces.py':
                for node in tree.body:
                    if isinstance(node, ast.FunctionDef) and node.name.startswith('on_'):
                        self.assertIn('_safe', [ast.unparse(d) for d in node.decorator_list])
                for node in ast.walk(tree):
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'add_timer':
                        self.assertEqual(ast.unparse(node.args[0].func), '_safe')
