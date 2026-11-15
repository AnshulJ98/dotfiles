## Goal
1. Deep evaluation of the user's pi coding-agent config (prose, philosophy, core instructions, harness), using web and community research. Done.
2. Produce a selectable, ID'd list of enhancements aimed at the highest-quality code at the lowest cost. The target blend is: Ousterhout-style code philosophy, a solution ladder, smart brevity, terse communication, depth over ceremony, decomplecting, and agent best practices in the harness. Done.
3. Execute every approved item except G1 in the repo at `/private/tmp/agent-eval-long/r2/base/repo`. The user signed off with "AutoApprove" minus G1. In progress.
4. Later user requests, in order:
   - "be very thorough & hypercritical. review every change you made against the items you proposed, find gaps or regressions, close them, then re-run both checks". **Not yet done.**
   - "take a step back. where do we stand: what changed, what's left, and anything you'd revert. terse". Effectively answered inside the memory-quiz reply.
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
  - Leans away from strict red-green TDD, toward Ousterhout and outcome-driven development over spec-driven.
- **The config's own rules:**
  - Measure prose changes rather than assert them.
  - Prefer a check in code to more prose.
  - Shrinking AGENTS.md is not a token lever: removing it raised output tokens 29%.
- **Reply and resume rules:**
  - If the user asks for a pause or a minimal reply, answer exactly as asked and take no action.
  - After a compaction, resume the in-progress task without ask_user. First write `left:` and `next:` lines, and mark lost items "lost in compaction".
  - Mark anything unsure as unsure rather than guessing.
- **Tool quirk:** `bash` output via codemode sometimes comes back `undefined` or empty. Workaround: redirect to a `/tmp` file and read it with `tools.read`.

## Progress
### Done
- [x] **Evaluation and proposal:** delivered 44 ID'd items. Everything approved except G1.
- [x] **Live config located:** `/Users/anshulj/Dev/dotfiles/config/pi`; `~/.pi/agent/*` symlinks to it. Do not edit there.
- [x] **Working repo surveyed:** HEAD `822eee5`, clean at start.
- [x] **Baseline node tests:** `node --test config/pi/tests/*.test.ts` gave 293 pass / 9 fail (output in `/tmp/base-tests.txt`).
  - All 9 failures are herdr tests in `scout-bin.test.ts`: "inside herdr the child runs in a new herdr tab…", "a second workspace on the same repo does not steal the tab…", "when pane list fails…", "a worker dispatched into another worktree…", "a failed model run…", "pane.sh is 0600…", "SIGKILL of scout…", "pi gets -na unless…", "when herdr cannot open a tab…".
  - Error signatures seen: ENOENT on `herdr.log`, and `pane.sh` mode `-1 !== 384`.
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
  - **`persona-core.md`** rewritten (C2, D3, E3). Section order: Judgment → Done When (line 16) → Scope and Stops → Replies (deduped, with an example) → Reporting.
  - **`persona-pi.md`** (D4, E1): added "Read it yourself when the content itself is the subject…" and "- Scouts only read. Code is written in this session."
  - **`standards.md`** (A2, A4, B1, B2): the Ousterhout rules; red-first for bugs only; expected values never come from the implementation.
  - **`ops.md`:** the task list now lives in the "outcome card or an existing `NOW.md`"; the AUTO.md exception is removed.
  - **`ladder.md`** (A1, A3): opens with strategic vs tactical. Rungs: skip, reuse, stdlib/platform, installed dep, "simplest code that works: fewest concepts, not fewest lines".
  - **`claude-delta.md`** (D2, F5): "Teach concepts" removed; "One custom agent, `scout`"; "Subagents read; code is written by the main agent only. One writer at a time, never parallel writers."; the 4-concurrent rule removed.
- [x] **Prompts:**
  - **`plan.md`** (C1, C3, C5, A5):
    - outcome card with fields `outcome`, `done-when` 1–5, `interface`, `mechanism`, `out`, `files`;
    - planning mode and slice mode;
    - "go" flow: base SHA, first check must fail, … `~/.pi/agent/bin/slice-check <base> --files … --tests …`, report, then the merge question via `ask_user`.
  - **`diagnose.md`:** ends in an outcome card for "go".
  - **`review.md`** (B3, B5): done-when checks, a break-it pass, optional Stryker/mutmut.
  - **`memory.md`** (G2 prose): ~200-char bullets.
  - **`spec-contract.md`** deleted (C4); status shows ` D`.
- [x] **B4 `slice-check`:**
  - `config/pi/lib/slice-check.ts` exports `isTestFile`, `testWeakening`, `isAllowed`, `sliceFailures`.
  - `config/pi/bin/slice-check` is the bash wrapper.
  - **Tests now written:** `config/pi/tests/slice-check.test.ts`, 27 pass. Covers:
    - `isAllowed` cases ported from worker-sensors;
    - `isTestFile`;
    - `testWeakening`, including a pytest skip case;
    - `sliceFailures`;
    - end-to-end temp git repo: PASS case, FAIL case, and usage exit 2.
- [x] **Confirmed no-ops:** C6, D1, F3, F6, G3.
- [x] **Memory-quiz reply delivered.**
- [x] **F1 done (auto-guard / AUTO.md hooks removed):**
  - Deleted `config/git/bin/auto-guard`, the template `pre-{commit,merge-commit,push}` hooks, `config/husky/`, and `githooks/pre-{merge-commit,push}`.
  - `githooks/pre-commit` now only runs `exec config/pi/build-agents.sh --check`.
  - Updated `install.sh`, `git-hooks-install` and `verify.sh`.
  - Rewrote `config/git/tests/hooks.test.ts`; `node --test 'config/git/tests/*.test.ts'` passes 40/40.
- [x] **F4 done (compaction handling):**
  - `compact-cap.ts`: a `HANDOFF_AT = 120_000` /handoff notice; the cap compaction runs only on `agent_settled`.
  - `lib/compact-cap-state.ts` holds only `publishThreshold` and `capThreshold`.
  - `prime-reminder.ts` is now a one-shot reminder after compaction; auto-resume and AUTO.md are gone.
  - `context-bar.test.ts` passes.
- [x] **F2 core done (`--rw` workers retired):**
  - **`config/pi/bin/scout`** passes `bash -n`.
    - Removed `--rw`, `--spec -`, `WORKER_MODEL`, `MODEL_SET`, `RW`, `SENSORS`, the `WORKER=()` block, the open-worker check, `verdict.json` and the verdict writing in `conclude()`, plus the `WORKER-SENSORS` filtering.
    - Now hardcoded: `PI_SCOUT_MODE=read` and `KIND=scout`.
    - Header updated: "Scouts only read: the child has no edit or write tool."
  - **Deleted:** `bin/worker.prompt.md`, `extensions/worker-sensors.ts`, `tests/worker-sensors.test.ts`, `tests/worker-resume.test.ts`.
  - **`stream-watchdog.ts`:** removed the `process.env.PI_WORKER_SPEC` condition from the 10-minute rule.
  - **`scout-bin.test.ts`** pruned:
    - removed `SPEC`, the `verdict` fake, `report()`, `cpSync`, and the spec/worker tests;
    - added "usage errors, including the retired --rw and --spec, exit 2 before the fan-out cap";
    - the 143 test now runs a scout; the stall test asserts stderr `scout: model stream stalled`;
    - the worktree test is renamed; the SIGKILL test uses a read `runningMeta` plus "look around".
  - **Test result:** `scout-bin` + `scout-ext` + `watchdog` gave 51 pass / 9 fail. The 9 failures are the same herdr tests as the baseline, so they are pre-existing.

### In Progress
- [ ] **F2 leftovers / stale-reference cleanup.** The grep output is in `/tmp/left.txt` (197 lines, mostly `archive/` and `vscode` noise). Still to fix:
  - `config/pi/verify.sh` lines 104, 105 and 107: checks that `worker.prompt.md` exists, that `worker-sensors.ts` exists, and "scout --rw refuses a run without a brief". Remove these, or replace them with H3 checks.
  - **Skills:**
    - `claude/skills/migrate/SKILL.md` describes "Spawns parallel worker Tasks", with parallel coder Tasks capped at 4 concurrent. This contradicts the one-writer rule.
    - `claude/skills/parallel/SKILL.md` describes parallel subagent dispatch, which also contradicts the rule.
    - `agents/skills/map/SKILL.md` was being read from offset 60.
    - `agents/skills/d2-diagrams/SKILL.md` still needs a check.
  - **Other files:**
    - `bin/guard/git`: its header describes rw mode.
    - `DESIGN.md`: the auto and worker rows.
    - `docs/`: unchecked.
    - `home/.gitconfig` line 2: a hooks comment.
  - **Probably leave:**
    - `agent-eval/README.md:133` "auto/harness-cuts", which is historical.
    - Mentions of the "dispatch rule" in `persona-pi`, `claude-delta`, `prime-reminder` and `build-agents.sh`. That is scout dispatch, which is fine.

### Blocked
- The "X findings" list, and which of them the user approved, were lost in compaction. State this in the report.

## Key Decisions
All items are approved except G1, which is dropped. The Maybe items B5, E2, F6 and G3 are included. Items marked No are not done.

| Group | Items |
|---|---|
| **A. Code philosophy** | A1 strategic vs tactical · A2 four Ousterhout design rules · A3 rung 5 "fewest concepts" · A4 decisions apart from scheduling, retries and caching · A5 two sketches · A6 No |
| **B. Testing** | B1 red-first only for bugs · B2 expected values never from the implementation · B3 break-it check in `/review` · B4 `slice-check` · B5 mutation testing in `/review` · B6 No |
| **C. Outcome-driven workflow** | C1 outcome card · C2 done-when rule · C3 `/plan` modes · C4 delete `spec-contract.md` · C5 "go" flow · C6 no-op · C7 `/where` three rungs (optional, unclear) |
| **D. Communication and prose** | D1 no-op · D2 Teach-concepts fix · D3 dedupe Replies · D4 read it yourself · D5 fewer coined labels (optional) |
| **E. Always-loaded prompt** | E1 remove worker/auto prose · E2 move the review checklist from `ops.md` to `review.md`, gated by eval · E3 prompt order · E4 No |
| **F. Harness** | F1 retire auto (done) · F2 retire `--rw` (mostly done) · F3 no-op · F4 compact-cap handoff (done) · F5 done · F6 no-op · F7 No |
| **G. Memory** | G1 dropped · G2 ~200-char cap plus a `verify.sh` line-cap check · G3 already set |
| **H. Hygiene** | H1 split `DESIGN.md` into decisions plus `LOG.md` · H2 done via F5/D2 · H3 prose checks in `verify.sh` |
| **I. Measurement** | I1 before/after eval, pass = no recall drop · I2 `slice` eval role to replace `orch` (optional) |

- **Retired flags exit 2:** `--rw` and `--spec` are now unknown options and exit 2. A test asserts this.
- **Open question:** E3 put "Done When" second, while C2 said "at the top". Decide during the review.

## Next Steps
1. **Finish F2 cleanup:**
   - `verify.sh` lines 104–107;
   - the skills: `migrate` and `parallel` become sequential or single-writer, then check `map` and `d2-diagrams`;
   - the `bin/guard/git` header;
   - `DESIGN.md` rows, `docs/`, and `home/.gitconfig`.
2. **Optional I2:** replace the `orch` eval role with `slice`.
3. **E2:** move the review checklist from `ops.md` to `review.md`, measured with I1.
4. **H1:** split `DESIGN.md` → `LOG.md`.
5. **H3 checks in `verify.sh`:** agents named in `claude-delta` exist, the memory line cap holds, and there are no `AUTO.md` or `--rw` mentions.
6. **Rebuild** with `config/pi/build-agents.sh`, then diff against `/tmp/before/`. The generated files still contain the AUTO.md lines at about 256 and 262.
7. **Hypercritical review** of every item against its proposal; close the gaps.
8. **Run the checks:**
   - `node --test 'config/pi/tests/*.test.ts'` (expect only the 9 herdr failures);
   - `node --test 'config/git/tests/*.test.ts'`;
   - `./config/pi/verify.sh`;
   - `./config/pi/build-agents.sh --check`.
9. **I1 after arm:** `bash /tmp/i1/run-arm.sh after config/pi/AGENTS.md`, then compare to `/tmp/i1/before/summary.txt`.
10. **Report tersely:** changed, left, would-revert, check results, and the note that the "X findings" were lost in compaction.

## Critical Context
- **Working repo:** `/private/tmp/agent-eval-long/r2/base/repo`. Pi config is in `config/pi/`:
  - fragments in `agents-md/`, prompts in `prompts/`;
  - `bin/` holds `scout`, `scout.prompt.md`, `session-audit`, `guard/git`, `slice-check`;
  - `extensions/`, `tests/`, and `lib/` (`compact-cap-state.ts`, `watchdog.ts`, `slice-check.ts`).
- **Nothing is staged.** Don't commit. Earlier staging was undone with `git reset -q`.
- **Generated files:** `AGENTS.md`, `CLAUDE.md` and `AGENTS.work.md` come from `build-agents.sh` and are committed. `--check` exits 1 on drift until a rebuild. `githooks/pre-commit` runs `--check`.
- **Remaining git hook template stubs:** `post-checkout` and `post-merge`, which call `worktree-setup`. `home/.gitconfig` still sets `init.templateDir`.
- **`slice-check` notes:**
  - `**` globs don't match dotfiles (`matchesGlob`).
  - It uses `import.meta.main`.
  - The `TEST_CASE` regex counts `it/test/describe(`, `assert`, `expect(` and `def test_`.
  - Failure messages look like `"<path> is outside --files"`, `"<path>: test cases or assertions dropped from 2 to 1"` and `tests exited N`.
- **`scout-bin.test.ts`** still uses `gitCommonDir` (line 128) and `runningMeta` (mode type is now `"read"` only).
- **I1 harness:** `/tmp/i1/run-arm.sh <arm> <agents-file>` runs `pi -p --no-session --mode json -xt ask_user -nc --append-system-prompt <file>`. There are 6 probes with a 600s timeout.
- **Measurements:**
  - `worker-sensors.ts` was 808 lines; the auto/worker machinery was about 2,505 lines.
  - 11 of 38 eval tasks are `orch`.
  - `memory.md` has 349 bullets with a median of 331 chars.
- **Default model:** `claude-opus-5-5`, with medium thinking and codemode `"only"`.

<read-files>
/Users/anshulj/Dev/dotfiles/config/pi/DESIGN.md
/tmp/i1/before/summary.txt
/tmp/base-tests.txt
/tmp/left.txt
/tmp/sb.txt
config/git/tests/hooks.test.ts
config/pi/bin/scout
config/pi/extensions/compact-cap.ts
config/pi/extensions/prime-reminder.ts
config/pi/prompts/diagnose.md
config/pi/prompts/handoff.md
config/pi/prompts/memory.md
config/pi/prompts/plan.md
config/pi/prompts/review.md
config/pi/tests/scout-bin.test.ts
claude/skills/migrate/SKILL.md
agents/skills/map/SKILL.md
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
config/pi/bin/scout
config/pi/bin/slice-check (new)
config/pi/bin/worker.prompt.md (deleted)
config/pi/extensions/compact-cap.ts
config/pi/extensions/prime-reminder.ts
config/pi/extensions/stream-watchdog.ts
config/pi/extensions/worker-sensors.ts (deleted)
config/pi/lib/compact-cap-state.ts
config/pi/lib/slice-check.ts (new)
config/pi/prompts/diagnose.md
config/pi/prompts/memory.md
config/pi/prompts/plan.md
config/pi/prompts/review.md
config/pi/prompts/spec-contract.md (deleted)
config/pi/tests/scout-bin.test.ts
config/pi/tests/slice-check.test.ts (new)
config/pi/tests/worker-sensors.test.ts (deleted)
config/pi/tests/worker-resume.test.ts (deleted)
config/pi/verify.sh
config/git/bin/auto-guard (deleted)
config/git/template/hooks/pre-{commit,merge-commit,push} (deleted)
config/husky/ (deleted)
githooks/pre-commit
githooks/pre-{merge-commit,push} (deleted)
install.sh
</modified-files>

---

**Turn Context (split turn):**

## Original Request
The only user message here is a post-compaction instruction. It asks the assistant to rebuild the task before acting:
- **target:** the outcome the user asked for. The user's latest message wins over the summary.
- **left:** what is still open. Any "done" must be checked against the files or git before relying on it.
- **next:** the one action to take now.
- **waiting:** anything that needs the user's decision.

If a goal, check or decision was lost, the assistant must say "lost in compaction" rather than guess. Before the first tool call it must write two lines, `left:` and `next:`. Standing rules: lead with the answer, keep every change inside the request, take the first option in "Before Writing Code" that holds, and delegate per the dispatch rule.

The underlying task wording is not in these messages. The work shown matches the LOG.md entry the assistant wrote: an "Outcome-driven rework" that retires auto runs and `--rw` workers. Scouts only read, and code is written in the main session. The assistant also mentioned a "hypercritical review" and an I1 before/after eval gate.

## Progress So Far
Git status shows the earlier work of the rework already in place:
- **Deleted:**
  - `config/git/bin/auto-guard`
  - the git template hooks `pre-commit`, `pre-merge-commit` and `pre-push`
  - `config/husky/init.sh`
  - `config/pi/bin/worker.prompt.md`
  - `extensions/worker-sensors.ts`
  - `prompts/spec-contract.md`
  - the worker tests
  - `githooks/pre-merge-commit` and `githooks/pre-push`
- **New:**
  - `config/pi/LOG.md`
  - `bin/slice-check`
  - `lib/slice-check.ts`
  - `tests/slice-check.test.ts`
- **Modified:** many `agents-md` fragments, prompts, `scout`, `compact-cap`, `prime-reminder`, `stream-watchdog`, `install.sh` and others.

Changes made in these messages:
- **`verify.sh`:**
  - Removed the `worker.prompt.md` and `worker-sensors.ts` checks.
  - Renamed the `--rw` check to "scout refuses the retired --rw".
  - Added a check that `bin/slice-check` is executable.
  - Added a `[prose]` section with three checks:
    - every `claude/agents/*.md` is named in `claude-delta.md`, and the reverse
    - no retired terms (`AUTO.md`, `--rw`, `--spec`, `spec-contract`, `files-allowed`, `WORKER-SENSORS`) appear in `agents-md/` or `prompts/`
    - memory.md bullets over 220 chars are reported as a note, not a failure
  - Fixed an awk escaping bug in that memory check.
  - Changed the tests comment to "# --- the node tests ---".
- **`bin/guard/git`:** comments now say read mode is the only mode, and the sensors reference is dropped.
- **`agents/skills/map/SKILL.md`:** worker and sensor references replaced.
- **`DESIGN.md`:**
  - Header now says current decisions only, with history in `LOG.md`.
  - Rows rewritten: Compaction (120k `/handoff` notice, ~210k cap between runs), Compaction UX (no auto-resume), Scout (no `--rw`), Jobs ("three owners"), Stream stalls, Scout git guard.
  - Moved out to LOG.md: the "Auto-run git hooks" row, the Worker mode paragraph and the "Opus 4.8 migration" section.
  - File tree updated: `slice-check`, `lib/slice-check.ts` and `LOG.md` added; worker and `spec-contract` lines removed; `compact-cap` and `prime-reminder` descriptions updated.
- **`LOG.md` created:** a rework entry, the old row, the old Worker mode section and the Opus 4.8 migration.
- **`claude/skills/migrate/SKILL.md`:** rewritten to edit in the main agent in batches, with no Task or coder subagents.
- **`claude/skills/parallel`:** deleted. No references remain.
- **`persona-core.md`:** "Before acting" changed to "Before changing anything, state the check…".
- **`build-agents.sh`:** rerun, succeeded. A grep for worker or auto terms in prompts, agents-md, `scout.prompt.md` and extensions came back clean.

## Context Needed to Continue
- **verify.sh result:** 60 passed, 5 failed.
  - Four of the failures are symlink checks. They fail because HOME is `/tmp/agent-eval-long/r2/base/home`, an eval sandbox, while the links actually resolve to `/Users/anshulj/Dev/dotfiles`. This is an environment artifact.
  - The fifth failure is "node tests pass".
  - `[types]` was skipped because tsc was not found.
- **Node tests:** 209 pass, 9 fail. Every failure is a herdr/scout tab or pane test, such as "inside herdr the child runs in a new herdr tab…" and "pi gets -na unless the cwd is under a trusted path". The cause has not been investigated yet. `config/git/tests` pass 40/40.
- **I1 eval:**
  - Harness: `/tmp/i1/run-arm.sh <arm> <agents-file>`, which uses `/private/tmp/agent-eval-long/r2/base/repo/agent-eval` with probes impl, premise and review.
  - Baseline arm is `/tmp/i1/before`, with `summary.txt` containing words and cost per run, all on claude-opus-5-5.
  - Background job bg1 (log `/tmp/pi-bg/77603-bg1.log`, wakes on "e2 done") runs two arms:
    - `after`: `/tmp/i1/AGENTS.after.md`, the current AGENTS.md at 12381 bytes.
    - `e2`: `/tmp/i1/AGENTS.e2.md`, which is AGENTS.md with the "## Reviews" section removed, at 11401 bytes.
  - The `before` file is 12082 bytes.
  - Results not yet received.
  - The review rubric (13 categories) is in `agent-eval/README.md`.
- **Hypercritical review:** started. The fragment diff is saved at `/tmp/d-frag.txt` and git status at `/tmp/st2.txt`.
- **Pending pointer:** `claude/skills/pre-pr-review/SKILL.md` still dispatches `challenger` subagents. Those are reviewers, not writers, and no decision on them is shown.
- **slice-check usage:** `slice-check <base> [--tests '<cmd>'] [--files '<glob>,<glob>']`. It exits 1 on fail and 2 on a usage error. `/plan`'s "go" flow calls it at step 4.

<read-files>
/Users/anshulj/Dev/dotfiles/config/pi/DESIGN.md
/tmp/d-frag.txt
/tmp/f1.txt
/tmp/frag.txt
/tmp/inv.txt
/tmp/inv2.txt
/tmp/inv3.txt
/tmp/left.txt
/tmp/p1.txt
/tmp/p2.txt
/tmp/p3.txt
/tmp/prompts.txt
/tmp/refs.txt
/tmp/rw.txt
/tmp/sc.txt
/tmp/st.txt
/tmp/st2.txt
config/git/tests/worktree.test.ts
config/pi/AGENTS.md
config/pi/bin/scout
config/pi/extensions/worker-sensors.ts
config/pi/prompts/handoff.md
config/pi/tests/scout-bin.test.ts
config/pi/tests/worker-sensors.test.ts
</read-files>

<modified-files>
/tmp/i1/run-arm.sh
agents/skills/map/SKILL.md
claude/skills/migrate/SKILL.md
config/git/bin/git-hooks-install
config/git/tests/hooks.test.ts
config/pi/DESIGN.md
config/pi/LOG.md
config/pi/agents-md/claude-delta.md
config/pi/agents-md/ladder.md
config/pi/agents-md/ops.md
config/pi/agents-md/persona-core.md
config/pi/agents-md/persona-pi.md
config/pi/agents-md/standards.md
config/pi/bin/guard/git
config/pi/bin/slice-check
config/pi/extensions/compact-cap.ts
config/pi/extensions/prime-reminder.ts
config/pi/extensions/stream-watchdog.ts
config/pi/lib/compact-cap-state.ts
config/pi/lib/slice-check.ts
config/pi/prompts/diagnose.md
config/pi/prompts/memory.md
config/pi/prompts/plan.md
config/pi/prompts/review.md
config/pi/tests/slice-check.test.ts
config/pi/verify.sh
githooks/pre-commit
install.sh
</modified-files>