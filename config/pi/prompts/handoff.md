---
description: Distill this session into handoff notes, printed; "save" writes HANDOFF.md
argument-hint: "[what the next session will focus on]"
---
Write handoff notes for the next session, which may run in pi or Claude
Code. Focus for the next session, if given: $@

Print them in chat; I paste them into the next session. Write nothing
unless I say "save"; then they go to `HANDOFF.md` at the repo root
(`git rev-parse --show-toplevel`, or the cwd outside a repo), overwriting
any previous one and added to `.git/info/exclude` if not already ignored.

The reader has none of this conversation and cannot ask. Be complete
and exact: the length limits in your instructions do not apply here.
Cover every section below, in order; write "none" under a section
rather than dropping it.

```
# Session Handoff

_Written: <YYYY-MM-DD HH:MM> on <branch> @ <short sha>, <machine>_

## 1. Where we started
<the ask in my words, quoted, and the state of things at that point>

## 2. Goals and target state
<what done looks like; the outcomes I want, in my words where I gave them>

## 3. Iterations
<every approach tried, in order: what it was, and why it was kept, changed or dropped>

## 4. What works
<each working piece with the command or evidence that shows it>

## 5. What doesn't
<failures and dead ends, with the exact error text; what was ruled out and how>

## 6. Spikes and evals
<per spike: the question, the setup, the numbers, the verdict, where the results and scripts live>

## 7. Research
<findings, each with its source; how the search was done (providers, queries, sites, Reddit, logged-in sessions); what could not be reached>

## 8. Decisions
<made, each with its reason; locked ones I must not reopen; open ones with your recommendation>

## 9. Gotchas and tribal knowledge
<what cost time: tool quirks, version traps, things that look wrong but are deliberate>

## 10. Where things are
<machines, directories, repos, branches, worktrees, uncommitted and untracked files, scratch files, running jobs, panes and sessions>

## 11. References
<every URL, file:line, session file, commit sha, issue and PR number that was used>

## 12. Next steps
<ordered; the first one starts with the exact command to run; then risks, blockers, and what the next session must not touch>
```

Rules:
- Facts only, no narrative. Quote identifiers exactly: paths, commands,
  flags, shas, versions, model ids, error text, numbers.
- Every decision carries its reason; "we chose X" without the why is
  useless next session.
- Point to specs, plans, ADRs, commits, and diffs by path instead of
  copying them. What git log and the code can't tell goes in full.
- Mark anything you did not verify, and say where you looked.
- Before finishing, reread the conversation and any compaction summary
  once for sections 3, 5 and 9: those are what a summary drops first.
- Replace secrets, tokens, and credentials with `<REDACTED>`.
- If the session produced a durable fact (a decision with its reason, a
  gotcha, a corrected preference), draft one memory bullet for it in the
  format `/memory` uses, and ask before adding it.
