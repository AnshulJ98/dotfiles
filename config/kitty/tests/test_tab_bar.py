"""tab_bar.py: kitty's powerline tabs plus the workspace number and time at the right end."""
import importlib.util
from collections import namedtuple
from pathlib import Path
import sys
import time
import types
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True  # config/kitty is kitty's live config folder
KITTY_DIR = Path(__file__).resolve().parents[1]


class Cursor:
    x, fg, bg, bold = 0, 0, 0, False


class Screen:
    def __init__(self, columns):
        self.columns, self.cursor, self.cells = columns, Cursor(), [' '] * columns

    def draw(self, text):
        for ch in text:
            self.cells[self.cursor.x] = ch
            self.cursor.x += 1

    def line(self):
        return ''.join(self.cells)


def powerline(draw_data, screen, tab, before, max_tab_length, index, is_last, extra_data):
    screen.draw(f' {tab.title} ')
    return screen.cursor.x


class Tab(types.SimpleNamespace):
    pass


class Draw(namedtuple('Draw', 'active_fg active_bg inactive_fg inactive_bg default_bg')):
    def tab_fg(self, tab):
        return self.active_fg if tab.is_active else self.inactive_fg


def load():
    kitty = types.ModuleType('kitty')
    fast = types.ModuleType('kitty.fast_data_types')
    fast.get_boss = lambda: 'boss'
    bar = types.ModuleType('kitty.tab_bar')
    bar.draw_tab_with_powerline = powerline
    bar.as_rgb = lambda x: x
    modules = {'kitty': kitty, 'kitty.fast_data_types': fast, 'kitty.tab_bar': bar}
    with patch.dict(sys.modules, modules):
        spec = importlib.util.spec_from_file_location('tab_bar_test', KITTY_DIR / 'tab_bar.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


def panes():
    return [dict(id=1, tab=10, session='a', cwd='', vars={}, status=[], active=True),
            dict(id=2, tab=20, session='b', cwd='', vars={}, status=[], active=True)]


class TabBarTests(unittest.TestCase):
    def setUp(self):
        self.bar = load()
        self.data = types.SimpleNamespace(inactive_fg=7, default_bg=0)
        self.tabs = [Tab(title='one', is_active=False, active_session_name='b'),
                     Tab(title='two', is_active=True, active_session_name='b')]

    def draw(self, screen, for_layout):
        extra = types.SimpleNamespace(for_layout=for_layout)
        ends = []
        for i, tab in enumerate(self.tabs):
            ends.append(self.bar.draw_tab(self.data, screen, tab, screen.cursor.x, 99, i + 1,
                                          i == len(self.tabs) - 1, extra))
        return ends

    def test_right_end_shows_the_active_workspace_number_and_time(self):
        screen = Screen(40)
        with patch.object(self.bar.zkitty, 'snapshot', return_value=panes()) as snapshot, \
             patch.object(self.bar.time, 'strftime', return_value='14:31'):
            self.assertEqual(self.draw(screen, True), [5, 10])
            self.assertEqual(screen.line().rstrip(), ' one  two')  # layout passes add nothing
            snapshot.assert_not_called()
            screen = Screen(40)
            self.assertEqual(self.draw(screen, False), [5, 10])  # tab extents unchanged
        self.assertEqual(screen.line(), ' one  two'.ljust(29) + ' 2 · 14:31 ')
        self.assertEqual((screen.cursor.fg, screen.cursor.bg), (7, 0))
        snapshot.assert_called_once_with('boss')

    def test_host_inverts_only_tabs_and_local_passes_data_untouched(self):
        data = Draw(0xabcdef, 1, 0x123456, 2, 3)
        self.data = data
        for host in ('box', ''):
            screen = Screen(40)
            with patch.object(self.bar.zkitty, 'instance_host', return_value=host), \
                    patch.object(self.bar.zkitty, 'snapshot', return_value=panes()), \
                    patch.object(self.bar, 'draw_tab_with_powerline', wraps=powerline) as draw:
                self.draw(screen, False)
            for call in draw.call_args_list:
                passed = call.args[0]
                if host:
                    self.assertEqual(passed, data._replace(active_fg=0, active_bg=data.active_fg,
                                                          inactive_fg=0, inactive_bg=data.inactive_fg))
                else:
                    self.assertIs(passed, data)
            self.assertEqual((screen.cursor.fg, screen.cursor.bg), (data.inactive_fg, data.default_bg))
            self.assertEqual(self.data, data)

    def test_powerline_sees_host_cursor_colours_and_local_cursor_is_untouched(self):
        data = Draw(0xabcdef, 1, 0x123456, 2, 3)
        for host in ('box', ''):
            for active in (True, False):
                with self.subTest(host=host, active=active):
                    screen = Screen(40)
                    screen.cursor.fg, screen.cursor.bg = 41, 42
                    tab = Tab(title='one', is_active=active, active_session_name='a')
                    # tab_fg can include per-tab overrides, not just the theme's fg.
                    colour = 0x987654 if active else 0x654321
                    seen = []
                    def draw(*args):
                        seen.append((screen.cursor.fg, screen.cursor.bg))
                        return powerline(*args)
                    with patch.object(self.bar.zkitty, 'instance_host', return_value=host), \
                            patch.object(Draw, 'tab_fg', return_value=colour) as tab_fg, \
                            patch.object(self.bar, 'as_rgb', side_effect=lambda c: (c << 8) | 2), \
                            patch.object(self.bar, 'draw_tab_with_powerline', side_effect=draw):
                        self.bar.draw_tab(data, screen, tab, 0, 30, 1, False,
                                          types.SimpleNamespace(for_layout=False))
                    self.assertEqual(seen, [(2, (colour << 8) | 2)] if host else [(41, 42)])
                    if host:
                        tab_fg.assert_called_once_with(tab)
                    else:
                        tab_fg.assert_not_called()

    def test_clock_is_12_hour_without_seconds(self):
        for hour, expected in [(18, '6:38 PM'), (9, '9:38 AM'), (0, '12:38 AM'), (12, '12:38 PM')]:
            moment = time.struct_time((2026, 11, 13, hour, 38, 3, 4, 317, 0))
            with patch.object(self.bar.time, 'localtime', return_value=moment):
                self.assertEqual(self.bar.clock(), expected)

    def test_outside_a_workspace_only_the_time_and_no_room_draws_nothing(self):
        for tab in self.tabs:
            tab.active_session_name = ''
        with patch.object(self.bar.zkitty, 'snapshot', return_value=panes()), \
             patch.object(self.bar.time, 'strftime', return_value='14:31'):
            screen = Screen(20)
            self.draw(screen, False)
            self.assertEqual(screen.line(), ' one  two'.ljust(13) + ' 14:31 ')
            for tab in self.tabs:
                tab.active_session_name = 'b'
            screen = Screen(19)  # ' 2 · 14:31 ' needs 11 cells after the 10 the tabs use
            self.draw(screen, False)
            self.assertEqual(screen.line().rstrip(), ' one  two')


if __name__ == '__main__':
    unittest.main()
