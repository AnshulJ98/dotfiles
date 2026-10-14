---
description: Distill this session into handoff notes, printed; "save" writes HANDOFF.md
argument-hint: "[what the next session will focus on]"
---
Write handoff notes for the next session, which may run in pi or Claude
Code. Focus for the next session, if given: $@

Print them in chat; I paste them into the next session. Write nothing
unless I say "save"; then they go to `HANDOFF.md` at the repo root
(`git rev-parse --show-toplevel`, or the cwd outside a repo), overwriting
any previous one and added to `.git/info/exclude` if not already ignored.

```
# Session Handoff

_Written: <YYYY-MM-DD HH:MM> on <branch> @ <short sha>_

## Notes

<one paragraph: the goal, where it stands, and each locked decision with its reason>

## Context

- <files changed and files next, as paths>
- <last check run: the exact command and its result>
- <risks, blockers, and anything the next session must not touch>
- <next steps in order, starting with the first command to run>
```

Rules:
- The reader is an agent with none of this session's context. Facts
  only, no narrative.
- Every decision carries its reason; "we chose X" without the why is
  useless next session.
- Point to specs, plans, ADRs, commits, and diffs by path instead of
  copying them. Include only what git log and the code can't tell.
- Replace secrets, tokens, and credentials with `<REDACTED>`.
- If the session produced a durable fact (a decision with its reason, a
  gotcha, a corrected preference), draft one memory bullet for it in the
  format `/memory` uses, and ask before adding it.
