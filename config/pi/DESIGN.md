# pi-coding-agent — lightweight harness config

_Built 2026-06-05, last revised 2026-09-16 (scout: `pi-subagents` replaced by `bin/scout` child-process wrapper, 8,277 resident tokens reclaimed; audit: dead subagent fleet repointed at Anthropic, decisions discipline promoted, headless-close enforced in code, skills roster cut to 5, `verify.sh` added as the acceptance signal; two stale 2026-07 live-fire logs deleted). Previously revised 2026-08-26 (testing rewritten to acceptance-signal-first; worker demoted to explicit dispatch). Targets: personal machine (anthropic direct, `claude-fable-5-1` daily driver) and work laptop (local MLX; **GitHub Copilot is dead here** — see Cost model)._

## Goal

A lightweight, fast, visually-pleasing pi config that delivers high-quality output on low token usage. Single agent, mode-switching, manual escalation. No standing multi-agent fan-out (that was the old OpenCode setup's cost sink).

The original driver was GitHub Copilot's move to token billing on 2026-06-01. That provider no longer functions here (2026-09-16: pi drives Copilot through the Responses API and this account is not entitled to any model on it), so the constraint is now Anthropic-direct spend. The conclusion is unchanged, with one correction measured on 2026-09-16: **shrinking `AGENTS.md` is not a cost lever.** Removing it raised output tokens 29% (8,316 versus 5,903 on the premise probe) because the model compensates with longer, less disciplined replies. Cut the prompt for correctness, never for tokens.

## Decisions (what + why)

| Area | Decision | Why |
|------|----------|-----|
| Agent model | Single steerable agent + soft modes. One opt-in scout as a child `pi` process behind `bin/scout` (see Scout). | Token billing punishes context carried every turn; a child process isolates it at zero resident cost. `pi-subagents` cost 8,277 resident tokens per turn for no measured quality gain and was removed 2026-09-16. |
| Model config | AUTHORITATIVE in `settings.json` (default provider/model/thinking, enabledModels) and `bin/scout` (`MODEL=` for the scout child). This document does not track model choices. | Model churn outpaced this file twice (2026-07, 2026-08); a stale table is worse than none. Core pi has no fallback chain for the main session (verified 0.84.3) — on provider quota exhaustion, switch models manually via `/model` or `--model`. |
| Thinking | Default `high`; `Shift+Tab` cycles; editor border color = live HUD. | Reliable, visible level control. Spend tokens on reasoning, save them on context. |
| Compaction | Mario defaults, `keepRecentTokens` trimmed 20k→16k. Plus `extensions/compact-cap.ts`: a flat ~165k ceiling — fires at `turn_end` (mid-run, at turn boundaries) and `agent_settled` (between-run growth). Session command `/compact-cap [on|off|<n>k]`, 30k floor (below compaction's own output it thrashes). | Native trigger is per-model (`contextWindow - reserveTokens`) — useless on 1M-window models. Mid-run firing stops the 20-50k balloon past the cap that settle-only firing allowed; prime-reminder auto-resumes the aborted run (fleet-verified 2026-07-23: two consecutive cap→compact→resume cycles in one session, work continuing each time). |
| Modes | `/plan`, `/review`, `/memory`, `/challenge`, `/grill`, `/diagnose`, `/handoff` (prompt-templates, SOFT). | Reusable behavioral steers; no tool-gating. `/ask` redundant with default; `/spec` redundant with `mission`/`to-prd`. challenge/grill/diagnose are pi-native adaptations of the OpenCode challenger agent + Pocock grill-me/diagnose skills. |
| Questions | `pi-ask-user` (npm) — model-invocable `ask_user` selection UI. | One structured clarifying question beats a wrong implementation loop. `/grill` and `/challenge` route questions through it explicitly (models won't pick a UI tool unprompted). |
| RTK | `pi-rtk-optimizer` (npm), out-of-box config. | Compacts noisy tool output (test/build/git/lint/grep) before it enters context. Risky read-compaction ships off. No-ops where the brew `rtk` binary is absent (`guardWhenRtkMissing`), so one shared config works on both machines. Coverage gap (measured 2026-07-20): `fetch`/`read` dumps aren't in its pattern set — a fat session was 73% tool results led by fetch+bash; that gap is context-prune's job. |
| Context pruning | REMOVED 2026-07-26 (trial ended). | Live-fire found the failure mode decisive: with a quota-dead or absent summarizer it degrades to a silent no-op while appearing enabled (14/14 failed summarizer calls, zero pruned). Lifetime spend across 33 sessions was $3.38 — the risk of a silently dead cost-optimization outweighed the marginal saving. RTK plus compact-cap remain the context controls. Upstream issue unfiled by anyone as of removal. |
| Compaction UX | `extensions/prime-reminder.ts`. Any compaction that aborts a RUNNING task — manual /compact mid-task (0.80.x semantics), or compact-cap's turn_end path (signaled via `Symbol.for` handshake keys) — gets one auto-resume: `pi.sendUserMessage(RESUME)` deferred 1500ms past the compaction's agent-disconnect window, try/catch-armored. Every compaction arms a one-shot pointer to the Prime Directives injected on the next turn (fail-open). | The send MUST be `pi.sendUserMessage` — 0.81.x events ctx lacks the method (calling `ctx.sendUserMessage` throws) — and MUST be armored: an uncaught throw in an extension timer kills the pi process. Resume text forbids interactive asks (headless ask_user park). |
| Web access | `pi-web-access` (npm, swapped in 2026-08-11 for `pi-fetch`) — `web_search` + `fetch_content` (URL→markdown, PDF, GitHub-clone, video); `npm:@upstash/context7-pi` for live docs (`resolve-library-id` + `query-docs`). | pi-fetch died by adoption (17 weekly downloads, no release since 2026-04); pi-web-access is the ecosystem standard (75k weekly, MIT, active). The old "no web search" stance is REVERSED: live experience on Claude Code showed search is a real gap, not noise. Zero-config search (keyless Exa; reuses openai-codex auth for OpenAI search at home; work falls back keyless), optional keys in `~/.pi/web-search.json`, SSRF guards built in (localhost/private IPs blocked). Smoke-verified headless on install day. |
| Skills | Auto-loaded from `~/.agents/skills` (5, shared with Claude Code): `decisions`, `testing-patterns`, `git-patterns`, `d2-diagrams`, `pdf-images`. All model-invocable. | Pruned 2026-07-05 (27 -> 10) and again 2026-09-16 (8 -> 5): deleted `context7` (superseded by the `@upstash/context7-pi` package), `security-review` (duplicates `discipline.md` gate 3), and `caveman` (its always-on clause referenced an `AGENTS.md` section that no longer existed). **Correction:** pi has no skill-listing budget — no `skillListingBudgetFraction` or `maxSkillDescriptionChars` equivalent exists in 0.85.1's schema, so "progressive disclosure" does not bound the roster. Every description is resident every turn. Keep the list short by hand. |
| Persona | AGENTS files GENERATED from `agents-md/` fragments (persona + standards + ops shared; env.work overlay; ladder last) via `build-agents.sh`. Persona rewritten 2026-07-10 for Opus-4.8-era models. Restructured 2026-07-20 for salience: delegation contracts front-loaded in the persona fragments (persona-core.md shared with Claude Code + persona-pi.md pi-only; trigger catalog cut 2026-07-21 — auto-dispatch is probabilistic, contracts + explicit dispatch are not); standards compressed 163→108 lines (catalog → principles); Solution Ladder + Prime Directives digest moved to `ladder.md`, concatenated LAST in both variants. | Lost-in-the-Middle U-curve: content at prompt extremes gets used, the middle decays — the ladder sat at 65% depth, squarely in the trough. Primacy for identity + dispatch, recency for the ladder + digest. Edit fragments, never outputs — `--check` fails on drift. |
| Themes | Three vendored packs in `themes/`, switch in `/settings`. Default `bearded-hc-midnightvoid`. | The five upstream theme packages were dropped; the JSON is trivial and vendoring removes five package installs from cold start. `install.sh` links the whole `themes/` directory, not one file. |
| Scout | `bin/scout` wrapper spawning a minimal child `pi` (`-ne -nc -ns -np -t read,grep,find,ls,bash`, sonnet-5 low, 300 s timeout, nesting refused via `PI_SCOUT_DEPTH`). Worker agent dropped; `--rw` covers bounded-spec implementation on explicit request. | Zero resident tool schema in the parent; ~3.5k-token child; 3–4 KB digest returned. Measured against `pi-subagents` (8,277 resident, no quality difference) and the bundled example tool (687 resident, 72–79 KB returned per call). See Scout. |
| MLX | Auto-activating provider (`extensions/mlx-local.ts`, loaded). OMLX at `localhost:11434/v1`, Bearer auth via `$OMLX_API_KEY`. | Registers nothing when the server is down or the key is absent — safe to keep enabled everywhere. Env is frozen at pi launch; restart (not `/reload`) after exporting the key. |
| Bedrock | Built into pi (`amazon-bedrock` provider, Converse API, auto cache points). Export `AWS_BEARER_TOKEN_BEDROCK` (or `AWS_PROFILE`) + `AWS_REGION`; add `amazon-bedrock/us.anthropic.claude-*` ids to `enabledModels` when adopting. | Frontier escalation without Copilot's proxy limits. Mind: 5-min cache TTL, thinking-`high` cost on opus, 1M-window sessions never auto-compact — keep Bedrock sessions short. |
| Tracking | Files in `~/Dev/dotfiles/config/pi/`, symlinked into `~/.pi/agent/`. Pi itself installs npm-global (nvm), NOT brew — the brew formula lags releases (was pinned 0.80.6 when npm had 0.80.10); update via `pi update`, don't reintroduce brew. | Mirrors the OpenCode dotfiles pattern; version-controlled. |

## File layout

```
~/Dev/dotfiles/config/pi/
├── settings.json            # → symlinked to ~/.pi/agent/settings.json (both machines)
├── agents-md/               # SOURCE fragments — edit these, never the outputs
│   ├── persona-core.md      # register + judgment + scope (shared: @-imported by claude/CLAUDE.md)
│   ├── persona-pi.md        # pi-only: Tools + scout Delegation rule (decide before the first tool call)
│   ├── standards.md         # coding standards, compressed 2026-07-20 (principles > catalogs)
│   ├── ops.md               # shared operating rules (memory, AutoApprove, PDF/binary)
│   ├── env.work.md          # work-only machine facts (homebrew paths, NotesVault)
│   └── ladder.md            # Solution Ladder + Prime Directives — concatenated LAST (recency)
├── build-agents.sh          # concat fragments → AGENTS files; --check fails on drift
├── AGENTS.md                # GENERATED: persona+standards+ops → ~/.pi/agent/AGENTS.md on PERSONAL
├── AGENTS.work.md           # GENERATED: same + env.work.md → ~/.pi/agent/AGENTS.md on WORK
├── bin/                     # → symlinked to ~/.pi/agent/bin (both machines)
│   ├── scout                # child-pi scout wrapper (see Scout)
│   └── scout.prompt.md      # its system prompt (replaces pi's base prompt in the child)
├── prompts/
│   ├── plan.md              # /plan
│   ├── review.md            # /review
│   ├── memory.md            # /memory     (read/write persistent markdown memory)
│   ├── challenge.md         # /challenge  (interrogate a plan — no solutions)
│   ├── grill.md             # /grill      (requirements interview via ask_user)
│   ├── diagnose.md          # /diagnose   (feedback-loop-first bug discipline)
│   ├── handoff.md           # /handoff    (session → repo-root HANDOFF.md)
│   └── spec-contract.md     # brainstorm → implementation-spec compressor (paste target)
├── extensions/
│   ├── mlx-local.ts         # OMLX provider, auto-activates when server up (loaded)
│   ├── compact-cap.ts       # flat ~165k compaction safety-net, mid-run capable (/compact-cap command)
│   ├── prime-reminder.ts    # post-compaction reminder + manual-compact auto-resume
│   ├── headless-close.ts    # -p runs may not end on a question (enforced, not asked)
│   └── headless-close.test.ts  # 11 table tests: node --test headless-close.test.ts
└── DESIGN.md                # this file
```
Resource dirs (`prompts`, `extensions`) are referenced by absolute path in `settings.json`; each extension is listed individually in `extensions`, so a new file needs a settings entry and no `install.sh` change. Symlinks (`settings.json`, the AGENTS variant, `agents/`, `themes/`) are installed by `./install.sh [--work]` at the repo root. Skills are auto-discovered from `~/.agents/skills` only — the `config/pi/skills` directory referenced here until 2026-09-16 never existed.

## Cost model (token billing)

Billed = (input + output + cached tokens) × per-model rate. Levers, in order of impact:
1. **Context size** — lean `AGENTS.md`, skills as descriptions-only until invoked, background offload.
2. **Model choice** — local MLX = $0; else cheapest model that's good enough.
3. **Thinking** — the default is `low`; `Shift+Tab` up for work that earns it. Effort is model-dependent and not monotonic: on the review fixture, `opus-4-6` is flat across high/xhigh/max while `opus-5` and `opus-4-8` only reach 12/12 at `max`.
4. **Compaction** — caps context growth automatically.

Not a lever: the size of `AGENTS.md` (see Goal). Measured 2026-09-16, deleting it *raised* output tokens 29%.

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

## Scout (child-process delegation)

`pi-subagents` was removed on 2026-09-16 after measuring what it cost to keep: 8,277 resident tokens of tool schema on every parent turn, 33% of the 24,972-token resident prompt and 2.4x the whole of `AGENTS.md`. Head-to-head on two verifiable scouting tasks (10 runs, same model, same prompt) showed no quality difference against a plain child process, at 2.2–2.6x lower cost per call. The archive branch `archive/pi-subagents-config` holds the last configuration that used it.

What replaced it is `bin/scout`, a ~90-line bash wrapper linked to `~/.pi/agent/bin/scout` and invoked through the existing `bash` tool, so it costs zero resident tokens. It spawns:

```
PI_SCOUT_DEPTH=1 timeout 300 pi -p -ne [-e <oauth shim if present>] -nc -ns -np \
  -t read,grep,find,ls,bash --session-dir $TMPDIR/pi-scout \
  --model anthropic/claude-sonnet-5 --thinking low --system-prompt bin/scout.prompt.md "task"
```

Measured child cost: ~3.5k resident tokens (`-t` allowlist, no base prompt, no AGENTS.md, no extensions). Flags: `--brief FILE` injects context via `@FILE`; `--fork` copies `$PI_SESSION_FILE` first (the original is never appended to) and re-bills the whole parent context, so it is opt-in only; `--ctx` keeps AGENTS.md discovery; `--rw` adds edit/write for bounded-spec implementation and nothing else. Exit 2 on nesting (`PI_SCOUT_DEPTH` already set) or usage error, 124 on timeout. The bash tool has no default timeout, so the wrapper's own `timeout` is what stops a hung child from hanging the parent.

Why each flag is there is recorded in `~/Dev/pi-scout-plan-2026-09-16.md` (18 gaps, each with the evidence). The ones that bit: `-e <dir>` silently loads nothing (use `index.ts`); `--no-extensions` drops the OAuth compatibility shim, which is loaded back explicitly when installed; `grep/find/ls` are opt-in builtins that only `-t` enables; Anthropic's OAuth pool rate-limits above two concurrent agents, so the delegation rule caps parallel at two.

**Dispatch is the fragile half, and it is prose.** With the old rule ("dispatch before a third file read... a narrow grep: do it yourself") the parent dispatched 0/12 times on a genuine multi-file trace; every thinking trace said "dispatch is right, but I'll do a quick grep first" and momentum finished the job, pulling 25–42 KB into context. The clause was the on-ramp. The current rule in `persona-pi.md` ("decide before the first tool call; a scoping grep is the first read") went 4/4 with the scout as the first call and 6–17 KB into the parent, at +25–30 s latency. Explicit "use the scout" dispatch was 4/4 under both rules. Re-run this probe (`/tmp/spike/run6.sh` shape: headless parent, `-nc --append-system-prompt <AGENTS variant>`, unfamiliar-package trace prompt) whenever the Delegation fragment changes.

The bundled `examples/extensions/subagent` was measured as the alternative (687 resident tokens, typed single/parallel/chain) and rejected: it returns the child's whole streamed transcript as the tool result, 72–79 KB per dispatch against the wrapper's 3–4 KB, and its child inherits the full ~25k prompt.

Injection-surface isolation (scout on a non-Anthropic model so untrusted content cannot steer the parent's model family) remains abandoned: every non-Anthropic slot was verified dead on 2026-09-16 (`opencode-go` 429 monthly limit, `openai-codex` account-unsupported or usage-limited, `github-copilot` `model_not_supported`). `--model` on the wrapper is the repoint when one comes back.

pi has no main-session model fallback; nothing in 0.85.1's settings schema provides it. On provider exhaustion, switch manually via `/model` or `--model`.

## Activation

`./install.sh` (personal) or `./install.sh --work` (work laptop, after `git pull`) — runs `build-agents.sh --check`, then links `settings.json`, the correct AGENTS variant, and `agents/` into `~/.pi/agent/`. Then `pi update --extensions` materializes npm packages. `auth.json` and `sessions/` are left untouched.

Two GENERATED variants, one source: home = persona + standards + ops; work = the same + `env.work.md` (`/opt/homebrew/`-only binaries policy, NotesVault). Work-machine facts may live only in `env.work.md`. Everything else — settings, prompts, extensions, skills — is shared verbatim.

### Opus 4.8 migration (2026-07-10)

The pre-migration Opus-4.6 config is preserved at git tag `pi-config-opus-4.6` (`git show pi-config-opus-4.6:config/pi/AGENTS.work.md`). The blind-test protocol comparing 4.6/4.8 on old/new prompts was deferred — the 4.8 config was adopted directly; if the register regresses, add ONE line naming the specific behavior to `agents-md/persona.md`, don't restore sections.

## Verification

`./config/pi/verify.sh` is the acceptance signal. It asserts what this document claims, so a stale claim fails a check instead of quietly misleading. Sections: `[build]` (fragments match generated outputs), `[models]` (no enabled model is one we have proven cannot run), `[scout]` (wrapper executable, prompt present, link resolves, refuses to nest, model enabled, no legacy roster), `[paths]` (no broken symlinks, every referenced path exists), `[skills]`, `[install]` (`install.sh` links what the layout above describes), `[packages]`, `[hygiene]`. Exit non-zero on any failure; `-v` lists passes too.

It went 33 passed / 7 failed before the 2026-09-16 audit, 33 / 0 after, and 39 / 0 after the scout replacement. Add a check when you add a claim.

Behavioural changes are measured, not asserted. The harness lives in `agent-eval/` (probes + `parse_probes.py`); the 2026-09-15/16 audit ran 128 arm-isolated runs plus a 24-run before/after on the real config. Two cautions learned there: arm isolation needs both `HOME` and `PI_CODING_AGENT_DIR` (skills come from the former), and `~/.agents/skills` is a symlink into this repo, so `cp -R` copies the link and lets a patched arm write through into the real config. Use `cp -RL`.

### What measurement actually showed (2026-09-16)

- **Prompt size is not a cost lever.** Deleting `AGENTS.md` cost 3 review-rubric categories, failed the headless-close rule 83% of the time, and raised output tokens 29%.
- **Wording changes are mostly noise.** Review recall did not move between the full prompt and four trimmed variants (9.11 vs 9.56 of 12, n=9 per arm, p=0.378). Rubric categories 8 (falsy cache-hit) and 11 (`node-fetch` vs native) were missed by every arm in all 25 review runs — model blind spots, not prompt defects. Do not rewrite fragments hoping to fix those.
- **Structure prompts work; the effect is compliance, not judgment.** Promoting the `decisions` skill moved Goal-Options-Plan structure from 2.83 to 6.50 of 7 (p=0.0022, perfect separation). But the *pick never changed* in any run, and the scorer rewarded a template this repo prescribed. Treat it as "the reasoning is now visible", not "the reasoning is now better".
- **A rule stated twice in prose still failed 30% of the time.** Enforcement in code took it to 0 of 8. Prefer a check to another sentence.
- **Effects are model-specific.** The headless-close violation this config now enforces against never occurred on `claude-fable-5-1` or `opus-5` — only on `sonnet-5`. The extension is insurance for delegated and older-model runs.

## Open / future

- Install the brew `rtk` binary on the work laptop to activate `pi-rtk-optimizer` (no-ops until then).
- Bedrock adoption (personal): export creds, add `amazon-bedrock/us.anthropic.claude-opus-4-6-v1` to `enabledModels`.
- Re-probe the `decisions` promotion on a non-obvious decision. Every run so far picked pg-boss, so weighted criteria have never been shown to change an outcome — only to make the reasoning legible.
- Repoint scout (`bin/scout` `MODEL=`) to a non-Anthropic provider if one becomes usable, restoring injection-surface isolation (see Scout).
- Measure the three long-standing extensions. `mlx-local`, `compact-cap` and `prime-reminder` were disabled in every A/B arm and have never been measured against a control; `headless-close` and `compact-cap` both hook `turn_end` and their interaction is untested.
- Deterministic stale-tool-output pruning as a local extension (`context-prune-lite.ts`, OpenCode marker algorithm on the `context` event) — decided direction from the 2026-08-11 deep dive, not yet built.
- Tool guard (pi-landstrip vs @gotgenes/pi-permission-system) to mirror Claude Code's PreToolUse hook policy — evaluation pending.

## Rejected / deferred

- **pi-blackhole** — compaction layer replacement. Pi's built-in compaction is adequate. Adding a second memory layer conflicts with our markdown memory system. Revisit only if compaction erosion becomes a real pain point.
- **pi-lean-ctx** — tool output compression. The scout child already handles context isolation. 64MB binary + 79 MCP tools is heavyweight for marginal gain on Copilot credits (billed per interaction, not per token).
- **contact_supervisor / intercom bridge** — subagent-to-parent IPC. Original rejection cited Issue #335 (fixed upstream in pi-subagents 0.32.0), but the real finding (2026-07-20 audit): the supervisor tool went NATIVE in pi-subagents ~0.34.x and is injected into every child regardless of frontmatter allowlists whenever the bridge is active (default "always") — a child calling it can block 10 min against a parent that never polls (headless/fanout parents don't). Disabled via `intercomBridge: off` while the package was installed; moot since its removal on 2026-09-16.
- **Automatic model escalation** — no extension supports cross-provider quality-based escalation. Model selection is manual (Ctrl+L). The scout model lives in `bin/scout`; this document does not track it.
- **`github-copilot` as a provider** — removed 2026-09-16. pi drives Copilot through the Responses API; `gpt-4.1` returns `unsupported_api_for_model` and every other id returns `model_not_supported`, while the OAuth token stays valid and `availableModelIds` lists them all. An entitlement mismatch, not an expiry, and nothing in this repo can work around it. `pi-copilot-web` and `pi-copilot-auto` were uninstalled with it.
- **Trimming `AGENTS.md` for tokens** — tested and rejected; it costs quality and *increases* output tokens (see Verification).
- **`pi-lens`** — evaluated 2026-09-15 over 4 runs; no measurable effect on any probe. Not worth an always-on package.
