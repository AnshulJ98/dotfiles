# Workspace watcher: zkitty runs key/sidebar intents; bin/zws and bin/zpick handle prompts.
#  - keeps a session file per open workspace in ~/.local/state/kitty/workspaces, so goto_session
#    reopens it with its tabs, splits and panes (transient=1 scout panes are not saved).
#    Saves are debounced: the tab bar redraws on
#    every title change.
#  - lists the open workspaces in .open there and reopens them when kitty starts on a workspace
#    (bin/kmain after a quit, a crash or a reboot).
#  - answers bin/zshell's zq query once per pane with its holder and pi_session.
#  - accepts ready/zdo only from role=sidebar windows launched with bin/zside.
#  - gives every workspace tab a sidebar dock (bin/zside) and pushes each its own view.
#    'set-user-vars zside=toggle' (cmd+alt+b) hides or shows them all.
import os
import re
import shlex
import time
import sys

FOLDER = os.path.dirname(os.path.abspath(__file__))
if FOLDER not in sys.path:
    sys.path.insert(0, FOLDER)
import zcore
import zkitty

# Not documented kitty API, checked against kitty 0.50.0: add_timer and get_boss here, and below
# boss.all_windows / all_tabs / active_window, window.created_in_session_name / os_window_id /
# user_vars / write_to_child / screen / program_status / cwd_of_child / child.argv, tab.tab_manager_ref /
# active_window and its manager's active_tab, Screen.last_reported_cwd, ProgramStatus.as_list.
# tests/test_workspaces.py checks these. Callbacks and boss.call_remote_control are documented.
from kitty.fast_data_types import add_timer, get_boss

DIR = zkitty.folder()
_log = zkitty.log
_safe = zkitty.safe
OPEN = os.path.join(DIR, '.open')
OFF = os.path.join(DIR, '.sidebar-off')
_save_pending = False
_sync_pending = False
_quitting = False  # windows close one by one on quit; saving then would drop workspaces from .open
_owner = False  # this kitty started on a workspace and has reopened the rest, so it keeps .open
_tries = 0
_launched: dict[int, list[float]] = {}  # tab id -> recent dock launches
_named: set[int] = set()
_ready: set[int] = set()
_sent: dict[int, bytes] = {}


def _file(name: str) -> str:
    return os.path.join(DIR, name + '.kitty-session')


def _names(boss) -> list[str]:
    """Open workspaces, the active one last."""
    names: list[str] = []
    for w in boss.all_windows:
        if (w.created_in_session_name and w.user_vars.get('transient') != '1'
                and w.created_in_session_name not in names):
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
        if w.created_in_session_name and w.user_vars.get('transient') != '1':
            where.setdefault(w.created_in_session_name, set()).add(w.os_window_id)
    first = min((i for ids in where.values() for i in ids), default=0)  # the window workspaces share
    for name in names:
        boss.call_remote_control(None, ('action', 'save_as_session', '--save-only',
                                        '--match=' + shlex.quote(f'session:^{re.escape(name)}$ and not var:transient=1'),
                                        _file(name)))
        _place(_file(name), first not in where.get(name, {first}))
    if _owner:
        with open(OPEN + '.tmp', 'w') as f:
            f.write(''.join(name + '\n' for name in names))
        os.replace(OPEN + '.tmp', OPEN)  # a crash mid-write must not empty the list


def _restore(timer_id: int | None = None) -> None:
    global _owner, _tries
    boss = get_boss()
    names = _names(boss)
    if not names:
        if not list(boss.all_windows) and _tries < 10:  # loaded before the first window exists
            _tries += 1
            add_timer(_safe(_restore), 0.3, False)
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


def _push(boss) -> None:
    view = zcore.view(zkitty.snapshot(boss))
    existing = set()
    for tab in boss.all_tabs:
        for d in _docks(tab):
            existing.add(d.id)
            if d.id in _ready:
                line = zcore.line(view, d.created_in_session_name or '', tab.id)
                if line and line != _sent.get(d.id):
                    d.write_to_child(line)
                    _sent[d.id] = line
    _named.intersection_update(w.id for tab in boss.all_tabs for w in tab)
    _ready.intersection_update(existing)
    for wid in _sent.keys() - existing:
        del _sent[wid]


def _tick(boss) -> None:
    for tab in boss.all_tabs:
        tm = tab.tab_manager_ref()
        if tm is not None and tm.active_tab is tab:
            for w in _docks(tab):
                if w.id in _ready:
                    w.write_to_child(b'\n')


def _refresh(boss) -> None:
    _push(boss)
    _tick(boss)


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
            zkitty.dock(boss, tab.id, name)
    _refresh(boss)


@_safe
def on_load(boss, data) -> None:
    add_timer(_safe(_restore), 1.0, False)


@_safe
def on_tab_bar_dirty(boss, window, data) -> None:
    global _save_pending, _sync_pending
    if not _sync_pending:
        _sync_pending = True
        add_timer(_safe(_sync), 0.05, False)
    if not _save_pending:
        _save_pending = True
        add_timer(_safe(_save), 2.0, False)


@_safe
def on_focus_change(boss, window, data) -> None:
    if data.get('focused'):
        _refresh(boss)


@_safe
def on_program_status_change(boss, window, data) -> None:
    _refresh(boss)


@_safe
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
    elif data.get('key') == 'zside' and data.get('value') == 'ready':
        boss.call_remote_control(None, ('set-user-vars', f'--match=id:{window.id}', 'zside'))
        if zkitty.is_sidebar(window):
            _ready.add(window.id)
            _sent.pop(window.id, None)
            _push(boss)
    elif data.get('key') == 'zdo' and data.get('value'):
        boss.call_remote_control(None, ('set-user-vars', f'--match=id:{window.id}', 'zdo'))
        if zkitty.is_sidebar(window):
            zkitty.run(boss, data['value'].split())
    elif data.get('key') == 'zq' and data.get('value'):
        if window.id not in _named:
            _named.add(window.id)
            zkitty.attach(boss, window)
        else:
            boss.call_remote_control(None, ('set-user-vars', f'--match=id:{window.id}', 'zq'))
    elif data.get('key') in ('zside', 'zdo', 'zq'):
        return
    else:  # a rename (ws_name) or pi's model and context use
        on_tab_bar_dirty(boss, window, data)


@_safe
def on_quit(boss, window, data) -> None:
    global _quitting
    if data.get('confirmed'):
        _save()
        _quitting = True
