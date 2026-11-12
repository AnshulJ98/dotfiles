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
plan and say whether it starts and whether it leaves `git status`
clean: a `tests` command that writes an untracked file stops every
worker with CANNOT-RUN, so ignore the file or fix the command first. Omit `allowed-commands` unless a step
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

The mechanical steps are `~/.pi/agent/bin/auto-slice` (`--help` lists
them); it finds the run from any checkout of the repo. The run has its
own worktree, `../<repo>.auto-<effort>`, with `AUTO.md` at its root.

Start, or resume when the run's `AUTO.md` exists:

1. Stop and say why if HEAD is the default branch (`origin/HEAD`, else
   `master` or `main`; offer a branch name) or `AUTO.md` is tracked.
   Uncommitted work in this checkout does not stop a start: the run
   begins from the HEAD commit without it, and the confirmation says so.
2. Ask now any unknown in the slices that changes what gets built.
   Headless, such an unknown is a stop, never a default.
3. Print the confirmation: base branch and sha, `auto/<effort>`, each
   slice with its `tests`, the worker model, grants beyond the default,
   `AUTO.md`. Ask start, change or cancel with `ask_user`; if it can't
   run (headless), proceed.
4. `auto-slice start <effort>` makes the run worktree and prints its
   path; write `AUTO.md` there. On resume, nothing is made.

`AUTO.md` holds this section verbatim with the grants resolved, the
spec, the base sha, and the slice list as `- [ ] <n>. <name>, branch
slice/<name>, …` lines (the harness reads and ticks them). The script
adds one line per merged slice (merge sha, then each dispatch's verdict,
scout dir and cost) and a `session:` line. After a compaction, re-read
it before anything else.

Per slice, in this order:

1. `auto-slice new <name>` makes the slice's worktree beside the repo
   and prints its path. Never `git worktree add`.
2. Plan the slice as above against the code in that worktree as it is
   now: read the files it touches, then print the plan with its
   `mechanism:` line, numbered steps and `check:` lines, and write the
   closing block with the plan after it to a file outside the repo. A
   line of the slice list is not a plan: scout refuses a spec without
   steps and checks, and the script refuses one written before the
   worktree existed.
3. `auto-slice dispatch <name> <spec-file>` runs the worker there, in
   the foreground. It can take 15 minutes: the harness leaves
   `auto-slice` out of the bash timeout, and scout bounds the worker.
4. The sensors gate the slice; there is no review per slice. When the
   script says the slice passed, `auto-slice merge <name> "<type>:
   <description>"` commits, merges `--no-ff` into `auto/<effort>`, runs
   every merged slice's `tests` there, removes the worktree and ticks
   `AUTO.md`. When it says one rework, append the sensors' reasons to
   the spec file and dispatch again.

You never fix by hand in an auto run. The only file you edit is
`AUTO.md`; the harness blocks the rest of the run's checkout and every
slice worktree while it exists.

The script exits 1 and names the stop condition for: a slice worktree
with changes in it before its first dispatch; a slice that does not
pass its rework; a PASS with anything under Blocked on me; a worker
timeout (rc 124); `AUTO.md` changed during a dispatch; a merge
conflict; `tests` failing on `auto/<effort>`; a slice out of list
order (the list is frozen). Stop as well for: a first dispatch that
FAILs on two slices in a row; an unknown in a slice plan that changes
what gets built; a slice that turns out obsolete; the cap. On a stop,
leave the slice branch and its worktree unmerged, add the line
`stopped: <condition>` to `AUTO.md`, report per Long Runs, and wait.
Without that line the harness sends you back to the unticked slices
when you end a turn. "auto" removes the line and resumes at the first
unticked slice. "auto abandon" deletes `AUTO.md` and its exclude line,
keeps the branches and worktrees, and reports.

After the last slice comes the run's one review, before any merge into
the base: `auto-slice review`, in the foreground. It
runs `scout --review <base-sha>` in the run worktree, which reviews
`git diff <base-sha>...HEAD` and `git log --first-parent
<base-sha>..HEAD` against the spec in `AUTO.md` as `review.md` does,
checks by reading that each bug fix's new test fails without the fix,
and records the tip it reviewed. The merge hook refuses to merge
`auto/<effort>` into any branch until that record exists. A later
commit needs a new review; it reads only the diff since the last one,
and scout refuses a fourth round. Report per Long Runs with the
review's verdict and findings and the cost per slice, ending with `git
merge --no-ff auto/<effort>` (run in this checkout, on the base
branch). On fix or rework, add `stopped: review` to `AUTO.md` and
wait. On ship, delete `AUTO.md` and its exclude line, then stop. Run
that merge only if I granted it; after it succeeds, `wt remove -y
auto/<effort>` and `git branch -d auto/<effort>`.
