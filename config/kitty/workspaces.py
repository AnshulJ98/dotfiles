# Workspace watcher: zkitty runs key/sidebar intents; bin/zws and bin/zpick handle prompts.
#  - keeps a session file per open workspace in $ZWS_DIR (default ~/.local/state/kitty/workspaces), so goto_session
#    reopens it with its tabs, splits and panes (transient=1 scout panes are not saved).
#    Saves are debounced: the tab bar redraws on
#    every title change.
#  - lists the open workspaces in .open there and reopens them when kitty starts on a workspace
#    (bin/kmain after a quit, a crash or a reboot).
#  - answers bin/zshell's zq query once per pane with its holder and pi_session, and for a
#    host instance (ZWS_HOST in its environment) that host and the remote folder.
#  - accepts ready/zdo only from role=sidebar windows launched with bin/zside.
#  - gives every workspace tab a sidebar dock (bin/zside) and pushes each its own view.
#    'set-user-vars zside=toggle' (cmd+alt+b) hides or shows them all.
import os
import re
import shlex
import shutil
import time
import sys
from importlib import import_module

FOLDER = os.path.dirname(os.path.abspath(__file__))
if FOLDER not in sys.path:
    sys.path.insert(0, FOLDER)
import zcore
import zkitty

# Undocumented kitty API names (here and in tab_bar.py) are checked by INTERNALS, FUNCTIONS and _missing below.
from kitty.fast_data_types import add_timer, get_boss, mark_tab_bar_dirty, wakeup_main_loop

DIR = zkitty.folder()
_log = zkitty.log
_safe = zkitty.safe
OPEN = os.path.join(DIR, '.open')
OFF = os.path.join(DIR, '.sidebar-off')
STATE = os.path.expanduser('~/.local/state/kitty')
ATTACHED = os.path.join(DIR, '.attached')
_seen_main = False
_save_pending = False
_sync_pending = False
_quitting = False  # windows close one by one on quit; saving then would drop workspaces from .open
_owner = False  # this kitty started on a workspace and has reopened the rest, so it keeps .open
_tries = 0
_labelled: dict[str, str] = {}  # zmx session -> the workspace its label names
_refused: dict[str, int] = {}  # zmx session -> labels zmx refused
_check_tries = 0
_launched: dict[int, list[float]] = {}  # tab id -> recent dock launches
_named: set[int] = set()
_ready: set[int] = set()
_sent: dict[int, bytes] = {}


INTERNALS = (
    ('kitty.boss:Boss', 'all_windows all_tabs all_tab_managers active_window active_tab call_remote_control'),
    ('kitty.window:Window', 'created_in_session_name os_window_id user_vars id write_to_child screen program_status cwd_of_child child last_focused_at open_url_handler'),
    ('kitty.child:Child', 'argv'),
    ('kitty.tabs:Tab', 'tab_manager_ref id __iter__ active_window'),
    ('kitty.fast_data_types:Screen', 'last_reported_cwd columns cursor draw'),
    ('kitty.program_status:ProgramStatus', 'as_list'),
    ('kitty.tabs:TabManager', 'active_tab os_window_id tab_bar_hidden tab_bar_should_be_visible'),
    ('kitty.tab_bar:TabBarData', 'is_active active_session_name'),
    ('kitty.tab_bar:DrawData', 'inactive_fg default_bg'),
    ('kitty.tab_bar:ExtraData', 'for_layout'),
)
FUNCTIONS = (
    ('kitty.fast_data_types', 'add_timer get_boss mark_tab_bar_dirty wakeup_main_loop'),
    ('kitty.tab_bar', 'draw_tab_with_powerline as_rgb'),
)


def _missing() -> list[str]:
    missing = []
    for path, names in INTERNALS:
        module, name = path.split(':')
        try:
            cls = getattr(import_module(module), name)
        except (ImportError, AttributeError):
            cls = None
        assigned = getattr(getattr(getattr(cls, '__init__', None), '__code__', None), 'co_names', ())
        missing.extend(name + '.' + attr for attr in names.split()
                       if cls is None or not (hasattr(cls, attr) or attr in assigned))
    try:
        config_dir = import_module('kitty.constants').config_dir
    except (ImportError, AttributeError):
        config_dir = None
    if not isinstance(config_dir, str):
        missing.append('kitty.constants.config_dir')
    for module, names in FUNCTIONS:
        try:
            found = import_module(module)
        except ImportError:
            found = None
        missing.extend(module + '.' + name for name in names.split()
                       if not callable(getattr(found, name, None)))
    return missing


def _check(timer_id: int | None = None) -> None:
    global _check_tries
    missing = _missing()
    if not missing:
        return
    if _check_tries == 0:
        _log('kitty no longer has: ' + ', '.join(missing))
    boss = get_boss()
    try:
        windows = getattr(boss, 'all_windows', None)
        if windows is not None and not list(windows):
            raise RuntimeError('no window for watcher error tab')
        boss.call_remote_control(None, ('launch', '--type=tab', '--tab-title',
                                       'watcher error', '/usr/bin/less', '+G',
                                       os.path.join(DIR, 'watcher.log')))
    except Exception:
        if _check_tries >= 10:
            raise  # the timer's _safe wrapper logs the last failure
        _check_tries += 1
        add_timer(_safe(_check), 0.3, False)


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


def _label(boss) -> None:
    """Label each pane's zmx session with its workspace. kitty drops a closed pane from the session
    file; the label stays with the session, so bin/zpick-rows can still place it once detached."""
    zmx = shutil.which('zmx') or '/opt/homebrew/bin/zmx'
    for w in boss.all_windows:
        name, holder = w.created_in_session_name, w.user_vars.get('holder', '')
        if not name or not holder or _labelled.get(holder) == name or _refused.get(holder, 0) > 3:
            continue
        # kitty runs it: no process may be started from this thread (tests/test_kitty.py). zmx
        # refuses while the session is not up yet; the refusal comes back as zlabel=retry.
        host = zkitty.instance_host()
        if host:
            script = ('"$1" "$2" "$3" "$4" "$5" "$6" >/dev/null 2>&1 || '
                      'kitten @ set-user-vars --match "id:$7" zlabel=retry')
            args = (os.path.join(FOLDER, 'bin/zhost'), host, 'zmx', 'set')
        else:
            script = ('"$1" set "$2" "$3" >/dev/null 2>&1 || '
                      'kitten @ set-user-vars --match "id:$4" zlabel=retry')
            args = (zmx,)
        boss.call_remote_control(None, (
            'launch', '--type=background', '--allow-remote-control', 'sh', '-c',
            script, 'sh', *args, holder, 'space=' + zcore.label(name), str(w.id)))
        _labelled[holder] = name


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
    _label(boss)
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
    _lifecycle()
    add_timer(_safe(_lifecycle), 2.0, True)


def _record(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + '.tmp', 'w') as f:
        f.write(str(value))
    os.replace(path + '.tmp', path)


def _lifecycle(timer_id: int | None = None) -> None:
    global _seen_main, _quitting
    if not _owner or _quitting:
        return
    pidfile = os.path.join(STATE, '.main-pid')
    if not zkitty.instance_host():
        _record(pidfile, os.getpid())
        return
    try:
        with open(pidfile) as f:
            pid = int(f.read())
        if pid <= 0:
            raise ValueError('invalid main pid')
        os.kill(pid, 0)
    except (OSError, ValueError):
        if _seen_main:
            _save()
            _quitting = True  # SIGTERM closes windows individually; preserve .open
            os.kill(os.getpid(), 15)  # no quit confirmation, no subprocess in kitty's thread
    else:
        _seen_main = True  # follow a replacement too, not only the first pid


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
                    w.write_to_child(zcore.TICK)


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


def _clock(timer_id: int | None = None) -> None:
    """Redraw every tab bar as the minute turns, for tab_bar.py's clock.

    The C call skips TabManager.mark_tab_bar_dirty's on_tab_bar_dirty, which would save each minute.
    An idle kitty draws a dirty bar only when its main loop next wakes, so wake it."""
    add_timer(_safe(_clock), 60.05 - time.time() % 60, False)  # first, so a failure below keeps the clock
    for tm in get_boss().all_tab_managers:
        mark_tab_bar_dirty(tm.os_window_id, not tm.tab_bar_hidden and tm.tab_bar_should_be_visible)
    wakeup_main_loop()


@_safe
def on_resize(boss, window, data) -> None:
    # Every new window is resized before use, including overlays and restored panes.
    if zkitty.instance_host():
        window.open_url_handler = zkitty.open_url


@_safe
def on_load(boss, data) -> None:
    add_timer(_safe(_restore), 1.0, False)
    add_timer(_safe(_check), 1.0, False)
    add_timer(_safe(_clock), 1.0, False)


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
    elif data.get('key') == 'zlabel' and data.get('value'):
        boss.call_remote_control(None, ('set-user-vars', f'--match=id:{window.id}', 'zlabel'))
        holder = window.user_vars.get('holder', '')
        _labelled.pop(holder, None)
        _refused[holder] = _refused.get(holder, 0) + 1
        on_tab_bar_dirty(boss, window, data)  # the next save tries again
    elif data.get('key') in ('zside', 'zdo', 'zq', 'zlabel'):
        return
    else:  # a rename (ws_name) or pi's model and context use
        on_tab_bar_dirty(boss, window, data)


@_safe
def on_quit(boss, window, data) -> None:
    global _quitting
    if data.get('confirmed') and not data.get('aborted'):
        when = time.time()
        _save()
        if not _quitting and (zkitty.instance_host() or _owner):
            # A numeric attachment is a user quit, except when a Mac quit is within 5 s.
            # Keep both timestamps: either process can be the first to quit on logout.
            _record(ATTACHED if zkitty.instance_host() else os.path.join(STATE, '.main-quit'), when)
        _quitting = True


@_safe
def on_close(boss, window, data) -> None:
    if not zkitty.instance_host() or _quitting:
        return
    # A normal last close still lists that window. SIGTERM lists none, even on its
    # first callback. Intermediate closes (including sidebar toggles) must not detach.
    windows = list(boss.all_windows)
    if len(windows) == 1 and windows[0] is window:
        try:
            os.unlink(ATTACHED)
        except FileNotFoundError:
            pass
