"""Table-driven tests for the pure workspace core."""
import ast
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

sys.dont_write_bytecode = True
CORE_PATH = Path(__file__).resolve().parents[1] / 'zcore.py'
spec = importlib.util.spec_from_file_location('zcore', CORE_PATH)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def pane(id, tab, session, **extra):
    return dict(dict(id=id, tab=tab, session=session, cwd='/first', vars={},
                     status=[], active=False), **extra)


def snapshot():
    return core.view([
        pane(1, 10, 'ignored', vars={'role': 'sidebar', 'ws_name': 'Alpha'},
             status=[{'state': 'blocked'}]),
        pane(2, 10, 'a', status=[{'state': 'idle'}], active=True),
        pane(3, 10, 'other', status=[{'state': 'working', 'app': None},
                                    {'state': 'error', 'app': 'ignored'}],
             vars={'pi_model': 'model', 'pi_ctx': '42'}),
        pane(4, 20, 'b', cwd='/second', status=[{'state': 'done', 'app': ''}]),
        pane(5, 30, 'a', cwd='/not-first', status=[{'state': 'blocked', 'app': 'pi'}],
             active=True, vars={'ws_name': 'Later'}),
        pane(6, 30, ''),
        pane(7, 40, 'skip', vars={'role': 'sidebar'}, status=[{'state': 'blocked'}]),
        pane(8, 50, '', status=[{'state': 'blocked'}]),
        pane(9, 50, 'skip', status=[{'state': 'blocked'}]),
    ])


class CoreTests(unittest.TestCase):
    def test_holder(self):
        for cwd, expected in [
            ('/Users/a/Dev/My Repo', 'my-repo-U'), ('/Users/a', 'home-U'),
            ('/', '--U'), ('', '--U'), ('/x/My Repo/', 'my-repo-U'),
            ('/x/a.b_c+d', 'a.b_c-d-U'), ('/x/Ä Z', '--z-U'),
        ]:
            with self.subTest(cwd=cwd):
                self.assertEqual(core.holder(cwd, '/Users/a', 'U'), expected)

    def test_answer(self):
        for name, pi, expected in [
            ('n', '', b': zq n -\n'),
            ('my name', '/p/x y.jsonl', b': zq my%20name %2Fp%2Fx%20y.jsonl\n'),
            ('a\nb% c', '/x\ny', b': zq a%0Ab%25%20c %2Fx%0Ay\n'),
        ]:
            with self.subTest(name=name):
                data = core.answer(name, pi)
                self.assertEqual(data, expected)
                self.assertEqual(data.count(b' '), 3)
                self.assertEqual(data.count(b'\n'), 1)

    def test_worst(self):
        rows = [([], ''), (['unknown'], 'unknown'), (['unknown', 'idle'], 'idle')]
        rows += [([state], state) for state in core.RANK]
        rows += [(core.RANK, 'blocked'), (list(reversed(core.RANK)), 'blocked')]
        for states, expected in rows:
            with self.subTest(states=states):
                self.assertEqual(core.worst(states), expected)

    def test_cwd(self):
        rows = [
            (None, '/fallback'), ('', '/fallback'), (b'', '/fallback'),
            (b'kitty-shell-cwd://6e:f5:83:a1:db:ca/tmp/ksp/deep', '/tmp/ksp/deep'),
            ('kitty-shell-cwd://host/Users/a/my dir/50%20off', '/Users/a/my dir/50%20off'),
            ('file://host/Users/a/my%20dir', '/Users/a/my dir'),
            ('file:///tmp/x', '/tmp/x'), ('kitty-shell-cwd://host', '/fallback'),
            ('ftp://h/x', '/fallback'), ('garbage', '/fallback'),
            (b'kitty-shell-cwd://host/tmp/\xff', '/tmp/\ufffd'),
            ('file://[bad/tmp/x', '/tmp/x'),
        ]
        for report, expected in rows:
            with self.subTest(report=report):
                self.assertEqual(core.cwd_of(report, '/fallback'), expected)

    def test_view(self):
        expected = {
            'spaces': [
                dict(name='a', tabs=2, cwd='/first', shown='Alpha', state='blocked'),
                dict(name='b', tabs=1, cwd='/second', shown='', state='done')],
            'agents': [
                dict(pane=2, space='a', tab=1, app='agent', state='idle',
                     model='', ctx='', tab_id=10, active=True),
                dict(pane=3, space='a', tab=1, app='agent', state='error',
                     model='model', ctx='42', tab_id=10, active=False),
                dict(pane=4, space='b', tab=1, app='agent', state='done',
                     model='', ctx='', tab_id=20, active=False),
                dict(pane=5, space='a', tab=2, app='pi', state='blocked',
                     model='', ctx='', tab_id=30, active=True)]}
        self.assertEqual(snapshot(), expected)

    def test_missing_keys(self):
        empty = {'spaces': [], 'agents': []}
        rows = [
            ([], empty), ([{}], empty), ([{'tab': 1}, {'tab': 2}], empty),
            ([{'session': 'x', 'status': [{}]}],
             {'spaces': [dict(name='x', tabs=1, cwd='', shown='', state='')],
              'agents': [dict(pane=0, space='x', tab=1, app='agent', state='',
                              model='', ctx='', tab_id=0, active=False)]}),
            ([{'session': 'x', 'vars': None}], AttributeError),
        ]
        for panes, expected in rows:
            with self.subTest(panes=panes):
                before = json.dumps(panes)
                if expected is AttributeError:
                    with self.assertRaises(AttributeError):
                        core.view(panes)
                else:
                    self.assertEqual(core.view(panes), expected)
                self.assertEqual(json.dumps(panes), before)

    def test_line(self):
        view = snapshot()
        before = json.dumps(view)
        messages = []
        for tab, ons in [(10, [True, False, False, False]),
                         (30, [False, False, False, True]), (99, [False] * 4)]:
            with self.subTest(tab=tab):
                data = core.line(view, 'a', tab)
                expected_agents = []
                for agent, on in zip(view['agents'], ons):
                    expected_agents.append(dict(
                        {k: v for k, v in agent.items() if k not in ('tab_id', 'active')},
                        on=on))
                expected = dict(v=1, current='a', spaces=view['spaces'], agents=expected_agents)
                self.assertEqual(json.loads(data), expected)
                self.assertEqual(data, json.dumps(expected, sort_keys=True,
                                                  separators=(',', ':')).encode() + b'\n')
                self.assertTrue(data.endswith(b'\n'))
                self.assertEqual(data.count(b'\n'), 1)
                messages.append([{k: v for k, v in a.items() if k != 'on'}
                                 for a in json.loads(data)['agents']])
        self.assertEqual(messages[0], messages[1])
        self.assertEqual(messages[1], messages[2])
        self.assertEqual(json.dumps(view), before)

    def test_intent(self):
        rows = [
            ('a', ['switch', '2'], [('goto', 'b')]),
            ('a', ['switch', '1'], [('goto', 'a')]),
            ('a', ['space', 'b'], [('goto', 'b')]),
            ('a', ['space', 'missing'], []),
            ('a', ['next'], [('goto', 'b')]), ('b', ['next'], [('goto', 'a')]),
            ('a', ['prev'], [('goto', 'b')]), ('b', ['prev'], [('goto', 'a')]),
            ('missing', ['next'], [('goto', 'b')]),
            ('missing', ['prev'], [('goto', 'b')]),
            ('a', ['agent', '3'], [('goto', 'b'), ('focus', 4)]),
            ('b', ['agent', '3'], [('focus', 4)]),
            ('a', ['pane', '5'], [('focus', 5)]),
            ('b', ['pane', '2'], [('goto', 'a'), ('focus', 2)]),
            ('a', ['pane', '41'], []),
        ]
        rows += [('a', words, []) for words in [
            [], ['switch'], ['nope'], ['switch', 'x'], ['agent', '0'],
            ['switch', '0'], ['switch', '-1'], ['switch', '3'], ['agent', '5'],
            ['agent', '-1'], ['agent', 'x'], ['pane', 'x'], ['pane', '999'],
            ['next', 'extra'], ['agent', '1', 'extra']]]
        view = snapshot()
        before = json.dumps(view)
        for current, words, expected in rows:
            with self.subTest(current=current, words=words):
                self.assertEqual(core.intent(view, current, words), expected)
        self.assertEqual(json.dumps(view), before)

    def test_empty_and_malformed_commands(self):
        for view in [{}, {'spaces': [], 'agents': []}, {'spaces': None, 'agents': None}]:
            for words in [['next'], ['prev'], ['switch', '1'], ['agent', '1'], ['pane', '1']]:
                with self.subTest(view=view, words=words):
                    if view.get('spaces', []) is None:
                        with self.assertRaises(TypeError):
                            core.intent(view, '', words)
                    else:
                        self.assertEqual(core.intent(view, '', words), [])
        self.assertEqual(json.loads(core.line({}, '', 0)),
                         dict(v=1, current='', spaces=[], agents=[]))
        with self.assertRaises(AttributeError):
            core.line({'agents': [None]}, '', 0)
        with self.assertRaises(TypeError):
            core.intent({'spaces': None, 'agents': None}, '', ['next'])
        for words in (['switch', 'x'], ['agent', '1.5'], ['pane', '']):
            self.assertEqual(core.intent(snapshot(), '', words), [])

    def test_additional_ordering(self):
        rows = [
            ([pane(1, 1, 'a', status=[{'state': 'unknown'}]), pane(2, 2, 'a')],
             [dict(name='a', tabs=2, cwd='/first', shown='', state='unknown')]),
            ([pane(1, 1, 'a'), pane(2, 2, 'b'), pane(3, 1, 'a')],
             [dict(name='a', tabs=2, cwd='/first', shown='', state=''),
              dict(name='b', tabs=1, cwd='/first', shown='', state='')]),
        ]
        for panes, expected in rows:
            with self.subTest(panes=panes):
                self.assertEqual(core.view(panes)['spaces'], expected)
        view = core.view([pane(41, 1, 'a', status=[{}]), pane(42, 2, 'b'), pane(43, 3, 'c')])
        for current, words, expected in [
            ('b', ['pane', '41'], [('goto', 'a'), ('focus', 41)]),
            ('a', ['pane', '41'], [('focus', 41)]),
            ('unknown', ['next'], [('goto', 'b')]),
            ('unknown', ['prev'], [('goto', 'c')]),
            ('c', ['next'], [('goto', 'a')]),
            ('a', ['prev'], [('goto', 'c')]),
        ]:
            with self.subTest(current=current, words=words):
                self.assertEqual(core.intent(view, current, words), expected)

    def test_imports(self):
        self.assertIn('Pure', core.__doc__)
        self.assertIn('Python 3.9', core.__doc__)
        tree = ast.parse(CORE_PATH.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    with self.subTest(module=alias.name):
                        self.assertIn(alias.name, {'__future__', 'json', 'urllib.parse'})
            elif isinstance(node, ast.ImportFrom):
                with self.subTest(module=node.module):
                    self.assertIn(node.module, {'__future__', 'json', 'urllib.parse'})
                    self.assertEqual(node.level, 0)

    @unittest.skipUnless(Path('/usr/bin/python3').exists(), '/usr/bin/python3 is absent')
    def test_system_python(self):
        result = subprocess.run(
            ['/usr/bin/python3', '-B', '-c',
             "import sys; sys.path.insert(0, 'config/kitty'); import zcore; "
             "print(zcore.worst(['idle','blocked']))"],
            cwd=CORE_PATH.parents[2], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'blocked\n')
