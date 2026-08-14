# pi-coding-agent — lightweight harness config

_Built 2026-06-05, last revised 2026-07-26 (fragment rewrite for plain register + length governance, A/B-tested live; context-prune removed; subagent report bounds; CLAUDE.md now generated from the same fragments). Targets: work laptop (GitHub Copilot + local MLX) and personal machine (openai-codex gpt-5.5 daily-driver; anthropic direct for Claude models)._

## Goal

A lightweight, fast, visually-pleasing pi config that delivers high-quality output on **low token usage** — because GitHub Copilot moved to **usage-based (token) billing on 2026-06-01**. Single agent, mode-switching, manual escalation. No standing multi-agent fan-out (that was the old OpenCode setup's cost sink).

## Decisions (what + why)

| Area | Decision | Why |
|------|----------|-----|
| Agent model | Single steerable agent + soft modes. Two opt-in subagents (scout + worker) via pi-subagents. | Token billing punishes context carried every turn; subagents run in isolated context with controlled concurrency (max 2). |
| Default model | `opencode-go/kimi-k3`, thinking `high` (home, user trial 2026-07-23; previously openai-codex/gpt-5.5 xhigh). At work the default doesn't resolve — pi tolerates it; pick per-session. | Trying opencode-go quota; codex remains the flat-rate fallback. Escalate manually via `/model`. |
| Model bench (Ctrl+P) | haiku-4.5 · gpt-5.4-mini · sonnet-4.6 · opus-4.6 · gpt-5.4 | Cheap→dear ladder; `/model` for the full picker. |
| Thinking | Default `high`; `Shift+Tab` cycles; editor border color = live HUD. | Reliable, visible level control. Spend tokens on reasoning, save them on context. |
| Compaction | Mario defaults, `keepRecentTokens` trimmed 20k→16k. Plus `extensions/compact-cap.ts`: a flat ~165k ceiling — fires at `turn_end` (mid-run, at turn boundaries) and `agent_settled` (between-run growth). Session command `/compact-cap [on|off|<n>k]`, 30k floor (below compaction's own output it thrashes). | Native trigger is per-model (`contextWindow - reserveTokens`) — useless on 1M-window models. Mid-run firing stops the 20-50k balloon past the cap that settle-only firing allowed; prime-reminder auto-resumes the aborted run (fleet-verified 2026-07-23: two consecutive cap→compact→resume cycles in one session, work continuing each time). |
| Modes | `/plan`, `/review`, `/memory`, `/challenge`, `/grill`, `/diagnose`, `/handoff` (prompt-templates, SOFT). | Reusable behavioral steers; no tool-gating. `/ask` redundant with default; `/spec` redundant with `mission`/`to-prd`. challenge/grill/diagnose are pi-native adaptations of the OpenCode challenger agent + Pocock grill-me/diagnose skills. |
| Questions | `pi-ask-user` (npm) — model-invocable `ask_user` selection UI. | One structured clarifying question beats a wrong implementation loop. `/grill` and `/challenge` route questions through it explicitly (models won't pick a UI tool unprompted). |
| RTK | `pi-rtk-optimizer` (npm), out-of-box config. | Compacts noisy tool output (test/build/git/lint/grep) before it enters context. Risky read-compaction ships off. No-ops where the brew `rtk` binary is absent (`guardWhenRtkMissing`), so one shared config works on both machines. Coverage gap (measured 2026-07-20): `fetch`/`read` dumps aren't in its pattern set — a fat session was 73% tool results led by fetch+bash; that gap is context-prune's job. |
| Context pruning | REMOVED 2026-07-26 (trial ended). | Live-fire found the failure mode decisive: with a quota-dead or absent summarizer it degrades to a silent no-op while appearing enabled (14/14 failed summarizer calls, zero pruned). Lifetime spend across 33 sessions was $3.38 — the risk of a silently dead cost-optimization outweighed the marginal saving. RTK plus compact-cap remain the context controls. Upstream issue unfiled by anyone as of removal. |
| Compaction UX | `extensions/prime-reminder.ts`. Any compaction that aborts a RUNNING task — manual /compact mid-task (0.80.x semantics), or compact-cap's turn_end path (signaled via `Symbol.for` handshake keys) — gets one auto-resume: `pi.sendUserMessage(RESUME)` deferred 1500ms past the compaction's agent-disconnect window, try/catch-armored. Every compaction arms a one-shot pointer to the Prime Directives injected on the next turn (fail-open). | The send MUST be `pi.sendUserMessage` — 0.81.x events ctx lacks the method (calling `ctx.sendUserMessage` throws) — and MUST be armored: an uncaught throw in an extension timer kills the pi process. Resume text forbids interactive asks (headless ask_user park). |
| Web access | `pi-web-access` (npm, swapped in 2026-08-11 for `pi-fetch`) — `web_search` + `fetch_content` (URL→markdown, PDF, GitHub-clone, video); `npm:@upstash/context7-pi` for live docs (`resolve-library-id` + `query-docs`). | pi-fetch died by adoption (17 weekly downloads, no release since 2026-04); pi-web-access is the ecosystem standard (75k weekly, MIT, active). The old "no web search" stance is REVERSED: live experience on Claude Code showed search is a real gap, not noise. Zero-config search (keyless Exa; reuses openai-codex auth for OpenAI search at home; work falls back keyless), optional keys in `~/.pi/web-search.json`, SSRF guards built in (localhost/private IPs blocked). Smoke-verified headless on install day. |
| Skills | Auto-loaded from `~/.agents/skills` (9, shared); the work-only `vault` skill lives on the work machine, not in this repo. All model-invocable. | pi natively discovers this dir; progressive disclosure keeps always-on cost to descriptions only. Pruned 2026-07-05 (27 -> 10): kept only non-obvious reference skills; philosophy restatements deleted (now inline). |
| Persona | AGENTS files GENERATED from `agents-md/` fragments (persona + standards + ops shared; env.work overlay; ladder last) via `build-agents.sh`. Persona rewritten 2026-07-10 for Opus-4.8-era models. Restructured 2026-07-20 for salience: delegation contracts front-loaded in the persona fragments (persona-core.md shared with Claude Code + persona-pi.md pi-only; trigger catalog cut 2026-07-21 — auto-dispatch is probabilistic, contracts + explicit dispatch are not); standards compressed 163→108 lines (catalog → principles); Solution Ladder + Prime Directives digest moved to `ladder.md`, concatenated LAST in both variants. | Lost-in-the-Middle U-curve: content at prompt extremes gets used, the middle decays — the ladder sat at 65% depth, squarely in the trough. Primacy for identity + dispatch, recency for the ladder + digest. Edit fragments, never outputs — `--check` fails on drift. |
| Themes | 5 maintained packs, switch in `/settings`. Default `bearded-arc`. | Drop-in, maintained upstream, zero hand-maintenance. Installed themes-only (no bundled extensions). |
| Subagents | `pi-subagents` (npm), `disableBuiltins: true`, two custom agents: scout (read-only, gpt-5.4-mini → fallback `openai-codex/gpt-5.4-mini`, 5-min timeout) + worker (implementation, copilot claude-opus-4.8 → fallbacks `openai-codex/gpt-5.5`, copilot sonnet-4.6, 60-min runaway timeout, `defaultContext: fresh` since 2026-07-26 — fork made worker cost scale with parent-session size on per-token billing; the explicit spec carries the context instead). Both agents carry a ~300-word report budget with file overflow. Max 2 concurrent. `subagent-config.json` (symlinked to `~/.pi/agent/extensions/subagent/config.json`) sets `intercomBridge: off` — verified 2026-07-20: children's tool list excludes `contact_supervisor`. | Context isolation without always-on fan-out. Bridge-off kills the indefinite-stall class: the native supervisor tool is otherwise injected into every child regardless of frontmatter allowlists, and a child calling it blocks up to 10 min against a parent that may never poll. Long implementations go async + `subagent_wait` slices (see persona Delegation) instead of blocking foreground. |
| MLX | Auto-activating provider (`extensions/mlx-local.ts`, loaded). OMLX at `localhost:11434/v1`, Bearer auth via `$OMLX_API_KEY`. | Registers nothing when the server is down or the key is absent — safe to keep enabled everywhere. Env is frozen at pi launch; restart (not `/reload`) after exporting the key. |
| Bedrock | Built into pi (`amazon-bedrock` provider, Converse API, auto cache points). Export `AWS_BEARER_TOKEN_BEDROCK` (or `AWS_PROFILE`) + `AWS_REGION`; add `amazon-bedrock/us.anthropic.claude-*` ids to `enabledModels` when adopting. | Frontier escalation without Copilot's proxy limits. Mind: 5-min cache TTL, thinking-`high` cost on opus, 1M-window sessions never auto-compact — keep Bedrock sessions short. |
| Tracking | Files in `~/Dev/dotfiles/config/pi/`, symlinked into `~/.pi/agent/`. Pi itself installs npm-global (nvm), NOT brew — the brew formula lags releases (was pinned 0.80.6 when npm had 0.80.10); update via `pi update`, don't reintroduce brew. | Mirrors the OpenCode dotfiles pattern; version-controlled. |

## File layout

```
~/Dev/dotfiles/config/pi/
├── settings.json            # → symlinked to ~/.pi/agent/settings.json (both machines)
├── subagent-config.json     # → symlinked to ~/.pi/agent/extensions/subagent/config.json (intercomBridge off)
├── context-prune-settings.json # → symlinked to ~/.pi/agent/context-prune/settings.json (trial)
├── agents-md/               # SOURCE fragments — edit these, never the outputs
│   ├── persona-core.md      # register + judgment + scope (shared: @-imported by claude/CLAUDE.md)
│   ├── persona-pi.md        # pi-only: Tools + scout/worker Delegation contracts
│   ├── standards.md         # coding standards, compressed 2026-07-20 (principles > catalogs)
│   ├── ops.md               # shared operating rules (memory, AutoApprove, PDF/binary)
│   ├── env.work.md          # work-only machine facts (homebrew paths, NotesVault)
│   └── ladder.md            # Solution Ladder + Prime Directives — concatenated LAST (recency)
├── build-agents.sh          # concat fragments → AGENTS files; --check fails on drift
├── AGENTS.md                # GENERATED: persona+standards+ops → ~/.pi/agent/AGENTS.md on PERSONAL
├── AGENTS.work.md           # GENERATED: same + env.work.md → ~/.pi/agent/AGENTS.md on WORK
├── agents/                  # → symlinked to ~/.pi/agent/agents/ (both machines)
│   ├── scout.md             # read-only retrieval (gpt-5.4-mini + openai fallback)
│   └── worker.md            # scoped implementation (opus-4.8 + fallback chain)
├── prompts/
│   ├── plan.md              # /plan
│   ├── review.md            # /review
│   ├── memory.md            # /memory     (read/write persistent markdown memory)
│   ├── challenge.md         # /challenge  (interrogate a plan — no solutions)
│   ├── grill.md             # /grill      (requirements interview via ask_user)
│   ├── diagnose.md          # /diagnose   (feedback-loop-first bug discipline)
│   └── handoff.md           # /handoff    (session → repo-root HANDOFF.md)
├── extensions/
│   ├── mlx-local.ts         # OMLX provider, auto-activates when server up (loaded)
│   ├── compact-cap.ts       # flat ~165k compaction safety-net, mid-run capable (/compact-cap command)
│   └── prime-reminder.ts    # post-compaction reminder + manual-compact auto-resume
└── DESIGN.md                # this file
```
Resource dirs (`prompts`, `extensions`) are referenced by absolute path in `settings.json`. Symlinks (`settings.json`, the AGENTS variant, `agents/`) are installed by `./install.sh [--work]` at the repo root. Skills are auto-discovered from `~/.agents/skills` (shared) plus `config/pi/skills` (pi-only, via settings).

## Cost model (token billing)

Billed = (input + output + cached tokens) × per-model rate. Levers, in order of impact:
1. **Context size** — lean `AGENTS.md`, skills as descriptions-only until invoked, background offload.
2. **Model choice** — local MLX = $0; else cheapest model that's good enough.
3. **Thinking** — `high` is a deliberate quality spend; `Shift+Tab` down when a task doesn't need it.
4. **Compaction** — caps context growth automatically.

## Modes

Prompt-templates, **SOFT**: the agent keeps every tool; the template only instructs (matches the old "build + don't code" habit). One-shot expansion that persists via conversation context until you say "go".
- **`/plan [task]`** — investigate read-only, then an ordered plan with file/dependency rationale. No edits until "go".
- **`/review [diff|paths]`** — adversarial read-only review, severity-ranked, `file:line` + fixes. Defaults to `git diff`.
- **`/memory [query]`** — greps `~/.pi/agent/memory.md` for matching entries. Can also write directly. Zero standing cost — runs only when invoked.
- **`/challenge [plan]`** — adversarial interrogation BEFORE code: recursive why, one question at a time via `ask_user`, no solutions, stops when reasoning is sound.
- **`/grill [design]`** — relentless requirements interview, one `ask_user` question at a time with the recommended answer as first option; explores the codebase instead of asking when it can; ends with an approvable spec.
- **`/diagnose [bug]`** — feedback loop first, repro, 3-5 ranked falsifiable hypotheses (shown before testing), one-variable instrumentation, root-cause fix, regression test.
- **`/handoff [notes]`** — distills the session into `HANDOFF.md` at the repo root; shows the notes before writing.

## Rejected (against the lightweight / low-token goal)

Surveyed from a maximalist community pi build:
- **`pi-fork`, `pi-minimal-subagent`** — replaced by `pi-subagents` with `disableBuiltins: true` and controlled concurrency.
- **`pi-codemapper` / `cymbal`** — repo-maps are large token injections; codemapper is unmaintained per its own author.
- **`pi-observational-memory`** — adds an LLM call per compaction for weeks-long-session continuity not in this workflow.
- **`context-mode`** — MCP server on a no-MCP harness; degrades to ~60% instruction-only routing without hooks; overlaps RTK; Elastic License.
- **`pi-lean-ctx`** — MCP-based (Rust daemon), contradicts lean philosophy. RTK already handles output compression.

## Subagent architecture

Two agents defined in `agents/`, `pi-subagents` package with `disableBuiltins: true` — only our definitions load, not the 8 builtins.

- **scout** — always available. Read-only retrieval. gpt-5.4-mini (copilot at work, `openai-codex/gpt-5.4-mini` fallback at home), low thinking, tools: read/grep/find/ls/bash. Returns `context.md`. Prefer over direct reads for broad exploration, multi-file lookups, unfamiliar code. Deliberately non-Anthropic (injection-surface isolation).
- **worker** — scoped implementation. `github-copilot/claude-opus-4.8` → `openai-codex/gpt-5.5` (home) → `github-copilot/claude-sonnet-4.6` (floor if 4.8 is absent at work). Forks context. Tools: read/grep/find/ls/bash/edit/write. Carries a Verification block: no unverified "complete", list what wasn't verified, never invent metrics.

Model ladder: Qwen3 MLX (free, mechanical lookups only, when available) → gpt-5.4-mini (scout) → gpt-5.5 (home default) → opus-4.8 (worker at work / heavy reasoning).

The old `explore.ts` has been deleted — scout fully replaces it.

## Activation

`./install.sh` (personal) or `./install.sh --work` (work laptop, after `git pull`) — runs `build-agents.sh --check`, then links `settings.json`, the correct AGENTS variant, and `agents/` into `~/.pi/agent/`. Then `pi update --extensions` materializes npm packages. `auth.json` and `sessions/` are left untouched.

Two GENERATED variants, one source: home = persona + standards + ops; work = the same + `env.work.md` (`/opt/homebrew/`-only binaries policy, NotesVault). Work-machine facts may live only in `env.work.md`. Everything else — settings, prompts, extensions, skills — is shared verbatim.

### Opus 4.8 migration (2026-07-10)

The pre-migration Opus-4.6 config is preserved at git tag `pi-config-opus-4.6` (`git show pi-config-opus-4.6:config/pi/AGENTS.work.md`). The blind-test protocol comparing 4.6/4.8 on old/new prompts was deferred — the 4.8 config was adopted directly; if the register regresses, add ONE line naming the specific behavior to `agents-md/persona.md`, don't restore sections.

## Verification

- `python3 -c 'import json;json.load(open(...))'` — settings is valid JSON.
- `pi list` — 4 theme packages present.
- Confirm theme id from installed package JSON `name` fields; correct `settings.json "theme"` if needed.
- One cheap `pi -p` Haiku run confirms config + extension load without error.

### Live-fire round 2 (2026-07-23, 9-session fleet on cubik clones)

Mid-run compaction chain FULLY VERIFIED (S9, glm-5.2, 35k test cap): cap fires at
turn boundaries within ~2k of the mark, run aborts, compaction completes,
prime-reminder auto-resumes via deferred `pi.sendUserMessage`, model continues the
task from the summary — two consecutive cycles in one session, self-reported
"I resumed on my own". Control group (S2, pre-fix): identical firing WITHOUT a
delivered resume = the in-flight task silently dies ("No engine code was written
after compaction #1") — the resume is load-bearing, not cosmetic.

Pi 0.81.x sharp edges found this round (all upstream-reportable):
- **Uncaught throw in an extension timer kills the whole pi process** (fatal
  TypeError from setTimeout took down a session mid-fleet). Armor every deferred
  callback in extensions.
- **Events ctx lost `sendUserMessage` in 0.81.x** (existed on 0.80.10) — it now
  lives ONLY on the `pi` (ExtensionAPI) object. Calling the ctx variant throws
  "not a function"; inside an async handler that throw is silently swallowed,
  which masqueraded as "the send was eaten" for two days.
- **RPC `compact` command changed semantics in 0.81.x**: it no longer emits
  `session_compact` to extensions AND no longer aborts the in-flight run (the
  model kept working straight through it, unaware). Extension `ctx.compact()`
  retains 0.80.x semantics (aborts + emits). If the TUI /compact shares the new
  non-aborting path, pi upstream-fixed the original "manual compact kills the
  turn" complaint — verify in TUI once.
- **Context-prune with a quota-dead summarizer degrades to a silent no-op**:
  14/14 summarizer calls failed on a codex usage limit; the pruner queued
  forever, pruned nothing, lost nothing (fail-safe confirmed live) — but
  delivered zero value while appearing enabled. Its summarizer model is a
  single point of failure: absent provider (work) or exhausted quota (home).

### Live-fire verification (2026-07-21)

Five scripted 8-turn working sessions (RPC-driven, cubik Phase 1 on isolated clones,
full extension stack, hidden red-baseline tripwire, `/compact-cap 30k` mid-session)
across the opencode-go lineup. Verified end-to-end: compact-cap fires on
`agent_settled` and re-fires as context regrows; `/compact-cap` works as an
in-session command (RPC prompt path = same command registry as TUI); prime-reminder
injects its pointer exactly once on the first post-compaction turn and the `fromCap`
marker correctly suppresses auto-resume on the settle path (round 2 added the
turn_end path, where fromCap + INTERRUPTED triggers the resume instead); bridge-off subagents (scout, parallel
scouts, worker) round-trip cleanly; sessions exit on stdin EOF post-compaction.

Pi sharp edges found (upstream-reportable):
- **Compaction-window prompt drop**: a prompt submitted while a compaction is in
  flight is ACKed (`success: true`) then silently discarded — no run ever starts.
  Reproduced twice. This retro-explains the earlier "RPC wedge" finding (prompts
  after `compaction_end` work fine; the wedge was misdiagnosed drop-timing) and is
  why the resume is deferred at all (superseded: it is now 1.5s via
  pi.sendUserMessage — see round 2). Queued (`followUp`) prompts are immune. TUI exposure: typing during the compaction spinner may lose the message.
- **`ask_user` parks headless sessions forever** (select with no timeout): for
  print-mode/scripted runs add `--exclude-tools ask_user`, or answer via RPC
  `extension_ui_response`. In the TUI this is desirable behavior, not a bug.
- **`grok-4.5` unusable via opencode-go**: catalog maps it to `openai-responses`,
  which that provider does not implement ("no API implementation"). The four
  working opencode-go models are all `openai-completions`.
- **qwen3.7-max reports junk usage** (`input` ≈ single digits) — context-size
  telemetry (and anything keyed on it) is blind on that model.
- **pi-subagents 0.35.x watchdog blocks startup inside big repos** (found
  2026-07-23, work-machine hang): `registerMainWatchdog` synchronously computes
  a "repo change signature" at extension load — `git rev-parse --show-toplevel`
  from cwd (walks UP), `git status --untracked-files=all` on that repo, then
  recursively sha256-hashes every changed/untracked file. No timeout, main
  thread → SIGINT never serviced. Ungated: the watchdog's `enabled: false`
  default does not guard it (`reviewChangesOnly: true` is hardcoded in
  `register-main.ts`). Reproduced: 1.5GB untracked in a repo = 2.5s → 12.5-16s
  startup, scales linearly (work's tens of GB = "indefinite"). Also re-runs on
  every `session_start`/`before_agent_start`. Fix on affected machines: add the
  offending paths (or `*`) to the enclosing repo's `.git/info/exclude` —
  verified to restore baseline startup. Upstream-reportable.

Model discipline on the same hidden red baseline: glm-5.2 halted and asked
(textbook test-sandwich); kimi-k3 bridged fixtures→model in the test and left the
truth source pristine; deepseek-v4-flash, qwen's worker, and minimax-m3 rewrote
the language-agnostic fixture JSON to the TS `{grid}` shape (minimax at least
asked first). Hence the new standards line: fixtures are truth sources — bridge
or ask, never rewrite. Delegation adherence is probabilistic even on kimi (it
dispatched scout on one work repo, went direct on cubik after weighing the policy).

## Open / future

- Install the brew `rtk` binary on the work laptop to activate `pi-rtk-optimizer` (no-ops until then).
- Bedrock adoption (personal): export creds, add `amazon-bedrock/us.anthropic.claude-opus-4-6-v1` to `enabledModels`.
- Consider adding `context7` extension to scout agent's tools if library-docs queries become a common delegation pattern.
- Deterministic stale-tool-output pruning as a local extension (`context-prune-lite.ts`, OpenCode marker algorithm on the `context` event) — decided direction from the 2026-08-11 deep dive, not yet built.
- Tool guard (pi-landstrip vs @gotgenes/pi-permission-system) to mirror Claude Code's PreToolUse hook policy — evaluation pending.

## Rejected / deferred

- **pi-blackhole** — compaction layer replacement. Pi's built-in compaction is adequate. Adding a second memory layer conflicts with our markdown memory system. Revisit only if compaction erosion becomes a real pain point.
- **pi-lean-ctx** — tool output compression. Scout subagent already handles context isolation. 64MB binary + 79 MCP tools is heavyweight for marginal gain on Copilot credits (billed per interaction, not per token).
- **contact_supervisor / intercom bridge** — subagent-to-parent IPC. Original rejection cited Issue #335 (fixed upstream in pi-subagents 0.32.0), but the real finding (2026-07-20 audit): the supervisor tool went NATIVE in pi-subagents ~0.34.x and is injected into every child regardless of frontmatter allowlists whenever the bridge is active (default "always") — a child calling it can block 10 min against a parent that never polls (headless/fanout parents don't). Disabled via `subagent-config.json` `intercomBridge: off`. Worker reports ambiguity in its Issues section instead; that design was right for the wrong reason.
- **Automatic model escalation** — no extension supports cross-provider quality-based escalation. Model selection is manual (Ctrl+L). Scout defaults to gpt-5.4-mini, worker to sonnet.
