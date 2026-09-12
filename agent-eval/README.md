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
python3 parse_probes.py results/<ts>/*.json # re-parse any output
```

`run.sh` executes headless pi (`-p --no-session --mode json -xt ask_user`)
per probe and prints words / tokens / cost. The parser also reads Claude
Code `--output-format json` files, detected by content.

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

## Board (review probe, all legs 2026-08-26 → 2026-09-12)

Ranked by recall, then cost. Availability: B = work Bedrock, C = work
Copilot, P = personal only. Single run per leg unless noted; a one-category
gap is within observed run-to-run noise (misses are quasi-independent).

| # | Leg | Recall | Words | Cost | Avail | Note |
|---|---|---|---|---|---|---|
| 1 | fable-5 @ xhigh | 13/13 | 238 | $0.39 | P | recall ceiling, tersest of the 13s |
| 2 | fable-5-1 @ xhigh | 13/13 | 430 | $0.16* | P | warm cache; cold ≈ $0.35–0.40 |
| 3 | fable-5-1 @ max | 13/13 +2 beyond | 407 | $0.69 | P | only leg to exceed the rubric |
| 4 | grok-4.6 @ high | 12/12 +JSDoc | 220 | $0.08 | B | best recall/$; impl 10/12, no JSDoc; `-xt web_search` |
| 5 | grok-4.5 @ high | 12/12 | 375 | $0.07 | P | hardest premise gate of the go legs |
| 6 | opus-5 @ max | 12/12 | 319 | $0.26 | B,C | |
| 7 | opus-5 @ medium | 12/12 +rt | 359 | $0.30† | B,C | cold cache, warm ≈ $0.22; hardest premise gate to date |
| 8 | opus-4-8 @ max | 12/12 | 338 | $0.31 | B | max-only model; worst opus below max |
| 9 | luna @ high (codex) | 11/12 +rt | 309 | $0.006 | C | only luna leg without a false clean |
| 10 | minimax-m3 @ high | 11/12 +JSDoc | 751 | $0.01 | P | wrote unrequested files (scope violation) |
| 11 | glm-5.3 @ high | 11/12 +JSDoc | 355 | $0.04 | P | |
| 12 | qwen3.8-max @ high | 11/12 +JSDoc | 376 | $0.04 | P | |
| 13 | terra @ xhigh (codex) | 11/12 | 173 | $0.05 | C | best GPT leg; tersest 11 on the board |
| 14 | kimi-k3 @ high | 11/12 | 341 | $0.08 | P | |
| 15 | opus-4-6 @ high | 11/12 | 446 | $0.14 | B | wordiest 11; only premise "?" violator (once) |
| 16 | opus-5 @ xhigh | 11/12 | 344 | $0.22 | B,C | |
| 17 | opus-5 @ high | 11/12 | 421 | $0.23 | B,C | |
| 18 | fable-5 @ high | 11/12 | 272 | $0.35 | P | |
| 19 | fable-5-1 @ high | 11/12 | 330 | $0.37 | P | |
| 20 | luna @ medium (codex) | 10/12 +rt | 248 | $0.005 | C | FALSE CLEAN on config |
| 21 | luna @ xhigh (codex) | 10/12 +rt | 243 | $0.007 | C | FALSE CLEAN on endpoint |
| 22 | glm-5.2 @ high | 10/12 | 325 | $0.03 | P | |
| 23 | opus-4-6 @ max | 10/12 | 269 | $0.05 | B | effort-flat model |
| 24 | terra @ high (codex) | 10/12 | 189 | $0.08 | C | |
| 25 | terra @ max (codex) | 10/12 +rt | 183 | $0.10 | C | 4757 output tokens for nothing |
| 26 | opus-4-6 @ xhigh | 10/12 | 309 | $0.17 | B | |
| 27 | opus-4-8 @ high | 10/12 | 410 | $0.18 | B | "Want a rewrite?" violation |
| 28 | opus-4-8 @ low | 9–10/12 | 320–329 | $0.18 | B | 2026-08-26 then-default |
| 29 | opus-4-8 @ xhigh | 10/12 | 354 | $0.24 | B | |
| 30 | sonnet-5 @ high | 9.5/12 | 397 | $0.07 | B,C | consistent miss tail: timeout, falsy, node-fetch |
| 31 | luna @ max (codex) | 9/12 | 262 | $0.007 | C | worst luna leg, most output tokens |
| 32 | terra @ medium (codex) | 9/12 | 167 | $0.04 | C | |
| 33 | qwen3.7-max @ high | 9/12 | 360 | $0.08 | P | "clean: none" overclaim, plan-eager premise |
| — | kimi-k2.7-code @ high | violation | 71 | $0.03 | P | wrote files, dangling reference |

Effort ladders, for the record: opus-5 medium 12 / high 11 / xhigh 11 /
max 12 (flat); opus-4-6 high 11 / xhigh 10 / max 10 (flat); opus-4-8 high
10 / xhigh 10 / max 12 (max-only); luna medium 10 / high 11 / xhigh 10 /
max 9 (flat, max worst); terra medium 9 / high 10 / xhigh 11 / max 10
(flat). Only fable-5 has shown a real effort gain (11 → 13, high → xhigh).

Family blind spots: GPT-5.6 missed node-fetch in 7/7 legs; opus-5 and
opus-4-6 miss falsy-vs-absent and node-fetch; sonnet-5 misses timeout,
falsy, node-fetch. grok-4.6 and fable-5 @ xhigh have hit every category.
Any Anthropic + non-Anthropic pair covers the fixture.

Current lineup (2026-09-12, ~/Dev/model-eval-2026-09-12.md): Bedrock
daily opus-5 @ medium; hard review opus-5 @ medium + grok-4.6 @ high
second sweep; sonnet-5 for bulk implementation only; opus-4-6 and
opus-4-8 dropped. Copilot daily luna @ high; terra @ xhigh reserve when
brevity is worth ~8x cost; never medium or max on either GPT model.

dead: deepseek-v4-pro and deepseek-v4-flash — 403 RegionError,
China-hosted, workspace opt-in required.

†opus-5 medium ran cold-cache (24K cacheWrite); warm cost ≈ $0.22.
See ~/Dev/model-eval-2026-09-12.md. github-copilot/gpt-5.6-luna returns
model_not_supported on the personal account; luna/terra legs ran via
openai-codex.

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

Premise: gate fired 5/5 models; opus-4-6 was the only question-mark
violator. Impl: 5–9 tests, all watched green, 32–77-word replies.

Known findings encoded here: misses are quasi-independent noise (union
of two runs ≈ 12/12); mechanical rules outlive conceptual ones; forced
defect-or-clean accounting lifted every model same-day. Do not chase
recall past ~11/12 with instruction prose — use effort, model, or a
second pass.
