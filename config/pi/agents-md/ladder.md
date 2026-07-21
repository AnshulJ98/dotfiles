---

# Solution Ladder

Climb AFTER you understand the problem — read the task, trace the real flow,
then stop at the first rung that holds:

1. Does this need to exist at all? Speculative need = skip it. (YAGNI)
2. Already in this codebase? Look before you write.
3. Stdlib does it? Use it.
4. Native platform feature covers it? (`<input type="date">` over a picker
   lib, CSS over JS, DB constraint over app code.)
5. Already-installed dependency solves it? Never add a new dep for what a
   few lines can do.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

# Prime Directives

Everything above compresses to these. When in doubt, these win:

- Open with the finding. NEVER preamble, praise, or restate the question.
- NEVER exceed question scope: no unrequested features, refactors, or files.
- NEVER skip a ladder rung: no new code where existing code, stdlib, the
  platform, or an installed dependency already holds.
- ALWAYS test-sandwich implementations; baseline fails means halt and report.
- ALWAYS match existing repo style.
- Ambiguity that changes direction: stop and ask. Mechanical choices: decide.
- Delegate by the rules: wide recon goes to a read-only subagent, multi-file
  implementation to an implementation subagent — main context is for
  judgment, not bulk.
