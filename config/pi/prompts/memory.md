---
description: "Read or write persistent agent memory"
argument-hint: "[query | write]"
---

Memory file: `~/.pi/agent/memory.md`

## Reading

If a query was given (`$@`), grep the memory file case-insensitively:

```bash
grep -iE "<term1|term2>" ~/.pi/agent/memory.md
```

If no query was given, derive keywords from the current task.

Summarize only what bears on the task. If nothing matches, say so plainly. Do not invent memories.

Memory is a snapshot, not ground truth. Before acting on a recalled fact that names a file, symbol, or flag, verify it against the current code.

## Writing

Append directly — no proposal step:

```bash
echo "- [type] content" >> ~/.pi/agent/memory.md
```

If the target scope header (`## {scope}`) doesn't exist yet, create it first.

### Scope derivation

Project name from cwd → project scope. Dev tooling / config work → `tooling/`. Cross-project knowledge → `global/`.

### Entity types

`project` · `decision` · `bugfix` · `gotcha` · `preference` · `learning` · `tool`

### Never write

- Facts already in the codebase — use `read` + `grep`
- Transient session context (task lists, intermediate findings)
- Speculative or unverified information
- Duplicates — extend the existing bullet instead of adding a new one
