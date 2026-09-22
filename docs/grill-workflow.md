# Grill workflow: how the pieces fit

Design note for the next revision of `config/pi/prompts/grill.md`. Five
additions (chart header, axes checklist, exit-to-map rule, glossary read
and pin, Terms section in the spec), no new prompt, no new skill.

## Where grill sits among the existing prompts

| Situation | Use | Why not the others |
|---|---|---|
| Zero open decisions, just work | `/plan` | Grill with nothing to decide produces padding |
| One or more decisions you can name, or a feature you cannot yet describe precisely | `/grill` | `/plan` would silently pick answers for you |
| Spec exists, want it attacked | `/challenge` (switch model first) | Grill asks you; challenge asks the plan |
| A decision in the spec meets the ADR bar | `/decisions` | Grill records the answer; decisions records the reasoning for posterity |
| Grill's chart says more than three waves | grill writes a map, then one topic per session | Wayfinder-sized work does not fit one context |
| Session ending mid-effort | `/handoff` names the grill or map file | The file is the state; the handoff is the pointer |

## The files

```
.grill/
  auth-cache.md            one topic: waves appended, answers in place
  auth-cache.spec.md       written when no branch is open; the approval gate
  dcca-agent.map.md        one effort: destination, decisions, open topics, fog, out of scope
  dcca-agent-surfaces.md   a topic under the map, same shape as auth-cache.md
CONTEXT.md                 glossary; read every grill, written at spec approval
docs/adr/0007-*.md         written by /decisions at spec approval
```

`.grill/` is excluded via `.git/info/exclude`. CONTEXT.md and ADRs are
committed; they are the durable output.

## The chart header

Every wave opens with the model's current estimate. Wave 1 is the first
look; later waves revise it. The estimate is approximate and labelled so.

```markdown
# Grill: auth-cache — wave 1

**Scope:** cache the auth lookup in `middleware/auth.ts` so the hot path
stops hitting Postgres per request. Not in scope: session storage, token
refresh.
**Branches seen:** cache location (in-process vs Redis), invalidation,
failure mode when the cache is down, observability.
**Estimate:** 2 waves, ~12 questions. Wave 2 exists only if Q2 lands on
Redis (adds connection, serialization, and TTL-vs-eviction questions).
**Fog:** whether multi-region matters. Cannot phrase the question until
Q2 settles.
**Glossary:** CONTEXT.md read. "Principal" and "Session" are defined;
"user" is not, and the brief uses it three ways.

**Wave 1: 8 questions (6 independent, 2 guarded). Deferred: 3.**
```

The first thing you do with a chart is decide whether to answer it. Three
outcomes: answer as is; trim the scope line and tell the model to
re-chart; or split, because the estimate is wayfinder-sized.

## Scenario 1: small change, no fork

"Add a `--json` flag to the report command."

Chart: 1 wave, 5 questions, no fog. Axes walk finds two you did not bring:
what `--json` emits on the error path, and whether the existing
`--quiet` flag composes with it. Both load-bearing (a caller scripting
against the output depends on them). No terms to pin. Spec is ten lines,
no ADR bar met. Total cost: one wave, one spec, then `/plan` or straight
to implementation.

## Scenario 2: fork with a deferred branch

"Add caching to the auth middleware." Chart as above.

Wave 1 asks the eight frontier questions. Q2 (in-process vs Redis) is
recommended in-process; Q5 and Q6 are guarded on Q2 = in-process. You
answer Q2 "Redis, we already run it for rate limiting". On re-read the
model plays back: Q5 and Q6 discarded (guarded on the branch you did not
take); the three deferred questions graduate into wave 2; the chart is
revised to "2 waves, ~14 questions". Wave 2 appends to the same file.
The Redis choice meets the ADR bar (hard to reverse once callers depend
on shared cache semantics, surprising to a reader who sees an in-process
map elsewhere, real trade-off). The spec flags it; `/decisions` writes
`docs/adr/0007-redis-for-auth-cache.md` after you approve.

## Scenario 3: a term that needs pinning

Your wave 1 answer to Q4 reads "invalidate when the user changes". CONTEXT.md
defines Principal (the authenticated identity) and Session (one login of a
Principal). "User" could be either, and the two invalidation policies differ
by an order of magnitude in cache churn. Wave 2 carries:

```markdown
## Q11. By "user changes" in Q4, do you mean the Principal record or the Session?
**Context:** CONTEXT.md:14 defines Principal, :19 defines Session; "user"
is undefined. `auth.ts:88` keys the lookup by session id, `principal.ts:40`
by principal id.
**Recommendation:** Principal — the cached value is the permission set,
which is a property of the Principal, not the login.
**Answer:**
```

The pinned term goes into the spec's Terms section, and CONTEXT.md gets
the entry at approval, not mid-wave.

## Scenario 4: scope cut mid-grill

Real example from `~/Dev/vscodext/.grill/currency-lab.md`, wave 2: "let's
just skip this. not relevant." Today the model treats it as an answer and
moves on. With the trailer, it lands in **Out of scope** with the reason,
and the play-back names it as a scope cut rather than a decision, so a
later wave cannot resurrect it as fog.

## Scenario 5: the chart says split

"Make DCCA conversational inside agent mode." Chart: 5 waves, ~40
questions, four branches with fog under each (which surfaces survive,
what the CLI keeps, how the skill file and the agent share state, what
telemetry proves it works). The exit rule fires. The model writes the map
instead of wave 1:

```markdown
# Map: dcca-agent

## Destination
A decision rule for which Copilot surface DCCA uses for each interaction,
plus the migration order from the current four surfaces to that rule.

## Decisions so far
(none)

## Open topics
- surfaces — which of tool, skill, agent, participant survive. Blocks: state, telemetry.
- state — how the agent and the skill share context. Blocked by: surfaces.
- telemetry — what proves an interaction went through the intended surface. Blocked by: surfaces.
- cli-boundary — what stays in the CLI. Independent.

## Not yet specified
Migration order. Cannot phrase until surfaces and state resolve.

## Out of scope
MCP. Ruled out 2026-09-19 in currency-lab Q12; theory only.
```

Charting is the whole session. Next session: `/grill dcca-agent
surfaces`. The model reads the map, grills that one topic as an ordinary
`.grill/dcca-agent-surfaces.md`, writes its spec, and appends one line to
Decisions so far. The map's Open topics shrink, blocked topics unblock,
fog graduates when it becomes sharp enough to phrase. One topic per
session; the map is the only thing that crosses sessions.

## Scenario 6: a fact outside the repo

A frontier question hangs on something the codebase cannot settle
(current `@types/vscode` version, whether an API is behind a proposal
flag). Under grill, the explore-first rule covers it: the model fetches
the fact before writing the question, and the Context line cites the
source. If the fetch is itself a session's worth of work, it becomes an
open topic on the map tagged research, and the scout resolves it while
you grill something else. Nothing in the grill file ever asks you for a
fact the model could have fetched.

## Scenario 7: abandon and resume

A wave sits half-answered for a week. Next session: `/grill auth-cache`.
The model re-reads from disk, plays back the answers present, names the
"I need this from you" blanks, and waits. Nothing is regenerated. The
chart at the head of the last wave is the state; the handoff prompt, if
you wrote one, just points at the file.

## Scenario 8: approval and beyond

Spec written. You read it, correct two play-backs in the file, say
"approved". In that order the model: writes the Terms into CONTEXT.md,
runs `/decisions` for each ADR-bar decision, and stops. "Go" is a separate
word. Implementation then follows the spec through `/plan` or, for a
Copilot 365 handoff, `spec-contract`.

## What stays out

- No question-count cap on the whole effort; the scope line and the map
  bound it. The 15 per wave is a reading budget.
- No issue tracker, labels, or ticket types. The map is markdown; blocking
  is a line of prose. Adopt Pocock's wayfinder per-project only if a
  tracker becomes the shared surface with other humans.
- No CONTEXT.md writes before approval. The cost is a settled term not on
  disk for the length of the grill; the benefit is one approval gate.
- No separate `/wayfind` prompt until the exit rule has fired three times.
