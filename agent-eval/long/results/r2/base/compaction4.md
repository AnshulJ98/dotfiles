## Goal
1. Deep evaluation of the user's pi coding-agent config (prose, philosophy, core instructions, harness), using web and community research. Done.
2. Produce a selectable, ID'd list of enhancements aimed at the highest-quality code at the lowest cost. The target blend is: Ousterhout-style code philosophy, a solution ladder, smart brevity, terse communication, depth over ceremony, decomplecting, and agent best practices in the harness. Done.
3. Execute every approved item except G1 in the repo at `/private/tmp/agent-eval-long/r2/base/repo`. The user signed off with "AutoApprove" minus G1. In progress.
4. Later user requests, in order:
   - "be very thorough & hypercritical. review every change you made against the items you proposed, find gaps or regressions, close them, then re-run both checks". **Not yet done.**
   - "take a step back. where do we stand: what changed, what's left, and anything you'd revert. terse". This was effectively answered inside the memory-quiz reply.
   - A from-memory quiz on six questions. Answered; see Critical Context.
5. The latest message says to resume the in-progress task after compaction, without ask_user. If input is genuinely needed, state it and stop.

## Constraints & Preferences
- **Execution rules for this task:**
  - Don't commit or push.
  - No workers (no `scout --rw`). Do the work in this session. Read-only scouts are fine.
  - When done, run `./config/pi/verify.sh` and `./config/pi/build-agents.sh --check` and report the results.
- **User's working style:**
  - Prefers short sessions: small bounded slices for implementation, one larger session for architecture and planning.
  - Has had no success with agentic loops or with subagents that write code. The read-only scout is OK.
  - Leans away from strict red-green TDD toward Ousterhout, and toward outcome-driven development over spec-driven.
- **The config's own rules:**
  - Measure prose changes rather than assert them.
  - Prefer a check in code to more prose.
  - Shrinking AGENTS.md is not a token lever: removing it raised output tokens 29%.
- If the user asks for a pause or a minimal reply, answer exactly as asked and take no action.
- After a compaction, resume the in-progress task. Do not use ask_user to resume.
- Mark anything unsure as unsure rather than guessing.
- `bash` output via codemode sometimes comes back `undefined` or empty. Workaround: redirect to a `/tmp` file and read it with `tools.read`.

## Progress
### Done
- [x] **Evaluation and proposal:** delivered 44 ID'd items. Everything approved except G1.
- [x] **Live config located:** `/Users/anshulj/Dev/dotfiles/config/pi`; `~/.pi/agent/*` symlinks to it. Do not edit there.
- [x] **Working repo surveyed:** HEAD `822eee5`, clean at start.
- [x] **Baseline node tests** (`node --test config/pi/tests/*.test.ts`, output in `/tmp/base-tests.txt`). Pre-existing failures, all in `scout-bin.test.ts`:
  - test 141: ENOENT on `herdr.log`;
  - test 142: `pane.sh` mode `-1 !== 384`;
  - test 140 also shows an ENOENT on `herdr.log`.
- [x] **Pre-edit snapshot:** generated files saved to `/tmp/before/{AGENTS.md,CLAUDE.md,AGENTS.work.md}`.
- [x] **I1 "before" arm:** output in `/tmp/i1/before/`, summary in `summary.txt`. Model `claude-opus-5-5`:

  | Probe | Words | Cost |
  |---|---|---|
  | impl-1 | 80 | $0.0803 |
  | premise-1 | 447 | $0.0862 |
  | premise-2 | 385 | $0.0815 |
  | review-1 | 468 | $0.0810 |
  | review-2 | 384 | $0.0778 |
  | review-3 | 464 | $0.0818 |

- [x] **Prose edits in `config/pi/agents-md/`:**
  - **`persona-core.md`** fully rewritten. Section order: Judgment → Done When → Scope and Stops → Replies (deduped, with an example) → Reporting. This covers C2, D3 and E3. "AutoApprove" lifts the stops.
  - **`persona-pi.md`** (D4, E1):
    - added "Read it yourself when the content itself is the subject…";
    - replaced the `--rw --spec -` and one-open-worker bullets with "- Scouts only read. Code is written in this session."
  - **`standards.md`** (A2, A4, B1, B2):
    - added pull complexity down, keep decisions apart from scheduling/retry/cache, a boolean/mode param is two functions (and pass-throughs are deleted), and define errors out of existence;
    - the bug-fix test is now red-first for bugs only;
    - expected values never come from the implementation.
  - **`ops.md`:** the task list now lives in the "outcome card or an existing `NOW.md`"; the AUTO.md exception is removed.
  - **`ladder.md`** rewritten (A1, A3):
    - opens with strategic planning vs tactical slice;
    - rungs: skip, reuse, stdlib/platform, installed dep, then "simplest code that works: fewest concepts, not fewest lines".
  - **`claude-delta.md`** (D2, F5):
    - removed "Teach concepts…";
    - "One custom agent, `scout`";
    - worker bullet replaced by "Subagents read; code is written by the main agent only. One writer at a time, never parallel writers.";
    - removed the 4-concurrent parallel rule.
- [x] **Prompts:**
  - **`plan.md`** rewritten (C1, C3, C5, A5): outcome card, sort input, planning mode, slice mode and the "go" flow.
    - Card fields: `outcome`, `done-when` 1–5, `interface`, `mechanism`, `out`, `files`.
    - Planning mode gives Now/Target/Between/Cards-or-Next, with two sketches for interface decisions.
    - Slice mode runs about 300 words: Card, Findings with the map skill, Approach, Plan, Risks.
    - "go" flow: base SHA, first check must fail, steps, checks, `~/.pi/agent/bin/slice-check <base> --files … --tests …`, report, then the merge question via `ask_user`.
    - All auto, dispatch and rework text removed.
  - **`diagnose.md`:** now ends in an outcome card for "go". The dispatch and files-allowed block is removed.
  - **`review.md`** (B3, B5):
    - the worker-digest text is replaced by running the card's done-when checks;
    - added a break-it pass (revert or invert per test; a still-green test is a High finding) plus optional Stryker/mutmut;
    - removed the worker-sensors ast-grep ratchet sentence.
  - **`memory.md`** (G2 prose): one bullet is at most about 200 characters.
  - **`spec-contract.md`** (C4): deleted from the working tree. It was briefly `git rm`'d, then unstaged with `git reset`, so status shows ` D`.
- [x] **B4 `slice-check` written:**
  - `config/pi/lib/slice-check.ts` exports `isTestFile`, `testWeakening`, `isAllowed` and `sliceFailures`.
  - `main` handles `--tests`, `--files`, tracked plus untracked changes, and output `SLICE-CHECK: PASS|FAIL`. Exit codes: 0 pass, 1 fail, 2 usage error.
  - `config/pi/bin/slice-check` is a bash wrapper, chmod +x, running `node --no-warnings`.
  - The module loads on node v26.13.1. It has **no tests yet**.
- [x] **Confirmed no-ops** (this repo differs from the live config):
  - C6: `handoff.md` is already short.
  - D1: there is no Recommendations block.
  - F3: there is no `scout --review`.
  - F6: there is no `health-footer.ts`.
  - G3: `PI_CACHE_RETENTION=long` is already set in `home/.zshrc`.
- [x] **Memory-quiz reply delivered.** It said plainly that the hypercritical review never ran and neither check has run since the edits.

### In Progress
- [ ] Remaining implementation, then the hypercritical review, then both checks.

### Blocked
- The "X findings" list, and which of them the user approved, were lost in compaction. Proceed with the other work and state this as needed.

## Key Decisions
All items are approved except G1, which is dropped. The Maybe items in the core set (B5, E2, F6, G3) are included per AutoApprove. Items marked No are not done.

| Group | Items |
|---|---|
| **A. Code philosophy** | A1 strategic vs tactical · A2 four Ousterhout design rules · A3 rung 5 "fewest concepts" · A4 decisions apart from scheduling, retries and caching · A5 two sketches · A6 No |
| **B. Testing** | B1 red-first only for bugs · B2 expected values never from the implementation · B3 break-it check in `/review` · B4 `slice-check` · B5 mutation testing, folded into `/review` · B6 No |
| **C. Outcome-driven workflow** | C1 outcome card · C2 done-when rule · C3 `/plan` planning and slice modes · C4 delete `spec-contract.md` · C5 "go" flow · C6 short `/handoff` (no-op) · C7 `/where` three rungs (optional, unclear) |
| **D. Communication and prose** | D1 (no-op) · D2 Teach-concepts contradiction · D3 dedupe Replies · D4 read it yourself · D5 fewer coined labels (optional) |
| **E. Always-loaded prompt** | E1 remove worker/auto prose · E2 move the review checklist from `ops.md` to `review.md`, gated by eval · E3 prompt order · E4 No |
| **F. Harness** | see below |
| **G. Memory** | G1 dropped · G2 ~200-char cap plus a `verify.sh` line-cap check · G3 already set |
| **H. Hygiene** | H1 split `DESIGN.md` into decisions plus `LOG.md` · H2 `claude-delta` fix (done via F5/D2; commit part is moot) · H3 prose checks in `verify.sh` |
| **I. Measurement** | I1 before/after eval, pass = no recall drop · I2 `slice` eval role to replace `orch` (optional) |

**F. Harness detail**
- **F1**: Retire auto mode. Removes:
  - `auto-run.ts`, `bin/auto-slice` and their tests, where present;
  - `config/git/bin/auto-guard`, plus the `pre-*` template stubs' guard lines, `templateDir` and `git-hooks-install`, as needed;
  - the `githooks/` guard lines, `config/husky/init.sh` and the `install.sh` lines;
  - `hooks.test.ts`;
  - the `orch` eval role;
  - the DESIGN rows.
- **F2**: Retire `--rw` workers. Covers:
  - the `--rw`/`--spec` handling in `bin/scout`;
  - `worker-sensors.ts` and its tests, and `worker-resume.test.ts`;
  - `worker.prompt.md`;
  - the relevant parts of `scout-bin.test.ts`;
  - `stream-watchdog.ts` worker parts;
  - the `map` skill text.
- **F3**: no-op.
- **F4**: `compact-cap.ts` notifies "`/handoff` and start fresh". Drop the auto-resume and AUTO.md line in `prime-reminder.ts`. Optionally lower the cap from 210k to about 120k.
- **F5**: done.
- **F6**: no-op.
- **F7**: No.

**Open question:** E3 placed "Done When" second, after Judgment, while C2 asked for it "at the top". Decide during the review.

## Next Steps
1. **F1 retire auto.** Touch:
   - `config/git/bin/auto-guard` and the `config/git/template/hooks/pre-{commit,merge-commit,push}` guard lines;
   - `githooks/*` (keep the `build-agents.sh --check` call in `pre-commit`);
   - `config/husky/init.sh`, `install.sh` (~97–104, 163), `home/.gitconfig` `templateDir` if it becomes unneeded;
   - `config/git/tests/hooks.test.ts`;
   - the auto-mode tests and files, if present;
   - `agent-eval` `orch` → optional I2 `slice` role.
2. **F2 retire `--rw`.** Touch:
   - `bin/scout` (`--rw`, `--spec`);
   - delete `extensions/worker-sensors.ts`, `tests/worker-sensors.test.ts`, `tests/worker-resume.test.ts`, `bin/worker.prompt.md`;
   - trim `scout-bin.test.ts`, `scout-ext`, `stream-watchdog.ts`;
   - the skills `agents/skills/{d2-diagrams,map}`, `claude/skills/{migrate,parallel}`.
3. **F4:** `compact-cap.ts` and `prime-reminder.ts`. Remove the AUTO.md reminder line and the auto-resume.
4. **Grep for stale references:** `spec-contract`, `dispatch`, `files-allowed`, `AUTO.md`, `--rw`, `worker`. Cover `prompts/{grill,challenge,where}.md`, `DESIGN.md` and `docs/`.
5. **Tests for `slice-check`:** `config/pi/tests/slice-check.test.ts`, covering `isAllowed`, `testWeakening`, `sliceFailures` and an end-to-end temp git repo.
6. **E2:** move the review checklist from `ops.md` to `review.md`, measured with I1.
7. **H1:** split `DESIGN.md` → `LOG.md`.
8. **H3 checks in `verify.sh`:**
   - agents named in `claude-delta` exist;
   - the memory line cap holds;
   - no `AUTO.md` or `--rw` mentions.
9. **Regenerate** with `config/pi/build-agents.sh`, then diff against `/tmp/before/`.
10. **Hypercritical review:** check each changed item against its proposal for gaps and regressions, then close them.
11. **Run the checks:**
    - `node --test 'config/pi/tests/*.test.ts'` (expect only the pre-existing `scout-bin` herdr failures, unless those tests are removed);
    - `./config/pi/verify.sh`;
    - `./config/pi/build-agents.sh --check`.
12. **I1 after arm:** `bash /tmp/i1/run-arm.sh after config/pi/AGENTS.md`, then compare to `/tmp/i1/before/summary.txt`.
13. **Report tersely:** what changed, what's left, what I'd revert, and the check results. Note the "X findings" were lost in compaction.

## Critical Context
**Working repo**
- Path: `/private/tmp/agent-eval-long/r2/base/repo`. Pi config is in `config/pi/`:
  - fragments in `agents-md/`, prompts in `prompts/`;
  - `bin/` holds `scout`, `scout.prompt.md`, `worker.prompt.md`, `session-audit`, `guard/git` and the new `slice-check`;
  - `extensions/`, `tests/`, and `lib/` (`compact-cap-state.ts`, `watchdog.ts`, new `slice-check.ts`).
- **Current `git status --short`:**
  - ` M` in agents-md: `claude-delta.md`, `ladder.md`, `ops.md`, `persona-core.md`, `persona-pi.md`, `standards.md`;
  - ` M` in prompts: `diagnose.md`, `plan.md`, `review.md`, plus `memory.md` (edited after that listing);
  - ` D` `config/pi/prompts/spec-contract.md`;
  - untracked: `config/pi/lib/slice-check.ts`, `config/pi/bin/slice-check`.
- **Generated files:** `AGENTS.md`, `CLAUDE.md` and `AGENTS.work.md` are built by `build-agents.sh` and committed. `--check` exits 1 on drift, which is expected now until a rebuild. `githooks/pre-commit` runs `--check`.
- **Git hooks**
  - `config/git/bin/{auto-guard,git-hooks-install,worktree-setup}`.
  - `config/git/template/hooks`: `post-checkout` and `post-merge` call `worktree-setup`; the `pre-*` hooks call `auto-guard`. Stubs carry a `# dotfiles-hook` marker.
  - `home/.gitconfig` sets `init.templateDir = ~/.config/git/template`.
  - `install.sh` sets `core.hooksPath githooks`.
  - Refusal message: `auto-guard: AUTO.md is present (an auto run is in progress); <hook> refused`.
- **`prime-reminder.ts`** has the REMINDER line "If the repo root has an AUTO.md, re-read it before anything else." and a RESUME message. It imports `capFiring` from `lib/compact-cap-state.ts`.
- **`slice-check` notes**
  - `**` globs don't match dotfiles (`node:path` `matchesGlob`).
  - It uses `import.meta.main`.
  - The `TEST_CASE` regex counts `it/test/describe(`, `assert`, `expect(` and `def test_`.
- **I1 harness**
  - `/tmp/i1/run-arm.sh <arm> <agents-file>` runs `pi -p --no-session --mode json -xt ask_user -nc --append-system-prompt <file>`.
  - Probes: 3 review, 2 premise, 1 impl, with a 600s timeout. Output goes to `/tmp/i1/<arm>/`.
- **Measurements**
  - `worker-sensors.ts` is 808 lines. The auto/worker/health machinery totals about 2,505 lines.
  - 11 of 38 eval tasks are `orch`.
  - `memory.md` data: 349 bullets, median 331 chars.
- **Memory-quiz answers given**
  - The user's working style, as listed above (sourced from the summary; unsure whether all of it was in the first message).
  - The item list; G1 dropped.
  - The "X findings" are unknown, lost in compaction.
  - Checks not run.
- **Default model:** `claude-opus-5-5`, with medium thinking and codemode `"only"`.

<read-files>
/Users/anshulj/Dev/dotfiles/config/pi/DESIGN.md
/tmp/i1/before/summary.txt
config/git/tests/hooks.test.ts
config/pi/bin/scout
config/pi/extensions/compact-cap.ts
config/pi/extensions/prime-reminder.ts
config/pi/extensions/worker-sensors.ts
config/pi/prompts/diagnose.md
config/pi/prompts/handoff.md
config/pi/prompts/memory.md
config/pi/prompts/plan.md
config/pi/prompts/review.md
config/pi/tests/scout-bin.test.ts
config/pi/tests/worker-sensors.test.ts
</read-files>

<modified-files>
/tmp/i1/run-arm.sh
config/pi/agents-md/persona-core.md
config/pi/agents-md/persona-pi.md
config/pi/agents-md/standards.md
config/pi/agents-md/ops.md
config/pi/agents-md/ladder.md
config/pi/agents-md/claude-delta.md
config/pi/prompts/plan.md
config/pi/prompts/diagnose.md
config/pi/prompts/review.md
config/pi/prompts/memory.md
config/pi/prompts/spec-contract.md (deleted)
config/pi/lib/slice-check.ts (new)
config/pi/bin/slice-check (new)
</modified-files>

---

**Turn Context (split turn):**

## Original Request
After a compaction, the user asked the assistant to rebuild the task before acting. The steps were: state the target, list what is left, name the next action, and flag anything waiting on a user decision. Anything lost in the compaction should be marked "lost in compaction" rather than guessed. The assistant was to write `left:` and `next:` lines before its first tool call. Standing rules still apply: lead with the answer, keep changes inside the request, take the first option in Before Writing Code that holds, and delegate per the dispatch rule.

The assistant's opening lines after compaction:
- **left:** F1, F2, F4, H1, H3, E2, tests for `slice-check`, rebuilding the generated files, the hypercritical review, the I1 "after" run, `verify.sh`, and `build-agents.sh --check`.
- **lost in compaction:** the "X findings" list.

## Progress So Far

**Working tree and staging**
- Modified so far:
  - `config/pi/agents-md/` fragments: claude-delta, ladder, ops, persona-core, persona-pi, standards.
  - Prompts: diagnose, memory, plan, review.
- New: `config/pi/bin/slice-check` and `config/pi/lib/slice-check.ts`.
- Deleted: `config/pi/prompts/spec-contract.md`.
- Some of these changes were staged, which they should not have been. The assistant ran `git reset -q`, so nothing is staged now.
- `persona-core.md` has a `## Done When` section at line 16.

**F1 (done): removed the auto-guard / AUTO.md git-hook mechanism**
- Deleted:
  - `config/git/bin/auto-guard`
  - `config/git/template/hooks/pre-commit`, `pre-merge-commit` and `pre-push`
  - `config/husky/init.sh` and the `config/husky/` directory
  - `githooks/pre-merge-commit` and `githooks/pre-push`
- Rewrote `githooks/pre-commit` so it only runs `exec config/pi/build-agents.sh --check`.
- `install.sh`: removed the husky and auto-guard links. It now links only `config/git/template` and describes those stubs as worktree-setup stubs.
- `git-hooks-install`: comments and messages no longer mention auto-guard or husky. The skip message is now `skipped: core.hooksPath=$hp`.
- `verify.sh`: removed the check for auto-guard on PATH and the husky init.sh check. Replaced the `# dotfiles-hook` loop over githooks with a check that `githooks/pre-commit` runs `build-agents.sh --check`.
- Rewrote `config/git/tests/hooks.test.ts`. The stubs are now only `post-checkout` and `post-merge`, the worktree-setup line is tested, and git-hooks-install is tested.
- `node --test 'config/git/tests/*.test.ts'` passes 40/40.

**F4 (done): reworked compaction handling**
- `compact-cap.ts`:
  - New header comment.
  - Adds a `HANDOFF_AT = 120_000` notice ("run /handoff and start a fresh session"), shown once per crossing and reset on `session_compact`.
  - The cap compaction now runs only on `agent_settled`. The `turn_end` path and the `capFiring` signalling are gone.
  - The command tail (`/compact-cap`) is unchanged.
- `lib/compact-cap-state.ts` now holds only `publishThreshold` and `capThreshold`.
- `prime-reminder.ts`:
  - It is now only a one-shot reminder after compaction, with the text "lead with the answer, state the done-when check, keep every change inside the request, take the first option in Before Writing Code that holds, and delegate per the dispatch rule".
  - The auto-resume behaviour and the AUTO.md mention were removed.
- `context-bar.test.ts` passes.

**F2 (in progress): mapping the `--rw`/worker code in `config/pi/bin/scout`**
- No edits made yet.
- `bin/scout` is 508 lines. Its `--rw` / `--spec -` worker mode involves:
  - `worker.prompt.md`
  - `extensions/worker-sensors.ts`
  - the `PI_WORKER_SPEC` and `PI_WORKER_REPORT` environment variables
  - `verdict.json`
  - `WORKER_MODEL`
  - the higher thinking level and timeout under `--rw`
  - `PI_SCOUT_MODE=read|rw`, used by `bin/guard/git`
  - a limit of one open worker per repo
  - a `$KIND` label, used at lines 428 and 497
- Other files that mention worker or `--rw`:
  - `tests/scout-bin.test.ts` (30 hits)
  - `tests/worker-resume.test.ts` (8)
  - `tests/worker-sensors.test.ts` (14)
  - `extensions/stream-watchdog.ts` (2)
  - `extensions/worker-sensors.ts` (24)
  - `bin/guard/git` has 0 hits for those patterns, but its header describes the rw mode.

## Context Needed to Continue
- **Still to do:** finish F2, then H1, H3, E2, slice-check tests, the I1 "after" run and the hypercritical review.
- **Generated files need a rebuild.** Run `config/pi/build-agents.sh` to regenerate `AGENTS.md`, `AGENTS.work.md` and `CLAUDE.md`. These still contain the AUTO.md lines at about lines 256 and 262. After rebuilding, run `config/pi/verify.sh` and `build-agents.sh --check`.
- **Stale references to fix:**
  - `config/pi/DESIGN.md` still describes the "Auto-run git hooks" row and the "git hooks gated on AUTO.md" revision note.
  - `home/.gitconfig` line 2 still has a hooks comment that may need checking.
- **Docs not yet checked:** the grep for references excluded `docs/`, so `docs/` was not reviewed.
- **Lost in compaction:** the details of F2, H1, H3, E2 and I1. The original definitions of these IDs are not in the conversation shown here.

<read-files>
/Users/anshulj/Dev/dotfiles/config/pi/DESIGN.md
/tmp/f1.txt
/tmp/frag.txt
/tmp/inv.txt
/tmp/inv2.txt
/tmp/inv3.txt
/tmp/p1.txt
/tmp/p2.txt
/tmp/p3.txt
/tmp/prompts.txt
/tmp/refs.txt
/tmp/rw.txt
/tmp/sc.txt
/tmp/st.txt
config/git/tests/worktree.test.ts
config/pi/bin/scout
config/pi/extensions/worker-sensors.ts
config/pi/prompts/handoff.md
config/pi/tests/scout-bin.test.ts
config/pi/tests/worker-sensors.test.ts
</read-files>

<modified-files>
/tmp/i1/run-arm.sh
config/git/bin/git-hooks-install
config/git/tests/hooks.test.ts
config/pi/agents-md/claude-delta.md
config/pi/agents-md/ladder.md
config/pi/agents-md/ops.md
config/pi/agents-md/persona-core.md
config/pi/agents-md/persona-pi.md
config/pi/agents-md/standards.md
config/pi/bin/slice-check
config/pi/extensions/compact-cap.ts
config/pi/extensions/prime-reminder.ts
config/pi/lib/compact-cap-state.ts
config/pi/lib/slice-check.ts
config/pi/prompts/diagnose.md
config/pi/prompts/memory.md
config/pi/prompts/plan.md
config/pi/prompts/review.md
config/pi/verify.sh
githooks/pre-commit
install.sh
</modified-files>