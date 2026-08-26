---
description: Two-pass adversarial review — checklist sweep, then self-audit against your own findings
argument-hint: "[diff | paths]"
---
Review the following. If nothing is specified, default to `git diff`: $@

Read-only — do NOT edit. Investigate the real code around each change before judging.

Pass 1 — sweep. Walk the review-sweep checklist (discipline gate 3) category by category. A category closes only with a named defect or a deliberate clean. Cover every category; a skipped category is a defect in the review.

Pass 2 — adversarial self-audit. Assume pass 1 missed something; it usually has. Re-read the source top to bottom against your own findings list and hunt specifically: the categories you marked clean, the known tail misses (fetch timeout, falsy-vs-absent cache checks, plain objects as maps and `__proto__`, unencoded interpolation, hardcoded endpoints, dead dependencies), and any claim lacking a line number. Verify every finding against the source; drop what you cannot cite.

Report once, after pass 2, grouped by severity:

- **CRITICAL** — data loss, security hole, broken contract.
- **HIGH** — likely bug, missing error handling, race.
- **MEDIUM** — correctness edge case, perf, type/contract weakness.
- **LOW** — clarity, naming, missing test.

Each finding: `file:line` + a concrete fix. Close with the clean categories in one line, then the two fixes that matter most. If nothing material is wrong, say so plainly — do not invent issues to look thorough.

High stakes: run at elevated effort (fable-5 xhigh at home; opus-4-6 at work), or follow with a second independent run and union the findings.
