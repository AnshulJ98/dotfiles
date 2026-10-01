# Operating proposal, 2026-09-26

Thesis: `multi-codebase-process.md` is correct and was not applied, because
every rule in it lives in your head. Under load, head-rules lose. Each item
below converts one rule into a file, a script, or a number that runs without
you remembering it. Nothing here adds a rule; everything makes an existing
rule mechanical.

Ordering inside each axis is value per hour. Timing: tonight, weekend, Tuesday.

## Axis 1: pi

| # | Item | Fixes | Cost | When |
|---|------|-------|------|------|
| 1 | `bin/pi-cost <date>`: sum `usage.cost.total` from session JSONL by session and model; print turns, peak context, cacheWrite spikes (misses). | Blind spend. $100/day with no attribution. | 30 lines, 20 min. | Tonight |
| 2 | `scripts/review-branch.sh <base> <branch> [--module p]`: stat, out-of-module files, test PASS/FAIL on both refs with NOT-PINNING flag, `.d.ts` diff, grep for `any`/empty catch/TODO/package.json deps, full suite exit code. | Review is the velocity ceiling; this makes it 15 minutes and removes the model from it. | 150 lines, 2 h; needs worktrees. | Tonight, used Saturday |
| 3 | `scripts/interface-digest.sh <repo> <out>`: `.d.ts` emit, import graph via the TypeScript compiler API (no madge), topological module list, top-15 exports by fan-in, top-20 modules by fan-in. | Map input in minutes instead of a day of reading. | 200 lines, 2 h. | Tonight, used Sunday |
| 4 | `settings.json`: `"cacheWarming": "idle"`. | $0.75 cold rewrite at 150k opus context after every pause longer than the cache lifetime; becomes $0.03 warms. | One line. | Tonight |
| 5 | `bin/scout --thinking LEVEL`; document `--rw --brief --timeout` as the worker profile. | Workers launched as plain `pi -p` load `AGENTS.work.md`, all package tools, and the delegation rule (nested scouts). Scout profile is `-ne -nc -ns -np -t`, guarded. | 10 lines. | Tuesday |
| 6 | `bin/slice-loop <specs-dir> <base>`: per spec, branch, `scout --rw --brief`, `review-branch.sh` to `docs/reviews/`, append cost to `run-history.jsonl`, halt until `<slice>.reviewed` exists. | The model driver. Removes prompt crafting, return ingestion, review turns, and compaction from opus context: the largest term in the $100. Encodes the §6 gate as a file. | 80 lines. | Tuesday |
| 7 | `extensions/worker-sensors.ts`, loaded only into `--rw` children via scout `-e`: `tool_call` blocks `package.json` dependency edits, writes outside `.agent-allowlist` directories, `any` in new text, and the 400-line diff cap; `agent_before_settle` runs spec tests, checks the file list and diff size, one `continue: true` retry, then records PASS/FAIL via `appendEntry`. Backstop re-check at settle because `bash` bypasses `tool_call`. | DCCA has no sensors; every worker return is reviewed by eye. | 200 lines plus tests. | Tuesday to Wednesday |
| 8 | Fragments `dispatch-gate.md`, `review-protocol.md` (shared); DCCA/Detect specifics in `env.work.md`. Skills `map` (runs digest, then asks for your ten lines, refuses to write them) and `spec` (slice template). | Rules currently in `multi-codebase-process.md` are not in the agent's context. | 150 lines of fragment text. | Tuesday |
| 9 | Resident prompt audit with the cost script's numbers: `AGENTS.md` is 17,236 chars (about 4.3k tokens); package tool schemas (web_search, context7, ask_user) are the larger term. Work profile without web tools if the numbers say so. | Per-turn fixed cost on every session and child. | Measure first. | After #1 |

Rejected: cheaper driver model (cacheRead is $0.2/M on both opus-5-5 and
sonnet-5; a downgrade halves output only, deletion removes the term);
subagents or orchestration (bench 2026-08-28: 2 to 3x cost, zero gain,
handoff recall 11/12 to 9/12); any harness work before Tuesday.

## Axis 2: workflow

1. Ranking today, not Friday. Two threads: DCCA (CLI plus extension, one
   map) and Detect. Backlog file holds items 5, 6, 9 with the reason each
   is not live. Overdue items ship on current knowledge; a prerequisite
   added to a deadline item is a tripwire.
2. Blocks: morning own-hands 3 h, afternoon worker loop 2 h, one project
   per block. Open with one sentence naming the artifact; close with three
   lines in `NOW.md`. A block without a `NOW.md` entry is a tripwire.
3. Learning and mutating never share a block. The ts-morph refactor started
   during a trace and produced the regression you found today; that is the
   cost of the violation, in your own repo.
4. Dispatch: Opus writes the slice list from the map and closes. Specs are
   files. `slice-loop` runs them. You review from `review-branch.sh` output
   plus `git diff`. Patches go to a fresh sonnet with the defect list only.
   Prose from a worker is never read.
5. Brownfield (extension, Detect): characterization test around the
   endpoint the task touches, on real inputs, before any change. Wrap, do
   not rewrite. Slop behind a test is tolerated; slop without a test is
   not touched.
6. Greenfield (Node 24 work, the 60-day ECS and platform agent): week one by
   hand (layout, types, ports, one thin slice, harness, lint from CLIs).
   Sensors before the first dispatch, which for DCCA means #7 above lands
   before Node 24 implementation starts.
7. Weekly numbers, from `pi-cost` and `run-history.jsonl`: unreviewed runs
   (above one third of the week's runs means the gate broke) and dollars
   per merged slice. Dollars per day is the wrong metric; a $100 day that
   merges eight slices is fine.

## Axis 3: mental model

1. Comprehension is a byproduct of tasks that touch a module, captured as a
   ten-line map at the boundary. It is not a prerequisite and not a product
   of reading. "Knowing the codebase" means holding the map and knowing
   where to look; the teammates hold it from tenure, you build it in ten
   lines on purpose.
2. The 3-hour wall is physiology. The process already sizes blocks to it.
   Fighting it produces the fourth-hour refactor that broke the CLI.
3. The velocity ceiling is review throughput times comprehension. More
   dispatch raises the unreviewed pile, not the ceiling. Sensors and the
   review script raise it. This is why "lean more into agentic" is the
   wrong lever and why the loops you wrote felt like more work.
4. Two threads. A third does not cost one third more; it costs both maps.
5. Opus does decisions: the plan, the grill, the slice list. Every token
   Opus reads that a script or you could have produced is waste. Worker
   output, diffs, and test logs are for the script and for you.
6. October is judged on shipped slices and demonstrated command: the maps,
   the decomposition, the docs, the merged branches. Hours are not the
   lever; the teammates working within hours is the proof. "Run at max"
   means protecting the two deep blocks and the gate every day, not
   extending the day.
7. Measure before optimizing. The cost script, the unreviewed-run count,
   and dollars per merged slice are the three numbers. Nothing in Axis 1
   past item 4 gets built before item 1 has run on the work machine.

## Weekend, restated

Saturday: `review-branch.sh` on both branches; merge or fix own-hands;
capture one telemetry event; worker drafts telemetry doc and Node 24
decomposition from the event and the existing high-level; DevLoop block
once sized; `NOW.md` and backlog file.

Sunday: `interface-digest.sh` on all three repos; one Detect trace aimed at
the Dynatrace-to-repo mapping; ten-line Detect map; one hour on the 60-day
scope; one hour on Monday's plan.

Open facts: what DevLoop integration is; whether extension telemetry can be
exercised at work without Orbit Develop running.
