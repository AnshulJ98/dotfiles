from __future__ import annotations

__doc__ = """Pure workspace rules, running on Python 3.9 and inside kitty."""

import json
import urllib.parse

TICK = b'\x1b_zt\x1b\\'
RANK = ['', 'idle', 'working', 'done', 'error', 'blocked']
# zmx binds a socket at <its dir>/<name>, and macOS allows 103 bytes with 57 taken by the
# per-user temp folder. A longer name makes 'zmx attach' fail, so the new pane closes at once.
BASE_MAX = 30


def holder(cwd: str, home: str, unique: str) -> str:
    folder = cwd.rstrip('/').rsplit('/', 1)[-1]
    base = ''.join(c if c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-'
                   else '-' for c in folder).lower()[:BASE_MAX] or '-'
    if cwd.rstrip('/') == home.rstrip('/'):
        base = 'home'
    return base + '-' + unique


def answer(name: str, pi_session: str) -> bytes:
    return (': zq ' + urllib.parse.quote(name, safe='') + ' ' +
            (urllib.parse.quote(pi_session, safe='') if pi_session else '-') + '\n').encode()


def worst(states: list[str]) -> str:
    return max(states, key=lambda s: RANK.index(s) if s in RANK else 0, default='')


def cwd_of(report: bytes | str | None, fallback: str) -> str:
    if isinstance(report, bytes):
        report = report.decode('utf-8', errors='replace')
    if not report:
        return fallback
    scheme, separator, rest = report.partition('://')
    if not separator or scheme not in ('kitty-shell-cwd', 'file'):
        return fallback
    _, slash, tail = rest.partition('/')
    if not slash:
        return fallback
    path = slash + tail
    return urllib.parse.unquote(path) if scheme == 'file' else path


def view(panes: list[dict]) -> dict:
    spaces, agents, tabs, states = {}, [], [], {}
    for pane in panes:
        if not tabs or tabs[-1][0].get('tab', 0) != pane.get('tab', 0):
            tabs.append([])
        tabs[-1].append(pane)
    for tab in tabs:
        members = [p for p in tab if p.get('vars', {}).get('role') != 'sidebar']
        name = members[0].get('session', '') if members else ''
        if not name:
            continue
        if name not in spaces:
            states[name] = []
            spaces[name] = dict(name=name, tabs=0, cwd=members[0].get('cwd', ''),
                                shown='', state='')
        space = spaces[name]
        space['tabs'] += 1
        space['shown'] = space['shown'] or next(
            (p.get('vars', {}).get('ws_name') for p in tab
             if p.get('vars', {}).get('ws_name')), '')
        for pane in members:
            records = pane.get('status', [])
            pane_states = [r.get('state', '') for r in records]
            state = worst(pane_states)
            states[name].extend(pane_states)
            space['state'] = worst(states[name])
            if records:
                variables = pane.get('vars', {})
                agents.append(dict(pane=pane.get('id', 0), space=name, tab=space['tabs'],
                                   app=records[0].get('app') or 'agent', state=state,
                                   model=variables.get('pi_model', ''), ctx=variables.get('pi_ctx', ''),
                                   tab_id=pane.get('tab', 0), active=bool(pane.get('active', False))))
    return {'spaces': list(spaces.values()), 'agents': agents}


def status(view: dict, current: str, clock: str) -> str:
    """The tab bar's right end: the workspace's cmd+alt number, then the time."""
    names = [s.get('name', '') for s in view.get('spaces', [])]
    return f'{names.index(current) + 1} · {clock}' if current and current in names else clock


def line(view: dict, session: str, tab: int) -> bytes:
    agents = [dict({k: v for k, v in a.items() if k not in ('tab_id', 'active')},
                   on=a.get('tab_id') == tab and bool(a.get('active', False)))
              for a in view.get('agents', [])]
    obj = dict(v=1, current=session, spaces=view.get('spaces', []), agents=agents)
    return b'\x1b_zv' + json.dumps(obj, sort_keys=True, separators=(',', ':')).encode() + b'\x1b\\'


def intent(view: dict, current: str, words: list[str]) -> list[tuple]:
    spaces = [s.get('name', '') for s in view.get('spaces', [])]
    agents = view.get('agents', [])
    if len(words) == 1 and words[0] in ('next', 'prev') and spaces:
        index = spaces.index(current) if current in spaces else 0
        return [('goto', spaces[(index + (1 if words[0] == 'next' else -1)) % len(spaces)])]
    if len(words) != 2:
        return []
    command, value = words
    if command == 'space':
        return [('goto', value)] if value in spaces else []
    if command not in ('switch', 'agent', 'pane'):
        return []
    try:
        number = int(value)
    except ValueError:
        return []
    if command == 'switch':
        return [('goto', spaces[number - 1])] if 1 <= number <= len(spaces) else []
    if command == 'agent':
        agent = agents[number - 1] if 1 <= number <= len(agents) else None
    else:
        agent = next((a for a in agents if a.get('pane') == number), None)
    if agent is None:
        return []
    space, pane = agent.get('space', ''), agent.get('pane')
    if not space or not isinstance(pane, int):
        return []
    return ([] if space == current else [('goto', space)]) + [('focus', pane)]
