"""Duck-typed, read-only adapter from kitty objects to zcore panes."""
import zcore


def snapshot(boss) -> list[dict]:
    panes = []
    for tab in boss.all_tabs:
        for w in tab:
            variables = dict(w.user_vars)
            cwd = ''
            if variables.get('role') != 'sidebar':
                cwd = zcore.cwd_of(w.screen.last_reported_cwd, '')
                if not cwd:
                    cwd = w.cwd_of_child or ''
            panes.append(dict(id=w.id, tab=tab.id, session=w.created_in_session_name or '',
                              vars=variables, status=w.program_status.as_list(),
                              active=w is tab.active_window, cwd=cwd))
    return panes
