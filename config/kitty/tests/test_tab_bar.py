"""tab_bar.py: kitty's powerline tabs plus the workspace number and time at the right end."""
import importlib.util
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
