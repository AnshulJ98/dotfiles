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

## Baselines (2026-08-26, config at commit df87659)

| Leg | Recall | Words | Cost |
|---|---|---|---|
| opus-4-8 @ low (then-default) | 9–10/12 | 320–329 | $0.18 |
| fable-5 @ high | 11/12 | 272 | $0.35 |
| fable-5 @ xhigh | 13/13 | 238 | $0.39 |
| opus-5 @ high | 11/12 | 421 | $0.23 |
| opus-5 @ xhigh | 11/12 | 344 | $0.22 |
| opus-4-6 @ high | 11/12 | 446 | $0.14 |
| sonnet-5 @ high | 9.5/12 | 397 | $0.07 |
| grok-4.5 @ high | 12/12 | 375 | $0.07 |
| grok-4.6 @ high | 12/12 (+JSDoc) | 220 | $0.08 |
| kimi-k3 @ high | 11/12 | 341 | $0.08 |
| glm-5.2 @ high | 10/12 | 325 | $0.03 |
| glm-5.3 @ high | 11/12 (+JSDoc) | 355 | $0.04 |
| qwen3.7-max @ high | 9/12 | 360 | $0.08 |
| qwen3.8-max @ high | 11/12 (+JSDoc) | 376 | $0.04 |
| minimax-m3 @ high | 11/12 (+JSDoc) | 751 | $0.01 |
| kimi-k2.7-code @ high | violation | 71 | $0.03 |

dead: deepseek-v4-pro and deepseek-v4-flash — 403 RegionError,
China-hosted, workspace opt-in required.

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
