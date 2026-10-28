---
description: Two-pass review — checklist sweep, then an attack on your own findings
argument-hint: "[diff | paths]"
---
Review the following; if nothing is specified, review `git diff`: $@

When the review is a diff of the checked-out tree, first run
`node ~/.agents/skills/map/map.mjs <repo> --diff <base>`, with `<repo>`
the work tree root and `<base>` the ref the diff is against (the
`git merge-base` of the branch and its target when reviewing a branch);
it compares `<base>` with the working tree, so skip it for a branch that
is not checked out, and go on without it when it exits non-zero. Read
the touched files in its fan-in order, highest first. A `(!)` row or a `High: new cycle` line is
reviewed as High exposure, and every importer listed for it is a caller
to check.

Don't edit files. Read the code around each change before judging it,
and find what the change is for: a plan or spec earlier in this
conversation wins, then the request, a PR description or a commit
message. Judge against it both ways: work it didn't ask for, and steps
it asked for that are missing. If a worker digest is present, its
`WORKER-SENSORS` line and any "Blocked on me" item come first, and run
the `tests` command yourself; a worker's claim is checked, not trusted.

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

Report once, after pass 2, inline, opening with one word, ship, fix or
rework, and the reason in one sentence. Then findings grouped by
severity, one line each, skipping empty groups:

- **Critical**: data loss, security hole, broken contract.
- **High**: likely bug, missing error handling, race, or a bug fix with
  no test that fails without it.
- **Medium**: edge-case correctness, performance, weak types or
  contracts.
- **Low**: clarity, naming.

Each finding gets `file:line` and a concrete fix. Mark issues the
change didn't introduce as pre-existing; still report them if a caller
can reach them through the changed code. Skip nitpicks and anything the
linter already catches. Close with the clean categories in one line. If
nothing material is wrong, say so plainly.
