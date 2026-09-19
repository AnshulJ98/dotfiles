---
description: Grilling session that lands in a file I fill in — one wave of questions with your recommended answer on each, blanks accept the recommendation
argument-hint: "[plan | feature | design to grill]"
---
<what-to-do>

Interview me relentlessly about every aspect of this until we reach a shared
understanding: $@

Walk down each branch of the design tree, resolving dependencies between
decisions one by one. For each question, give your recommended answer.

The questions go in a file I fill in, not into chat. Write one wave, stop,
and wait for me to answer.

If a question can be answered by exploring the codebase, explore the codebase
instead.

Do not implement. No code until I say go.

</what-to-do>

<supporting-info>

## Sort the questions before writing any

Every candidate question is one of three kinds:

- **Independent** — no answer to any other question changes it. Include it.
- **Guarded** — it applies down one branch only, and taking the other branch
  deletes it outright. Include it, with an `Applies if` line.
- **Deferred** — the other branch replaces it with three or more questions of
  its own. Only this kind needs a second wave.

The sort decides how big the wave is; you don't. A plan that never forks ships
as one long wave. If you report no deferred questions on a plan that visibly
forks, you skipped the sort.

Stop at 15. Past that, drop the questions whose recommendation you would make
confidently anyway and list them as assumed defaults.

## Explore before you ask

Writing a question costs you one turn. The greps that would have answered it
cost six. Ignore that pressure. Every Context line either cites `file:line` or
says plainly that the code does not settle the question.

## The file

Write `.grill/<topic>.md`. If the repo does not ignore `.grill/`, add it to
`.git/info/exclude`.

````markdown
# Grill: <topic> — wave <n>

Leave an answer blank to accept the recommendation. Save the file, then tell
me to re-read it. Questions marked "I need this from you" have no default and
will stop the wave if left blank.

**Wave <n>: <N> questions (<a> independent, <b> guarded). Deferred: <c>.**

## Q1. <question>
**Context:** what this decision constrains, citing `file:line` — or why the
code does not settle it.
**Recommendation:** <pick> — <why, one line>
**Alternatives:** <B> (costs: …) | <C> (costs: …)
**Answer:**

## Q7. <question>
**Applies if:** Q3 = <branch>, which is what I recommend. Skip this one if
you take <other branch>.
**Context:** …
**Recommendation:** …
**Answer:**

## Q9. <question>
**Context:** …
**Recommendation:** none — I need this from you, because <the change is
irreversible / only you hold the number>.
**Answer:**

---
**Assumed defaults (not asked):** <decision> = <value>. …
**Deferred to wave <n+1>:** <topic> (needs Q3), <topic> (needs Q5).
````

## Reading the answers back

Re-read from disk. Never answer from your memory of what you wrote, and never
rewrite the file — the answers in it are mine, and a rewrite eats them. Wave
`n+1` appends a new section to the same file.

- Blank means the recommendation stands.
- Blank on a question you marked "I need this from you" stops the wave. Name
  the ones you are missing and wait.
- A guarded question whose branch I did not take is discarded, even if I
  filled it in.
- Answers come as prose. "B, but only on the admin path" is not "B". Play
  every answer back in your own words so I can catch you misreading me.

Once no branch is left open, write the spec: the goal, every decision with the
answer as you understood it, the assumed defaults, and the open risks. Then
wait for my approval.

</supporting-info>
