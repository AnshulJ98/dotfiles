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

1. **Goal**: one line. Under it, `mechanism:` and one line on how the
   change works (which function, which seam), so the result can be
   checked against the route taken and not only against the tests.
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
interface-frozen: [<only if callers must not see a change: globs of files whose exports keep their headers>]
---
```

`tests` is a committed script or a single command, never a path under
`/tmp` (scout refuses it). Run it once on the base before printing the
plan and say whether it starts. Omit `allowed-commands` unless a step
must deploy or change cloud resources; then list each prefix with a
one-line purpose under Plan. Workers are blocked from `cdk
deploy|destroy|bootstrap` and `aws` create/put/update/delete/terminate/
invoke calls not listed there. Omit `interface-frozen` unless a step
edits a file that other slices or callers import; a frozen file may
change bodies but not export headers (an export added, removed or
re-signed fails the worker). The check reads headers as written, so a
frozen TypeScript file needs explicit return types and const
annotations on its exports and no exported class or `export { a }`
list; otherwise the worker is blocked before its first edit. Read the
exports in the map digest before freezing, and fix headers in an
earlier step.

Stop and wait.

- **"go"**: do the steps yourself, run `tests`, report per your
  instructions.
- **"dispatch"**: settle any decision still marked open. If the plan
  names a branch, create it yourself first: the worker is blocked from
  `git switch`, `checkout` and the rest. Then run
  `~/.pi/agent/bin/scout --rw --spec - <<'EOF'` with the closing block
  first and this plan after it, then the module's `docs/maps/*-map.md`
  if one exists, then `EOF`. Scout refuses a spec whose body has no
  numbered step and no `check:` line. One open worker at a time.
  When it returns, the first line of the digest is
  `WORKER-SENSORS: PASS|FAIL|CANNOT-RUN`. Review the diff as `/review`
  does, with this plan as the yardstick: run `tests` yourself, then
  `git diff --stat`, then drift both ways (work the plan didn't ask
  for, steps it asked for that are missing, anything under "Blocked on
  me"). Open with ship, fix or rework.
- **"rework"**: append my findings to the spec, dispatch once more, then
  fix by hand.

In a slice loop, after a ship on a branch, ask one question with
`ask_user`: merge `--no-ff` to the base branch, delete the branch (and
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
spec, the slice list as `- [ ] <n>. <name>, branch slice/<name>, …`
lines (ticked `- [x]`; the harness reads them), the base sha, and one
line per slice:
verdict, merge sha, and its scout dir (the
`~/.pi/agent/sessions/scout/<pid>/` created during the slice; cost is
the sum of `usage.cost.total` in its jsonl). After a compaction,
re-read it before anything else.

Per slice, in this order:

1. `wt switch -y --no-cd -c slice/<name> --base auto/<effort>` makes the
   slice's worktree beside the repo (`git worktree list` prints its
   path). Never `git worktree add`, never a path inside the repo.
2. Plan the slice as above against the code as it is now: read the
   files it touches, then print the plan with its `mechanism:` line,
   numbered steps and `check:` lines. A line of the slice list is not
   a plan, and scout refuses a spec without steps and checks.
3. Dispatch from the slice worktree (`cd <path> && ~/.pi/agent/bin/scout
   --rw --spec -`), with a bash timeout no lower than scout's.
4. The sensors gate the slice; there is no review per slice. On
   `WORKER-SENSORS: PASS`: commit on the slice branch, merge `--no-ff`
   into `auto/<effort>`, run every merged slice's `tests` there,
   `wt remove -y slice/<name>`, tick `AUTO.md`. On FAIL: one "rework"
   dispatch with the sensors' reasons appended to the spec.

You never fix by hand in an auto run. The only file you edit is
`AUTO.md`; the harness blocks the rest while it exists.

Stop at the first of: FAIL or CANNOT-RUN after the rework; a first
dispatch that FAILs on two slices in a row; anything under Blocked on
me; an unknown in a
slice plan that changes what gets built; a merge conflict; `tests`
failing on `auto/<effort>`; a scout timeout (rc 124); `AUTO.md`
changed during a dispatch (compare its sha before and after); a slice
that turns out obsolete or missing (the list is frozen); the cap. On a
stop, leave the slice branch and its worktree unmerged, add the line
`stopped: <condition>` to `AUTO.md`, report per Long Runs, and wait.
Without that line the harness sends you back to the unticked slices
when you end a turn. "auto" removes the line and resumes at the first
unticked slice. "auto abandon" deletes `AUTO.md` and its exclude line,
keeps the branches, and reports.

After the last slice comes the run's one review, before any merge into
the base: from the `auto/<effort>` checkout, run
`~/.pi/agent/bin/scout --review <base-sha>`. It reviews `git diff
<base-sha>...HEAD` and `git log --first-parent <base-sha>..HEAD`
against the spec in `AUTO.md` as `review.md` does, checks by reading
that each bug fix's new test fails without the fix, and records the
tip it reviewed. The merge hook refuses to merge `auto/<effort>` into
any branch until that record exists; a later commit needs a new
review. Report per Long Runs with the review's verdict and findings and
the cost per slice, ending with `git switch <base> && git merge --no-ff
auto/<effort>`. On fix or rework, add `stopped: review` to `AUTO.md`
and wait. On ship, delete `AUTO.md` and its exclude line, then stop.
Run that merge only if I granted it; after it succeeds, `git branch -d
auto/<effort>`.
