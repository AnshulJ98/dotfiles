---
description: Read the code, then a short plan; "go" does it, "dispatch" sends it to the worker and reviews the result
argument-hint: "[task]"
---
Plan the following. No edits until I say "go" or "dispatch": $@

Read the code first (read, grep, bash); never plan from memory.

If the task is a spec with several deliverables (a `/grill` spec, or
anything that names more than one), it is a slice loop: list the
slices first, one line each, `<n>. <name>, branch slice/<name>,
decisions <numbers>`, in dependency order. Then plan slice 1 as below.
Each slice plan opens by restating, verbatim, the spec decisions it
covers, so the review has its yardstick in reach.

Write about 300 words, skipping any section with nothing to say:

1. **Goal**: one line.
2. **Findings**: only facts that change the plan, each with
   `file:line`. For each unknown, the default you chose and why, in one
   line.
3. **Approach**: only when two designs are plausible. Two lines each,
   and why one wins.
4. **Plan**: ordered steps, each `<step> (files) → check: <command or
   observation that proves it>`. Say why a step must follow the one
   before only when it isn't obvious. A one-step plan is fine.
5. **Risks**: what could break and how far. Skip if nothing beyond the
   obvious.

Close with this block; it is the worker's spec if the plan is dispatched:

```
---
files-allowed: [<every file the steps touch, relative to the git root>]
tests: <one command that proves the plan and exits non-zero on failure>
---
```

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
`ask_user`: merge `--no-ff` to master, delete the branch, plan slice
n+1? On yes, do all three in one turn; the next plan starts from the
slice list, with the merged slices ticked. If I answer anything other
than go, dispatch or rework while a plan is waiting, ask which one I
mean.
