// Run: node --test 'agent-eval/tests/*.test.ts'
// trial.sh plan mode, check-judges.sh and validate.sh for plan tasks, against stub planners, workers and judges.
import "../../config/pi/tests/hermetic.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  scratch,
  realHome,
  keep,
  env,
  run,
  write,
  git,
  BUGGY,
  FIXED,
  TEST_CMD,
  spec,
  repo,
  fixSha,
  makeTask,
  type Mode,
  makeStub,
  trial,
} from "./trial-harness.ts";

const PLAN_PROMPT = join(scratch, "plan-prompt.md");
write(
  PLAN_PROMPT,
  "---\ndescription: plan\nargument-hint: x\n---\nPlan the following. No edits: $@\n\nEnd with the spec block.\n",
);
const TICKET = "Adding 2 and 3 gives -1. Fix add in src/.";
const FENCE = "```";
const GOOD_PLAN = [
  "**Goal**: add sums its arguments. mechanism: src/add.ts:2 subtracts instead of adding.",
  "",
  "1. Add a failing test in src/add.more.test.ts → check: node --test 'src/*.test.ts' fails on the new test",
  "2. Change the operator in src/add.ts → check: node --test 'src/*.test.ts' passes",
  "",
  FENCE,
  "---",
  "files-allowed: [src/add.ts, src/add.more.test.ts]",
  "tests: node --test 'src/*.test.ts'",
  "---",
  FENCE,
  "",
].join("\n");
const DECISIONS = [{ id: "d1", text: "The plan keeps add synchronous." }];
const RUBRIC_IDS = ["mechanism", "checks", "test-first", "scope"];

// The plan tasks' source repo: like the one above, but its fix commit changes only src/add.ts and adds the new test.
const planRepo = join(scratch, "plan-repo");
write(
  join(planRepo, "package.json"),
  JSON.stringify({ type: "module", scripts: { test: TEST_CMD } }),
);
write(join(planRepo, "src/add.ts"), BUGGY);
write(join(planRepo, "src/add.test.ts"), spec("zero", 0, 0, 0));
git(planRepo, "init", "-q");
git(planRepo, "add", "-A");
git(planRepo, "commit", "-q", "-m", "buggy");
write(join(planRepo, "src/add.ts"), FIXED);
write(join(planRepo, "src/add.more.test.ts"), spec("more", 2, 3, 5));
git(planRepo, "add", "-A");
git(planRepo, "commit", "-q", "-m", "fix");
const planFix = git(planRepo, "rev-parse", "HEAD");

function makePlanTask(id: string, over: Record<string, unknown> = {}): string {
  const dir = join(scratch, "tasks", id);
  const task = {
    id,
    role: "plan",
    repo: planRepo,
    fix: planFix,
    test: TEST_CMD,
    hidden: ["src/add.more.test.ts"],
    link: [],
    decisions: DECISIONS,
    ...over,
  };
  write(join(dir, "task.json"), JSON.stringify(task));
  write(join(dir, "ticket.md"), TICKET + "\n");
  return dir;
}

/** A stub planner pi (baked in, as it runs under env -i): prints the reply as its final message, records home, cwd and arguments (NUL-separated). */
function makePlanStub(
  name: string,
  reply: string,
  mode: "reply" | "edit" | "silent" | "slow" = "reply",
): { path: string; record: string } {
  const path = join(scratch, "stub-plan-" + name);
  const record = path + ".record";
  const usage = {
    input: 100,
    output: 20,
    cacheRead: 0,
    cacheWrite: 0,
    cost: { total: 0.01 },
  };
  write(
    path + ".turn",
    JSON.stringify({
      type: "message",
      message: { role: "assistant", usage, content: [] },
    }) + "\n",
  );
  write(
    path + ".end",
    JSON.stringify({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: reply }] },
    }) + "\n",
  );
  write(
    path,
    `#!/usr/bin/env bash
{ printf 'HOME=%s\\0PWD=%s\\0' "$HOME" "$PWD"; printf '%s\\0' "$@"; } > '${record}'
sdir=; prev=; for a in "$@"; do case "$prev" in --session-dir) sdir=$a ;; esac; prev=$a; done
mkdir -p "$sdir"
if [ ${mode} = silent ]; then : > "$sdir/s.jsonl"; exit 1; fi
cp '${path}.turn' "$sdir/s.jsonl"
if [ ${mode} = slow ]; then exec sleep 60; fi
if [ ${mode} = edit ]; then echo changed > NOTES.md; fi
cat '${path}.end'
`,
    0o755,
  );
  return { path, record };
}

/** A stub judge pi: the first arm whose model glob and prompt marker match gives the reply, else garbage. Calls go to <stub>.calls, the prompt to <stub>.prompt. */
function makeJudgeStub(
  name: string,
  arms: { when?: string; model?: string; reply: string }[],
): { path: string; calls: string; prompt: string } {
  const path = join(scratch, "stub-judge-" + name);
  const body = arms
    .map(
      (a) =>
        "if " +
        [
          a.model ? '[[ "$model" == ' + a.model + " ]]" : "true",
          a.when ? "grep -q '" + a.when + '\' <<< "$prompt"' : "true",
        ].join(" && ") +
        "; then echo '" +
        a.reply +
        "'; exit 0; fi",
    )
    .join("\n");
  write(
    path,
    `#!/usr/bin/env bash
model=; sdir=; prev=; prompt=
for a in "$@"; do case "$prev" in --model) model=$a ;; --session-dir) sdir=$a ;; esac; prev=$a; prompt=$a; done
echo call >> '${path}.calls'
printf '%s' "$prompt" > '${path}.prompt'
mkdir -p "$sdir"
echo '{"type":"message","message":{"role":"assistant","usage":{"input":1,"output":1,"cost":{"total":0.1}},"content":[]}}' > "$sdir/s.jsonl"
${body}
echo garbage
`,
    0o755,
  );
  return { path, calls: path + ".calls", prompt: path + ".prompt" };
}
const YES5 = '["yes","yes","yes","yes","yes"]';

let planCounter = 0;
function planTrial(
  reply: string,
  opts: {
    mode?: "reply" | "edit" | "silent" | "slow";
    worker?: Mode;
    sensors?: boolean;
    defaultPrompt?: boolean;
    judge?: string;
    extra?: Record<string, string>;
  } = {},
) {
  const n = planCounter++;
  const planner = makePlanStub("p" + n, reply, opts.mode);
  const worker = makeStub(opts.worker ?? "fix", opts.sensors);
  const judge = makeJudgeStub("p" + n, [{ reply: opts.judge ?? YES5 }]);
  rmSync(worker.record, { force: true });
  const out = join(scratch, "out-plan-" + n + ".jsonl");
  const r = run(
    "trial.sh",
    [makePlanTask("plan-" + n), "prov/model-x", "high", "3", out],
    {
      EVAL_PLAN_PI: planner.path,
      EVAL_SCOUT: worker.path,
      EVAL_JUDGE_PI: judge.path,
      ...(opts.defaultPrompt ? {} : { EVAL_PLAN_PROMPT: PLAN_PROMPT }),
      EVAL_REAL_HOME: realHome,
      EVAL_PLAN_WORKER: "prov/worker-m:low",
      ...opts.extra,
    },
  );
  const rec = existsSync(out)
    ? JSON.parse(readFileSync(out, "utf8").trim().split("\n").pop() ?? "null")
    : undefined;
  if (rec) keep.push(rec.dir);
  return { r, rec, planner, worker, judge };
}

const MECH_OK = {
  covers: true,
  tight: true,
  grounded: true,
  readonly: true,
  short: true,
};

test("trial.sh plan: a good plan, a worker that fixes it and judges that say yes pass with found = of; record fields, homes, arguments", () => {
  const { r, rec, planner, worker, judge } = planTrial(GOOD_PLAN);
  assert.equal(r.status, 0, r.stderr);
  const { dir, seconds, ...rest } = rec;
  assert.deepEqual(rest, {
    task: rec.task,
    role: "plan",
    model: "prov/model-x",
    thinking: "high",
    trial: 3,
    pass: true,
    accepted: true,
    executed: true,
    checks: MECH_OK,
    met: [...RUBRIC_IDS, "d1"],
    found: 11,
    of: 11,
    disagreements: [],
    judgeCost: 0.2,
    workerCost: 0.125,
    worker: "prov/worker-m:low",
    workerSensors: null,
    rc: 0,
    cost: 0.01,
    input: 100,
    output: 20,
    cacheRead: 0,
    cacheWrite: 0,
    turns: 1,
    leak: false,
    infra: false,
  });
  assert.equal(typeof seconds, "number");
  // the planner: plain pi -p --mode json in the base workspace, its own home, the rendered prompt as the last argument
  const seen = readFileSync(planner.record, "utf8").split("\0");
  assert.equal(seen[0], "HOME=" + join(dir, "home"));
  assert.equal(seen[1], "PWD=" + join(realpathSync(dir), "ws"));
  const args = seen.slice(2, -1);
  assert.deepEqual(args.slice(0, 3), ["-p", "--mode", "json"]);
  assert.deepEqual(
    args.slice(args.indexOf("--model"), args.indexOf("--model") + 4),
    ["--model", "prov/model-x", "--thinking", "high"],
  );
  assert.equal(
    args[args.indexOf("--session-dir") + 1],
    join(dir, "home/.pi/agent/sessions/plan"),
  );
  assert.equal(
    args.at(-1),
    "Plan the following. No edits: " + TICKET + "\n\nEnd with the spec block.",
  );
  assert.equal(readFileSync(join(dir, "reply.txt"), "utf8"), GOOD_PLAN);
  // the spec, the mechanical grade, the base workspace untouched
  const spec = readFileSync(join(dir, "spec.md"), "utf8");
  assert.match(
    spec,
    /^---\nfiles-allowed: \[src\/add.ts, src\/add.more.test.ts\]\ntests: node --test 'src\/\*.test.ts'\n---\n\n\*\*Goal\*\*/,
  );
  assert.equal(spec.includes(FENCE), false);
  assert.deepEqual(
    JSON.parse(readFileSync(join(dir, "mechanical.json"), "utf8")),
    { accepted: true, ...MECH_OK },
  );
  assert.equal(readFileSync(join(dir, "ws/src/add.ts"), "utf8"), BUGGY);
  // the worker: a second workspace and its own home, the spec on stdin, the model and thinking from EVAL_PLAN_WORKER
  const w = readFileSync(worker.record, "utf8");
  assert.match(w, new RegExp("^HOME=" + join(dir, "worker-home") + "$", "m"));
  assert.match(
    w,
    new RegExp("^PWD=" + join(realpathSync(dir), "ws2") + "$", "m"),
  );
  assert.match(
    w,
    /^ARGS=--rw --model prov\/worker-m --thinking low --spec -$/m,
  );
  assert.match(w, /^STDIN=---$/m);
  assert.equal(readFileSync(join(dir, "ws2/src/add.ts"), "utf8"), FIXED);
  assert.match(readFileSync(join(dir, "test.txt"), "utf8"), /fail 0/);
  // the judges: rubric on the spec, with the ticket and the reference diff as background, once per judge
  assert.equal(readFileSync(judge.calls, "utf8").trim().split("\n").length, 2);
  const prompt = readFileSync(judge.prompt, "utf8");
  assert.ok(
    prompt.includes(TICKET) &&
      prompt.includes("Reference diff:") &&
      prompt.includes("+\treturn a + b;"),
  );
  assert.ok(
    prompt.includes("files-allowed: [src/add.ts, src/add.more.test.ts]"),
  );
  assert.ok(
    prompt.includes("5. The plan keeps add synchronous.") &&
      prompt.includes("1. The plan states the cause"),
  );
});

test("trial.sh plan: a reply without a spec block fails, is not infra, and runs neither the worker nor the judges", () => {
  const { r, rec, worker, judge } = planTrial(
    "I would change the operator in src/add.ts and run the tests.",
  );
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(
    [rec.pass, rec.accepted, rec.executed, rec.infra, rec.turns, rec.rc],
    [false, false, false, false, 1, 0],
  );
  assert.deepEqual(rec.checks, {
    covers: false,
    tight: false,
    grounded: false,
    readonly: true,
    short: false,
  });
  assert.deepEqual(
    [rec.met, rec.found, rec.of, rec.judgeCost, rec.workerCost],
    [[], 1, 11, 0, 0],
  );
  assert.equal(existsSync(worker.record), false);
  assert.equal(existsSync(judge.calls), false);
  assert.equal(existsSync(join(rec.dir, "ws2")), false);
  assert.equal(rec.workerSensors, null);
});

test("trial.sh plan: a plan the worker cannot make pass is accepted, not executed, a fail; the judges still rate it", () => {
  const { rec, judge } = planTrial(GOOD_PLAN, { worker: "noop" });
  assert.deepEqual(
    [rec.pass, rec.accepted, rec.executed, rec.infra, rec.found, rec.of],
    [false, true, false, false, 11, 11],
  );
  assert.equal(readFileSync(judge.calls, "utf8").trim().split("\n").length, 2);
  assert.match(readFileSync(join(rec.dir, "test.txt"), "utf8"), /fail [1-9]/);
});

test("trial.sh plan: a refused fixed worker is infra, but a plan blocker is a real failure", () => {
  for (const [worker, infra] of [
    ["refused", true],
    ["dead", true],
    ["frozen", false],
  ] as const) {
    const { r, rec } = planTrial(GOOD_PLAN, { worker });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      [rec.infra, rec.executed, rec.pass],
      [infra, false, false],
      worker,
    );
  }
});

test("trial.sh plan: default prompt falls back to the repo when the real home has no prompts", () => {
  assert.equal(existsSync(join(realHome, ".pi/agent/prompts")), false);
  const { r, rec, planner } = planTrial(GOOD_PLAN, { defaultPrompt: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(rec.pass, true);
  const prompt = readFileSync(planner.record, "utf8").split("\0").at(-2) ?? "";
  assert.ok(prompt.includes(TICKET));
  assert.ok(prompt.includes("files-allowed"));
});

test("trial.sh plan: workerSensors reports the worker digest verdict", () => {
  for (const [worker, want] of [
    ["blocked", "CANNOT-RUN"],
    ["fix", "PASS"],
    ["noop", "FAIL"],
  ] as const) {
    const { r, rec } = planTrial(GOOD_PLAN, { worker, sensors: true });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(rec.workerSensors, want);
    assert.equal(rec.executed, worker === "fix");
  }
});

test("trial.sh plan: a planner that edits a file fails the readonly check", () => {
  const { rec } = planTrial(GOOD_PLAN, { mode: "edit" });
  assert.deepEqual(rec.checks, { ...MECH_OK, readonly: false });
  assert.deepEqual([rec.accepted, rec.found, rec.of], [true, 10, 11]);
  assert.match(
    readFileSync(join(rec.dir, "porcelain.txt"), "utf8"),
    /NOTES\.md/,
  );
});

test("trial.sh plan: judges that split: met follows judge.sh; an unusable judge reply is infra", () => {
  const split = planTrial(GOOD_PLAN, {
    judge: '["yes","no","yes","yes","yes"]',
  }).rec;
  assert.deepEqual(
    [split.pass, split.met, split.found, split.infra],
    [true, ["mechanism", "test-first", "scope", "d1"], 10, false],
  );
  const garbage = planTrial(GOOD_PLAN, { judge: "garbage" }).rec;
  assert.deepEqual(
    [garbage.pass, garbage.infra, garbage.met, garbage.found],
    [true, true, [], 6],
  );
});

test("trial.sh plan: no planner turns is infra; a planner that outlives EVAL_PLAN_TIMEOUT is infra with rc 124 and starts no worker", () => {
  const quiet = planTrial("", { mode: "silent" });
  assert.equal(quiet.r.status, 0, quiet.r.stderr);
  assert.deepEqual(
    [quiet.rec.infra, quiet.rec.turns, quiet.rec.pass, quiet.rec.accepted],
    [true, 0, false, false],
  );
  const started = Date.now();
  const slow = planTrial(GOOD_PLAN, {
    mode: "slow",
    extra: { EVAL_PLAN_TIMEOUT: "2" },
  });
  assert.ok(Date.now() - started < 40000, "the trial waited for the planner");
  assert.deepEqual(
    [slow.rec.rc, slow.rec.infra, slow.rec.pass, slow.rec.turns],
    [124, true, false, 1],
  );
  assert.equal(existsSync(slow.worker.record), false);
});

test("trial.sh plan: a bad EVAL_PLAN_WORKER, a missing prompt or bad decisions exit 2 before any planner call", () => {
  const out = join(scratch, "out-plan-usage.jsonl");
  const planner = makePlanStub("usage", GOOD_PLAN);
  const base = {
    EVAL_PLAN_PI: planner.path,
    EVAL_PLAN_PROMPT: PLAN_PROMPT,
    EVAL_REAL_HOME: realHome,
  };
  const task = makePlanTask("plan-usage");
  for (const extra of [
    { EVAL_PLAN_WORKER: "no-colon" },
    { EVAL_PLAN_PROMPT: join(scratch, "missing.md") },
  ]) {
    assert.equal(
      run("trial.sh", [task, "m", "low", "1", out], { ...base, ...extra })
        .status,
      2,
    );
  }
  assert.equal(
    run(
      "trial.sh",
      [
        makePlanTask("plan-baddec", { decisions: [{ id: "x" }] }),
        "m",
        "low",
        "1",
        out,
      ],
      base,
    ).status,
    2,
  );
  assert.equal(existsSync(planner.record), false);
});

/** A plan task with gold.md, bad.md and samples.json, for check-judges.sh and validate.sh. */
const GOLD = [
  "**Goal**: GOLDMARK add sums. See src/add.ts:2.",
  "",
  "1. Add a failing test in src/add.more.test.ts → check: node --test fails",
  "2. Fix src/add.ts → check: node --test passes",
  "",
  FENCE,
  "---",
  "files-allowed: [src/add.ts, src/add.more.test.ts]",
  "tests: node --test 'src/*.test.ts'",
  "---",
  FENCE,
  "",
].join("\n");
const BAD =
  "Fix the bug.\n\n1. Fix src/add.ts → check: verify it works\n\n---\nfiles-allowed: [src/add.ts]\ntests: node --test 'src/*.test.ts'\n---\n";
function makeSampleTask(
  id: string,
  over: Record<string, unknown> = {},
  samples: unknown = [
    { file: "gold.md", yes: RUBRIC_IDS, no: [] },
    { file: "bad.md", yes: [], no: RUBRIC_IDS },
  ],
  gold = GOLD,
): string {
  const dir = makePlanTask(id, { decisions: [], ...over });
  write(join(dir, "gold.md"), gold);
  write(join(dir, "bad.md"), BAD);
  write(join(dir, "samples.json"), JSON.stringify(samples));
  return dir;
}

test("check-judges.sh plan: judges that answer per the table print one ok line per listed id and exit 0", () => {
  const judge = makeJudgeStub("cj-good", [
    { when: "GOLDMARK", reply: '["yes","yes","yes","yes"]' },
    { reply: '["no","no","no","no"]' },
  ]);
  const r = run("check-judges.sh", [makeSampleTask("cj-plan")], {
    EVAL_JUDGE_PI: judge.path,
    EVAL_REAL_HOME: realHome,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 8);
  assert.equal(lines[0], "gold.md mechanism want=yes: a=yes b=yes; ok");
  assert.equal(lines[7], "bad.md scope want=no: a=no b=no; ok");
  assert.equal(
    lines.every((l) => l.endsWith("; ok")),
    true,
  );
  assert.equal(readFileSync(judge.calls, "utf8").trim().split("\n").length, 4);
  assert.ok(readFileSync(judge.prompt, "utf8").includes("Reference diff:"));
});

test("check-judges.sh plan: one judge that deviates is a MISS and exits 1; a plan task without samples.json exits 2", () => {
  const gpt = makeJudgeStub("cj-gpt", [
    { model: "*gpt*", reply: '["yes","yes","yes","yes"]' },
    { when: "GOLDMARK", reply: '["yes","yes","yes","yes"]' },
    { reply: '["no","no","no","no"]' },
  ]);
  const r = run("check-judges.sh", [makeSampleTask("cj-plan-dev")], {
    EVAL_JUDGE_PI: gpt.path,
    EVAL_REAL_HOME: realHome,
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(
    r.stdout.includes("bad.md mechanism want=no: a=no b=yes; MISS"),
    true,
  );
  assert.equal(
    r.stdout.includes("gold.md mechanism want=yes: a=yes b=yes; ok"),
    true,
  );
  assert.equal(
    run("check-judges.sh", [makePlanTask("cj-plan-nosamples")], {
      EVAL_JUDGE_PI: gpt.path,
    }).status,
    2,
  );
});

test("validate.sh plan: a sound task is VALID; an empty ticket, an unknown sample id and the other unsound tasks are INVALID with the reason", () => {
  const good = run("validate.sh", [makeSampleTask("vp-good")]);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.equal(good.stdout.trim(), "VALID vp-good");
  assert.equal(
    run("validate.sh", [makePlanTask("vp-nosamples")]).stdout.trim(),
    "VALID vp-nosamples",
  );
  const table: [string, string, Record<string, unknown>, unknown, string][] = [
    ["vp-ticket", "ticket.md is missing or empty", {}, undefined, GOLD],
    [
      "vp-id",
      "samples.json names an unknown item id: bogus",
      {},
      [{ file: "gold.md", yes: ["bogus"], no: [] }],
      GOLD,
    ],
    [
      "vp-file",
      "samples.json names a file that does not exist: nope.md",
      {},
      [{ file: "nope.md", yes: [], no: ["scope"] }],
      GOLD,
    ],
    [
      "vp-dup",
      "a decision id collides with a rubric id",
      { decisions: [{ id: "scope", text: "x" }] },
      undefined,
      GOLD,
    ],
    [
      "vp-shape",
      "decisions must be a list of {id, text}",
      { decisions: [{ id: "d1" }] },
      undefined,
      GOLD,
    ],
    [
      "vp-gold",
      "gold.md fails the mechanical check: accepted, covers, tight, grounded, short",
      {},
      undefined,
      "Just words, no spec block.",
    ],
    [
      "vp-pass",
      "hidden tests pass on the base",
      { hidden: ["src/add.test.ts"] },
      undefined,
      GOLD,
    ],
  ];
  for (const [id, reason, over, samples, gold] of table) {
    const dir = makeSampleTask(id, over, samples, gold);
    if (id === "vp-ticket") write(join(dir, "ticket.md"), "  \n");
    const r = run("validate.sh", [dir]);
    assert.equal(r.status, 1, id + ": " + r.stdout);
    assert.equal(r.stdout.trim(), "INVALID " + id + ": " + reason);
  }
});

// Lives here, not in trial.test.ts: it needs makeJudgeStub.
test("dead worker and scout runs with counted turns are infra", () => {
  for (const role of ["worker", "scout"]) {
    const judge = makeJudgeStub("dead-" + role, [{ reply: '["no"]' }]);
    const task = makeTask("dead-" + role, {
      role,
      ...(role === "scout" ? { rev: fixSha } : {}),
      facts: [{ id: "f", text: "add sums", hit: "add sums" }],
      expect:
        role === "scout"
          ? [{ file: "src/add.ts", lines: [1, 2], must: [] }]
          : "pass",
    });
    const { r, rec } = trial(task, "dead", { EVAL_JUDGE_PI: judge.path });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      [rec.infra, rec.pass, rec.rc, rec.input, rec.output, rec.turns],
      [true, false, 1, 0, 0, 1],
    );
  }
});
