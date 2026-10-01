# Operating proposal (rev. 2026-09-30)

**Thesis:** `multi-codebase-process.md` is right. It wasn't applied because its rules live in your head, and head-rules lose under load. Every item below turns one rule into a file, a script, or a number. Nothing adds a rule.

Build detail: `pi-adjustments-plan.md`.

## Facts this rests on

- **Prices per M tokens** (in / out / cache read / cache write):
  - Opus 5.5: 4 / 20 / 0.20 / 5
  - Sonnet 5.5: 2 / 10 / 0.20 / 2.50
  - Fable 5.1: 10 / 50 / 0.25 / 12.50
  - Every model has a 1M context window.
- **Model roles:**
  - Opus 5.5 plans and reviews. It catches 8–10 of 13 hard bugs; Sonnet 5.5 catches 6.
  - Sonnet 5.5 implements. It is within a few points of Opus at under a third of the cost.
- **Effort:** default medium. High costs about 1.3x for a small gain. Never use max: it fans out to subagents and makes out-of-scope edits.
- **Cache:** a model switch rewrites the whole prefix ($0.75 at 150k on Opus). An effort change does not, on Anthropic direct. A new phase means a new process.
- **The $100/day** came from the model driver loop, uncapped child output, and review turns at 150k. It did not come from the token floor, which is about $0.002 per turn.

## Axis 1: harness

| # | Item | Status |
|---|---|---|
| 1 | Default `claude-opus-5-5` at medium | Done 09-30 |
| 2 | Built-ins off: `mcp`, `codemode`, `tool-search`, `llama.cpp` | Done 09-30 |
| 3 | `cacheWarming: "idle"` | Approved |
| 4 | `review-branch.sh` | Skipped |
| 5 | Prompt edits (Opus 5.5 guide) | Approved |
| 6 | Scout flags plus worker prompt | Approved |
| 7 | Interface digest v0 (`tsc` emit + `tsort`) | Trial at work |
| 8 | `worker-sensors.ts` | Defined; D1–D4 open |
| 9 | `slice-loop` | Hand-run three slices first |
| 10 | Delegation bullets, `map` skill, `spec-contract.md` frontmatter | Evaluating |
| 11 | Review: existing `/review` on slices; pi-review for own work | Trial |

**Rejected, and why:**

- **Cheaper driver model.** Cache reads cost the same, so deleting the driver saves more than downgrading it.
- **Subagents and orchestration** (pi-subagents, Claude Code workflows and ultracode, ralph loops). The 08-28 bench measured 2–3x the cost, no quality gain, and handoff recall falling from 11/12 to 9/12.
- **Virtual models.** Every switch loses the cache.
- **Classifier routing (Jev).** It is unattended judgment.
- **MCP.** Tool-schema and result bloat. Its one real use is OAuth'd hosted services, and CLIs and skills cover the rest.
- **Codemode.** Claude already makes parallel tool calls, and bash already composes. Without MCP, little is left for it to do. Measured 2026-10-01 on vscodext (4-file `src/` survey, Opus 5.5 medium, `-nc`): offered codemode, the model ignored it and used bash twice ($0.087 against $0.058 without it; the tool description adds about 3.1k tokens to every request). Told to use it, one script did the work in one call at $0.057, the same as bash. Revisit only with MCP servers or a classifier model (`models.classify()`), the two things bash cannot reach.

## Axis 2: workflow

1. **Two threads:** DCCA (CLI plus extension, one map) and Detect. Everything else goes in a backlog file with the reason it isn't live.
2. **Blocks:** 3 hours own-hands in the morning, 2 hours of worker loop in the afternoon, one project per block. Open with one sentence naming the artifact. Close with three lines in `NOW.md`.
3. **Learning and changing never share a block.** The ts-morph refactor during a trace caused the CLI regression.
4. **Dispatch:**
   - Opus writes the slice list from the map, then the session closes.
   - Specs are files. You dispatch them by hand with `scout --rw` until a script earns its place.
   - Workers report under Blocked on me / Changed / Found / Unconfirmed.
   - You review from the sensors verdict, the spec's tests, and the diff.
   - Fixes go to a fresh worker carrying the defect list only.
5. **Brownfield:** put a characterization test around the touched endpoint before changing it. Wrap, don't rewrite.
6. **Greenfield** (Node 24, the 60-day agent): week one by hand. Sensors land before the first dispatch.
7. **Weekly numbers:** unreviewed runs (more than a third means the gate broke) and dollars per merged slice. Dollars per day is the wrong metric.

## Axis 3: mental model

1. Comprehension is a byproduct of tasks, captured as a ten-line map per module. It is not a reading project.
2. The 3-hour wall is physiology. Size blocks to it. The fourth-hour refactor broke the CLI.
3. The velocity ceiling is review throughput times comprehension. More dispatch grows the unreviewed pile; sensors and the review script raise the ceiling.
4. Two threads. A third costs both maps.
5. Opus decides: plan, grill, slice list, review. Any token Opus reads that a script could have produced is waste.
6. October is judged on shipped slices and demonstrated command, not hours.
7. Measure before optimizing: unreviewed runs, dollars per merged slice, cache misses.

## Open

- What shipped over the 09-26/27 weekend. This sets where "Next" starts.
- What DevLoop integration is, and whether telemetry can be tested without Orbit Develop running.
- Bedrock: cache eligibility, and whether effort changes are free there.
