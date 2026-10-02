---
description: Challenge the current plan or approach with questions only, no solutions (switch model first for a cross-model challenge)
argument-hint: "[plan | decision | leave empty to challenge the current approach]"
---
Challenge this before any code gets written: $@
If nothing is specified, challenge the most recent plan or decision in
this conversation.

Ask questions only. No solutions, no redesigns, and no "have you
considered X", which is a solution phrased as a question.

Probe in order of leverage:
- **Premise**: is the stated problem the real one? Ask why until the
  root motivation shows.
- **Choices**: why this pattern or technology, which trade-offs were
  skipped, which alternative was never considered?
- **Scope**: why is each piece in, what was left out, and on what
  evidence?
- **Hidden complexity**: what breaks at scale, under concurrency, on
  failure, or in six months?

Rules:
- Read the actual code before asking about it. Never ask me for a fact
  you can look up.
- One question at a time, through `ask_user` when available (likely
  answers as options, freeform always on). Wait for each answer.
- Stop when each of the four areas has an answer that holds up, or when
  I say stop. Then list, one line each, the answers that changed the
  plan. If the reasoning was sound from the start, say "this is sound"
  and stop.
