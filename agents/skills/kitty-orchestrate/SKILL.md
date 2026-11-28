---
name: kitty-orchestrate
description: Drive the Mac's kitty workspaces and the pi sessions running in them as an orchestrator — list panes and which pi session each holds, read a pane's screen, open workspaces and tabs, start pi with a prompt, wait for its turn to end, collect a /handoff, quit and close sessions. Use when asked to relaunch, hand off, close or kick off pi sessions, or to work with zws, kmain, zmx or kitten @.
---

# Kitty Orchestrate

Mac only. Checked against kitty 0.50.0 and the dotfiles `config/kitty/bin` of
11-28; `zws create` and the user vars below are internals of that code.

## Model

- `kmain` focuses or starts the main kitty, socket `unix:/tmp/kitty-main`.
  `kmain winpc` is the host instance (`unix:/tmp/kitty-winpc`), whose panes
  run on winpc.
- A workspace is a kitty session (`zws`). Its file is
  `~/.local/state/kitty/workspaces/<name>.kitty-session`; `.open` lists the
  open ones. Only one workspace shows at a time.
- Every pane's shell runs inside a zmx session (`bin/zshell`). Closing a
  kitty window only detaches it; `zmx kill` ends it.
- Always pass `--to unix:/tmp/kitty-main`. A pane's own `KITTY_LISTEN_ON`
  can name a socket that died when kitty restarted.

```bash
K="kitten @ --to unix:/tmp/kitty-main"
```

## Find panes and their pi sessions

pi processes don't carry their session id; the pane's user vars do.

```bash
$K ls | python3 -c '
import json, sys
for o in json.load(sys.stdin):
  for t in o["tabs"]:
    for w in t["windows"]:
      v = w.get("user_vars", {})
      if v.get("role") == "sidebar": continue
      print(w.get("session_name"), t["id"], w["id"], repr(t["title"])[:24], w["cwd"],
            v.get("holder", ""), v.get("pi_session", "")[-45:], v.get("pi_ctx", ""))'
```

- `session_name`: the workspace. `holder`: the pane's zmx session.
  `pi_session`: path of the session's jsonl. `pi_ctx`: context used.
- Window ids change when kitty restarts; list again before acting.

## Read a pane

```bash
zmx history <holder> --screen | sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' | grep -v '^\s*$' | tail -20
$K get-text --match id:<window>      # kitty's view of the same screen
```

## Open a workspace or a tab

```bash
KITTY_LISTEN_ON=unix:/tmp/kitty-main zws new ~/Dev/labs          # name from the folder
KITTY_LISTEN_ON=unix:/tmp/kitty-main zws create <name> <cwd>     # explicit name
id=$($K launch --type=tab --tab-title 'π labs' --cwd ~/Dev/labs --match id:<any window in that workspace>)
```

Both `zws` forms switch the user's view to the new workspace. `launch`
prints the new window id, and the tab joins the matched window's workspace.

## Start pi with a prompt

```bash
$K send-text --match id:$id $'pi\r'
# wait until the pane's pi_session user var is set (3–10 s), then:
$K send-text --match id:$id $'\x15'                    # clear the input line
$K send-text --match id:$id --stdin < /tmp/prompt.txt  # long text, no shell quoting
$K send-text --match id:$id $'\r'                      # submit, as a separate send
```

- Text sent while pi is busy is queued as a follow-up message.
- To resume a session: `pi --session <id>` in the same cwd.

## Wait for a turn to end

Stream the session's jsonl. A turn has ended when an assistant message's
`stopReason` is anything other than `toolUse`. `error` counts too; read
`errorMessage` then.

```bash
python3 - "$jsonl" <<'PY'
import json, os, sys, time
f = sys.argv[1]; off = os.path.getsize(f)
while True:
    with open(f) as h:
        h.seek(off); data = h.read(); off = h.tell()
    for line in data.splitlines():
        m = (json.loads(line).get("message") or {})
        if m.get("role") == "assistant" and m.get("stopReason") not in (None, "toolUse"):
            print(m["stopReason"], m.get("errorMessage", "")); sys.exit()
    time.sleep(3)
PY
```

Run it under `bg_run` with `wake_on` rather than in a blocking call.

## Hand off and close

1. Send `/handoff <focus and any facts it lacks, such as moved paths>`.
2. After the turn ends, take the handoff from the last assistant text in the
   jsonl. If two sessions share a repo, keep each handoff in
   `~/.pi/agent/handoffs/<name>.md`: `save` writes the repo-root
   `HANDOFF.md` and would overwrite the other's.
3. Start the successor with a prompt that reads the file, checks its proof
   commands, folds what matters into memory, and trashes the file.
4. Quit the old pi: send `$'\x15/quit'`, then `$'\r'`. It prints
   `To resume this session: pi --session <id>`.
5. `$K close-window --match id:<window>`, then `zmx kill <holder>`.

Closing a whole workspace is `$K action close_session <name>` (= `zws close`).
A "Close session?" window may appear; close that too.

## Gotchas

- "Cannot find module .../install/releases/<old version>/..." means that pi
  runs from a removed install. Quit it, then `pi --session <id>`.
- A pi may ignore SIGTERM. Quit it through the TUI; use SIGKILL only on a
  session whose pane is already gone.
- Before killing a zmx session, read its screen: some panes run services, for
  example a lab's `tunnel.sh`.
- Never close the pane you run in, and never `pkill -f` a pattern that also
  matches your own command line.
- Ask before closing a session that has an open question or unsaved work.
