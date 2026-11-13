"""The kitty boundary uses remote control only and never starts processes."""
import ast
import importlib.util
import os
import tempfile
from pathlib import Path
import sys
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch

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


class Tab(list):
    def __init__(self, wid, session, status):
        pane = NS(id=wid, created_in_session_name=session, user_vars={},
                  program_status=NS(as_list=lambda: status),
                  screen=NS(last_reported_cwd=b'kitty-shell-cwd://host/live folder'),
                  cwd_of_child='/stale')
        super().__init__([pane])
        self.id, self.active_window = wid + 100, pane


class Boss:
    def __init__(self):
        self.all_tabs = [Tab(7, 'alpha', []), Tab(41, 'beta', [{'app': 'pi', 'state': 'working'}])]
        self.all_windows = [w for t in self.all_tabs for w in t]
        self.active_window = self.all_windows[0]
        self.active_tab = self.all_tabs[0]
        self.calls = []

    def call_remote_control(self, window, args):
        self.calls.append((window, args))
        if args[:2] == ('launch', '--type=tab'):
            self.active_tab = NS(id=999)
            return '50'


class IntentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        env = patch.dict(os.environ, ZWS_DIR=self.directory.name)
        env.start()
        self.addCleanup(env.stop)
        self.boss = Boss()

    def goto(self, name):
        return (None, ('action', 'goto_session', str(Path(self.directory.name) / (name + '.kitty-session'))))

    def test_navigation_and_noops(self):
        for words, ops, calls in [
            (['switch', '2'], [('goto', 'beta')], [self.goto('beta')]),
            (['space', 'beta'], [('goto', 'beta')], [self.goto('beta')]),
            (['next'], [('goto', 'beta')], [self.goto('beta')]),
            (['prev'], [('goto', 'beta')], [self.goto('beta')]),
            (['agent', '1'], [('goto', 'beta'), ('focus', 41)],
             [self.goto('beta'), (None, ('focus-window', '--match=id:41'))]),
            (['pane', '41'], [('goto', 'beta'), ('focus', 41)],
             [self.goto('beta'), (None, ('focus-window', '--match=id:41'))]),
            (['nope'], [], []), ([], [], []), (['switch', '99'], [], []),
        ]:
            with self.subTest(words=words):
                self.boss.calls.clear()
                self.assertEqual(zkitty.run(self.boss, words), ops)
                self.assertEqual(self.boss.calls, calls)
        self.boss.calls.clear()
        self.boss.active_window = self.boss.all_windows[1]
        self.assertEqual(zkitty.run(self.boss, ['agent', '1']), [('focus', 41)])
        self.assertEqual(self.boss.calls, [(None, ('focus-window', '--match=id:41'))])

    def test_tab_here_launches_dock_immediately_with_live_cwd_and_name(self):
        active = self.boss.active_window
        self.boss.all_windows[1].created_in_session_name = 'alpha'
        self.boss.all_windows[1].user_vars['ws_name'] = 'Renamed'
        self.assertEqual(zkitty.run(self.boss, ['tab', 'here']), [('tab', 'alpha')])
        self.assertEqual(self.boss.calls, [
            (active, ('launch', '--type=tab', '--cwd', '/live folder', '--add-to-session', 'alpha')),
            (None, ('launch', '--type=tab-dock', '--match=id:999', '--dock-edge=left', '--dock-size=24',
                    '--dock-skip-focus', '--keep-focus', '--add-to-session', 'alpha', '--var',
                    'role=sidebar', '--var', 'ws_name=Renamed', zkitty.SIDEBAR))])

    def test_tab_without_cwd_sidebar_off_and_outside_workspace(self):
        self.assertEqual(zkitty.run(self.boss, ['tab']), [('tab', 'alpha')])
        self.assertEqual(self.boss.calls[0],
                         (self.boss.active_window, ('launch', '--type=tab', '--add-to-session', 'alpha')))
        self.assertEqual(len(self.boss.calls), 2)
        self.assertNotIn('ws_name=', ' '.join(self.boss.calls[1][1]))
        Path(self.directory.name, '.sidebar-off').touch()
        self.boss.calls.clear()
        zkitty.run(self.boss, ['tab', 'here'])
        self.assertEqual(len(self.boss.calls), 1)
        Path(self.directory.name, '.sidebar-off').unlink()
        self.boss.active_window.created_in_session_name = None
        self.boss.active_window.screen.last_reported_cwd = None
        self.boss.active_window.cwd_of_child = ''
        self.boss.calls.clear()
        self.assertEqual(zkitty.run(self.boss, ['tab', 'here']), [('tab', '')])
        self.assertEqual(self.boss.calls, [(self.boss.active_window, ('launch', '--type=tab'))])

    def test_no_active_window(self):
        self.boss.active_window = None
        self.boss.all_tabs = []
        self.assertEqual(zkitty.run(self.boss, ['tab']), [('tab', '')])
        self.assertEqual(zkitty.run(self.boss, ['next']), [])
        self.assertEqual(self.boss.calls, [(None, ('launch', '--type=tab'))])

    def test_folder_reads_environment_each_time_and_has_default(self):
        self.assertEqual(zkitty.folder(), self.directory.name)
        with patch.dict(os.environ, ZWS_DIR=''):
            self.assertEqual(zkitty.folder(), os.path.expanduser('~/.local/state/kitty/workspaces'))

    def test_no_ui_kitten_dispatch_and_error_logging(self):
        handler = NS(result_handler=lambda **kw: lambda fn: fn if kw == {'no_ui': True} else None)
        modules = {'kittens': NS(), 'kittens.tui': NS(), 'kittens.tui.handler': handler,
                   'kitty': NS(), 'kitty.constants': NS(config_dir=str(ROOT))}
        with patch.dict(sys.modules, modules), patch.object(sys, 'path', [p for p in sys.path if p != str(ROOT)]):
            spec = importlib.util.spec_from_file_location('zdo_test', ROOT / 'zdo.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.__file__, module.__name__ = None, 'kitten'
            self.assertIsNone(module.main([]))
            self.assertIsNone(module.handle_result(['zdo.py', 'switch', '2'], None, 1, self.boss))
            self.assertEqual(sys.path[0], str(ROOT))
            self.assertEqual(self.boss.calls, [self.goto('beta')])
            class Broken:
                active_window = None
                @property
                def all_tabs(self):
                    raise RuntimeError('broken tabs')
            self.assertIsNone(module.handle_result(['zdo.py', 'next'], None, 1, Broken()))
            logged = Path(self.directory.name, 'watcher.log').read_text()
            self.assertIn('Traceback', logged)
            self.assertIn('broken tabs', logged)
            with patch.dict(sys.modules, {'kitty.constants': NS()}):
                self.assertIsNone(module.handle_result([], None, 1, self.boss))
            self.assertIn('ImportError', Path(self.directory.name, 'watcher.log').read_text())


class KittyTests(unittest.TestCase):
    def test_sidebar_requires_role_and_launch_argv(self):
        for role, child, expected in [
            ('sidebar', NS(argv=['/any/where/zside']), True),
            ('sidebar', NS(argv=['/bin/zsh']), False),
            ('sidebar', NS(argv=[]), False), ('sidebar', NS(), False),
            ('sidebar', None, False), ('', NS(argv=[zkitty.SIDEBAR]), False),
        ]:
            self.assertEqual(zkitty.is_sidebar(NS(user_vars={'role': role}, child=child)), expected)
        self.assertFalse(zkitty.is_sidebar(NS(user_vars={'role': 'sidebar'})))

    def test_attach_saved_and_fresh_order(self):
        import uuid
        for saved in ('saved', ''):
            with self.subTest(saved=saved):
                events = []
                window = NS(id=7, user_vars={'holder': saved, 'pi_session': '/p/s.jsonl'},
                            cwd_of_child='/x/My Repo',
                            write_to_child=lambda data: events.append(('write', data)))
                boss = NS(call_remote_control=lambda w, args: events.append((w, args)))
                zkitty.attach(boss, window)
                name = events[0][1].decode().split()[2]
                if saved:
                    self.assertEqual(name, 'saved')
                else:
                    self.assertTrue(name.startswith('my-repo-'))
                    unique = uuid.UUID(name[len('my-repo-'):])
                    self.assertEqual(unique.version, 4)
                    self.assertEqual(str(unique), name[len('my-repo-'):])
                self.assertEqual(events, [
                    ('write', f': zq {name} %2Fp%2Fs.jsonl\n'.encode()),
                    (None, ('set-user-vars', '--match=id:7', 'zq')),
                ] + ([(None, ('set-user-vars', '--match=id:7', 'holder=' + name))]
                     if not saved else []))

    def test_attach_saved_does_not_read_cwd_and_missing_cwd_works(self):
        writes = []
        window = Pane()
        window.user_vars = {'holder': 'saved'}
        window.write_to_child = writes.append
        boss = Boss()
        zkitty.attach(boss, window)
        self.assertEqual(writes, [b': zq saved -\n'])
        with patch.object(zkitty.uuid, 'uuid4', return_value='U'):
            window = NS(id=8, user_vars={}, cwd_of_child=None, write_to_child=writes.append)
            zkitty.attach(boss, window)
        self.assertEqual(writes[-1], b': zq --U -\n')
        self.assertEqual(boss.calls[-1], (None, ('set-user-vars', '--match=id:8', 'holder=--U')))

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
