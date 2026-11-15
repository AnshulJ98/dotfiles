## Goal
1. Deep evaluation of the user's pi coding-agent config (prose, philosophy, core instructions, harness), using web and community research. Done.
2. Produce a selectable, ID'd list of enhancements aimed at the highest-quality code at the lowest cost. The target blend is: Ousterhout-style code philosophy, a solution ladder, smart brevity, terse communication, depth over ceremony, decomplecting, and agent best practices in the harness. Done; awaiting user sign-off.
3. After sign-off, execute only the selected items. Not started.

## Constraints & Preferences
- Execution was explicitly not requested yet. The user will give a final sign-off by ID before selective execution.
- The user prefers short sessions:
  - small bounded slices for implementation;
  - one larger session for architecture and planning.
- Has had no success with agentic loops or with subagents that write code. The scout (read-only) is OK.
- Leaning away from strict red-green TDD toward Ousterhout. Leaning toward outcome-driven development over spec-driven.
- The config's own rules:
  - Measure prose changes rather than assert them.
  - Prefer a check in code to more prose.
  - Shrinking AGENTS.md is not a token lever: removing it raised output tokens 29%.
- The user sometimes asks for a brief pause with a minimal reply (for example "ready"). Answer exactly as asked and take no action.

## Progress
### Done
- [x] Located the live config at `/Users/anshulj/Dev/dotfiles/config/pi`.
  - `~/.pi/agent/AGENTS.md` symlinks to it.
  - The cwd `/private/tmp/agent-eval-long/r2/base/repo` is an older copy, lacking the Recommendations section, auto run and `--web`.
- [x] The live repo has uncommitted edits to `persona-core.md`, `persona-pi.md`, `plan.md`, `spec-contract.md` and `where.md`.
- [x] Read the fragments: `agents-md/{persona-core,persona-pi,standards,ops,ladder,claude-delta,env.work}.md`. AGENTS.md is 275 lines / 2033 words.
- [x] Read `DESIGN.md` (8k words), `NEXT.md`, the prompts (`plan`, `where`, `spec-contract`, `review`, `grill`, `learn`, etc.), and `bin/*.prompt.md`.
- [x] Ran two web scouts (outputs in `/tmp/webscout.out` and `/tmp/webscout2.out`, snippets only).
- [x] Delivered the evaluation: strengths, problems by severity, TDD vs Ousterhout, outcome-driven development, loops/subagents.
- [x] Delivered 44 ID'd items (A–I). 27 are Yes; the core set adds 4 Maybe items (B5, E2, F6, G3).
- [x] The user requested a short pause; the assistant replied "ready". There has been no sign-off yet.

### In Progress
- [ ] Waiting for the user's next step: sign-off by ID and answers to the decision questions.

### Blocked
- Execution is blocked on that sign-off.

## Key Decisions
All items below are proposed and pending sign-off.

**A. Code philosophy**
- **A1**: Planning session = strategic (design it twice); slice session = tactical. Two lines at the top of `ladder.md`.
- **A2**: Four rules added to the Design section of `standards.md`:
  - pull complexity down;
  - split flag/mode params;
  - delete pass-through functions;
  - define errors out of existence.
- **A3**: Ladder rung 5 becomes "Write the simplest code that works: fewest concepts, not fewest lines."
- **A4**: Keep what is decided apart from when/how it runs (no scheduling, retries or caching in business logic).
- **A5**: `plan.md:48` changes to always two sketches for interface changes. Depends on A1.
- **A6 (No)**: comments-first.

**B. Testing**
- **B1**: Red-first only for bugs. Fix `spec-contract.md:49` and `claude-delta.md:23` ("TDD enforced").
- **B2**: Expected values never come from the implementation.
- **B3**: Break-it check in `/review` pass 2.
- **B4**: `slice-check <base>` script plus optional pre-commit. It checks:
  - tests rerun green;
  - test/assert count is not lower;
  - no new skip/only;
  - diff stays within the declared files.

  Logic is lifted from `worker-sensors.ts` and `lib/bash-changes.ts`.
- **B5 (Maybe)**: Opt-in mutation testing (Stryker / mutmut).
- **B6 (No)**: TDD-guard hook.

**C. Outcome-driven workflow**
- **C1**: The outcome card becomes the unit of work, replacing the `/plan` Goal block and `spec-contract.md`. Fields:
  - `outcome:`
  - `done-when:` (1–5 runnable checks, the first red today)
  - `interface:`
  - `mechanism:`
  - `out:`
- **C2**: Done-when rule at the top of `persona-core.md`: "Before acting, state the check that shows it's done. Done means you ran it and showed the output."
- **C3**: Rewrite `/plan` into planning and slice modes. Remove the auto section (~860 words), dispatch and rework.
- **C4**: Delete `spec-contract.md`.
- **C5**: `/plan` "go" flow: checks red → work → green → `slice-check` → report.
- **C6**: Short `/handoff` by default; `/handoff full` keeps the 12 sections.
- **C7 (Maybe)**: `/where` cut to three rungs (target, slice, this).

**D. Communication and prose**
- **D1**: Recommendations block (`persona-core.md:15`) cut to two lines.
- **D2**: Fix the `claude-delta` "Teach concepts" vs "explain why only when asked" contradiction.
- **D3**: Remove duplicate rules in Replies (about 15% fewer words).
- **D4**: Scout exception when the content itself is the subject.
- **D5 (Maybe)**: Fewer coined labels.

**E. Always-loaded prompt**
- **E1**: Remove `persona-pi.md:39-66`, `ops.md:43` and the `slice/`/`auto/` branch rules from the always-loaded prompt.
- **E2 (Maybe)**: Move the review checklist from `ops.md:13-35` to `review.md`, gated by an eval run.
- **E3**: Prompt order: Judgment, done-when, Scope first; ladder last.
- **E4 (No)**: Shrinking AGENTS.md for tokens.

**F. Harness**
- **F1**: Retire auto mode (~1,000 lines). Removes:
  - `auto-run.ts`, `bin/auto-slice` and their tests;
  - `config/git/bin/auto-guard`, the `init.templateDir` setting and the `git-hooks-install` line;
  - the husky / `githooks` calls;
  - the auto parts of `pi-health`;
  - the `orch` eval role;
  - the DESIGN rows.
- **F2**: Retire `--rw` workers after B4.
- **F3**: Keep `scout --review <base>` on demand.
- **F4**: At the cap, `compact-cap` notifies "`/handoff` and start fresh". No auto-resume: drop that part of `prime-reminder.ts`. Optionally lower the cap from 210k to about 120k.
- **F5**: Claude delta: remove the 4-concurrent rule; read-only subagents, one writer.
- **F6 (Maybe)**: Drop `health-footer.ts`.
- **F7 (No)**: Ralph loops, parallel writers, spec kits.

**G. Memory**
- **G1**: Clean `memory.md`. Move or delete the dotfiles and pi scopes.
- **G2**: ~200-char bullet cap in `/memory`, plus a `verify.sh` line-cap check.
- **G3 (Maybe)**: Cache TTL. Unverified whether pi exposes it.

**H. Hygiene**
- **H1**: Split `DESIGN.md` into decisions plus `LOG.md`.
- **H2**: Commit the uncommitted edits first; fix `claude-delta.md:23`.
- **H3**: Prose checks in `verify.sh`:
  - agents named in `claude-delta.md` exist;
  - the memory line cap holds;
  - no mention of `AUTO.md` or `--rw`.

**I. Measurement**
- **I1**: Before/after agent-eval gate.
  - Covers the `review`, `plan` and `scout` roles plus the cold-start probe.
  - Uses the same model both times.
  - Pass = no recall drop.
- **I2 (Maybe)**: A `slice` eval role to replace `orch`.

## Next Steps
1. Wait for the user's next message after the pause.
2. Get sign-off by ID: drops from the core set, and whether to add C7, D5 or I2.
3. Get answers to the open questions:
   - F4: notice only, or also lower the cap to about 120k?
   - G1: move the dotfiles/pi memory scopes into the repo, or delete them?
4. Execute in the proposed order:
   1. H2 → I1 before-run.
   2. Prose items: A1–A5, B1–B3, C2, D1–D4, E1, E3, F5.
   3. Workflow: C1, C3–C6 → B4 → F1, F2.
   4. F3, F4, G1, G2.
   5. H1, H3 → I1 after-run.
5. Validate with:
   - `./build-agents.sh --check`, which generates AGENTS.md, CLAUDE.md and AGENTS.work.md from the fragments; a pre-commit hook verifies they match;
   - `verify.sh`.

## Critical Context
**Repo**
- Location: `/Users/anshulj/Dev/dotfiles`.
- Pi config is in `config/pi/`:
  - fragments in `config/pi/agents-md/`;
  - prompts in `config/pi/prompts/`;
  - scout at `config/pi/bin/scout`.
- `~/.pi/agent/*` symlinks into the repo.
- Default model is `claude-opus-5-5`, with medium thinking and codemode `"only"`.

**Measurements**
- Machinery sizes:
  - `auto-run.ts` is 242 lines, `auto-slice` 259, `worker-sensors.ts` 808.
  - Auto/worker/health files plus their tests total about 2,505 lines.
  - `plan.md` is 1,892 words, of which ~857 are the auto section.
  - `where.md` is 816 words.
  - 11 of 38 agent-eval tasks are `orch`.
- `events.log` (2026-11-11 to 11-14) worker verdicts: 354 PASS, 90 CANNOT-RUN, 5 FAIL.
- `memory.md`:
  - 146,556 bytes and 349 bullets;
  - median bullet 331 chars, max 1691;
  - the dotfiles scope is 58 KB and the pi scope 37 KB.
- `NEXT.md`: idle cache rebuilds cost $166, compaction $102.
- DESIGN findings:
  - A rule stated twice in prose still failed 30% of the time; enforcing it in code made it 0/8.
  - The cold-start cut went from 12,548 to 10,545 tokens.
  - 93% of tool-call turns carry a single call.

**Key sources**
- Ousterhout: github.com/johnousterhout/aposd-vs-clean-code; Pragmatic Engineer 2025-04 ("tactical tornadoes").
- Beck on TDD with agents: Pragmatic Engineer 2025-06.
- Böckeler on SDD tools: martinfowler.com sdd-3-tools.
- Codex `/goal` cookbook.
- Cognition, "Don't build multi-agents".
- Anthropic multi-agent research system post.
- ETH context-file study: arXiv 2602.11988.
- Reddit: r/ClaudeCode 1q9vkvh, r/ClaudeAI 1rz2oo3, r/ClaudeCode 1r00136.

<read-files>
/Users/anshulj/Dev/dotfiles/config/pi/DESIGN.md
/tmp/p1.txt
/tmp/p2.txt
/tmp/p3.txt
</read-files>

---

**Turn Context (split turn):**

## Original Request
The user approved a previously proposed recommendations list ("AutoApprove") with one change: drop item G1, and implement every other recommendation in this repo. Constraints:
- Don't commit or push.
- No workers (no `scout --rw`). Do the work in this session. Read-only scouts are fine.
- When done, run `./config/pi/verify.sh` and `./config/pi/build-agents.sh --check` and report the results.

(The recommendation list itself came from an earlier turn and does not appear in this excerpt. Only G1 and I1 are referenced by ID here.)

## Progress So Far
- **Repo**
  - Working directory: `/private/tmp/agent-eval-long/r2/base/repo`.
  - HEAD is `822eee5 chore(herdr): drop Sheprd config, add Herdr app settings, keys and theme`, with a clean status.
- **Repo layout surveyed**
  - `agent-eval/` contains `run.sh`, `parse_probes.py`, `README.md`, `prompts/{impl,premise,review}.txt` and `fixtures/review-target.ts`.
  - Git hooks:
    - `githooks/{pre-commit,pre-merge-commit,pre-push}` call `auto-guard`. `pre-commit` also runs `config/pi/build-agents.sh --check`.
    - `config/git/{bin/{auto-guard,git-hooks-install,worktree-setup},template/hooks/*,tests/{hooks,worktree}.test.ts}`.
    - `home/.gitconfig` sets `templateDir = ~/.config/git/template`.
    - `install.sh` links these at about lines 97–104 and sets `core.hooksPath githooks` at line 163.
  - `claude/agents/scout.md` exists.
  - `config/pi/verify.sh` is 220 lines and has checks for worker files, `scout --rw`, auto-guard, and node tests.
- **Baseline node tests** (`node --test config/pi/tests/*.test.ts`, output saved to `/tmp/base-tests.txt`)
  - 2 tests fail, both in `scout-bin.test.ts`, and are pre-existing and environment-related:
    - Test 141 fails with an ENOENT on `herdr.log`.
    - Test 142 fails with `pane.sh` mode `-1 !== 384`.
  - Test 140 also showed an ENOENT on `herdr.log`.
- **Files referencing auto/worker/`--rw`** (listed so you know what may need edits):
  - Skills: `agents/skills/{d2-diagrams,map}/SKILL.md`, `claude/skills/{migrate,parallel}/SKILL.md`.
  - `config/husky/init.sh`.
  - `config/pi/agents-md/{claude-delta,ops,persona-pi}.md`.
  - `config/pi/{AGENTS.md,AGENTS.work.md,CLAUDE.md,DESIGN.md}`.
  - Extensions: `config/pi/extensions/{prime-reminder,stream-watchdog,worker-sensors}.ts`.
  - Prompts: `config/pi/prompts/{plan,review,spec-contract}.md`.
  - `config/pi/bin/scout` and the tests `scout-bin`, `scout-ext`, `worker-resume`, `worker-sensors`.
  - `docs/operating-proposal-2026-09-26.md`, `docs/pi-adjustments-plan.md`, `install.sh`.
- **I1 before/after gate**
  - Saved the generated files as they were before any edits: `/tmp/before/{AGENTS.md,CLAUDE.md,AGENTS.work.md}`.
  - Wrote `/tmp/i1/run-arm.sh <arm> <agents-file>`. It runs agent-eval probes with:
    - `pi -p --no-session --mode json -xt ask_user -nc --append-system-prompt <file>`.
    - 3 review probes, 2 premise probes and 1 impl probe, in parallel, with a 600s timeout each.
    - Output goes to `/tmp/i1/<arm>/`, with a summary from `parse_probes.py` in `summary.txt`.
  - Started the "before" arm as background job `bg1` (log `/tmp/pi-bg/25807-bg1.log`). It prints "before done" when finished.
- Started reading `config/pi/prompts/{plan,review,handoff,memory}.md` before editing. `plan.md` covers the go/dispatch/auto modes, the Now/Target/Between/Next view, the slice loop and a roughly 300-word plan format.

## Context Needed to Continue
- No implementation edits have been made yet.
- Remaining work:
  1. Implement the approved recommendations except G1.
  2. Regenerate the generated files via `config/pi/build-agents.sh`, since `AGENTS.md` and `CLAUDE.md` are built from `agents-md/` fragments.
  3. Run the I1 "after" arm with the new `AGENTS.md` and compare it against `/tmp/i1/before/summary.txt`.
  4. Run `./config/pi/verify.sh` and `./config/pi/build-agents.sh --check` and report the results.
- In the final report, the 2 `scout-bin` herdr test failures should be noted as pre-existing in the baseline.

<read-files>
/Users/anshulj/Dev/dotfiles/config/pi/DESIGN.md
/tmp/p1.txt
/tmp/p2.txt
/tmp/p3.txt
config/pi/prompts/handoff.md
config/pi/prompts/memory.md
config/pi/prompts/plan.md
config/pi/prompts/review.md
</read-files>

<modified-files>
/tmp/i1/run-arm.sh
</modified-files>