---
description: Investigate, then produce a step-by-step plan; no edits until I approve
argument-hint: "[task]"
---
Plan the following. Don't edit or create files yet: $@

Read the actual code first (read, grep, bash); don't plan from
assumptions. Then write:

1. **Goal**: one line.
2. **Findings and constraints**: what the code does today, with
   `file:line` evidence. Name the unknowns.
3. **Approach**: when two designs are plausible, sketch both in two
   lines each and say why one wins.
4. **Plan**: ordered steps, each written as
   `<step> (files) → check: <command or observation that proves it>`,
   with why it has to follow the step before it.
5. **Risks**: what could break, and how far.

Stop after the plan and wait for my "go".
