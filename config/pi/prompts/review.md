---
description: Adversarial, read-only review of a diff or files — ranked by severity
argument-hint: "[diff | paths]"
---
Review the following. If nothing is specified, default to `git diff`: $@

Read-only — do NOT edit. Investigate the real code around each change before judging. Report findings grouped by severity:

- **CRITICAL** — data loss, security hole, broken contract.
- **HIGH** — likely bug, missing error handling, race.
- **MEDIUM** — correctness edge case, perf, type/contract weakness.
- **LOW** — clarity, naming, missing test.

Each finding: `file:line` + a concrete fix. Cover correctness/logic, security, error handling, performance, contract/type violations, and missing tests. If nothing material is wrong, say so plainly — do not invent issues to look thorough.
