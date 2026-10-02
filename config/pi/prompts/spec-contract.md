---
description: Spec contract — turns a brainstorm or plan into an implementable spec, with worker frontmatter for scout --rw
argument-hint: "[paste the brainstorm, or leave empty]"
---
# Spec Contract

Use at the end of a brainstorm or planning session, in pi or pasted
into another chat. Save the output as `specs/NN-<slice>.md` and dispatch
it with `scout --rw --brief`, or paste it into pi as the task.

---

Compress this into an implementation spec. Start with this frontmatter,
filled in, unfenced, as the first line of the spec. Keep every value on
one line. `module` is for the reader; the sensors ignore it. `**` globs
skip dotfiles, so list those by name:

```
---
module: <directory the slice lives in>
files-allowed: [<every file the slice may create or change; globs allowed>]
tests: <one shell command that passes only when the slice is done>
max-lines: <added-line cap; omit for 400>
---
```

Then exactly these sections and nothing else:

1. Premise verdict — what we validated or rejected, one line each.
2. Scope — what this slice delivers; non-goals named explicitly.
3. Files — each file to create or change, one line on the change.
   Every path here must match files-allowed.
4. Acceptance criteria — observable behavior, numbered, each phrased
   as a check the agent can run. The first is a test that fails before
   the change.
5. Edge cases — a table: input or state → expected behavior.
6. Open decisions — anything unresolved, plus the fact that would
   settle each one.

---

The frontmatter is what the worker sensors enforce: edits outside
files-allowed are blocked, and `tests` is rerun before the worker may
finish; a test file that loses cases or assertions fails the check.
If you can run shell commands here, run the `tests` command once before
printing the spec and say whether it starts; a command that cannot run
sends the worker into a rabbit hole. Sections 2-5 are what the worker
consumes; section 1 settles the premise up front; section 6 routes
remaining judgment back to a human instead of letting the executor
guess.
