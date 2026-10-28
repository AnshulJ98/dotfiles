---
description: Read the code; a settled spec gets a short plan ("go" does it, "dispatch" sends it to the worker, "auto" runs a slice list unattended), anything else gets a now-to-target view and the next command
argument-hint: "[task]"
---
Plan the following. No edits until I say "go" or "dispatch": $@

Read the code first (read, grep, bash); never plan from memory.

Then sort the input. A settled spec (a `/grill` spec, or one
deliverable whose what and why I have already decided) gets the plan
below. Anything else (an idea, a complaint, several asks, a choice
still open) gets this view instead of a plan; print it and stop:

- **Now**: how it works today, one fact per line, each with
  `file:line`.
- **Target**: what done looks like, in one or two lines, in my words
  where I gave them.
- **Between**: the decisions that separate the two, one line each
  with your recommendation; mark the ones only I can make.
- **Next**: one command and why, in one line. `/challenge` when my
  request carries its own solution or rests on a premise you doubt;
  `/grill` when the target holds but two or more decisions are open;
  `/plan <piece>` when one piece is clear and nothing open blocks it.
  When challenge and grill both apply, challenge comes first:
  grilling a wrong premise settles the wrong decisions.

A spec with several deliverables is a slice loop: list the slices
first, one line each, `<n>. <name>, branch slice/<name>, decisions
<numbers>`, in dependency order. Then plan slice 1 as below. Each
slice plan opens by restating, verbatim, the spec decisions it
covers, so the review has its yardstick in reach.

Write about 300 words, skipping any section with nothing to say:

1. **Goal**: one line.
2. **Findings**: only facts that change the plan, each with
   `file:line`. For each unknown, the default you chose and why, in one
   line. An unknown that changes what gets built is a
   question for me, not a default; ask it with `ask_user` before
   writing the plan. For a change inside an existing module, run
   `node ~/.agents/skills/map/map.mjs <repo> <module-dir>` first; a file
   the steps touch with fan-in 10+ or in a cycle is a finding (its
   importers are the callers the plan must check), cited as `file
   (fan-in N)`.
3. **Approach**: only when two designs are plausible. Two lines each,
   and why one wins.
4. **Plan**: ordered steps, each `<step> (files) → check: <command or
   observation that proves it>`. Say why a step must follow the one
   before only when it isn't obvious. A one-step plan is fine. Each
   step's work sits where the Design rule in AGENTS.md puts it (the tool
   that owns the job).
5. **Risks**: what could break and how far. Skip if nothing beyond the
   obvious.

Close with this block; it is the worker's spec if the plan is dispatched:

```
---
files-allowed: [<every file the steps touch, relative to the git root>]
tests: <one command that proves the plan, including the repo's type check and lint when it has them, and exits non-zero on failure>
max-lines: <cap on added lines across all files; omit for 400>
allowed-commands: [<only if a step must change the cloud: exact prefix, e.g. cdk deploy MyStack-dev>]
---
```

`tests` is a committed script or a single command, never a path under
`/tmp` (scout refuses it). Run it once on the base before printing the
plan and say whether it starts. Omit `allowed-commands` unless a step
must deploy or change cloud resources; then list each prefix with a
one-line purpose under Plan. Workers are blocked from `cdk
deploy|destroy|bootstrap` and `aws` create/put/update/delete/terminate/
invoke calls not listed there.

Stop and wait.

- **"go"**: do the steps yourself, run `tests`, report per your
  instructions.
- **"dispatch"**: settle any decision still marked open. If the plan
  names a branch, create it yourself first: the worker is blocked from
  `git switch`, `checkout` and the rest. Then run
  `~/.pi/agent/bin/scout --rw --spec - <<'EOF'` with the closing block
  first and this plan after it, then the module's `docs/maps/*-map.md`
  if one exists, then `EOF`. One open worker at a time.
  When it returns, the first line of the digest is
  `WORKER-SENSORS: PASS|FAIL|CANNOT-RUN`. Review the diff as `/review`
  does, with this plan as the yardstick: run `tests` yourself, then
  `git diff --stat`, then drift both ways (work the plan didn't ask
  for, steps it asked for that are missing, anything under "Blocked on
  me"). Open with ship, fix or rework.
- **"rework"**: append my findings to the spec, dispatch once more, then
  fix by hand.

In a slice loop, after a ship on a branch, ask one question with
`ask_user`: merge `--no-ff` to master, delete the branch (and
`wt remove` its worktree if it has one; never `--force`), plan slice
n+1? On yes, do all three in one turn; the next plan starts from the
slice list, with the merged slices ticked. A bare "ok" or "yes" while
a plan waits: ask which of the three I mean. Anything else puts the
plan on hold; follow my reply.

**"auto"** on a printed slice list runs the unticked slices without
me, at most 8 per run unless I raise that in prose. My prose can grant
or withhold actions, except two that nothing grants: writing to master
or the default branch, and force-push or history rewrite on the base
branch. Default grants: commits on `slice/*`, merges into
`auto/<effort>`, deleting merged slice branches. No push, deploy, or
deleting unmerged work.

Start, or resume when a root `AUTO.md` exists:

1. Stop and say why if `git status --porcelain` is not empty, HEAD is
   the default branch (`origin/HEAD`, else `master` or `main`; offer a
   branch name), or `AUTO.md` is tracked.
2. Ask now any unknown in the slices that changes what gets built.
   Headless, such an unknown is a stop, never a default.
3. Print the confirmation: base branch and sha, `auto/<effort>`, each
   slice with its `tests`, the worker model, grants beyond the default,
   `AUTO.md`. Ask start, change or cancel with `ask_user`; if it can't
   run (headless), proceed.
4. Add `AUTO.md` to `.git/info/exclude`, write it, and create
   `auto/<effort>` from the base (on resume, switch to it).

`AUTO.md` holds this section verbatim with the grants resolved, the
spec, the slice list with ticks, the base sha, and one line per slice:
verdict, merge sha, and its scout dir (the
`~/.pi/agent/sessions/scout/<pid>/` created during the slice; cost is
the sum of `usage.cost.total` in its jsonl). After a compaction,
re-read it before anything else.

Per slice: `git switch -c slice/<name> auto/<effort>`, plan it as above
against the code as it is now, then dispatch and review as "dispatch"
does, with a bash timeout no lower than scout's. For a bug fix, also
judge by reading whether the new test fails without the fix. On ship:
commit on the slice branch, merge `--no-ff` into `auto/<effort>`, run
every merged slice's `tests` there, delete the slice branch, tick
`AUTO.md`. On rework: one "rework" dispatch, never a hand fix.

Stop at the first of: FAIL or CANNOT-RUN after the rework; rework from
two reviews in a row; anything under Blocked on me; an unknown in a
slice plan that changes what gets built; a merge conflict; `tests`
failing on `auto/<effort>`; a scout timeout (rc 124); `AUTO.md`
changed during a dispatch (compare its sha before and after); a slice
that turns out obsolete or missing (the list is frozen); the cap. On a
stop, leave the slice branch unmerged, keep `AUTO.md`, report per Long
Runs, and wait. "auto" resumes at the first unticked slice. "auto
abandon" deletes `AUTO.md` and its exclude line, keeps the branches,
and reports.

After the last slice, review `git diff <base-sha>...auto/<effort>` and
`git log --first-parent <base-sha>..auto/<effort>` against the spec,
following `review.md` from the prompts directory in
`~/.pi/agent/settings.json` (else: your Reviews checklist, then attack
your own findings). Report per Long Runs with cost per slice, ending
with `git switch <base> && git merge --no-ff auto/<effort>`. Delete
`AUTO.md` and its exclude line, then stop. Run that merge only if I
granted it; after it succeeds, `git branch -d auto/<effort>`.
