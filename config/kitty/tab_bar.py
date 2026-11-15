"""Tab bar (tab_bar_style custom): kitty's powerline tabs, then the workspace's cmd+alt+N number
and the time at the right end.

kitty runs this file itself; draw_tab_with_powerline and the draw arguments are not a documented
API (checked against 0.50.0 by workspaces.py's INTERNALS and FUNCTIONS). A failing draw_tab makes
kitty log the error and fall back to its own style. workspaces.py redraws the bar each minute.
"""
import os
import sys
import time

FOLDER = os.path.dirname(os.path.abspath(__file__))
if FOLDER not in sys.path:
    sys.path.insert(0, FOLDER)
import zcore
import zkitty

from kitty.fast_data_types import Color, get_boss
from kitty.tab_bar import as_rgb, draw_tab_with_powerline

_current = ''  # the active tab's workspace; tabs are drawn in order, so it is known by the last one


def clock() -> str:
    return time.strftime('%I:%M %p', time.localtime()).lstrip('0')  # 6:38 PM


def draw_tab(draw_data, screen, tab, before, max_tab_length, index, is_last, extra_data):
    global _current
    if index == 1:
        _current = ''
    if tab.is_active:
        _current = tab.active_session_name
    tab_data = draw_data
    if zkitty.instance_host():
        screen.cursor.fg = as_rgb(0)
        screen.cursor.bg = as_rgb(int(draw_data.tab_fg(tab)))
        # Colors, not ints: kitty's soft separator between two inactive tabs calls
        # Color.contrast on them, and a TypeError there falls back to its fade tabs.
        black = Color(0, 0, 0)
        tab_data = draw_data._replace(active_fg=black, active_bg=draw_data.active_fg,
                                      inactive_fg=black, inactive_bg=draw_data.inactive_fg)
    end = draw_tab_with_powerline(tab_data, screen, tab, before, max_tab_length, index, is_last, extra_data)
    if is_last and not extra_data.for_layout:  # a layout pass measures tabs; the right end is not one
        view = zcore.view(zkitty.snapshot(get_boss()))
        text = f' {zcore.status(view, _current, clock())} '
        if screen.cursor.x + len(text) <= screen.columns:
            screen.cursor.x = screen.columns - len(text)
            screen.cursor.fg = as_rgb(int(draw_data.inactive_fg))
            screen.cursor.bg = as_rgb(int(draw_data.default_bg))
            screen.cursor.bold = False
            screen.draw(text)
    return end
