---
description: Distill this session into handoff notes at the current repo root (HANDOFF.md)
argument-hint: "[extra notes to include]"
---
Write handoff notes for the next session (any tool — pi, Claude Code, OpenCode). Extra notes from me: $@

Distill THIS session into `HANDOFF.md` at the repo root — `git rev-parse --show-toplevel`, or the cwd if not in a git repo (overwrite — it holds only the latest handoff):

```
# Session Handoff

_Written: <YYYY-MM-DD HH:MM>_

## Notes

<one dense paragraph: objective, current status, locked decisions with their WHY>

## Context

- <files changed / files next, as paths>
- <verification done / pending — exact commands>
- <risks, blockers>
- <exact next steps, in order>
```

Rules:
- Dense and factual — the reader is an agent with zero context from this session. No narrative, no filler.
- Decisions need their rationale; "we chose X" without why is useless next session.
- Only include what is NOT recoverable from git log or the code itself.
- If this session produced a durable fact worth persisting (decision + rationale, gotcha, corrected preference), append it to `~/.pi/agent/memory.md` under the appropriate scope header using `- [type] content` format.

Show me the notes before writing the file.
