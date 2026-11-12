# Keep a session file per open workspace (kitty session) in ~/.local/state/kitty/workspaces, so
# goto_session can reopen it with its tabs, splits and panes (bin/zws, bin/zpick). Saves are
# debounced: the tab bar redraws on every title change.
import os
import re

from kitty.fast_data_types import add_timer, get_boss

DIR = os.path.expanduser('~/.local/state/kitty/workspaces')
_pending = False


def _save(timer_id: int | None = None) -> None:
    global _pending
    _pending = False
    boss = get_boss()
    names = {w.created_in_session_name for w in boss.all_windows if w.created_in_session_name}
    os.makedirs(DIR, exist_ok=True)
    for name in names:
        path = os.path.join(DIR, name + '.kitty-session')
        boss.call_remote_control(None, ('action', 'save_as_session', '--save-only',
                                        f'--match=session:^{re.escape(name)}$', path))


def on_tab_bar_dirty(boss, window, data) -> None:
    global _pending
    if not _pending:
        _pending = True
        add_timer(_save, 2.0, False)


def on_quit(boss, window, data) -> None:
    if data.get('confirmed'):
        _save()
