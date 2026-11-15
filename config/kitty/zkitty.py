"""Duck-typed kitty adapter: snapshots and intents without starting processes."""
import mimetypes
import os
import re
import sys
from urllib.parse import unquote, urlsplit
import time
import traceback
import uuid
from functools import wraps

# The hints helper can load this file in a fresh interpreter, without the watcher.
FOLDER = os.path.dirname(os.path.abspath(__file__))
if FOLDER not in sys.path:
    sys.path.insert(0, FOLDER)
import zcore

SIDEBAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'zside')
ZWS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'zws')
ZRUN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'zrun')
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
    reported = zcore.cwd_of(window.screen.last_reported_cwd, '')
    return reported if instance_host() else reported or window.cwd_of_child or ''


def instance_host() -> str:
    return os.environ.get('ZWS_HOST', '')


def attach(boss, window) -> None:
    saved = window.user_vars.get('holder', '')
    host = instance_host() if window.user_vars.get('role') != 'sidebar' else ''
    directory = ''
    if host and not saved:
        # kitty gives a split no session, so its own tab also supplies remote peers.
        session = getattr(window, 'created_in_session_name', None)
        tab = next((list(t) for t in getattr(boss, 'all_tabs', ()) if any(w is window for w in t)), [])
        peers = [w for w in list(getattr(boss, 'all_windows', ())) + tab
                 if w is not window and w.user_vars.get('role') != 'sidebar'
                 and ((session and w.created_in_session_name == session) or w in tab)]
        active = max(peers, key=lambda w: w.last_focused_at, default=None)
        directory = (cwd(active) if active else '') or window.user_vars.get('host_dir', '')
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


def launch_program(boss, window, kind, command, options=()):
    host = instance_host()
    boss.call_remote_control(None, (
        'launch', '--type=' + kind, f'--match=id:{window.id}', *options,
        *(('--cwd=current',) if not host else ()),
        '/bin/bash', ZRUN, cwd(window), *command))


def open_url(boss, window, url, hyperlink_id, reported_cwd):
    """Intercept before kitty's remote_file kitten; never inspect a host file locally."""
    if not instance_host():
        return False
    path, line = '', ''
    try:
        match = re.fullmatch(r'([^:]+):(\d+)', url)
        parsed = urlsplit(url)
        if match:
            path, line = match.groups()
        elif parsed.scheme == 'file':
            path = unquote(parsed.path)
            line = parsed.fragment if parsed.fragment.isdecimal() else ''
        elif not parsed.scheme:
            path = unquote(parsed.path)
        else:
            return False
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        # Keep the same extension exceptions as open-actions (notably .ts).
        extensions = ('ts tsx mts cts js mjs cjs jsx json jsonc md py sh zsh bash lua toml '
                      'yaml yml conf go rs rb java kt swift c h cpp hpp css scss html sql '
                      'txt ini xml tf env lock').split()
        mime = mimetypes.guess_type(path)[0] or ''
        if ext in extensions or mime.startswith('text/'):
            launch_program(boss, window, 'overlay',
                           ('nvim', *(('+' + line,) if line else ()), '--', path))
        else:
            message = path.translate(str.maketrans({c: '?' for c in path if ord(c) < 32}))
            boss.call_remote_control(None, (
                'launch', '--type=overlay', f'--match=id:{window.id}', '/bin/sh', '-c',
                'printf "%s\\n" "$1"; read -r key', '_',
                message + ' lives on ' + instance_host()))
    except Exception:
        log(traceback.format_exc())
    return True  # failure must not fall through to a Mac opener


def handle_result(args, data, target_window_id, boss, extra_cli_args):
    # URL hints call Boss.open_url directly, bypassing Window.open_url_handler.
    from kittens.hints.main import handle_result as default_handler
    remaining = dict(data, customize_processing='')
    window = boss.window_id_map.get(target_window_id)
    if instance_host():
        pairs = [(url, group) for url, group in zip(data['match'], data['groupdicts'])
                 if url and window and not open_url(boss, window, url, 0, '')]
        remaining['match'] = [p[0] for p in pairs]
        remaining['groupdicts'] = [p[1] for p in pairs]
    default_handler(args, remaining, target_window_id, boss)


def run(boss, words) -> list[tuple]:
    active = boss.active_window
    current = (active.created_in_session_name or '') if active else ''
    if words in (['hunk'], ['shell']):
        if active:
            hunk = words == ['hunk']
            launch_program(boss, active, 'tab',
                           ('/opt/homebrew/bin/hunk', 'diff') if hunk else ('/bin/zsh', '-il'),
                           ('--tab-title', 'hunk', '--add-to-session=!') if hunk
                           else (('--add-to-session=' + current,) if current else ()))
        return []
    if words in (['tab'], ['tab', 'here']):
        # A host workspace's folders are remote; attach() hands them to the new pane.
        directory = (cwd(active) if active and words == ['tab', 'here']
                     and not instance_host() else '')
        boss.call_remote_control(active, (
            'launch', '--type=tab', *(('--cwd', directory) if directory else ()),
            *(('--add-to-session', current) if current else ())))
        if current and not os.path.exists(os.path.join(folder(), '.sidebar-off')):
            dock(boss, boss.active_tab.id, current)
        return [('tab', current)]
    if words and words[0] == 'new':
        if words not in (['new'], ['new', 'ask'], ['new', 'window']):
            return []
        directory = (cwd(active) if active else '') or ('' if instance_host() else os.path.expanduser('~'))
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
