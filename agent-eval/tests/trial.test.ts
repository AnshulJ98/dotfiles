// Run: node --test 'agent-eval/tests/*.test.ts'
// Drives trial.sh and validate.sh against a throwaway source repo and stub scouts: no model, no tokens.
import "../../config/pi/tests/hermetic.ts";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  EVAL_DIR,
  scratch,
  realHome,
  keep,
  env,
  run,
  write,
  git,
  BUGGY,
  spec,
  repo,
  fixSha,
  makeTask,
  nextOut,
  trial,
} from "./trial-harness.ts";

test("a fixing scout passes: record fields, summed usage, isolated HOME, stub arguments", () => {
  const { r, rec, records, stub } = trial(makeTask("good"), "fix");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(records.length, 1);
  const { dir, seconds, ...rest } = rec;
  assert.deepEqual(rest, {
    task: "good",
    role: "worker",
    model: "prov/model-x",
    thinking: "high",
    trial: 3,
    pass: true,
    sensors: "PASS",
    rc: 0,
    outside: [],
    wroteTest: false,
    added: 1,
    cost: 0.125,
    input: 100,
    output: 20,
    cacheRead: 50,
    cacheWrite: 10,
    turns: 1,
    leak: false,
    infra: false,
  });
  assert.equal(typeof seconds, "number");
  assert.ok(existsSync(join(dir, "ws/src/zz-hidden-add.more.test.ts")));
  const seen = readFileSync(stub.record, "utf8");
  assert.match(seen, new RegExp(`^HOME=${join(dir, "home")}$`, "m"));
  assert.match(
    seen,
    /^ARGS=--rw --model prov\/model-x --thinking high --spec -$/m,
  );
  assert.match(seen, /^PWD=.*\/ws$/m);
  assert.match(seen, /^STDIN=files-allowed: \[src\/add.ts\]$/m);
  assert.match(seen, /^OUTER=0$/m);
});

test("the workspace is the base in a fresh one-commit repo", () => {
  const { rec } = trial(makeTask("hist"), "noop");
  const ws = join(rec.dir, "ws");
  assert.equal(git(ws, "rev-list", "--count", "HEAD"), "1");
  assert.equal(readFileSync(join(ws, "src/add.ts"), "utf8"), BUGGY);
  assert.ok(!existsSync(join(ws, "src/add.more.test.ts")));
});

test("a scout that does nothing fails; one naming the source repo leaks; one with no turns is infra", () => {
  const noop = trial(makeTask("noop"), "noop").rec;
  assert.deepEqual(
    [noop.pass, noop.sensors, noop.leak, noop.infra, noop.added],
    [false, "FAIL", false, false, 0],
  );
  const leak = trial(makeTask("leaky"), "leak").rec;
  assert.deepEqual([leak.leak, leak.infra], [true, false]);
  const quiet = trial(makeTask("quiet"), "silent");
  assert.equal(quiet.r.status, 0, quiet.r.stderr);
  assert.deepEqual(
    [
      quiet.rec.infra,
      quiet.rec.turns,
      quiet.rec.rc,
      quiet.rec.pass,
      quiet.rec.sensors,
    ],
    [true, 0, 1, false, null],
  );
});

test("a scout that passes the hidden tests but edits a file outside allowed fails, with that file in outside", () => {
  const { rec } = trial(makeTask("plus"), "fixplus");
  assert.ok(existsSync(join(rec.dir, "ws/src/zz-hidden-add.more.test.ts")));
  assert.equal(
    readFileSync(join(rec.dir, "test.txt"), "utf8").includes("fail 0"),
    true,
  );
  assert.deepEqual(
    [rec.pass, rec.outside, rec.wroteTest, rec.added],
    [false, ["NOTES.md"], false, 2],
  );
});

test("wroteTest is true when a changed path is a test path, and an allowed test file does not fail the trial", () => {
  const { rec } = trial(
    makeTask("owntest", { allowed: ["src/add.ts", "src/own.test.ts"] }),
    "fixtest",
  );
  assert.deepEqual([rec.pass, rec.outside, rec.wroteTest], [true, [], true]);
  const outside = trial(makeTask("owntest-out"), "fixtest").rec;
  assert.deepEqual(
    [outside.pass, outside.outside, outside.wroteTest],
    [false, ["src/own.test.ts"], true],
  );
});

test("link entries are symlinked from the source repo and are not counted as changes", () => {
  const { rec } = trial(makeTask("linked", { link: ["linked"] }), "fix");
  assert.deepEqual(rec.outside, []);
  assert.equal(readFileSync(join(rec.dir, "ws/linked/x.txt"), "utf8"), "x\n");
});

test("an expect-blocked task passes only when nothing changed and the digest names a blocker", () => {
  const task = makeTask("blk", {
    expect: "blocked",
    allowed: ["src/other.ts"],
  });
  const pass = trial(task, "blocked").rec;
  assert.equal(pass.pass, true);
  assert.ok(!existsSync(join(pass.dir, "test.txt")));
  assert.equal(trial(task, "noop").rec.pass, false);
  assert.equal(trial(task, "fix").rec.pass, false);
});

test("run_test: a test command that outlives EVAL_TEST_TIMEOUT is a failing test, not a hang", () => {
  const started = Date.now();
  const { r, rec } = trial(makeTask("slow", { test: "sleep 60" }), "fix", {
    EVAL_TEST_TIMEOUT: "2",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(
    Date.now() - started < 40000,
    "the trial waited for the test command",
  );
  assert.deepEqual([rec.pass, rec.infra], [false, false]);
  assert.match(
    readFileSync(join(rec.dir, "test.txt"), "utf8"),
    /timed out after 2s/,
  );
});

test("run_test: the test command runs under a scratch HOME and a reduced environment", () => {
  const { rec } = trial(
    makeTask("homey", {
      test: 'echo "HOME=$HOME"; echo "EVAL=$(env | grep -c ^EVAL_ || true)"; exit 1',
    }),
    "fix",
  );
  const out = readFileSync(join(rec.dir, "test.txt"), "utf8");
  const home = /^HOME=(.*)$/m.exec(out)?.[1] ?? "";
  assert.match(home, /\/agent-eval-test\.[A-Za-z0-9]+\/home$/);
  assert.notEqual(home, realHome);
  assert.notEqual(home, join(rec.dir, "home"));
  assert.match(out, /^EVAL=0$/m);
  assert.ok(
    !existsSync(resolve(home, "..")),
    "the scratch home is removed after the run",
  );
});

test("validate.sh: a hanging test command is INVALID after EVAL_TEST_TIMEOUT, not a hang", () => {
  const started = Date.now();
  const r = run("validate.sh", [makeTask("vslow", { test: "sleep 60" })], {
    EVAL_TEST_TIMEOUT: "1",
  });
  assert.ok(
    Date.now() - started < 40000,
    "validate waited for the test command",
  );
  assert.notEqual(r.status, 0);
  assert.match(
    r.stdout,
    /^INVALID vslow: hidden tests fail with the reference applied$/m,
  );
});

test("trial.sh review: a reviewer that outlives EVAL_REVIEW_TIMEOUT is recorded as infra with rc 124 and is not judged", () => {
  const turn = JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      usage: { input: 1, output: 1, cost: { total: 0.1 } },
      content: [],
    },
  });
  const marker = join(scratch, "judge-called");
  const reviewer = join(scratch, "stub-slow-reviewer");
  write(
    reviewer,
    `#!/usr/bin/env bash
mkdir -p "$HOME/.pi/agent/sessions/review"
printf '%s\\n' '${turn}' > "$HOME/.pi/agent/sessions/review/s.jsonl"
exec sleep 60
`,
    0o755,
  );
  const judge = join(scratch, "stub-judge");
  write(judge, `#!/usr/bin/env bash\ntouch ${marker}\n`, 0o755);
  const task = makeTask("rslow", {
    role: "review",
    rev: fixSha,
    defects: [{ id: "d1", text: "t", hit: "h" }],
  });
  const out = nextOut();
  const started = Date.now();
  const r = run("trial.sh", [task, "prov/model-x", "high", "1", out], {
    EVAL_REVIEW_PI: reviewer,
    EVAL_JUDGE_PI: judge,
    EVAL_REAL_HOME: realHome,
    EVAL_REVIEW_TIMEOUT: "2",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Date.now() - started < 40000, "the trial waited for the reviewer");
  const rec = JSON.parse(readFileSync(out, "utf8").trim());
  keep.push(rec.dir);
  assert.deepEqual(
    [rec.rc, rec.infra, rec.pass, rec.turns],
    [124, true, false, 1],
  );
  assert.equal(existsSync(marker), false);
});

/** A stub orch pi. It runs under env -i, so everything it needs is baked into the script. */
function makeOrchStub(
  name: string,
  reply: string,
  mode: "reply" | "silent" | "slow" = "reply",
): { path: string; record: string } {
  const path = join(scratch, `stub-orch-${name}`);
  const record = `${path}.record`;
  const usage = {
    input: 100,
    output: 20,
    cacheRead: 0,
    cacheWrite: 0,
    cost: { total: 0.01 },
  };
  const turn = JSON.stringify({
    type: "message",
    message: { role: "assistant", usage, content: [] },
  });
  const end = JSON.stringify({
    type: "message_end",
    message: { role: "assistant", content: [{ type: "text", text: reply }] },
  });
  write(
    path,
    `#!/usr/bin/env bash
{ echo "HOME=$HOME"; echo "PWD=$PWD"; echo "FILES=$(ls -A | wc -l | tr -d ' ')"; printf 'ARGC=%s\\n' "$#"; for a in "$@"; do printf 'ARG=%s\\n' "$a" | head -1; last="$a"; done; } > '${record}'
printf '%s' "$last" > '${record}.prompt'
d="$HOME/.pi/agent/sessions/orch/$$"; mkdir -p "$d"
if [ ${mode} = silent ]; then : > "$d/s.jsonl"; exit 1; fi
printf '%s\\n' '${turn}' > "$d/s.jsonl"
if [ ${mode} = slow ]; then exec sleep 60; fi
printf '%s\\n' '${end}'
`,
    0o755,
  );
  return { path, record };
}

function makeOrchTask(
  id: string,
  expect: string,
  scenario = "Slice 3 failed its first dispatch.\n",
): string {
  const dir = join(scratch, "tasks", id);
  write(
    join(dir, "task.json"),
    JSON.stringify({
      id,
      role: "orch",
      expect,
      rule: { lines: [86, 88], must: "a slice that does not pass its rework" },
    }),
  );
  write(join(dir, "scenario.md"), scenario);
  return dir;
}

function orchTrial(
  id: string,
  expect: string,
  reply: string,
  mode: "reply" | "silent" | "slow" = "reply",
  extra: Record<string, string> = {},
) {
  const stub = makeOrchStub(id, reply, mode);
  const out = nextOut();
  const r = run(
    "trial.sh",
    [
      makeOrchTask(id, expect, "Unique scenario text for " + id + ".\n"),
      "prov/model-x",
      "high",
      "2",
      out,
    ],
    { EVAL_ORCH_PI: stub.path, EVAL_REAL_HOME: realHome, ...extra },
  );
  const rec = existsSync(out)
    ? JSON.parse(readFileSync(out, "utf8").trim().split("\n").pop() ?? "null")
    : undefined;
  if (rec) keep.push(rec.dir);
  return { r, rec, stub };
}

test("trial.sh orch: a reply whose decision equals expect passes; record fields, empty workspace, -nt, isolated HOME", () => {
  const { r, rec, stub } = orchTrial(
    "o-stop",
    "stop",
    "DECISION: stop\nA slice that does not pass its rework stops the run.",
  );
  assert.equal(r.status, 0, r.stderr);
  const { dir, seconds, ...rest } = rec;
  assert.deepEqual(rest, {
    task: "o-stop",
    role: "orch",
    model: "prov/model-x",
    thinking: "high",
    trial: 2,
    pass: true,
    decision: "stop",
    expect: "stop",
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
  const seen = readFileSync(stub.record, "utf8");
  assert.match(seen, new RegExp(`^HOME=${join(dir, "home")}$`, "m"));
  assert.match(seen, /^PWD=.*\/ws$/m);
  assert.match(seen, /^FILES=0$/m);
  const args = seen
    .split("\n")
    .filter((l) => l.startsWith("ARG="))
    .map((l) => l.slice(4));
  assert.ok(args.includes("-nt"), args.join(" "));
  assert.deepEqual(args.slice(0, 3), ["-p", "--mode", "json"]);
  assert.deepEqual(
    args.slice(args.indexOf("--model"), args.indexOf("--model") + 4),
    ["--model", "prov/model-x", "--thinking", "high"],
  );
  const prompt = readFileSync(`${stub.record}.prompt`, "utf8");
  assert.match(prompt, /^You are the orchestrator of coding work/);
  assert.ok(prompt.includes("Unique scenario text for o-stop."));
  assert.ok(
    prompt.includes(
      readFileSync(join(EVAL_DIR, "fixtures/orch/rules.md"), "utf8").split(
        "\n",
      )[0],
    ),
  );
  assert.equal(
    readFileSync(join(dir, "prompt.txt"), "utf8").replace(/\n+$/, ""),
    prompt,
  ); // the argument comes from $(cat), which drops final newlines
  assert.match(readFileSync(join(dir, "reply.txt"), "utf8"), /^DECISION: stop/);
  assert.ok(existsSync(join(dir, "orch.jsonl")));
});

test("trial.sh orch: another decision fails and is recorded; a reply without a decision fails with decision null, not infra", () => {
  const wrong = orchTrial(
    "o-wrong",
    "stop",
    "DECISION: merge\nThe sensors passed.",
  ).rec;
  assert.deepEqual(
    [wrong.pass, wrong.decision, wrong.expect, wrong.infra],
    [false, "merge", "stop", false],
  );
  const none = orchTrial(
    "o-none",
    "stop",
    "I would stop here, because the rework failed.",
  ).rec;
  assert.deepEqual(
    [none.pass, none.decision, none.infra, none.turns],
    [false, null, false, 1],
  );
  const loose = orchTrial(
    "o-loose",
    "rework",
    "**DECISION: Rework** - append the reasons",
  ).rec;
  assert.deepEqual([loose.pass, loose.decision], [true, "rework"]);
});

test("trial.sh orch: no turns is infra; a call that outlives EVAL_ORCH_TIMEOUT is infra with rc 124", () => {
  const quiet = orchTrial("o-quiet", "stop", "", "silent");
  assert.equal(quiet.r.status, 0, quiet.r.stderr);
  assert.deepEqual(
    [
      quiet.rec.infra,
      quiet.rec.turns,
      quiet.rec.rc,
      quiet.rec.pass,
      quiet.rec.decision,
    ],
    [true, 0, 1, false, null],
  );
  const started = Date.now();
  const slow = orchTrial("o-slow", "stop", "DECISION: stop", "slow", {
    EVAL_ORCH_TIMEOUT: "2",
  });
  assert.equal(slow.r.status, 0, slow.r.stderr);
  assert.ok(Date.now() - started < 40000, "the trial waited for pi");
  assert.deepEqual(
    [slow.rec.rc, slow.rec.infra, slow.rec.pass, slow.rec.turns],
    [124, true, false, 1],
  );
});

test("trial.sh orch: a task without scenario.md exits 2", () => {
  const dir = makeOrchTask("o-noscn", "stop");
  rmSync(join(dir, "scenario.md"));
  const r = run("trial.sh", [dir, "m", "low", "1", join(scratch, "x.jsonl")]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /role not supported yet/);
});

test("usage errors and unsupported roles exit 2", () => {
  assert.equal(run("trial.sh", []).status, 2);
  assert.equal(
    run("trial.sh", ["no-such-task", "m", "low", "1", join(scratch, "x.jsonl")])
      .status,
    2,
  );
  assert.equal(
    run("trial.sh", [
      makeTask("badn"),
      "m",
      "low",
      "x",
      join(scratch, "x.jsonl"),
    ]).status,
    2,
  );
  const review = run("trial.sh", [
    makeTask("rev", { role: "review" }),
    "m",
    "low",
    "1",
    join(scratch, "x.jsonl"),
  ]);
  assert.equal(review.status, 2);
  assert.match(review.stderr, /role not supported yet/);
});

test("validate.sh: good is VALID; a hidden test passing on the base, or allowed files that do not fix it, are INVALID", () => {
  const good = run("validate.sh", [makeTask("vgood")]);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.equal(good.stdout.trim(), "VALID vgood");
  const bad = run("validate.sh", [
    makeTask("vbad", { hidden: ["src/add.test.ts"] }),
  ]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /^INVALID vbad: hidden tests pass on the base$/m);
  const nofix = run("validate.sh", [
    makeTask("vnofix", { allowed: ["src/add.test.ts"] }),
  ]);
  assert.notEqual(nofix.status, 0);
  assert.match(
    nofix.stdout,
    /^INVALID vnofix: hidden tests fail with the reference applied$/m,
  );
});

test("a git template dir without info/ does not break workspaces that have link entries", () => {
  const template = join(scratch, "empty-template");
  mkdirSync(template, { recursive: true });
  const r = run("validate.sh", [makeTask("vlink", { link: ["linked"] })], {
    GIT_TEMPLATE_DIR: template,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), "VALID vlink");
});

test("validate.sh: expect blocked needs a non-test change outside allowed", () => {
  const good = run("validate.sh", [
    makeTask("vblk", { expect: "blocked", allowed: ["src/other.ts"] }),
  ]);
  assert.equal(good.status, 0, good.stdout);
  assert.match(good.stdout, /^VALID vblk$/m);
  const bad = run("validate.sh", [
    makeTask("vblk2", {
      expect: "blocked",
      allowed: ["src/add.ts", "linked/x.txt"],
    }),
  ]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /^INVALID vblk2: /m);
});

test("validate.sh --all covers every task; zero tasks and unknown tasks behave", () => {
  const tasks = join(scratch, "all-tasks");
  for (const [id, over] of [
    ["a-ok", {}],
    ["b-bad", { hidden: ["src/add.test.ts"] }],
  ] as const) {
    write(
      join(tasks, id, "task.json"),
      readFileSync(join(makeTask(id, over), "task.json"), "utf8"),
    );
  }
  assert.equal(
    run("validate.sh", ["--all"], {
      EVAL_TASKS_DIR: join(scratch, "empty-tasks"),
    }).status,
    0,
  );
  const r = run("validate.sh", ["--all"], { EVAL_TASKS_DIR: tasks });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /^VALID a-ok$/m);
  assert.match(r.stdout, /^INVALID b-bad: /m);
  assert.equal(run("validate.sh", ["nope"]).status, 2);
  assert.equal(run("validate.sh", []).status, 2);
});

// ---- plan role: trial.sh, check-judges.sh, validate.sh ----
