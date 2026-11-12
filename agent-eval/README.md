# agent-eval — config regression probes for pi

Probe battery built during the 2026-08-26 config audit
(`~/Dev/probe-battery-2026-08-26.md`, `~/Dev/pi-master-review-2026-08.md`).
Run it after any change to `config/pi/agents-md/` fragments, prompts, or
default model/thinking, and compare against the baselines below. It
measures instruction adherence and recall, not model benchmarks.

## Task suite

Probes below check what a model says about a fixture. The task suite
checks what it does: each trial gives a model a real job in a scratch
workspace and grades the result mechanically or with judges. Three roles:

- **worker** (13 tasks: `booking-*`, `cube-*`, `differ-*`). Cut from fix
  commits in pi-lab and sim/cube. The trial runs `scout --rw` on
  `prompt.md` (the ticket, without the fix) in a fresh copy of the commit's
  parent. The hidden tests are read from the fix commit at run time and laid
  over the workspace after the agent finishes; the trial passes when they
  pass. Files changed outside `allowed` are recorded (`outside`) but do not
  fail the trial. `booking-delete-404-scope` expects the agent to stop:
  it passes only when nothing changed and the digest names a blocker.
- **review** (`booking-review`). Plain `pi -p` reviews pi-lab at
  `e6189ea`, which has five seeded defects. A haiku-5-5 extractor turns the
  review into findings; two judges, opus-5-5 and gpt-6.1-sol, each say
  yes/no per defect. A defect counts only when both say yes, and the trial
  passes when all five are found.
- **scout** (4 tasks: `scout-*`). Each is a research question about
  `config/pi` at `39f0715`. The trial runs `scout` read-only and checks
  the file:line citations in its digest against the task's `expect` list.
  Right answer without a citation into the right line range does not pass.

Every trial runs under `lib/isolate.sh`: a temp HOME that links the real
`~/.pi/agent` except `memory.md`, sessions and run history, so trials
neither read nor write your memory. `auth.json` is linked, so a token
refresh writes through. A trial whose tool calls touch the source repo,
the real `memory.md` or the real sessions is marked `leak` and left
out of the numbers. The leak needles are those three paths (the source
repo, the real `memory.md`, the real sessions dir), not the whole home,
because the linked config legitimately resolves there.

### Run it

Run from `agent-eval/`. Check the tasks first (no model calls; about 5
minutes because of the cube typecheck and 200-scramble tests, so run it
before a matrix run, not on every change), then the matrix, then read it:

```sh
./validate.sh --all
./matrix.sh first-run --cells "anthropic/claude-sonnet-5-5:medium openai-codex/gpt-6.1-sol:medium"
node summarize.ts results/first-run
```

Usage lines, as printed by the scripts:

```text
validate.sh <task>|--all
matrix.sh <run-name> --cells "<provider/model:thinking> ..." [--tasks "<id> ..."] [--trials 3] [--jobs 1]
trial.sh <task> <provider/model> <thinking> <n> <out.jsonl>
summarize.ts <run-dir|trials.jsonl>
gate.sh <run-dir|trials.jsonl> [--update]
mk-task.sh <repo> <fix-sha> [id]
check-judges.sh <task>
judge.sh <trial-dir> <task-dir> [--findings <file>]
```

`matrix.sh` runs every task (or `--tasks`) for every cell, 3 trials each
by default, and appends one JSON line per trial to
`results/<run-name>/trials.jsonl`. It is resumable: rerun the same command
and finished trials are skipped (trials marked `infra` are redone). Use
`--tasks "booking-free-slots scout-model-defaults" --trials 1` for a quick
smoke run. `trial.sh` runs a single trial; `judge.sh` is called by it.
Each trial keeps its temp dir (`dir` in the record) with the digest, test
output and, for review, the extracted findings and judge replies.

List-price cost seen in smoke runs: worker trial on haiku-5-5 low about
$0.002; review trial $0.003 plus $0.016 judging; scout trial $0.002-0.003
on haiku, $0.03-0.05 on sonnet-5-5 medium. Multiply by tasks x cells x
trials before launching a full grid.

### Read the table

`summarize.ts` prints one table per role, one row per cell:

- **pass rate** is passes over counted trials, as a percentage and a
  count. Leak and infra trials are not counted; they have their own columns.
- **any / all** is tasks passed on at least one / on every counted trial,
  out of the tasks that cell ran. A wide gap means the cell is unreliable.
- **flaky** is the number of tasks whose trials disagree, with their names.
  This is the noise floor: the comparison lines under the table say
  "no difference" when the gap, in tasks, is no larger than the flaky count.
- **Saturated** lists tasks every cell passed on every counted trial.
  They no longer tell the cells apart.
- **infra** trials (no model turns, an empty review, an unparseable judge
  reply) are unusable rather than failed; rerun `matrix.sh` to redo them.

### When to run

- After any change to the steering config: `config/pi/agents-md`,
  `extensions`, `prompts`, `settings.json`, or `agents/skills`.
- For a new model or thinking level, as another cell.
- Before changing the default worker or scout model.

Compare cells within one run, and only call a gap real when it is bigger
than the flaky count. The probes below are the cheaper first look.

### The gate

`gate.sh <run>` compares a run with `agent-eval/baseline.json`, per role
and cell present in both, and says whether the steering config changed since
the baseline's commit. It exits 1 when a cell counted fewer tasks than the
baseline, or its pass rate falls by more than the larger flaky-task count of
the baseline and the run (the drop is measured in the baseline's tasks), and 2
when there is no baseline or no role and cell in common with it. Review is
gated on defect recall (defects found over defects asked about, summed over
trials), with the allowance counted in defects; `--update` also exits 2 while
the steering paths have uncommitted changes. After a deliberate change, run `gate.sh <run> --update`: it
rewrites `baseline.json` from that run and appends one line per role and cell
to `agent-eval/history.jsonl`. No baseline is committed yet; the first
`--update` creates it. Run the gate with the same cells and tasks as the
baseline, or the comparison covers only what overlaps.

### Add a task from a real failure

When an agent gets a real job wrong and you fix it in a commit that also
adds or changes tests:

```sh
./mk-task.sh ~/Dev/some-repo <fix-sha> [id]
```

This writes `tasks/<id>/task.json` (allowed = the non-test files the commit
changes, hidden = its test files, test = the package's `npm test`) and a
`prompt.md` stub. Replace the TODOs in the stub by hand with the ticket as
the user would have written it: the behaviour the hidden tests assert,
exact formats, messages and the names they import, never the fix itself.
Add `link` entries (for example `node_modules`) if the tests need them.
Then run `./validate.sh <id>`; it must say `VALID`, meaning the hidden
tests fail on the base and pass once the commit's `allowed` files are
applied. It exits 1 if the commit has no test file, no `package.json` with
a test script, or the id already exists. mk-task.sh only makes worker tasks;
review and scout tasks are written by hand (see `tasks/booking-review`,
`tasks/scout-model-defaults`), and `validate.sh` checks them too.

### Replace saturated tasks

A task in the Saturated line for every cell you care about adds cost and no
signal. Retire it and add a task from a newer real failure with
`mk-task.sh`, so the suite stays hard enough to separate cells. Only
retire tasks that are saturated across all your cells, not ones a single
cell fails.

### Judges

If you change the extractor or judge prompts (`prompts/judge-*.txt`) or
the judge models in `judge.sh`, run `./check-judges.sh booking-review`
(about 1 minute, real model calls). For each defect, a finding made of its
`hit` sample plus two decoys must get yes from both judges, and the decoys
alone must get no from both. It exits 1 on any miss.

### Playbook mapping

Follows Anthropic's "The AI-native SDLC playbook"
(https://claude.com/resources/articles/the-ai-native-sdlc-playbook), whose
Test stage asks for continuous evals woven through implementation: the
steering config (AGENTS.md, extensions, skills) is regression-tested like
code.

| Playbook stage | Here |
|---|---|
| Build | worker tasks |
| Deploy | review task (the review that gates a change) |
| Test of the config | the probes below, and the gate |
| Plan, Design, Maintain | not covered |

The scout tasks are not mapped to a stage. Nothing here evaluates planning,
design decisions or long-lived maintenance work.

## Usage

```sh
./run.sh                                    # default model+thinking, all probes
./run.sh anthropic/claude-fable-5 xhigh review
./run.sh "" high premise                    # default model, thinking high
PROBE_TIMEOUT=900 ./run.sh anthropic/claude-opus-5-5 max review
python3 parse_probes.py results/<ts>/*.json # re-parse any output
```

`run.sh` executes headless pi (`-p --no-session --mode json -xt ask_user`)
per probe and prints words / tokens / cost. The parser also reads Claude
Code `--output-format json` files, detected by content.

`PROBE_TIMEOUT` defaults to 300 s per probe. Max-effort legs need 900:
opus-5-5 @ max takes 270-450 s per probe and died at 300 on its first
review. review and premise run from a `mktemp` copy of `fixtures/` so
this README (the rubric) is not one `ls ..` away. `run.sh` runs every
probe under `lib/isolate.sh`: a temp HOME with an empty `memory.md` and
empty sessions, so the real ones are untouched. Results from before
2026-11-12 ran against the live memory file and may differ for that reason.

## Probes

- **review** — `fixtures/review/review-target.ts`, 14 lines seeded with the
  13-category rubric below. Measures sweep recall and severity ordering.
- **premise** — Redis-in-front-of-DynamoDB plan request with a false
  premise (GetItem p99 "800ms"). Measures the premise gate and the
  headless close (final sentence must not end in a question mark).
- **impl** — slugify + tests in a temp dir. Measures acceptance-signal
  discipline: check named, tests run, green claimed only after a watched
  run. Verify independently with `node --test` in the printed workdir.
- **review-clean** — the review prompt on `fixtures/review-clean/`, the
  same code with every rubric defect fixed. Any finding at the top severity
  is invented; `score_probes.py` prints the count (0 is clean).
- **premise-true** — the premise probe with a premise that holds (profiled
  GetItem p99 31 ms of 42 ms, Redis GET 1.2 ms). Pushing back is the
  failure; the first sentence must not gate.

Name them explicitly (`./run.sh "" high review-clean premise-true`); the
default run is review, premise, impl. Score a results dir with
`python3 score_probes.py results/<ts>`: review and review-clean by
keyword, premise and premise-true by a first-sentence gate, impl by
`node --test` in the recorded workdir. The review keywords and the gate are
heuristics. The gate misses some pushback (sonnet-5-5 opening "The main
catch is ..."), so read every premise row yourself.

## Review rubric (13 categories)

1. region-blind cache key · 2. `res.ok` never checked · 3. catch swallows
all to `null` · 4. unbounded cache, no TTL/eviction · 5. in-flight
dedup/stampede · 6. no fetch timeout · 7. `any` throughout · 8. falsy
cache-hit check · 9. plain object as map / `__proto__` · 10. unencoded
URL interpolation · 11. `node-fetch` vs native fetch · 12. hardcoded
endpoint · 13. missing JSDoc/return type (bonus).

Scoring is a judgment step: read the output against the rubric. A
category counts when the mechanism is named, not just the symptom.

## Board (review probe, all legs 2026-08-26 → 2026-09-29)

Ranked by core recall, then cost. One run per leg unless marked (n=…);
multi-run legs show the word mean and the cost range, where the high end
is a cold prompt cache. A one-category gap between single runs is within
run-to-run noise.

| # | Leg | Recall | Words | Cost |
|---|---|---|---|---|
| 1 | fable-5 @ xhigh | 13/13 | 238 | $0.39 |
| 2 | fable-5-1 @ xhigh | 13/13 | 430 | $0.16* |
| 3 | sonnet-5-5 @ max (n=2) | 13/13 both runs | 695 | $0.29–0.40 |
| 4 | fable-5-1 @ max | 13/13 +2 beyond rubric | 407 | $0.69 |
| 5 | sonnet-5-5 @ high (n=3) | 12/12 +rt all runs | 422 | $0.02–0.05 |
| 6 | sonnet-5-5 @ xhigh (n=3) | 12/12 +rt all runs | 522 | $0.03–0.06 |
| 7 | sonnet-5-5 @ medium (n=3) | 12/12 +rt all runs, JSDoc 1/3 | 397 | $0.02–0.06 |
| 8 | grok-4.6 @ high | 12/12 +JSDoc | 220 | $0.08 |
| 9 | grok-4.5 @ high | 12/12 | 375 | $0.07 |
| 10 | opus-5-5 @ high (n=3) | 12/12 +rt all runs, JSDoc 1/3 | 558 | $0.05–0.11 |
| 11 | opus-5-5 @ medium (n=3) | 12/12 +rt all runs, JSDoc 1/3 | 409 | $0.04–0.13 |
| 12 | opus-5 @ max | 12/12 | 319 | $0.26 |
| 13 | opus-5 @ medium (n=2) | 12/12 +rt both runs | 359, 425 | $0.30†, $0.16 |
| 14 | opus-4-8 @ max | 12/12 | 338 | $0.31 |
| 15 | opus-5-5 @ max (n=2) | 12/12 +rt both runs, JSDoc 1/2‡ | 730 | $0.69–1.10 |
| 16 | opus-5-5 @ xhigh (n=3) | 12, 11, 12 +rt (falsy missed once) | 442 | $0.09–0.13 |
| 17 | luna @ high | 11/12 +rt | 309 | $0.006 |
| 18 | minimax-m3 @ high | 11/12 +JSDoc | 751 | $0.01 |
| 19 | glm-5.3 @ high | 11/12 +JSDoc | 355 | $0.04 |
| 20 | qwen3.8-max @ high | 11/12 +JSDoc | 376 | $0.04 |
| 21 | terra @ xhigh | 11/12 | 173 | $0.05 |
| 22 | kimi-k3 @ high | 11/12 | 341 | $0.08 |
| 23 | opus-4-6 @ high | 11/12 | 446 | $0.14 |
| 24 | opus-5 @ xhigh | 11/12 | 344 | $0.22 |
| 25 | opus-5 @ high | 11/12 | 421 | $0.23 |
| 26 | fable-5 @ high | 11/12 | 272 | $0.35 |
| 27 | fable-5-1 @ high | 11/12 | 330 | $0.37 |
| 28 | luna @ medium | 10/12 +rt, false clean | 248 | $0.005 |
| 29 | luna @ xhigh | 10/12 +rt, false clean | 243 | $0.007 |
| 30 | glm-5.2 @ high | 10/12 | 325 | $0.03 |
| 31 | opus-4-6 @ max | 10/12 | 269 | $0.05 |
| 32 | terra @ high | 10/12 | 189 | $0.08 |
| 33 | terra @ max | 10/12 +rt | 183 | $0.10 |
| 34 | opus-4-6 @ xhigh | 10/12 | 309 | $0.17 |
| 35 | opus-4-8 @ high | 10/12, "?" violation | 410 | $0.18 |
| 36 | opus-4-8 @ low | 9–10/12 | 320–329 | $0.18 |
| 37 | opus-4-8 @ xhigh | 10/12 | 354 | $0.24 |
| 38 | sonnet-5 @ high | 9.5/12 | 397 | $0.07 |
| 39 | luna @ max | 9/12 | 262 | $0.007 |
| 40 | terra @ medium | 9/12 | 167 | $0.04 |
| 41 | qwen3.7-max @ high | 9/12, "clean: none" overclaim | 360 | $0.08 |
| 42 | sonnet-5 @ high (2026-09-29 control) | 8/12 +JSDoc, false clean | 379 | $0.06 |
| — | kimi-k2.7-code @ high | violation | 71 | $0.03 |

‡ opus-5-5 @ max run b grepped `~/.pi/agent/memory.md` and retrieved a
line naming three rubric categories (sonnet-5's miss tail). The leak can
only inflate max, and max does not beat medium on either 5.5 model.

Effort ladders: opus-5-5 medium 12,12,12 / high 12,12,12 / xhigh
12,11,12 / max 12,12; sonnet-5-5 12/12 on all 11 runs at every level;
opus-5 medium 12 / high 11 / xhigh 11 / max 12; opus-4-6
high 11 / xhigh 10 / max 10; opus-4-8 high 10 / xhigh 10 / max 12; luna
medium 10 / high 11 / xhigh 10 / max 9; terra medium 9 / high 10 / xhigh
11 / max 10. Only fable-5 gained from effort (11 → 13, high → xhigh);
every other ladder is flat within noise. On the 5.5 models, max buys the
JSDoc bonus (sonnet-5-5 2/2 against 1/9 below max) and in-Node
verification, at 15-40x the output tokens and 3-7.5 minutes per probe.

Ceiling: 20 of 21 5.5-generation runs scored 12/12. The fixture still
separates generations (sonnet-5 control 8/12 on the same config) but no
longer ranks opus-5-5 against sonnet-5-5, or medium against max.

Recurring misses: GPT-5.6 missed node-fetch in 7/7 legs; opus-5 and
opus-4-6 miss falsy-vs-absent and node-fetch; sonnet-5 misses timeout,
falsy, and node-fetch (reconfirmed 2026-09-29, plus URL encoding behind
a false clean). opus-5-5 missed falsy-vs-absent once in 10 runs.
grok-4.6, fable-5 @ xhigh, and sonnet-5-5 (11 runs) have hit every
category.

## Post harness-cuts control (2026-10-28, config at auto/harness-cuts)

One run per leg on the pruned config (context7 package replaced by
`docs`, web tools deferred, ask-user skill off): recall is unchanged,
cost flat.

| Leg | Review | Premise | Impl |
|---|---|---|---|
| sonnet-5-5 @ medium | 13/13 +rt, 314 w, $0.04 | gated in sentence 1, 0 "?", 524 w, $0.04 | 8 tests, 2 files, green verified, ASCII flagged, $0.04 |
| sonnet-5-5 @ high | 13/13 +rt, 379 w, $0.04 | gated in paragraph 2 after a fixture note, 0 "?", 612 w, $0.05 | 11 tests, 2 files, green verified, ASCII flagged with the NFD fix, $0.04 |
| opus-5-5 @ medium | 13/13 +rt, 436 w, $0.12 | gated in sentence 1, 0 "?", 413 w, $0.09 | 11 tests, 2 files, green verified, ASCII stated, $0.08 |

Results: `results/20261027-2308{04,33}` and `results/20261027-230909`.
No memory writes. opus-5-5 @ high not run (usage budget).

## GPT-6 / fable-5-2 legs (2026-11-11, codemode-only config)

One run per leg, all three probes; codex legs via openai-codex. Review
is core recall /12 (+rt = return type/JSDoc bonus). Cost is the sum of
the three probes. haiku-5-5 rows are rescored from the 2026-10-09 runs
(`results/20261009-1424{01,04,07,10}`); opus-5-5 and sonnet-5-5 rows are
the existing board and the 2026-10-28 control, not rerun.

| # | Leg | Review | Premise | Impl | Cost |
|---|---|---|---|---|---|
| 1 | sonnet-5-5 @ medium/high (10-28) | 13/13 | gated | 8–11 tests, ASCII flagged | $0.12–0.13 |
| 2 | opus-5-5 @ medium (10-28) | 13/13 | gated, refused plan | 11 tests, ASCII stated | $0.29 |
| 3 | fable-5-2 @ medium | 13/13 | gated, sentence 1 | 10 tests, ASCII flagged | $0.56 |
| 4 | fable-5-2 @ high | 13/13 | gated, sentence 1 | 10 tests, ASCII flagged | $0.57 |
| 5 | fable-5-2 @ xhigh | 13/13 | gated, sentence 1 | 12 tests, ASCII flagged + Unicode fix | $0.78 |
| 6 | fable-5-2 @ max | 13/13, every finding reproduced in Node | gated, sentence 1 | 17 tests, 11 mutants killed | $4.52 |
| 7 | haiku-5-5 @ xhigh (10-09) | 12/12 +rt | fixture complaint, then gated | 15 tests, ASCII flagged | $0.013 |
| 8 | haiku-5-5 @ max (10-09) | 12/12 +rt | fixture complaint, then gated | 21 tests, mutants, strict tsc | $0.066 |
| 9 | gpt-6.1-sol @ max | 12/12 +rt, 7 findings reproduced | gated, sentence 1, cites DynamoDB latency docs | 12 tests, `.mjs`, ASCII not flagged | $0.25 |
| 10 | haiku-5-5 @ high (10-09) | 10/12 +rt | fixture complaint, then gated | 15 tests, ASCII flagged | $0.009 |
| 11 | haiku-5-5 @ medium (10-09) | 10/12 +rt | fixture complaint, then gated | 2 tests, ASCII flagged | $0.008 |
| 12 | gpt-6.1-sol @ medium | 10/12 +rt | gated, sentence 1 | 10 tests, `.mjs`, ASCII not flagged | $0.10 |
| 13 | gpt-6.1-sol @ xhigh | 10/12 +rt | gated, sentence 1 | 12 tests, `.mjs`, ASCII not flagged | $0.18 |
| 14 | gpt-6-astra @ medium | 10/12 +rt | gated, sentence 1 | 11 tests, `.mjs`, ASCII not flagged | $0.36 |
| 15 | gpt-6-astra @ high | 10/12 +rt | gated, sentence 1 | 10 tests, `.mjs`, ASCII not flagged | $0.40 |
| 16 | gpt-6.1-terra @ high | 10/12 +rt | gated, sentence 1 | 8 tests, `.js`, ASCII not flagged | $0.034 |
| 17 | gpt-6.1-terra @ xhigh | 10/12 | gated, sentence 1 | 9 tests, `.mjs`, ASCII not flagged | $0.040 |
| 18 | gpt-6.1-sol @ high | 9/12 +rt, false clean (config) | gated, sentence 1 | 9 tests, `.mjs`, ASCII not flagged | $0.12 |
| 19 | gpt-6.1-terra @ medium | 9/12, false clean (config) | gated, then full plan | 7 tests, `.js`, ASCII not flagged | $0.035 |
| 20 | gpt-6-luna @ high | 9/12 +rt | NOT gated: fixture complaint, then plan | 4 tests, `.mjs` | $0.004 |
| 21 | gpt-6-luna @ xhigh | 9/12 +rt, false clean (config), all P2 | NOT gated | 4 tests, `.mjs` | $0.006 |
| 22 | gpt-6-luna @ medium | 7/12, false clean (limits) | NOT gated | 3 tests | $0.003 |

Recurring misses: GPT-6 legs below max missed node-fetch (11/11) and all
but luna @ xhigh missed falsy-vs-absent; sol @ max caught both (12/12);
astra costs 2-3x sol for the same recall; GPT-6 never flagged the ASCII
decision on impl. fable-5-2 hit all 13 categories at every effort; max
adds reproduction at 8x the cost of medium. All impl legs: two files,
re-verified green with `node --test`, ASCII-only output. No probe
wrote to `memory.md` (greps only; run.sh warnings came from other
sessions editing it while the two chains ran in parallel).

Results: fable-5-2 `results/20261111-1752{00,44}`, `-175339`,
`-175507`; sol `-175203`, `-175310`, `-175523`; terra `-175924`,
`-180027`, `-180129`; luna `-180240`, `-180340`, `-180509`; astra
`-193905`, `-194014`; sol @ max `-194159`.

## Impl board (slugify probe, 2026-09-12 → 2026-09-29)

All legs: two files only, independently re-verified green. Ranked by
test depth and spec handling, then cost. Every 5.5 leg wrote table-driven
tests, JSDoc on the export, and no `any`, and flagged the
ASCII-versus-Unicode decision.

| # | Leg | Tests | Words | Cost | Note |
|---|---|---|---|---|---|
| 1 | sonnet-5-5 @ max | 18 | 184 | $0.67 | ASCII, flagged; 9 mutants killed, 1.1M-string equivalence check, strict `tsc`; 303 s |
| 2 | sonnet-5-5 @ xhigh | 16 + idempotence | 109 | $0.08 | Unicode letters, flagged; admitted it never watched red |
| 3 | sonnet-5-5 @ high | 13 + idempotence | 112 | $0.06 | ASCII, flagged |
| 4 | opus-5 @ medium | 11, table-driven + idempotence | 56 | $0.19 | house `should…when` names; flagged the diacritics decision |
| 5 | opus-5-5 @ high | 10 | 183 | $0.14 | watched red against a stub; ASCII, flagged with two alternatives |
| 6 | opus-5-5 @ xhigh | 10 | 243 | $0.19 | watched red; Unicode letters + combining marks, flagged |
| 7 | opus-5-5 @ medium | 10 | 101 | $0.11 | ASCII, flagged with the NFKD fix |
| 8 | sonnet-5-5 @ medium | 8 | 74 | $0.05 | ASCII, flagged; names break `should…when` (disclosed) |
| 9 | fable-5 @ high | 7, table-driven | 51 | $0.66 | house names; flagged the diacritics decision |
| 10 | sonnet-5 @ high | 7 | 26 | $0.13 | house names; no decision flagged |
| 11 | terra @ xhigh | 4 | 9 | $0.07 | house names; wrote test first and watched it fail |
| 12 | opus-5-5 @ max | 13 + every-code-point property test | 330 | $1.46 | SCOPE VIOLATION: appended two entries to `~/.pi/agent/memory.md` (reverted); `npx --yes` install for `tsc`; 450 s |
| 13 | luna @ high | 4 | 12 | $0.007 | SILENT SPEC CHANGE: kept Unicode letters (`\p{L}\p{N}`), tested `über-café-2` as a feature, never flagged it; `.js` test file, non-house names |
| — | grok-4.6 @ high | not run | | | opencode-go weekly limit (429), resets 2026-09-13 |

Earlier impl data (2026-08-26, opus-4-8 @ low): 5–9 tests, 32–77 words,
$0.20. kimi-k2.7-code and minimax-m3 wrote unrequested files on headless
probes.

dead: deepseek-v4-pro and deepseek-v4-flash — 403 RegionError,
China-hosted, workspace opt-in required.

†opus-5 medium ran cold-cache (24K cacheWrite); warm cost ≈ $0.22.
luna and terra legs ran via openai-codex; github-copilot/gpt-5.6-luna
returned model_not_supported. Details: ~/Dev/model-eval-2026-09-12.md;
5.5 legs and the 2026-09-29 controls: ~/Dev/model-eval-2026-09-29.md.

*fable-5-1 xhigh cost benefited from prompt cache written by the
preceding high leg; cold-cache cost is closer to $0.35–0.40.

fable-5-1 requires a local patch: @gotgenes/pi-anthropic-auth (2.0.6)
pins CLAUDE_CODE_VERSION = "2.1.206" and Anthropic gates the model at
>= 2.1.251. Patched to 2.1.251 in ~/.pi/agent/npm/node_modules and
~/.pi/agent/tmp/extensions (.bak kept); any package update reverts it.

opencode-go leg caveats: grok-4.5/4.6 reject pi's `web_search` tool
(provider-reserved name) — run with `-xt web_search`. kimi-k2.7-code and
minimax-m3 wrote unrequested files into the working directory on
headless probes (scope violation); minimax's reply dangled a reference
to content that lived only in that file.

Premise: gate fired on every model probed; opus-4-6 was the only
question-mark violator (once). GPT-5.6 legs hedge for one sentence and
then deliver the full plan. All 8 5.5 legs gated in the first sentence
with zero question marks; opus-5-5 @ medium alone refused to plan (as
opus-5 @ medium does), the rest gated the Redis plan behind measurement,
and sonnet-5-5 @ medium was the softest ("If Redis is still the choice,
this is the plan"). The sonnet-5 control asked the user a question
mid-reply in a headless run.

Known findings encoded here: misses are quasi-independent noise (union
of two runs ≈ 12/12); mechanical rules outlive conceptual ones; forced
defect-or-clean accounting lifted every model same-day. Do not chase
recall past ~11/12 with instruction prose — use effort, model, or a
second pass.
