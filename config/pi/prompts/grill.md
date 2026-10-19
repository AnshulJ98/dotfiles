---
description: Grilling session in chat — one wave of questions with your recommended answer on each; I answer by number, the rest take the recommendation
argument-hint: "[plan | feature | design to grill] or [<effort> <topic> to grill one topic off a map]"
---
<what-to-do>

Interrogate every load-bearing decision in this until it is settled, and
surface the ones I have not noticed I am making: $@

If nothing follows the colon, grill the most recent view or plan in
this conversation.

Walk down each branch of the design tree, resolving dependencies between
decisions one by one. For each question, give your recommended answer.

The questions go in chat, never in a file. Write one wave, stop, and wait
for my answers.

If a question can be answered by exploring the codebase or fetching a fact,
do that instead of asking me.

Do not implement. No code until I say go.

</what-to-do>

<supporting-info>

## Find the decisions I did not bring

Walk these axes once before sorting, as a discovery checklist, not as a
structure for the wave: contract and interface, data shape, failure modes,
edge cases, migration, naming, verification. A question earns its place by
being load-bearing (something downstream depends on the answer), not by
covering an axis.

## Glossary

If the repo has a `CONTEXT.md`, read it before writing questions. When my
answer uses a term that conflicts with it, or a term two readers could read
two ways, the next wave carries one question that pins the term, citing the
glossary line and the code that uses it. Never write `CONTEXT.md` mid-grill;
pinned terms go into the spec's Terms section and land on approval.

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

Stop at 15 per wave. Past that, drop the questions whose recommendation you
would make confidently anyway and list them as assumed defaults. The cap is a
reading budget for me, not a bound on the effort; scope bounds the effort.

## Chart before you write

Every wave opens with your estimate of the whole: scope in one line with the
exclusions named, the branches seen by name, waves and questions expected,
and what is still fog (in scope, but not sharp enough to phrase). Revise it
at the head of every wave. It is an approximation; say so.

If the chart says more than three waves, or a branch that needs its own
exploration before its questions can be phrased, do not write wave 1. Write
the map instead (see below) and stop.

## Explore before you ask

Writing a question costs you one turn. The greps that would have answered it
cost six. Ignore that pressure. Every Context line either cites `file:line`
or a fetched source, or says plainly that nothing settles the question. Never
ask me for a fact you could have looked up.

## The wave

Print it in chat in this shape. Write nothing to disk unless I say
"save"; then it goes to `.grill/<topic>.md`, added to `.git/info/exclude`.

````markdown
# Grill: <topic> — wave <n>

Answer by number: `3: LCS`, `7: no, only on the admin path`. Anything not
mentioned takes the recommendation. Questions marked "I need this from you"
have no default and stop the wave if unanswered.

**Scope:** <one line; what is not in scope, named>
**Branches seen:** <name>, <name>, <name>
**Estimate:** <w> waves, ~<q> questions. <what makes wave 2 exist, if it does>
**Fog:** <in-scope question you cannot phrase yet, and what would sharpen it>
**Glossary:** <CONTEXT.md read: terms defined, terms the brief uses loosely | no CONTEXT.md>

**Wave <n>: <N> questions (<a> independent, <b> guarded). Deferred: <c>.**

## Q1. <question>
**Context:** what this decision constrains, citing `file:line` — or why the
code does not settle it.
**Recommendation:** <pick> — <why, one line>
**Alternatives:** <B> (costs: …) | <C> (costs: …)

## Q7. <question>
**Applies if:** Q3 = <branch>, which is what I recommend. Skip this one if
you take <other branch>.
**Context:** …
**Recommendation:** …

## Q9. <question>
**Context:** …
**Recommendation:** none — I need this from you, because <the change is
irreversible or destructive / only you hold the number>.

---
**Assumed defaults (not asked):** <decision> = <value>. …
**Deferred to wave <n+1>:** <topic> (needs Q3), <topic> (needs Q5).
**Not yet specified:** <in scope, not sharp enough to ask; what would sharpen it>
**Out of scope:** <ruled out, with the reason; never returns to a wave>
````

## Reading the answers back

My reply is the answer sheet. Wave `n+1` is a new message with a revised
chart.

- A number I did not mention means the recommendation stands.
- No answer on a question you marked "I need this from you" stops the
  wave. Name the ones you are missing and wait.
- A guarded question whose branch I did not take is discarded, even if I
  filled it in.
- "Skip this" or "not relevant" is a scope cut, not an answer. It goes under
  Out of scope with the reason, and the play-back names it as a cut.
- Answers come as prose. "B, but only on the admin path" is not "B". Play
  every answer back in your own words so I can catch you misreading me.

## The spec

Once no branch is left open, print the spec: the goal, every decision with
the answer as you understood it, the assumed defaults, the open risks, a
Terms section listing every glossary entry to add or change, and which
decisions meet the ADR bar (hard to reverse, surprising without context,
the result of a real trade-off). Then wait for my approval. "save" writes
it to `.grill/<topic>.spec.md`; nothing else does.

On approval, and only if I ask for it: write the Terms into `CONTEXT.md`,
and record each ADR-bar decision with the decisions skill
(`/skill:decisions`). Approval is not "go"; implementation waits for that
word.

## The map

For an effort the chart says is too big for one grill. Print the map and
stop; charting is the whole session. The map is the one grill artifact
that crosses sessions, so offer "save" once: it goes to
`.grill/<effort>.map.md`.

````markdown
# Map: <effort>

## Destination
<what reaching the end looks like: the spec, decision, or change this effort
is finding its way to. One or two lines.>

## Decisions so far
- <topic>: <one-line gist>, <date>

## Open topics
- <topic> — <the question it resolves>. Blocks: <topic>. Blocked by: <topic>.
- <topic> — <…>. Independent.
- <topic> — <a fact to fetch, not a decision>. Research; the scout can take it.

## Not yet specified
<in-scope fog: the suspected question and what would sharpen it>

## Out of scope
<ruled out, with the reason and date>
````

Working a map: invoked as `<effort> <topic>`, read the map (the saved
file, or the text I paste), grill that one topic as an ordinary wave,
print its spec, then print the map with one line added to Decisions so
far, what it unblocks unblocked, and any fog the answers made sharp
graduated into new open topics. One topic per session.

</supporting-info>
