"""Pure renderer checks and a real raw-pty draw-before-git regression."""
import base64
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import subprocess
import struct
import termios
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / 'bin/zside'


def load():
    loader = importlib.machinery.SourceFileLoader('zside_test', str(SCRIPT))
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
    with patch.dict(os.environ):
        loader.exec_module(module)
    return module


def view(cwd=''):
    return dict(v=1, current='a', spaces=[
        dict(name='a', shown='', cwd=cwd, state='working', tabs=1),
        dict(name='b', shown='Bee', cwd='', state='', tabs=1)],
        agents=[dict(pane=7, space='a', tab=1, app='pi', state='working',
                     model='sonnet', ctx='25%', on=True)])


def frame(obj):
    return b'\x1b_zv' + json.dumps(obj).encode() + b'\x1b\\'


class SideTests(unittest.TestCase):
    def setUp(self):
        self.side = load()

    def test_left_clicks_emit_only_intents_and_menu_still_uses_zws(self):
        with patch.object(self.side.subprocess, 'run', side_effect=AssertionError('process')), \
             patch.object(self.side.subprocess, 'Popen', side_effect=AssertionError('process')), \
             patch.object(self.side, 'write') as write:
            for action, words in [(('space', 'beta'), 'space beta'), (('pane', 41, 'beta'), 'pane 41')]:
                self.side.act(action)
                wire = write.call_args.args[0]
                encoded = base64.b64encode(words.encode()).decode()
                self.assertEqual(wire, '\x1b]1337;SetUserVar=zdo=' + encoded + '\x07')
                self.assertEqual(base64.b64decode(wire.split('zdo=')[1][:-1]).decode(), words)
            self.assertEqual(write.call_count, 2)
            self.side.act(None)
            self.assertEqual(write.call_count, 2)
        with patch.object(self.side, 'run') as run:
            self.side.act(('menu', 'rename', 'beta', '/repo'))
            run.assert_called_once_with(self.side.ZWS, 'rename', 'beta')

    def test_repo_directory_worktrees_detached_and_missing_head(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            normal = root / 'normal'
            (normal / '.git').mkdir(parents=True)
            head = normal / '.git/HEAD'
            head.write_text('ref: refs/heads/feature/topic\n')
            (normal / 'sub').mkdir()
            for cwd in (normal, normal / 'sub'):
                self.assertEqual(self.side.repo(str(cwd)), (str(normal), 'feature/topic'))
            for pointer in (str(normal / '.git'), '../normal/.git'):
                worktree = root / 'worktree'
                worktree.mkdir(exist_ok=True)
                (worktree / '.git').write_text('gitdir: ' + pointer + '\n')
                self.assertEqual(self.side.repo(str(worktree)), (str(worktree), 'feature/topic'))
            head.write_text('123deadbeef\n')
            self.assertEqual(self.side.repo(str(normal)), (str(normal), 'HEAD'))
            head.unlink()
            self.assertEqual(self.side.repo(str(normal)), (str(normal), ''))
            self.assertEqual(self.side.repo(str(root)), ('', ''))
            self.assertEqual(self.side.repo(''), ('', ''))

    def test_git_ceiling_directories_stop_the_search_like_git_does(self):
        # Where a parent folder is itself a checkout (Homebrew's prefix), folders under it are not its repo.
        loader = importlib.machinery.SourceFileLoader('zpick_rows_test', str(SCRIPT.parent / 'zpick-rows'))
        rows = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
        loader.exec_module(rows)
        with tempfile.TemporaryDirectory() as directory:
            outer = Path(directory).resolve() / 'outer'
            (outer / '.git').mkdir(parents=True)
            (outer / '.git/HEAD').write_text('ref: refs/heads/main\n')
            inner = outer / 'mine/project'
            inner.mkdir(parents=True)
            self.assertEqual(self.side.repo(str(inner)), (str(outer), 'main'))
            self.assertEqual(rows.git_ref(str(inner)), ('main', str(outer)))
            with patch.dict(os.environ, GIT_CEILING_DIRECTORIES=f'/nowhere:{outer}/'):
                self.assertEqual(self.side.repo(str(inner)), ('', ''))
                self.assertEqual(rows.git_ref(str(inner)), ('', ''))
                # git still finds a repo when started in the ceiling itself
                self.assertEqual(self.side.repo(str(outer)), (str(outer), 'main'))
                self.assertEqual(rows.git_ref(str(outer)), ('main', str(outer)))

    def picker_rows(self, view, ls, kitty=None, files=None, home=None, origin=''):
        loader = importlib.machinery.SourceFileLoader('zpick_rows_x', str(SCRIPT.parent / 'zpick-rows'))
        rows = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
        loader.exec_module(rows)
        def run(*cmd):
            if cmd[:2] == ('zmx', 'ls'):
                return ls
            return json.dumps(kitty or []) if cmd[0] == 'kitten' else ''
        with tempfile.TemporaryDirectory() as directory, patch.object(rows, 'run', run), \
                patch.object(rows, 'DIR', directory), patch.object(rows, 'HOME', home or rows.HOME), \
                patch.object(sys, 'argv', ['zpick-rows', view, origin]), patch('builtins.print') as out:
            for name, text in (files or {}).items():
                Path(directory, name + '.kitty-session').write_text(text)
            rows.main()
        lines = [l.split('\t') for l in out.call_args[0][0].split('\n')]
        return [(l[0], l[1], re.sub(r'\x1b\[[0-9;]*m', '', l[5])) for l in lines]

    def test_picker_rows_keep_the_session_zmx_marks_as_current(self):
        # Inside a session, zmx ls points at it with an arrow; zmx-pick must still list it.
        ls = ('  name=logs\tpid=11\tclients=0\tcreated=1\tcwd=file://box/srv\n'
              '\u2192 name=here\tpid=12\tclients=1\tcreated=1\tcwd=file://box/srv\n')
        self.assertEqual([r[1] for r in self.picker_rows('zmx', ls) if r[0] == 'det'], ['logs', 'here'])

    def test_picker_rows_tab_with_one_pane_is_one_row(self):
        def pane(i, title, holder):
            return {'id': i, 'title': title, 'cwd': '/srv', 'is_active': i != 3, 'session_name': 'lab',
                    'user_vars': {'holder': holder}, 'foreground_processes': [{'cmdline': ['zsh']}]}
        kitty = [{'is_active': True, 'tabs': [
            {'id': 7, 'title': 'solo', 'is_active': True, 'windows': [pane(1, 'solo', 'h1')]},
            {'id': 8, 'title': 'pair', 'is_active': False, 'windows': [pane(2, 'left', 'h2'), pane(3, 'right', 'h3')]}]}]
        got = self.picker_rows('all', '', kitty)
        self.assertEqual([(k, t) for k, t, _ in got], [('ws', 'lab'), ('pane', '1'), ('tab', '8'), ('pane', '2'), ('pane', '3')])
        self.assertTrue(got[1][2].lstrip(' ├─').startswith('solo '), got[1][2])
        self.assertIn('zsh', got[1][2])  # the pane's columns sit on the tab's row
        self.assertIn('2 tabs', got[0][2])

    def test_picker_rows_zmx_view_groups_by_kitty_space_where_a_session_file_names_it(self):
        # A session sits in the space whose session file holds it, wherever its process has gone;
        # one no file names falls back to its folder.
        ls = ''.join(f'  name={n}\tpid=1{i}\tclients=1\tcreated=1\tcwd=file://box{c}\n' for i, (n, c) in enumerate((
            ('dev-1', '/work/Dev'), ('dev-2', '/work/Dev/dotfiles'), ('dot-1', '/elsewhere'), ('loose', '/srv'))))
        files = {'dev': 'new_tab\ncd /work/Dev\nlaunch --var=holder=dev-1\nnew_tab\nlaunch --var=holder=dev-2\n',
                 'dotfiles': 'new_tab\ncd /work/Dev/dotfiles\nlaunch --var=holder=dot-1\n'}
        got = self.picker_rows('zmx', ls, files=files)
        self.assertEqual([(k, t) for k, t, _ in got], [
            ('hdr', ''), ('det', 'dev-1'), ('det', 'dev-2'), ('hdr', ''), ('det', 'dot-1'), ('hdr', ''), ('det', 'loose')])
        self.assertTrue(got[0][2].lstrip(' ◇').startswith('Dev 2 sessions'), got[0][2])
        self.assertTrue(got[3][2].lstrip(' ◇').startswith('elsewhere 1 session'), got[3][2])  # named as cmd+alt+g names it
        self.assertTrue(got[5][2].lstrip(' ◇').startswith('srv 1 session'), got[5][2])

    def test_picker_rows_zmx_view_lists_every_session_without_kitty(self):
        # zmx-pick outside kitty: no kitty calls, attached sessions listed too, no closed workspaces.
        loader = importlib.machinery.SourceFileLoader('zpick_rows_zmx', str(SCRIPT.parent / 'zpick-rows'))
        rows = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
        loader.exec_module(rows)
        ls = ('  name=logs\tpid=11\tclients=0\tcreated=1\tcwd=file://box/srv\n'
              '  name=pi-agent\tpid=12\tclients=1\tcreated=1\tcwd=file://box/srv\n')
        calls = []
        def run(*cmd):
            calls.append(cmd[0])
            return ls if cmd[:2] == ('zmx', 'ls') else ''
        with tempfile.TemporaryDirectory() as directory, patch.object(rows, 'run', run), \
                patch.object(rows, 'DIR', directory), patch.object(sys, 'argv', ['zpick-rows', 'zmx']), \
                patch('builtins.print') as out:
            Path(directory, 'closed.kitty-session').write_text('cd /x\nlaunch\n')
            rows.main()
        lines = [l.split('\t') for l in out.call_args[0][0].split('\n')]
        self.assertNotIn('kitten', calls)
        self.assertEqual([(l[0], l[1]) for l in lines], [('hdr', ''), ('det', 'logs'), ('det', 'pi-agent')])
        self.assertIn('sessions', lines[0][5])
        shown = [re.sub(r'\x1b\[[0-9;]*m', '', l[5]) for l in lines]
        self.assertTrue(shown[1].lstrip(' └├─').startswith('logs '), shown[1])  # the name leads: fzf searches it
        self.assertTrue(shown[2].lstrip(' └├─').startswith('pi-agent · attached'), shown[2])
        self.assertTrue(shown[0].lstrip(' ◇').startswith('srv 2 sessions'), shown[0])  # the folder heads them
        self.assertNotIn('kitty', shown[2])

    def test_picker_rows_zmx_view_groups_sessions_by_checkout(self):
        # cmd+alt+g's workspace level, rebuilt from where each session is: one group per git
        # checkout (its branch alongside) or plain folder, and home as "home".
        loader = importlib.machinery.SourceFileLoader('zpick_rows_zmx2', str(SCRIPT.parent / 'zpick-rows'))
        rows = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
        loader.exec_module(rows)
        with tempfile.TemporaryDirectory() as root:
            repo, other, home = (os.path.join(root, d) for d in ('repo', 'notes', 'home'))
            os.makedirs(os.path.join(repo, '.git'))
            os.makedirs(os.path.join(repo, 'sub'))
            Path(repo, '.git', 'HEAD').write_text('ref: refs/heads/main\n')
            ls = ''.join(f'  name={n}\tpid=1{i}\tclients=0\tcreated=1\tcwd=file://box{c}\n' for i, (n, c) in enumerate((
                ('alpha', repo), ('logs', other), ('beta', os.path.join(repo, 'sub')), ('shell', home))))
            with patch.object(rows, 'run', lambda *cmd: ls if cmd[:2] == ('zmx', 'ls') else ''), \
                    patch.object(rows, 'HOME', home), patch.object(rows, 'DIR', root), \
                    patch.object(sys, 'argv', ['zpick-rows', 'zmx']), patch('builtins.print') as out:
                rows.main()
        lines = [l.split('\t') for l in out.call_args[0][0].split('\n')]
        self.assertEqual([(l[0], l[1]) for l in lines], [
            ('hdr', ''), ('det', 'alpha'), ('det', 'beta'), ('hdr', ''), ('det', 'logs'), ('hdr', ''), ('det', 'shell')])
        shown = [re.sub(r'\x1b\[[0-9;]*m', '', l[5]) for l in lines]
        self.assertTrue(shown[0].lstrip(' ◇').startswith('repo 2 sessions'), shown[0])
        self.assertTrue(shown[0].rstrip().endswith('main'), shown[0])
        self.assertTrue(shown[1].lstrip(' ├─').startswith('alpha '), shown[1])
        self.assertIn('sub', shown[2])  # a session below the checkout's top says where
        self.assertTrue(shown[3].lstrip(' ◇').startswith('notes 1 session'), shown[3])
        self.assertTrue(shown[5].lstrip(' ◇').startswith('home'), shown[5])

    def test_picker_rows_zmx_attached_mark_survives_a_long_name_and_detached_view_drops_them(self):
        loader = importlib.machinery.SourceFileLoader('zpick_rows_zmx3', str(SCRIPT.parent / 'zpick-rows'))
        rows = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
        loader.exec_module(rows)
        long = 'dotfiles-337362b2-3f92-4c90-bc63-a12d354ccb81'
        ls = (f'  name={long}\tpid=11\tclients=1\tcreated=1\tcwd=file://box/srv\n'
              '  name=logs\tpid=12\tclients=0\tcreated=1\tcwd=file://box/srv\n')
        out = {}
        for view in ('zmx', 'zmx-detached'):
            with tempfile.TemporaryDirectory() as directory, \
                    patch.object(rows, 'run', lambda *cmd: ls if cmd[:2] == ('zmx', 'ls') else ''), \
                    patch.object(rows, 'DIR', directory), patch.object(rows, 'WIDTH', 60), \
                    patch.object(sys, 'argv', ['zpick-rows', view]), patch('builtins.print') as p:
                rows.main()
            out[view] = [l.split('\t') for l in p.call_args[0][0].split('\n')]
        shown = [re.sub(r'\x1b\[[0-9;]*m', '', l[5]) for l in out['zmx']]
        self.assertIn('· attached', shown[1])
        self.assertIn('…', shown[1])  # the name gives way, not the mark
        self.assertEqual([(l[0], l[1]) for l in out['zmx-detached']], [('hdr', ''), ('det', 'logs')])

    def test_rows_layout_actions_and_purity(self):
        obj = view('/repo')
        before = json.dumps(obj)
        body, clicks = self.side.rows(obj, {'a': ('Repo', 'main', '↑2 ↓1'), 'b': ('Bee', '', '')},
                                      'a', 32, 24)
        plain = [re.sub(r'\x1b\[[0-9;]*m', '', r) for r in body]
        self.assertEqual(len(body), 24)
        self.assertEqual(len(clicks), 24)
        self.assertIn('48;5;8', body[2])
        # cmd+alt+N's number, then the state glyph; the branch lines up under the name
        self.assertEqual(plain[2], ' 1 ◐ Repo'.ljust(32))
        self.assertEqual(plain[3], '     main ↑2 ↓1'.ljust(32))
        self.assertEqual(plain[8], ' 2 · Bee'.ljust(32))
        self.assertIn('main ↑2 ↓1', plain[3])
        self.assertEqual(clicks[2:4], [('space', 'a')] * 2)
        self.assertIn('Rename', plain[4])
        self.assertIn('Open worktree', plain[7])
        self.assertEqual(clicks[4], ('menu', 'rename', 'a', '/repo'))
        self.assertIn('pi · Repo 1', plain[-2])
        self.assertIn('sonnet · 25%', plain[-1])
        self.assertEqual(clicks[-2:], [('pane', 7, '')] * 2)
        self.assertEqual(json.dumps(obj), before)
        for height in (0, 1, 3, 6):
            self.assertEqual(len(self.side.rows(obj, {'a': ('a', '', ''), 'b': ('b', '', '')},
                                                '', 24, height)[0]), height)

    def test_agent_in_unlisted_workspace_uses_its_name(self):
        obj = view()
        obj['agents'][0]['space'] = 'gone'
        body, _ = self.side.rows(obj, {'a': ('A', '', ''), 'b': ('B', '', '')}, '', 32, 24)
        self.assertTrue(any('pi · gone 1' in row for row in body))

    def test_frames_at_every_cut_and_stray_bytes(self):
        split, wire = self.side.split_input, frame(view())
        for cut in range(len(wire) + 1):
            rest, mouse, first, tick = split(wire[:cut])
            tail, more, second, tock = split(rest + wire[cut:])
            self.assertEqual([v for v in (first, second) if v is not None], [view()])
            self.assertEqual((tail, mouse + more, tick or tock), (b'', [], False))
        for junk in (b'letters', b'\x1b[A', b'\x1b', json.dumps(view()).encode() + b'\n', b'\n'):
            self.assertEqual(split(junk)[1:], ([], None, False))
            rest, mouse, obj, tick = split(junk + wire + junk + wire + junk)
            self.assertEqual((mouse, obj, tick), ([], view(), False))
            self.assertEqual(rest, b'\x1b' if junk == b'\x1b' else b'')
        for invalid in ({}, [], dict(view(), v=2), dict(view(), current=0),
                        dict(view(), spaces={}), dict(view(), agents={})):
            self.assertIsNone(split(frame(invalid))[2])
        self.assertIsNone(split(b'\x1b_zvnot json\x1b\\')[2])

    def test_large_view_split_across_reads_is_returned_once(self):
        obj = dict(view(), current='x' * (100 * 1024))
        wire = frame(obj)
        for cut in (70 * 1024, len(wire) - 1):
            rest, mouse, first, tick = self.side.split_input(wire[:cut])
            tail, more, second, tock = self.side.split_input(rest + wire[cut:])
            self.assertEqual([v for v in (first, second) if v is not None], [obj])
            self.assertEqual((tail, mouse + more, tick or tock), (b'', [], False))
            self.assertEqual(self.side.split_input(tail), (b'', [], None, False))

    def test_splitter_is_linear_and_bounds_trailing_sequences(self):
        for data in (b'{' * 1048576, b'\x1b_zv{' * 209716, b'\x1b_zv' + b'{' * 1048576):
            start = time.monotonic()
            rest, mouse, obj, tick = self.side.split_input(data)
            self.assertLess(time.monotonic() - start, .5)
            self.assertLessEqual(len(rest), self.side.REST_MAX)
            self.assertEqual((mouse, obj, tick), ([], None, False))
        for size in (self.side.REST_MAX, self.side.REST_MAX + 1):
            rest = self.side.split_input(b'\x1b_zv' + b'{' * (size - 4))[0]
            self.assertEqual(len(rest), size if size <= self.side.REST_MAX else 0)

    def test_render_names_without_a_process_and_repo_each_draw(self):
        obj = view('/tmp/project')
        obj['spaces'] += [dict(name='empty', cwd='', shown='', state='', tabs=1),
                          dict(name='home', cwd=os.path.expanduser('~'), shown='', state='', tabs=1)]
        git = self.side.Git()
        with patch.object(self.side, 'write') as write, patch.object(self.side, 'repo', return_value=('', '')) as repo:
            for _ in range(2):
                self.side.render(obj, git, '')
            self.assertEqual(repo.call_count, 8)
            frame = write.call_args.args[0]
            for name in ('project', 'Bee', 'empty', 'home'):
                self.assertIn(name, frame)
            self.assertIn('2026h', frame)
            self.assertEqual(git.queue, [])

    def test_stream_splitter_partial_mouse_glued_views_ticks_junk(self):
        split = self.side.split_input
        part = b'\x1b[<0;4;'
        rest, mouse, obj, tick = split(part)
        self.assertEqual((rest, mouse, obj, tick), (part, [], None, False))
        report = b'\x1b[<0;4;3M'
        for cut in range(len(report) + 1):
            tail, first, _, _ = split(report[:cut])
            remaining, second, _, _ = split(tail + report[cut:])
            self.assertEqual(first + second, [(b'0', b'4', b'3', b'M')])
            self.assertEqual(remaining, b'')
        wire = frame(view())
        tail, _, partial, _ = split(wire[:10])
        self.assertIsNone(partial)
        self.assertEqual(split(tail + wire[10:])[2], view())
        rest, mouse, obj, tick = split(rest + b'3M' + wire)
        self.assertEqual(mouse, [(b'0', b'4', b'3', b'M')])
        self.assertEqual(obj, view())
        self.assertEqual(rest, b'')
        second = dict(view(), current='b')
        rest, mouse, obj, tick = split(wire + frame(second) + b'\x1b_zt\x1b\\junk\n[]\n{"v":2}\npartial')
        self.assertEqual(obj, second)
        self.assertTrue(tick)
        self.assertEqual(rest, b'')
        self.assertEqual(split(b'\x1b_zt\x1b\\'), (b'', [], None, True))
        self.assertEqual(split(b'junk\n')[1:], ([], None, False))

    def test_git_queue_throttles_serializes_and_times_out(self):
        git = self.side.Git()
        self.assertIsNone(git.top)
        git.request(['/a', '/b', '/a'], '/a', 0)
        self.assertEqual(git.queue, ['/a', '/b'])
        class Pipe:
            def fileno(self): return 42
            def read(self): return b''
            def close(self): pass
        class Process:
            stdout = Pipe()
            code = None
            def poll(self): return self.code
            def kill(self): self.code = -9
        proc = Process()
        with patch.object(self.side.subprocess, 'Popen', return_value=proc) as popen, patch.object(self.side.os, 'set_blocking'):
            git.start(0)
            git.start(0)
            self.assertEqual(popen.call_count, 1)
            self.assertEqual(popen.call_args.args[0],
                             [self.side.GIT, '-C', '/a', 'rev-list', '--left-right', '--count', '@{u}...HEAD'])
            self.assertEqual(popen.call_args.kwargs['env']['GIT_OPTIONAL_LOCKS'], '0')
            git.output, proc.code = b'1\t2\n', 0
            self.assertTrue(git.collect([], 1))
            self.assertEqual(git.cache['/a'], (1, '↑2 ↓1'))
            git.queue.clear()
            git.request(['/a'], '/a', 3.9)
            self.assertEqual(git.queue, [])
            git.request(['/a'], '/a', 4)
            git.start(4)
            proc.code = None
            self.assertTrue(git.collect([], 7.1))
            self.assertEqual(proc.code, -9)
            self.assertEqual(git.cache['/a'], (7.1, ''))
        git.request(['/a'], '/other', 37)
        self.assertEqual(git.queue, [])
        git.request(['/a'], '/other', 37.1)
        self.assertEqual(git.queue, ['/a'])

    @unittest.skipUnless(Path('/usr/bin/python3').exists(), '/usr/bin/python3 is missing')
    def test_pty_ready_draws_before_git_and_exits_on_close(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / 'example-repo'
            (repo / '.git').mkdir(parents=True)
            (repo / '.git/HEAD').write_text('ref: refs/heads/feature\n')
            fake = """import os, pathlib, sys, time
root = pathlib.Path(os.environ['FAKE_ROOT'])
with (root / 'calls').open('a') as f: f.write(pathlib.Path(sys.argv[0]).name + '\\n')
if pathlib.Path(sys.argv[0]).name == 'git':
    assert os.environ['GIT_OPTIONAL_LOCKS'] == '0'
    while not (root / 'release').exists(): time.sleep(.01)
    print('1\\t2')
"""
            for name in ('kitten', 'zmx', 'lsof', 'git'):
                path = root / name
                path.write_text('#!/usr/bin/python3\n' + fake)
                path.chmod(0o700)
            script = root / 'zside'
            script.write_text(SCRIPT.read_text().replace('/opt/homebrew/bin', str(root)))
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 40, 0, 0))
            proc = subprocess.Popen(['/usr/bin/python3', str(script)], stdin=slave, stdout=slave,
                                    stderr=subprocess.PIPE, env=dict(os.environ, FAKE_ROOT=str(root),
                                    PATH=str(root) + ':' + os.environ['PATH']))
            os.close(slave)
            output = bytearray()

            def until(predicate):
                deadline = time.monotonic() + 5
                while not predicate():
                    self.assertLess(time.monotonic(), deadline, bytes(output))
                    ready, _, _ = select.select([master], [], [], min(.02, max(0, deadline - time.monotonic())))
                    if ready:
                        output.extend(os.read(master, 65536))

            try:
                until(lambda: b'zside=cmVhZHk=\x07' in output)
                self.assertNotIn(b'\x1b[?2026h', output)
                self.assertFalse((root / 'calls').exists())
                os.write(master, frame(view(str(repo))))
                until(lambda: b'feature' in output and b'example-repo' in output and b'\x1b[?2026l' in output)
                self.assertNotIn('↑'.encode(), output)
                self.assertFalse((root / 'release').exists())
                until(lambda: (root / 'calls').exists())
                (root / 'release').touch()
                until(lambda: '↑2'.encode() in output)
                output.clear()
                os.write(master, b'\x1b_zt\x1b\\')
                until(lambda: b'\x1b[?2026l' in output)
                self.assertEqual((root / 'calls').read_text().splitlines(), ['git'])
                os.close(master)
                master = None
                self.assertEqual(proc.wait(timeout=5), 0)
                self.assertEqual(proc.stderr.read(), b'')
            finally:
                if master is not None:
                    os.close(master)
                if proc.poll() is None:
                    proc.kill()
                proc.wait(timeout=5)
                proc.stderr.close()
