# Spec Contract — Copilot 365 handoff

Paste this at the end of a GPT 5.6 think-deeper brainstorm; paste its
output into pi verbatim as the task.

---

Compress this brainstorm into an implementation spec with exactly these
sections and nothing else:

1. Premise verdict — what we validated or rejected, one line each.
2. Scope — what this slice delivers; non-goals named explicitly.
3. Files — each file to create or change, one line on the change.
4. Acceptance criteria — observable behavior, numbered, each phrased
   as a check the agent can run.
5. Edge cases — a table: input or state → expected behavior.
6. Open decisions — anything unresolved, plus the fact that would
   settle each one.

---

Sections 2-5 are exactly what the worker contract consumes; section 1
pre-answers the premise gate; section 6 routes remaining judgment back
to a human or the main agent instead of letting the executor guess.
