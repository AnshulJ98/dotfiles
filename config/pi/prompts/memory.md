---
description: "Read or write persistent agent memory"
argument-hint: "[query | write]"
---

Memory file: `~/.pi/agent/memory.md`. List its scopes with
`grep -n '^## ' ~/.pi/agent/memory.md`.

## Reading

Grep case-insensitively for the query ($@), or for keywords from the
current task when there is none:

```bash
grep -inE "<term1|term2>" ~/.pi/agent/memory.md
```

Summarize only what bears on the task. If nothing matches, say so.

Memory is a snapshot, not ground truth. Before acting on a recalled fact
that names a file, symbol, or flag, check it against the current code.

## Writing

Write without asking first. Insert the bullet at the end of its scope's
section with the edit tool; `echo >>` would put it under whichever header
is last in the file. The scope is the project name for project facts,
`pi` or `dotfiles` for tooling, and `profile` for facts about the user.
Create a new `## <scope>` header only when none fits.

Format: `- [type] content`, where type is one of `fact`, `gotcha`,
`decision`, `convention`, `correction`, or `preference`.

Don't write:
- Facts the codebase already states; read and grep find those.
- Transient session context (task lists, intermediate findings).
- Speculation or anything unverified.
- Duplicates; extend the existing bullet instead.
