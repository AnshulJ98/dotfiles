"""Duck-typed kitty adapter: snapshots and intents without starting processes."""
import os
import time
import traceback
import uuid
from functools import wraps

import zcore

SIDEBAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'zside')
ZWS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'zws')
WIDTH = '24'


def folder() -> str:
    return os.environ.get('ZWS_DIR') or os.path.expanduser('~/.local/state/kitty/workspaces')


def log(text):
    try:
        os.makedirs(folder(), exist_ok=True)
        path = os.path.join(folder(), 'watcher.log')
        mode = 'w' if os.path.exists(path) and os.path.getsize(path) > 256 * 1024 else 'a'
        with open(path, mode) as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + text + '\n')
    except Exception:
        pass  # There is nowhere left to report a failure to write the error log.


def safe(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            log(traceback.format_exc())
            return None
    return wrapped


def is_sidebar(window) -> bool:
    argv = getattr(getattr(window, 'child', None), 'argv', None)
    return (window.user_vars.get('role') == 'sidebar' and bool(argv)
            and os.path.basename(argv[0]) == os.path.basename(SIDEBAR))


def cwd(window) -> str:
    return zcore.cwd_of(window.screen.last_reported_cwd, '') or window.cwd_of_child or ''


def hosted(boss, session) -> list:
    """The panes of a workspace bound to an ssh host (zws new --host)."""
    return [w for w in (boss.all_windows if session else ())
            if w.created_in_session_name == session and w.user_vars.get('host')]


def attach(boss, window) -> None:
    saved = window.user_vars.get('holder', '')
    # kitty gives a split no session, so the pane's own tab also supplies host peers.
    tab = next((list(t) for t in getattr(boss, 'all_tabs', ()) if any(w is window for w in t)), [])
    peers = []
    for w in hosted(boss, getattr(window, 'created_in_session_name', None)) + [
            w for w in tab if w.user_vars.get('host')]:
        if w is not window and not any(w is p for p in peers):
            peers.append(w)
    # The pane focused before this one: the new pane opens in its remote folder.
    active = max(peers, key=lambda w: w.last_focused_at, default=None)
    host = window.user_vars.get('host', '') or (active.user_vars['host'] if active else '')
    directory = ''
    if host and not saved:
        directory = cwd(active) if active else window.user_vars.get('host_dir', '')
        name = zcore.holder(directory or '~', '~', uuid.uuid4().hex[:12])
    else:
        name = saved or zcore.holder(window.cwd_of_child or '', os.path.expanduser('~'),
                                    uuid.uuid4().hex[:12])
    window.write_to_child(zcore.answer(name, window.user_vars.get('pi_session', ''), host, directory))
    match = f'--match=id:{window.id}'
    boss.call_remote_control(None, ('set-user-vars', match, 'zq'))
    if not saved:
        boss.call_remote_control(None, ('set-user-vars', match, 'holder=' + name))
    if host and window.user_vars.get('host') != host:
        boss.call_remote_control(None, ('set-user-vars', match, 'host=' + host))


def snapshot(boss) -> list[dict]:
    panes = []
    for tab in boss.all_tabs:
        for w in tab:
            variables = dict(w.user_vars)
            directory = cwd(w) if variables.get('role') != 'sidebar' else ''
            panes.append(dict(id=w.id, tab=tab.id, session=w.created_in_session_name or '',
                              vars=variables, status=w.program_status.as_list(),
                              active=w is tab.active_window, cwd=directory))
    return panes


def dock(boss, tab_id, name) -> None:
    # A renamed workspace keeps its name when the panes that carried it are gone.
    named = next((w.user_vars['ws_name'] for w in boss.all_windows
                  if w.created_in_session_name == name and w.user_vars.get('ws_name')), '')
    boss.call_remote_control(None, (
        'launch', '--type=tab-dock', f'--match=id:{tab_id}', '--dock-edge=left', f'--dock-size={WIDTH}',
        '--dock-skip-focus', '--keep-focus', '--add-to-session', name, '--var', 'role=sidebar',
        *(('--var', f'ws_name={named}') if named else ()), SIDEBAR))


def run(boss, words) -> list[tuple]:
    active = boss.active_window
    current = (active.created_in_session_name or '') if active else ''
    if words in (['tab'], ['tab', 'here']):
        # A host workspace's folders are remote; attach() hands them to the new pane.
        directory = (cwd(active) if active and words == ['tab', 'here']
                     and not hosted(boss, current) else '')
        boss.call_remote_control(active, (
            'launch', '--type=tab', *(('--cwd', directory) if directory else ()),
            *(('--add-to-session', current) if current else ())))
        if current and not os.path.exists(os.path.join(folder(), '.sidebar-off')):
            dock(boss, boss.active_tab.id, current)
        return [('tab', current)]
    if words and words[0] == 'new':
        if words not in (['new'], ['new', 'ask'], ['new', 'window']):
            return []
        directory = (cwd(active) if active else '') or os.path.expanduser('~')
        flag = ('--' + words[1],) if len(words) == 2 else ()
        boss.call_remote_control(active, (
            'launch', '--type=background', '--allow-remote-control', ZWS, 'new', *flag, directory))
        return [('new', directory)]
    ops = zcore.intent(zcore.view(snapshot(boss)), current, words)
    for operation, value in ops:
        if operation == 'goto':
            boss.call_remote_control(None, (
                'action', 'goto_session', os.path.join(folder(), value + '.kitty-session')))
        elif operation == 'focus':
            boss.call_remote_control(None, ('focus-window', f'--match=id:{value}'))
    return ops
