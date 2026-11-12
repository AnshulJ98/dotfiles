# Watcher for workspaces (kitty sessions shown one at a time; bin/zws, bin/zpick):
#  - keeps a session file per open workspace in ~/.local/state/kitty/workspaces, so goto_session
#    reopens it with its tabs, splits and panes. Saves are debounced: the tab bar redraws on
#    every title change.
#  - lists the open workspaces in .open there and reopens them when kitty starts on a workspace
#    (bin/kmain after a quit, a crash or a reboot).
#  - gives every workspace tab a sidebar dock (bin/zside) and pokes the visible one to redraw.
#    'set-user-vars zside=toggle' (cmd+alt+b) hides or shows them all.
import os
import re
import time

# Not documented kitty API, checked against kitty 0.50.0: add_timer and get_boss here, and below
# boss.all_windows / all_tabs / active_window, window.created_in_session_name / os_window_id /
# user_vars / write_to_child, tab.tab_manager_ref and its active_tab. tests/test_workspaces.py
# fails when one of them goes. The on_* callbacks and boss.call_remote_control are documented.
from kitty.fast_data_types import add_timer, get_boss

DIR = os.environ.get('ZWS_DIR') or os.path.expanduser('~/.local/state/kitty/workspaces')
OPEN = os.path.join(DIR, '.open')
OFF = os.path.join(DIR, '.sidebar-off')
SIDEBAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'zside')
WIDTH = '24'
_save_pending = False
_sync_pending = False
_quitting = False  # windows close one by one on quit; saving then would drop workspaces from .open
_owner = False  # this kitty started on a workspace and has reopened the rest, so it keeps .open
_tries = 0
_launched: dict[int, list[float]] = {}  # tab id -> recent dock launches


def _file(name: str) -> str:
    return os.path.join(DIR, name + '.kitty-session')


def _names(boss) -> list[str]:
    """Open workspaces, the active one last."""
    names: list[str] = []
    for w in boss.all_windows:
        if w.created_in_session_name and w.created_in_session_name not in names:
            names.append(w.created_in_session_name)
    active = boss.active_window
    current = active.created_in_session_name if active else ''
    if current in names:
        names.remove(current)
        names.append(current)
    return names


def _place(path: str, own_window: bool) -> None:
    """Start the file with new_os_window only for a workspace that has a window of its own.

    kitty writes that line ahead of every OS window but the least recently focused one, so with
    two windows open it depends on where the focus was, and a workspace saved with it reopens in
    a new window."""
    try:
        with open(path) as f:
            lines = f.read().splitlines()
    except OSError:
        return
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and lines[0].strip() == 'new_os_window':
        lines.pop(0)
    if own_window:
        lines.insert(0, 'new_os_window')
    with open(path + '.tmp', 'w') as f:
        f.write('\n'.join(lines) + '\n')
    os.replace(path + '.tmp', path)


def _save(timer_id: int | None = None) -> None:
    global _save_pending
    _save_pending = False
    if _quitting:
        return
    boss = get_boss()
    names = _names(boss)
    os.makedirs(DIR, exist_ok=True)
    where: dict[str, set[int]] = {}  # workspace -> its OS windows
    for w in boss.all_windows:
        if w.created_in_session_name:
            where.setdefault(w.created_in_session_name, set()).add(w.os_window_id)
    first = min((i for ids in where.values() for i in ids), default=0)  # the window workspaces share
    for name in names:
        boss.call_remote_control(None, ('action', 'save_as_session', '--save-only',
                                        f'--match=session:^{re.escape(name)}$', _file(name)))
        _place(_file(name), first not in where.get(name, {first}))
    if _owner and names:
        with open(OPEN + '.tmp', 'w') as f:
            f.write('\n'.join(names) + '\n')
        os.replace(OPEN + '.tmp', OPEN)  # a crash mid-write must not empty the list


def _restore(timer_id: int | None = None) -> None:
    global _owner, _tries
    boss = get_boss()
    names = _names(boss)
    if not names:
        if not list(boss.all_windows) and _tries < 10:  # loaded before the first window exists
            _tries += 1
            add_timer(_restore, 0.3, False)
        return  # a plain kitty: no workspace at start
    try:
        saved = [n for n in open(OPEN).read().split('\n') if n]
    except OSError:
        saved = []
    todo = [n for n in saved if n not in names and os.path.exists(_file(n))]
    if todo and saved[-1] != todo[-1] and saved[-1] in names:
        todo.append(saved[-1])  # end on the workspace that was active
    for name in todo:
        boss.call_remote_control(None, ('action', 'goto_session', _file(name)))
    _owner = True


def _docks(tab) -> list:
    return [w for w in tab if w.user_vars.get('role') == 'sidebar']


def _poke(boss) -> None:
    for tab in boss.all_tabs:
        tm = tab.tab_manager_ref()
        if tm is not None and tm.active_tab is tab:
            for w in _docks(tab):
                w.write_to_child(b'r')


def _sync(timer_id: int | None = None) -> None:
    """One sidebar dock per workspace tab while the sidebar is on, none while it is off."""
    global _sync_pending
    _sync_pending = False
    boss = get_boss()
    off = os.path.exists(OFF)
    for tab in list(boss.all_tabs):
        docks = _docks(tab)
        name = next((w.created_in_session_name for w in tab if w.created_in_session_name and w not in docks), '')
        if docks and (off or not name):
            for d in docks:
                boss.call_remote_control(None, ('close-window', f'--match=id:{d.id}'))
        elif not docks and name and not off:
            # A sidebar that exits at once would be relaunched forever; three in 10 s is enough.
            recent = _launched[tab.id] = [t for t in _launched.get(tab.id, []) if time.monotonic() - t < 10]
            if len(recent) >= 3:
                continue
            recent.append(time.monotonic())
            # a renamed workspace keeps its name when the panes that carried it are gone
            named = next((w.user_vars['ws_name'] for w in boss.all_windows
                          if w.created_in_session_name == name and w.user_vars.get('ws_name')), '')
            boss.call_remote_control(None, (
                'launch', '--type=tab-dock', f'--match=id:{tab.id}', '--dock-edge=left', f'--dock-size={WIDTH}',
                '--dock-skip-focus', '--keep-focus', '--add-to-session', name, '--var', 'role=sidebar',
                *(('--var', f'ws_name={named}') if named else ()), SIDEBAR))
    _poke(boss)


def on_load(boss, data) -> None:
    add_timer(_restore, 1.0, False)


def on_tab_bar_dirty(boss, window, data) -> None:
    global _save_pending, _sync_pending
    if not _sync_pending:
        _sync_pending = True
        add_timer(_sync, 0.05, False)
    if not _save_pending:
        _save_pending = True
        add_timer(_save, 2.0, False)


def on_focus_change(boss, window, data) -> None:
    if data.get('focused'):
        _poke(boss)


def on_program_status_change(boss, window, data) -> None:
    _poke(boss)


def on_set_user_var(boss, window, data) -> None:
    if data.get('key') == 'zside' and data.get('value') == 'toggle':
        if os.path.exists(OFF):
            os.remove(OFF)
        else:
            os.makedirs(DIR, exist_ok=True)
            open(OFF, 'w').close()
        # Drop the var again: a saved session would replay it as --var and toggle on restore.
        boss.call_remote_control(None, ('set-user-vars', f'--match=id:{window.id}', 'zside'))
        _sync()
    else:  # a rename (ws_name) or pi's model and context use
        on_tab_bar_dirty(boss, window, data)


def on_quit(boss, window, data) -> None:
    global _quitting
    if data.get('confirmed'):
        _save()
        _quitting = True
