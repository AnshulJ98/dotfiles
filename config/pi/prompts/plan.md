---
description: Investigate, then produce a step-by-step plan — no edits until I approve
argument-hint: "[task]"
---
Plan the following. Do NOT edit or create any files yet: $@

Work read-only first — use read/grep/bash to investigate the ACTUAL code, not assumptions. Then produce:

1. **Goal** — restated in one line.
2. **Findings & constraints** — what the code actually does, with `file:line` evidence. Call out unknowns.
3. **Plan** — ordered steps. For each: the files it touches and WHY it depends on the previous step.
4. **Risks** — what could break, and the blast radius.

Stop after the plan. Wait for my explicit "go" before writing any code.
