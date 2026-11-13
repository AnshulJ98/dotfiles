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

    def test_rows_layout_actions_and_purity(self):
        obj = view('/repo')
        before = json.dumps(obj)
        body, clicks = self.side.rows(obj, {'a': ('Repo', 'main', '↑2 ↓1'), 'b': ('Bee', '', '')},
                                      'a', 32, 24)
        plain = [re.sub(r'\x1b\[[0-9;]*m', '', r) for r in body]
        self.assertEqual(len(body), 24)
        self.assertEqual(len(clicks), 24)
        self.assertIn('48;5;8', body[2])
        self.assertIn('Repo', plain[2])
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

    def test_splitter_is_linear_and_bounds_trailing_sequences(self):
        for data in (b'{' * 1048576, b'\x1b_zv{' * 209716, b'\x1b_zv' + b'{' * 1048576):
            start = time.monotonic()
            rest, mouse, obj, tick = self.side.split_input(data)
            self.assertLess(time.monotonic() - start, .5)
            self.assertLessEqual(len(rest), 65536)
            self.assertEqual((mouse, obj, tick), ([], None, False))
        for size in (65536, 65537):
            rest = self.side.split_input(b'\x1b_zv' + b'{' * (size - 4))[0]
            self.assertEqual(len(rest), size if size <= 65536 else 0)

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
            script.write_text(SCRIPT.read_text().replace('/opt/homebrew/bin', str(root))
                              .replace('/Applications/kitty.app/Contents/MacOS', str(root)))
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
