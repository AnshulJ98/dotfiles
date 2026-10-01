# Pi adjustments plan (rev. 2026-09-30 b)

Stand-in repo: `~/Dev/vscodext` (TS 6.0.3, `test:core` = `node --test src/core/*.test.ts`).

| # | Item | Status |
|---|---|---|
| 0 | Opus 5.5 medium default; built-ins off | Done |
| 1 | `cacheWarming: "idle"` | Done 09-30; idle check pending |
| 2 | `review-branch.sh` | Skipped |
| 3 | Interface digest | v0 shipped inside the `map` skill (`agents/skills/map/digest.sh`) |
| 4 | Prompt edits | Done 09-30 (env.work, Long and Headless Runs); prompt-audit and before/after pending; A, B open |
| 5 | Scout flags plus worker prompt | Done 09-30 |
| 6 | `slice-loop` | Evaluating: hand-run first |
| 7 | `worker-sensors.ts` | Done 09-30 (D1–D4 defaults); review pass 10-01 added token-scan bash blocks, pi path resolution, untracked hashing, test-weakening check; 80 table tests, 4 live runs |
| 8 | Fragments and skills | Done 09-30 except `env.work.md` repo names (at work) |
| 9 | Review trial | Evaluating: revised |

Remaining: 6 (hand-run first), 9, the #1 idle check, the #4 audit, decisions A–C.

---

## 1. cacheWarming (approved)

**Patch:** add `"cacheWarming": "idle"` to `config/pi/settings.json`. It is a global-only setting.

**Cost model at 150k context on Opus 5.5:**
- One refresh is a cache read: about $0.03.
- One miss is a cache rewrite: about $0.75.
- Warming pays if you come back within about two hours of idle.

**Unverified:** whether pi caps idle warming. If `/session` shows no cap, a session left open overnight bills about $0.40/hour. Close sessions you're done with.

**Check (personal machine):** grow a session past 100k, idle 6 minutes, send a message. No cache-miss notice should appear, and `/session` should show the warming decision.

**Check (work):** same test on Bedrock. If `/session` reports the model ineligible, add a `modelOverrides` `promptCache` entry. Take the syntax from `docs/models.md` at apply time.

## 4. Prompt edits (approved)

**`env.work.md:7`.** Replace the `**CRITICAL**` / `MUST` line with:

> Language runtimes and browser binaries run from `/opt/homebrew/`. macOS security policy blocks them under `~` and through symlinks from `~`.

**`ops.md`.** New section:

```markdown
## Long and Headless Runs

- Scoped to runs that change files or span many steps. Keep the task list in the spec or an existing `NOW.md`, never a new file, and tick items as they close.
- End with three headings: **Blocked on me**, **Changed**, **Found**.
  Mark anything you couldn't confirm, and say where you looked.
```

**Held for decision A:** the guide's stop rule, "keep going until done unless blocked or about to do something destructive." It contradicts the AutoApprove gate as written.

**Method:**
1. Run `/doctor prompt-audit` on the generated `CLAUDE.md`. Fix findings in the fragments.
2. Run three fixed prompts before and after: a review, a design question, a headless task.

**Done when:** `build-agents.sh --check` and `verify.sh` pass, and the before/after shows no lost behavior.

**Decisions:**
- **A. AutoApprove gate.**
  - Keep it as is: pauses on multi-step work. Costs "continue?" stops.
  - Or narrow it to destructive actions and add the stop rule. Costs a review point on multi-file refactors.
- **B. Prime Directives.** They repeat five Working Style rules. Cut the repeats after the before/after test, or keep them as deliberate emphasis. `prime-reminder.ts` points at that section.

## 5. Scout flags (approved)

**Defect found:** `config/pi/bin/scout.prompt.md` says "NEVER edit, write, or create files", and `--rw` uses the same prompt. A `--rw` child therefore gets edit tools and a rule forbidding them.

**Changes to `config/pi/bin/scout`:**
- **`--thinking LEVEL`:** accepts `low|medium|high|xhigh`; anything else exits 2. Defaults: read-only `low`, `--rw` `medium`.
- **`--rw`:** default timeout 900 s, and uses a new `worker.prompt.md`.
- **Both modes:** append "Mark anything you couldn't confirm, and say where you looked." to the task. Write `timeout=` to `.meta`.
- **Usage header:** update lines 7–24 to match.

**New `config/pi/bin/worker.prompt.md`:**

```markdown
You implement one bounded spec.

- Edit only files the spec lists under files-allowed. If you need another,
  stop and report it under Blocked on me.
- Write the spec's failing test first, then make it pass.
- Don't add dependencies, push, reset, or delete anything the spec doesn't name.
- If the spec is ambiguous or a check can't run here, stop and say which.
- End with: Blocked on me / Changed (file:line) / Found / Unconfirmed.
```

**Done when:**
- `scout --thinking bogus x` exits 2.
- `.meta` shows `thinking=medium` and `timeout=900` for `--rw`.
- A toy `--rw` run in a scratch repo actually edits its file.

---

## 3. Interface digest (evaluating)

**Ladder revision.** `tsc --declaration --emitDeclarationOnly` already emits every exported signature, and `/usr/bin/tsort` does topological order with cycle reports. v0 is about 30 lines of shell:
- `.d.ts` emit
- `rg` over relative imports for fan-in
- `tsort` for reading order

The compiler-API version (v1) is built only if DCCA's path aliases or barrel files make `rg` miscount.

**Use, on vscodext:**

```
$ scripts/interface-digest.sh ~/Dev/vscodext docs/maps
wrote docs/maps/vscodext-interfaces.md (4 modules, 0 cycles)
```

```markdown
# vscodext interfaces (2026-09-30, HEAD 3f2a1c0)

## Reading order (leaves first)
core/classify → tools/depReport → participant/currency → extension

## Fan-in
| module               | in | imported by                     |
|----------------------|----|---------------------------------|
| tools/depReport      | 2  | extension, participant/currency |
| core/classify        | 1  | tools/depReport                 |
| participant/currency | 1  | extension                       |
| extension            | 0  | entry                           |

## core/classify
export type Currency = 'current' | 'minor-behind' | 'major-behind' | 'unknown';
export declare function parseFloor(range: string): Semver | undefined;
export declare function classify(declared: string, latest: string | undefined): Currency;
export declare function buildReport(packageJsonText: string,
  versions?: Readonly<Record<string, string>>, nodeLatestLts?: string): CurrencyReport;

## tools/depReport
export declare const DEP_REPORT_TOOL = "currency-lab_depReport";
export declare class DepReportTool implements vscode.LanguageModelTool<DepReportInput> { … }
…
```

**Then, by hand:**
1. Read the file in its stated order.
2. Write `docs/maps/vscodext-map.md` in ten lines of your own words. For example: "classify is pure: package.json text in, CurrencyReport out, no vscode import. depReport is the only vscode tool and the only caller of buildReport."
3. That map opens every worker brief for the module.

**Value:** zero on vscodext (475 lines; read the five files). It pays on DCCA, where you can't read everything.

**Trial:** one run on DCCA at work. Keep it if the map takes 30 minutes or less, against the morning it replaces.

## 6. slice-loop (evaluating)

**Example spec** (illustrative), `specs/01-tilde-floor.md`:

```markdown
---
module: src/core
files-allowed: [src/core/classify.ts, src/core/classify.test.ts]
tests: node --test src/core/classify.test.ts && pnpm check-types
timeout: 900
---
parseFloor must treat `~1.2` as 1.2.0. Add the failing test first.
```

**Simulation:**

```
$ slice-loop specs main
[01-tilde-floor] precheck: tree clean
[01-tilde-floor] worktree .worktrees/01-tilde-floor on slice/01-tilde-floor
[01-tilde-floor] worker sonnet-5-5 medium 900s … 212s, $0.41, WORKER-SENSORS: PASS
[01-tilde-floor] packet docs/reviews/01-tilde-floor/ (report.md patch.diff tests.txt usage.json)
[01-tilde-floor] returned; halting for review

$ slice-loop specs main
[01-tilde-floor] review pending (specs/01-tilde-floor.returned); halting

# you review, then one of:
$ git merge --no-ff slice/01-tilde-floor && rm specs/01-tilde-floor.returned  # accept
$ echo "reason" > specs/01-tilde-floor.rejected                                # drop
$ cat defects.md >> specs/01-tilde-floor.md && rm specs/01-tilde-floor.returned # rework

$ slice-loop specs main
[01-tilde-floor] merged; skip
[02-engine-lts] precheck: tree dirty (src/core/classify.ts); exit 2
```

**Hand equivalent per slice** (six commands):

```
git worktree add .worktrees/01 -b slice/01 main && cd .worktrees/01
PI_WORKER_SPEC=$PWD/../../specs/01.md scout --rw --brief ../../specs/01.md "Implement the spec."
node --test src/core/classify.test.ts && pnpm check-types
git diff main... > ../../docs/reviews/01.diff
cd - && git merge --no-ff slice/01 && git worktree remove .worktrees/01
```

**What the script adds over the hand version:**
- **The gate:** it refuses a new dispatch while one is unreviewed. This is the rule broken at work, and the only part a fragment can't enforce, because the fragment binds Opus, not you.
- Cost per slice in `usage.json`.
- The clean-tree precheck.

**What it costs:**
- About 120 lines of bash to maintain.
- A queue that invites writing specs ahead of comprehension.
- With `review-branch.sh` skipped, the packet loses the PINNING check (does the new test fail on base).

**Verdict: don't build it yet.** Run the first three slices by hand. Script it on the third run only if the commands were identical and you dispatched before reviewing at least once. Otherwise the hand version is the tool.

## 7. worker-sensors.ts (evaluating; definition)

**Purpose:** limits a `--rw` worker can't argue past. Loaded only by `scout --rw` via `-e`. Inert unless `PI_WORKER_SPEC` is set.

**Input:** spec frontmatter: `files-allowed` (globs, matched with `node:path` `matchesGlob`, which works on Node 24.12), `tests`, and `max-lines` (default 400).

| ID | Event | Trigger | Action |
|---|---|---|---|
| S1 | `tool_call` edit/write | path outside `files-allowed` | block: "<path> is outside files-allowed; report it under Blocked on me" |
| S2 | `tool_call` edit/write on `package.json` | dependency keys change | block |
| S3 | `tool_call` bash | token scan per segment, through `git -C`/`command`/`sh -c`/`eval`/`$(...)`: git push/pull/merge/rebase/reset/clean/stash/checkout/switch/restore, `commit --amend`, recursive `rm`, `find -delete`, package add/remove/update, `npx --yes`/`dlx`/`bunx` | block |
| C1 | `agent_before_settle` | `tests` exits non-zero | fail |
| C2 | `agent_before_settle` | `git diff --name-only $PI_WORKER_BASE` lists a file outside `files-allowed` (catches bash writes that skip S1) | fail |
| C3 | `agent_before_settle` | added lines over `max-lines` | fail |

**Settle outcomes:**
- **PASS:** all C checks pass.
- **First failure:** append a `custom_message` with the reason and the last 40 lines of test output, and return `continue: true`. This happens once.
- **Second failure:** FAIL.
- **CANNOT-RUN:** the tests command exits 127, or its stderr names a missing binary or refused connection. No retry, because more model turns can't fix a missing service.
- **Timeout:** the settle check has a 300 s limit and counts as CANNOT-RUN when it expires.

**Report:** `agent_end` prints `WORKER-SENSORS: PASS|FAIL|CANNOT-RUN <reasons>`, and writes JSON to `$PI_WORKER_REPORT` when that is set.

**Gaps (accepted):**
- Bash can still write files; C2 catches it after the fact.
- The S3 regex is a speed bump, not a sandbox.

**Tests:** pure helpers, table-driven under `node --test`:
- `isAllowed(path, globs)`
- `depsChanged(before, after)`
- `isForbiddenBash(cmd)`
- `classifyFailure(exit, stderr)`
- `parseFrontmatter(text)`

**Decisions to settle before building:**
- **D1.** No `any` sensor. `pnpm check-types` plus lint in the spec's `tests` covers it with no regex false positives. *Default: no sensor.*
- **D2.** `max-lines` default 400 (from the handoff). *Default: 400.*
- **D3.** One retry. *Default: 1.*
- **D4.** Build it with or without `slice-loop`. It works under hand dispatch too, since only `PI_WORKER_SPEC` is needed. *Default: build it before `slice-loop`; it is the higher-value half.*

## 8. Fragments and skills (evaluating; shrunk)

**The ladder removed two of the four artifacts:**
- `config/pi/prompts/spec-contract.md` already defines Scope / Files / Acceptance / Edge cases. Add the worker frontmatter to it instead of creating a `spec` skill.
- `config/pi/prompts/review.md` (`/review`) already does a two-pass sweep. It becomes the review protocol (see #9) instead of a `review-protocol` skill.

**What remains:**
- **Three bullets in `persona-pi.md` Delegation**, instead of a new `dispatch-gate.md` fragment (about 60 resident tokens):
  - One open worker per repo. The next slice goes out only after the last is merged or rejected.
  - A worker brief opens with the module map, then the spec.
  - A planning session ends when the slice list exists. Implementation runs in new processes.
- **Skill `map`** (depends on #3). It runs the digest, shows it, and writes your ten lines verbatim to `docs/maps/<module>-map.md`. It refuses to draft the lines, because the map is only worth something if you wrote it. About 30 resident tokens for the description.
- **`env.work.md`:** DCCA and Detect repo names and test commands. Written at work.

## 9. Review trial (revised)

**Corrections:**
- `pi-review` 1.2.1 does not review a diff in a fresh session. It branches the *current conversation* (user and assistant text, tool calls stripped) and asks for a P0–P3 maintainer review.
- It also registers `/review`, which collides with the existing `config/pi/prompts/review.md`.

**Plan:**
- **Slices:** run the existing `/review main...slice/01` in a fresh Opus 5.5 session at medium.
  - The worker's narrative never enters context, so the review can't anchor on its claims.
  - Fix two things in `review.md`:
    - its stale model line ("fable-5 xhigh at home; opus-4-6 at work")
    - its `CRITICAL` label, renamed to P0–P3 or kept, your pick
- **Your own main-session work:** this is the one place `pi-review`'s conversation branching adds something. Trial it as `pi -e npm:pi-review` for a week, with `thinkingLevel: "medium"` in `~/.pi/agent/pi-review.json`, after renaming or dropping the local `/review` collision.

**Keep rule:** keep either one only if it finds a real defect you missed in its first five uses.

---

## Decisions you own

- **A.** AutoApprove gate: narrow it, or keep it.
- **B.** Prime Directives repeats: cut after testing, or keep.
- **C.** `review.md` severity labels: P0–P3, or CRITICAL–LOW.
- **D1–D4.** Sensors; defaults stated above.
