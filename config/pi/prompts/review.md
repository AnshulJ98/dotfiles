---
description: Two-pass review — checklist sweep, then an attack on your own findings
argument-hint: "[diff | paths]"
---
Review the following; if nothing is specified, review `git diff`: $@

Don't edit files. Read the code around each change before judging it,
and find what the change is for (the request, a spec, a PR description,
or a commit message) so you can judge its intent.

Pass 1, sweep: walk the review categories from your instructions one by
one. Each closes with a named defect or a deliberate "clean".

Pass 2, attack your own review. Assume pass 1 missed something; it
usually has. Trace what each caller can pass into the changed code and,
where you can, run it on hostile inputs (empty, wrong type, odd keys,
boundary values) and quote the result. Then re-read the source against
your findings, hardest at the categories you marked clean and at the
usual misses: missing timeouts, falsy-versus-absent checks, plain
objects used as maps (`__proto__`), unencoded interpolation, hardcoded
endpoints, dead dependencies, mutated inputs, missing `await`, and
off-by-one boundaries. Drop any finding you can't tie to a line.

Report once, after pass 2, grouped by severity:

- **Critical**: data loss, security hole, broken contract.
- **High**: likely bug, missing error handling, race, or a bug fix with
  no test that fails without it.
- **Medium**: edge-case correctness, performance, weak types or
  contracts.
- **Low**: clarity, naming.

Each finding gets `file:line` and a concrete fix. Mark issues the
change didn't introduce as pre-existing; still report them if a caller
can reach them through the changed code. Skip nitpicks and anything the
linter already catches. Close with the clean categories in one line, then the two fixes
that matter most. If nothing material is wrong, say so plainly.
