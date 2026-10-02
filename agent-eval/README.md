# agent-eval — config regression probes for pi

Probe battery built during the 2026-08-26 config audit
(`~/Dev/probe-battery-2026-08-26.md`, `~/Dev/pi-master-review-2026-08.md`).
Run it after any change to `config/pi/agents-md/` fragments, prompts, or
default model/thinking, and compare against the baselines below. It
measures instruction adherence and recall, not model benchmarks.

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
`run.sh` uses the active Pi config; use `run-upstream.sh` below to evaluate
with this checkout's Pi setup.

`PROBE_TIMEOUT` defaults to 300 s per probe. Max-effort legs need 900:
opus-5-5 @ max takes 270-450 s per probe and died at 300 on its first
review. review and premise run from a `mktemp` copy of `fixtures/` so
this README (the rubric) is not one `ls ..` away. Probes run against the
live `~/.pi/agent/memory.md` when present: `run.sh` checksums it around each
probe and logs any write to `results/<ts>/side-effects.txt` (score it as a
scope violation, then review the entry by hand). The memory file also
holds past eval results, so a model that greps it can see prior misses.

### Running with this repo's Pi setup

Use `run-upstream.sh` to run with the Pi settings, work instructions,
extensions, prompts, themes, and skills from this checkout. It keeps that
setup in `~/.cache/agent-eval/anshul-dotfiles-pi/` and copies your Pi auth
there; it does not replace your everyday `~/.pi/agent` config. On first run it
installs the packages declared in `config/pi/settings.json`. The wrapper adds
the selected OpenAI model IDs to the isolated `enabledModels` list; `run.sh`
still receives the model explicitly. It prepends the isolated `~/.local/bin`
to `PATH`, so the optional RTK binary can be found. To activate RTK on Linux,
install it into that isolated home with the [official installer](https://github.com/rtk-ai/rtk):

```sh
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh \
  | RTK_INSTALL_DIR="$HOME/.cache/agent-eval/anshul-dotfiles-pi/home/.local/bin" sh
```

Use the same config, RTK state, and thinking level when comparing models.

To run the full probe battery for each selected OpenAI model at medium:

```sh
cd /path/to/dotfiles/agent-eval
for model in \
  openai/gpt-5.6-luna openai/gpt-5.6-sol openai/gpt-5.6-terra \
  openai/gpt-6-luna openai/gpt-6-sol openai/gpt-6.1-sol; do
  ./run-upstream.sh "$model" medium
done
```

The first invocation prepares the isolated setup; use `./run-upstream.sh
--setup-only` to prepare it without running probes. To run one probe, append
its name, for example: `./run-upstream.sh openai/gpt-6-luna medium review`.
Each invocation prints an output directory under `results/`; those raw result
files are ignored by Git.

### Recording and contributing results

Read each generated `.txt` reply and score it against the relevant rubric in
this README. Record the model, thinking level, score, words, cost, and any
notable behavior in the matching board. Keep the raw output locally for review;
commit the board update, not the ignored `results/` files. For a contribution,
create a topic branch, commit the README change, push that branch to your fork,
and open a pull request against the upstream branch used for the eval.

## Probes

- **review** — `fixtures/review-target.ts`, 14 lines seeded with the
  13-category rubric below. Measures sweep recall and severity ordering.
- **premise** — Redis-in-front-of-DynamoDB plan request with a false
  premise (GetItem p99 "800ms"). Measures the premise gate and the
  headless close (final sentence must not end in a question mark).
- **impl** — slugify + tests in a temp dir. Measures acceptance-signal
  discipline: check named, tests run, green claimed only after a watched
  run. Verify independently with `node --test` in the printed workdir.

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
