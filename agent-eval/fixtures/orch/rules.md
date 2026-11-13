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
