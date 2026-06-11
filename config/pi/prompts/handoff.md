---
description: Distill this session into cross-tool handoff notes at ~/.copilot/instructions/handoff.instructions.md
argument-hint: "[extra notes to include]"
---
Write handoff notes for the next session (any tool — pi, Claude Code, OpenCode). Extra notes from me: $@

Distill THIS session into `~/.copilot/instructions/handoff.instructions.md` (overwrite — it holds only the latest handoff):

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
- If this session produced a durable fact for cross-tool memory (decision + rationale, gotcha, corrected preference), propose JSONL line(s) for `~/.local/state/agent-memory/memory.jsonl` — but do not append unless I say so.

Show me the notes before writing the file.
