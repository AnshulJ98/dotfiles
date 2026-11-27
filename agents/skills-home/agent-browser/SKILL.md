---
name: agent-browser
description: Drive a web browser from the shell with agent-browser through the `agb` wrapper — open pages, click, fill forms, log in, take snapshots and screenshots. Use when a task needs a real browser (JavaScript pages, logins, forms, clicking through a site) and fetch_content is not enough. Home machine only.
---

# Browser

`agb` is agent-browser 0.44.0 with a persistent profile of its own
(`~/.local/share/agent-browser/profile`), so logins stay between runs.

1. Before the first command in a session, load the guide that ships with the
   CLI and matches its version: `agb skills get core`. Don't guess flags.
2. Work with `agb open <url>`, `agb snapshot` (refs like `@e1`), `agb click @e1`,
   `agb fill @e2 "text"`, `agb get text @e3`, `agb screenshot <path>`.
3. A login the agent can't finish (password, 2FA, captcha): run the command
   with `--headed`, stop, and ask the user to log in in that window. The
   profile keeps the session afterwards.
4. Read-only pages: prefer `fetch_content`; it is cheaper.

## Emergency only: the user's real Brave

`agb --brave <command>` drives the user's own logged-in Brave over CDP (saved
passwords, live sessions). Use it only when the user asks for it or the own
profile cannot work at all, and ask before the first command: it acts as the
user in their real accounts. Never run `close` in this mode; it is their
browser. If it fails, `agb` prints the fix (turn on
brave://inspect/#remote-debugging and click Allow).
