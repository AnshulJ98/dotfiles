# Agent tribal knowledge — pi + Claude Code

_Frozen 2026-07-26 at the close of the 2026-07-16 → 07-26 reliability expedition.
Everything here was verified against the harness, upstream changelogs, or live-fire
runs on the stated date. Claims about future versions carry the version they were
last verified on. Update this file only with the same standard of evidence._

## Installed state at freeze

pi **0.82.1** · pi-subagents **0.37.0** · Claude Code **2.1.212** (brew cask) ·
zero MCP servers · harness lineup: **pi (work primary), Claude Code (personal
primary), OpenCode retired** (config archived at `config/opencode/`, unwired).
The `opencode-go` model *provider* is unrelated to the OpenCode harness and remains
pi's model source.

## 1. Architecture

- One fragment source (`config/pi/agents-md/`) → `build-agents.sh` emits
  `AGENTS.md`, `AGENTS.work.md`, `CLAUDE.md`. Manifest arrays at the top of the
  script are the composition authority; **order is load-bearing** (Lost-in-the-Middle:
  primacy for persona/dispatch, recency for `ladder.md`, always last). Variants
  differ only by fragment selection, never in-fragment conditionals. A `githooks/pre-commit`
  runs `--check` as a golden test (`core.hooksPath` set by install.sh).
- Fleets: scout + worker on both harnesses. Claude Code scout caps at a hard 400
  words, worker at 300, overflow to file. Pi scout/worker carry the same 300w
  contract. Evidence for the cull: 107 lifetime dispatches, 88% retrieval-shaped,
  four of six deleted agents at zero.
- Resident tokens at freeze: CLAUDE.md ≈2.8k (from ≈6.8k), AGENTS.md ≈2.6k.
- context7 = skill hitting `context7.com/api/v1` (search + docs endpoints, verified
  live); same backend as pi's `@upstash/context7-pi`. No MCP.
- Memory: Claude Code auto-memory native; pi markdown memory at `~/.pi/agent/memory.md`;
  durable cross-harness knowledge goes in the repo (this file, CONTEXT.md), never a
  side channel. The old MCP graph's jsonl sits read-only at `~/.local/state/agent-memory/`.

## 2. Cost truths (measured)

- Pi lifetime spend, 33 sessions: **$3.38**; output is 1% of token flow. Pi cost is
  input-side context re-billing. Optimize resident context and cache behavior, not prose.
- Claude Code pre-rewrite: 71% of output words in the top 10% of messages; subagents
  out-worded the main thread; a subagent return re-bills as parent input every turn.
- Worker `fork` context billed the whole parent conversation per dispatch → default
  is `fresh` + explicit spec (verified end-to-end: 24/24 tests from spec alone).
- Fallback chains: **pi-subagents `fallbackModels` resolves once at spawn against the
  catalog and does NOT advance on runtime provider errors.** Order is the mechanism;
  a home-viable model must come first (live-fire proven, commit `da39...` fix).
- Depth guard: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` and
  `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=4` are pinned in settings env ahead of the
  2.1.219 default flip to depth-3 nesting (word caps bind only at depth 1).

## 3. Persona and register engineering

- Casting causes facetiousness: character sheets ("distinguished staff engineer,
  impatient") make models perform. Behavioral rules survive without the theater.
- Instruction files are style exemplars: models imitate the register they are
  written in. Source em-dashes 30→0 halved output rates on all models.
- Mechanical rules bind; judgment rules don't ("<200 words default" works,
  "needs a reason" doesn't; per-section budgets don't stack into a total).
- Current persona: direct, hypercritical, harsh-with-payload ("every cutting remark
  must carry the specific defect, file, number; contempt without content is noise").
  Verified across six opencode-go models + Claude Code headless: 0 narration
  openings in 17+ scored runs, 205–292w replies, quality floor held.
- Numeric acceptance criteria only. "More human" is not a criterion.

## 4. Pi core sharp edges

- **RPC prompt during in-flight compaction: ACKed `success:true`, silently dropped.**
  Reproduced on 0.81.1 (2026-07-21 fleet) AND 0.82.1 (2026-07-26, session JSONL
  evidence). The window is the in-flight span: sub-second compactions let the prompt
  survive; multi-second compactions eat it. `followUp` prompts are immune.
  **Filed: earendil-works/pi#7150** (gist with JSONL + driver attached). Watch it.
- Extension uncaught-throw kills pi by design (0.74.1/#4426). Armor every deferred
  callback. Do not file.
- `sendUserMessage` lives only on the `pi` ExtensionAPI object (0.81.x+); the ctx
  variant throws and async handlers swallow it.
- `ask_user` parks headless sessions; `-xt ask_user` in every scripted run.
- ~~grok-4.5 broken via opencode-go~~ **RETIRED 2026-07-26**: stale catalog was the
  cause; works after `pi update --models` on 0.82.1 (0.81.0 fixed the Responses-API
  routing + catalog staleness #7016).
- qwen3.7-max usage telemetry is junk; opencode-go reports `cacheWrite=0` always.

## 5. Compaction chain (verified on 0.82.1, 2026-07-26)

`compact-cap` (165k flat ceiling, `/compact-cap` command, 30k floor) fires on
`turn_end` (mid-run, aborts) and `agent_settled`; `prime-reminder` injects a one-shot
pointer post-compaction and auto-resumes aborted runs via `pi.sendUserMessage`
deferred 1.5s. Smoke on 0.82.1: cap fired → compaction → resume delivered → task
completed (`counts.md` written). The two extensions coordinate via `Symbol.for`
keys; both no-op in subagent children.

## 6. pi-subagents (0.37.0)

- Upgrade path law: **0.37.0, never 0.36.0** (0.36.0 has the watchdog fixes but
  regressed success detection #645; 0.37.0 fixes it). SDK floor pi-ai ≥0.80.0: satisfied.
- Bridge-off (`intercomBridge: off`) **holds on 0.37.0**: child tool list probe shows
  exactly the frontmatter five, no `contact_supervisor` (0.36.0 reordered intercom
  registration; re-verified anyway).
- Work machine after upgrade: delete the `.git/info/exclude` watchdog scaffolding.
- New knobs since 0.37.0: `subagents.defaultThinking`, `subagents.defaultExtensions`,
  `agentOverrides.<name>.extensions`.
- Bounds are harness knobs (`turnBudget`, `toolBudget`, `timeoutMs`), not prose.
  Hard caps for read-only scouts only; never turn-cap mutation-capable workers.

## 7. Closed questions

- **herdr** (herdr.dev): agent multiplexer, **Apache-2.0** (GitHub API-verified
  2026-07-26; an earlier AGPL claim failed audit), solo-maintained, real project.
  NO for now: its problem is human attention across concurrent top-level agents;
  our concurrency is 1 and our constraint is context cost. Its socket API invites
  rebuilding cross-harness orchestration — the direction we deleted. Revisit
  trigger: real parallel multi-repo work.
- **pi-context-prune**: removed; its silent-no-op class is structurally absorbed by
  pi-condense (atomic batch summarization). If pruning ever returns, pi-condense is
  the candidate. Nothing to file.
- **TUI /compact on 0.81.x**: dropped — abandoned version.

## 8. Standing constraints for config work

1. Measure before changing; adds/deletes cite lifetime usage from session JSONL.
2. Numeric acceptance criteria only.
3. New tools enter as trials against a named measured problem, with a review date;
   usage-zero at the window = removal.
4. Subagent bounds are harness knobs; prose documents, knobs enforce.
5. Every doctrine claim gets verified against the harness or deleted (duck-hook standard).
6. "Still live on version X" claims carry a citation or last-verified date.
7. Finish every config session with `build-agents.sh --check` green.

## Watch list

- pi#7150 (prompt drop) — adopt the fix version when it lands, re-run the driver
  (archived in the gist and at scratchpad `smoke/driver.py` pattern).
- CC scout length cap: hardened to explicit "hard cap 400, count before returning"
  after two overshoots; if a third lands, add a SubagentStop length-measuring hook.
- Claude Code brew upgrade past 2.1.212: depth/concurrency env knobs already pinned;
  delete the stale nesting line if any doc still carries it.
