# Pi adjustments: plan

Scope: items 2 to 9 of `operating-proposal-2026-09-26.md`. Item 1 (cost
attribution) is skipped on your call; the cost is that item 6's saving and
item 9's numbers rest on `/session` totals and the usage widget instead of
per-run attribution. Every item names its interface, what it hides, its
acceptance signal, and the decisions still open. Stand-in repo:
`~/Dev/vscodext` (TypeScript 6.0.3 with the compiler API present,
`test:core` runs under `node --test` without Electron, branch
`feature/currency-lab`).

Build order is by dependency, then by the day each is first used.

## Sequence

| Step | Item | Depends on | First use | Cost |
|------|------|-----------|-----------|------|
| 1 | #4 `cacheWarming: "idle"` | nothing | tonight | 1 line, 1 check at work |
| 2 | #2 `review-branch.sh` | nothing | Saturday morning | 2 h |
| 3 | #3 `interface-digest.sh` | nothing | Sunday morning | 2 h |
| 4 | #9 resident-prompt measurement | nothing | Tuesday | 15 min |
| 5 | #5 `scout --thinking`, `--rw` timeout | nothing | Tuesday | 30 min |
| 6 | #6 `slice-loop` | #2, #5 | Tuesday | 2 h |
| 7 | #7 `worker-sensors.ts` | #6 env contract | Wednesday | 4 h with tests |
| 8 | #8 fragments and skills | #6, #7 real | Wednesday | 1 h |

Tonight: steps 1 to 3. Nothing else before Tuesday; the weekend is
own-hands by design and needs only the two scripts.

## #4 cacheWarming

Change: `"cacheWarming": "idle"` in `config/pi/settings.json`.

Hides nothing; it is a setting. Pi warms only when the model declares a
`promptCache` lifetime and the estimated avoided miss is at least $0.05, so
small sessions never warm.

Open check, work machine: the work models run through Bedrock. If
`/session` reports the model as not eligible, add a `modelOverrides` entry
with `promptCache: { "short": 300 }` for each Bedrock model in use. Without
that entry the setting is inert there.

Signal: open an opus session at 100k+ context, wait past the lifetime, send
a turn; no cache-miss notice. Same experiment before the change shows one.

## #2 review-branch.sh

Interface: `scripts/review-branch.sh <base> <branch> [--module <path>]...
[--test-cmd '<cmd with {file}>'] [--suite '<cmd>']`. Prints the five
sections in order; exit code is the suite's exit code.

Hides: two temporary worktrees (`$TMPDIR/review-<hash>/{base,branch}`,
removed on EXIT), `node_modules` symlinked from the main checkout into
both, test-runner detection, declaration emit on both refs, cleanup.

Sections:

1. `git diff <base>...<branch> --stat`, then every changed path not under a
   `--module` argument, one per line, headed `OUTSIDE MODULE`.
2. Per changed test file (`*.test.*`, `*.spec.*`, `__tests__/`): the
   branch's copy is placed into the base worktree so new tests run there
   too. Verdict per file from the pair: base FAIL and branch PASS is
   `PINNING`; PASS/PASS is `NOT-PINNING`; FAIL/FAIL is `BROKEN`; base PASS
   and branch FAIL is `REGRESSION`.
3. `tsc -p tsconfig.json --declaration --emitDeclarationOnly --outDir` in
   each worktree, then `diff -ru`. A ref that fails to emit prints its
   errors and marks the section `INCOMPLETE`; the script continues.
4. Added lines from `git diff -U0` grepped for `: any`, `as any`, `<any>`,
   `TODO|FIXME`; empty `catch` blocks found by a small awk over added
   lines; `dependencies` and `devDependencies` keys compared between refs
   via `jq` (raw diff fallback when `jq` is absent).
5. `--suite` (default: `npm test`) in the branch worktree; exit code
   printed on the last line and returned.

Decisions taken: worktrees over checkout switching (never touches your
working tree); symlinked `node_modules` with a printed warning when
`package.json` or the lockfile differ between refs (section 4 flags that
case anyway, and the operator installs in the worktree if needed);
`--test-cmd` default by detection (`vitest` → `npx vitest run {file}`,
`jest` → `npx jest {file}`, else `node --test {file}`).

Open decision: none that changes direction.

Signal: throwaway branch on `~/Dev/vscodext` from `feature/currency-lab`
containing (a) a new `src/core/*.test.ts` that fails on base, (b) an
existing test edited to still pass, (c) one `as any`, (d) one new
devDependency in `package.json`, (e) one changed exported signature in
`src/core`. Expected output: (a) `PINNING`, (b) `NOT-PINNING`, (c) the line,
(d) the key, (e) a `.d.ts` hunk, then the `test:core` exit code. Branch
deleted after. Run with `--test-cmd 'node --test {file}' --suite 'pnpm run
test:core'`.

## #3 interface-digest.sh

Interface: `scripts/interface-digest.sh <repo-dir> <out-dir>`. Writes
`<out>/<repo>-interfaces.md` and `<out>/<repo>-graph.md`, prints line
counts and every module with more than 10 exports.

Hides: declaration emit, import resolution, graph construction, fan-in
ranking, `.d.ts` parsing. Implementation is a bash wrapper plus one
`scripts/lib/interface-digest.mjs` that loads the repo's own
`node_modules/typescript` (rung 5: installed dependency; `madge` and
`dependency-cruiser` are absent and nothing new is added).

Steps: (1) `tsc -p <repo>/tsconfig.json --declaration
--emitDeclarationOnly --outDir <out>/decl`; on error print the diagnostics
and exit 1 without touching source. (2) `ts.createProgram` from the same
tsconfig; per source file, collect `import` and `export ... from`
specifiers, resolve with `ts.resolveModuleName`, keep in-project targets;
adjacency plus fan-in counts; Kahn topological order with cycles reported
and broken by fan-in; entry points are fan-in 0 files listed first. (3) Per
module, exported declarations read from its `.d.ts` via
`ts.createSourceFile`; signature text is `getText()` (no leading JSDoc);
per-export fan-in counted from named import specifiers across the
program, namespace and default imports counted once per module. Top 15 by
fan-in with signatures, the rest by name. (4) Graph file: top 20 modules by
fan-in, each with its direct importers.

Decisions taken: compiler API over regex import scanning (aliases and
re-exports resolve correctly; regex breaks on `paths`); plain `.mjs` with
no build step; TypeScript 5 and 6 API surface only.

Open decision: if a work repo runs TypeScript 7 (the Go compiler) without
`lib/typescript.js`, the script reports that and stops; a regex fallback
is a second implementation and is not built until that case is real.

Signal: run on `~/Dev/vscodext`; both files exist; `extension.ts` appears
as an entry point; `src/core` modules show fan-in from `participant` and
`tools`; line counts printed; any module over 10 exports named. Second run
on `~/Dev/tdb/testdata/typescript_app` as the trivial case.

## #9 resident-prompt measurement

Not a script. Three `pi -p "reply with ok"` runs, then read
`usage.input + usage.cacheWrite` from the first assistant message of each
session file: (a) default profile, (b) `-t read,edit,write,bash,grep,find,
ls`, (c) `-ne -ns -np`. The three numbers decide whether a work profile
without web tools is worth a settings change. `AGENTS.md` alone is 17,236
chars, about 4.3k tokens; the expectation is that package tool schemas
exceed it.

Signal: three numbers in `docs/resident-prompt-2026-09-30.md`.

## #5 scout worker profile

Change to `config/pi/bin/scout`: `--thinking LEVEL` (default `low`,
validated against `low|medium|high|xhigh`, exit 2 otherwise); `--rw`
raises the default timeout to 900 unless `--timeout` is given; header
comment documents the worker invocation `scout --rw --thinking medium
--brief spec.md "task"`. The `.meta` file already records `thinking`.

Hides nothing new; the profile (`-ne -nc -ns -np -t`, depth guard) is
already the right one.

Signal: `scout --thinking medium "say ok"` meta shows `thinking=medium`;
`scout --thinking bogus "x"` exits 2; `scout --rw "x"` meta shows the 900
timeout.

## #6 slice-loop

Interface: `bin/slice-loop <specs-dir> <base-ref>`. Runs in the repo root.
Zero model tokens outside the child.

Spec file: `specs/NN-<slice>.md` with frontmatter `module`, `files-allowed`
(globs), `tests` (command), `timeout` (seconds, optional); body is the
contract before/after. The `spec` skill (#8) emits this shape.

Per spec, in filename order:

- Skip if `git branch --merged <base>` contains `slice/<slice>` or
  `specs/<slice>.rejected` exists.
- Halt with `review pending: <slice>` if `specs/<slice>.returned` exists.
- Else: `git worktree add .worktrees/<slice> -b slice/<slice> <base>` (or
  reuse the worktree on a rerun), `cd` there, export `PI_WORKER_SPEC` and
  `PI_WORKER_BASE`, run `scout --rw --thinking medium --brief <spec>
  --timeout <t> "<body's task line>"`, then `review-branch.sh <base>
  slice/<slice> --module <module> --suite '<tests>' >
  docs/reviews/<slice>.md`, append one line to `run-history.jsonl` with
  the child's session cost read from its session file, touch
  `specs/<slice>.returned`, halt.

Operator actions between runs: merge (the loop derives "reviewed" from
the merge), or `touch specs/<slice>.rejected` and delete the branch, or
append the defect list to the spec and `rm specs/<slice>.returned` for a
rerun on the same branch. No manual `.reviewed` marker; merged or rejected
are the only terminal states, so habit cannot fake a review.

Lock: `specs/.lock` with the pid; a second loop on the same repo exits 2.
One loop per thread is the §1 cap enforced.

Hides: worktree lifecycle, scout invocation, review invocation, cost
extraction, state derivation.

Open decisions: worktree versus in-place (worktree taken; your checkout
stays clean and the review script already uses worktrees); whether the
task line is the spec's first body line or a frontmatter `task` field
(frontmatter, explicit).

Signal: two toy specs on `~/Dev/vscodext`. Run 1 dispatches slice 1,
writes `docs/reviews/01-....md`, halts. Run 2 halts with `review pending`.
After a merge, run 3 dispatches slice 2. A second concurrent invocation
exits 2. `run-history.jsonl` gains two lines with cost.

## #7 worker-sensors.ts

Interface: `config/pi/extensions/worker-sensors.ts`, loaded only into
`--rw` children via scout's `-e` slot. Reads `PI_WORKER_SPEC` and
`PI_WORKER_BASE`; absent either, the extension does nothing and says so
once.

Handlers:

- `tool_call` on `edit` and `write`: block with a one-line reason when the
  target is outside `files-allowed` (falling back to `.agent-allowlist`
  directory globs for new files); when the target is `package.json` and
  the `dependencies` or `devDependencies` keys or versions change; when
  the new text matches `:\s*any\b`, `as any\b`, or `<any>`; when `git diff
  --numstat <base>` plus this edit's added lines would exceed 400.
- `agent_before_settle`: run the spec's `tests` command; check `git diff
  --name-only <base>` against `files-allowed`; check the line cap. On
  failure, append the failure text as a message and return `continue:
  true` once (counter in extension state); on the second failure, record
  `FAIL` with `appendEntry` and settle. On success record `PASS`.
- `agent_end`: print `WORKER-SENSORS: PASS|FAIL <reasons>` to stdout so
  `slice-loop` and the review file carry it without model prose.

Backstop: `bash` bypasses `tool_call`, so the settle check is the
authority; the `tool_call` guards are early feedback.

Hides: spec parsing, git queries, JSON comparison, the retry counter.
Pure functions (`isPathAllowed`, `dependencyKeysChanged`, `findAnyInText`,
`wouldExceedLineCap`) are table-tested under `node --test` beside
`headless-close.test.ts`; handlers stay thin.

Open decisions: whether `.agent-allowlist` is required or optional
(optional; absent means `files-allowed` is the only rule); whether the
settle retry is one or zero (one; a zero-retry worker wastes the run on a
formatting-only failure).

Signal: table tests green; a `scout --rw` run on the stand-in with a spec
allowing only `src/core/**` and a task that writes `as any` into
`src/tools/x.ts` shows two blocks in the child transcript and `FAIL` at
the end; a compliant task shows `PASS`.

## #8 fragments and skills

- `agents-md/dispatch-gate.md` (shared, resident): no dispatch on a thread
  until the previous return is merged or rejected; worker prompts open
  with the module's ten-line map; "read the repo" and "look at this and
  tell me what is wrong" are banned prompt forms; Opus for plan and grill
  only, session closes when the slice list exists. About 400 tokens
  resident, paid on every turn; it must bind every session that could
  dispatch.
- `review-protocol.md` as a skill, not a fragment: five steps, prose never
  read. Loaded only in review sessions, zero resident cost.
- Skill `map`: runs `interface-digest.sh`, prints the entry point and the
  top 5 by fan-in, then asks for your ten lines and writes exactly what
  you type into `docs/map/<repo>.md`. Refuses to draft the lines.
- Skill `spec`: emits the `slice-loop` spec shape with frontmatter and the
  300-word return cap.
- `env.work.md` gains the DCCA and Detect repo names and test commands
  only.

Signal: `build-agents.sh --check` passes; the generated `AGENTS.md` diff
contains only the new fragment; `verify.sh` passes; resident delta
reported in tokens.

## Decisions you own before tonight's build

1. `review-branch.sh` section 2 runner default when detection fails:
   `node --test {file}` (taken unless you object).
2. `slice-loop` terminal states: merged or `.rejected` only, no manual
   reviewed marker (taken unless you object).
3. `review-protocol` as a skill rather than a resident fragment (taken;
   reverse if you want it binding in every session at 400 tokens a turn).
