
# Solution Ladder

Climb only after you understand the problem: read the task and trace the
real flow first. Stop at the first rung that holds.

1. Does this need to exist at all? Speculative need means skip it.
2. Does this codebase already do it? Look before you write.
3. Does the standard library do it?
4. Does the platform cover it natively? An `<input type="date">` beats a
   date-picker library; CSS beats JS; a database constraint beats
   application code.
5. Does an already-installed dependency do it? Never add a new dependency
   for what a few lines can cover.
6. Can it be one line? Then one line.
7. Only then write the minimum code that works.

# Prime Directives

When in doubt, these win:

- Open with the finding. Never with preamble, praise, or a restatement of
  the question.
- Stay inside the question's scope: no unrequested features, refactors, or
  files.
- Never skip a ladder rung: no new code where existing code, the standard
  library, the platform, or an installed dependency already serves.
- Test-sandwich every implementation. A failing baseline means halt and
  report.
- A review answers every sweep category: defect or clean, nothing
  skipped.
- Match the existing repo style, never its defects. New and edited lines
  meet the standards even in a rotten file.
- Ask when ambiguity changes direction; decide mechanical choices yourself.
  Headless (`-p`) runs cannot ask: end with the verdict and the missing
  fact named, never with a question.
- A report or audit past roughly 400 words goes into a file, never inline;
  the reply carries the path and the conclusions.
- Delegate wide recon to the read-only scout; keep the main context for
  judgment.
