// Run: node --test 'agent-eval/tests/*.test.ts'
// check-judges.sh for review and facts tasks, against stub judges: no model, no tokens.
import "../../config/pi/tests/hermetic.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  realHome,
  run,
  makeTask,
  YES,
  SMART,
  id,
  makePi,
  judge,
  factsTask,
} from "./review-harness.ts";

test("check-judges.sh: judges that agree with the known answers exit 0, one line per defect", () => {
  const pi = makePi({ a: SMART, b: SMART });
  const r = run("check-judges.sh", [makeTask("cj-good")], {
    EVAL_JUDGE_PI: pi.path,
    EVAL_REAL_HOME: realHome,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 3);
  lines.forEach((line, i) =>
    assert.equal(
      line,
      "d" + (i + 1) + " hit: a=yes b=yes; decoys only: a=no b=no; ok",
    ),
  );
  assert.equal(pi.seen("extract"), undefined);
});

test("check-judges.sh: a judge that always says yes, or one that cannot answer, exits 1 and names the defects it missed", () => {
  const yes = run("check-judges.sh", [makeTask("cj-yes")], {
    EVAL_JUDGE_PI: makePi({ a: SMART, b: YES }).path,
    EVAL_REAL_HOME: realHome,
  });
  assert.equal(yes.status, 1, yes.stdout + yes.stderr);
  assert.equal(
    yes.stdout
      .trim()
      .split("\n")
      .filter((l) => l.endsWith("; MISS")).length,
    3,
  );
  assert.match(
    yes.stdout,
    /^d1 hit: a=yes b=yes; decoys only: a=no b=yes; MISS$/m,
  );
  const mute = run("check-judges.sh", [makeTask("cj-mute")], {
    EVAL_JUDGE_PI: makePi({ a: SMART }).path,
    EVAL_REAL_HOME: realHome,
  });
  assert.equal(mute.status, 1);
  assert.match(
    mute.stdout,
    /^d1 hit: a=yes b=none; decoys only: a=no b=none; MISS$/m,
  );
  assert.equal(run("check-judges.sh", []).status, 2);
  assert.equal(run("check-judges.sh", ["no-such-task"]).status, 2);
});

test("check-judges.sh: a facts task and a review task each get one ok line per item; a judge that says yes to everything exits 1", () => {
  const env2 = (pi: string) => ({
    EVAL_JUDGE_PI: pi,
    EVAL_REAL_HOME: realHome,
  });
  const good = makePi({ a: SMART, b: SMART });
  const factsPi = makePi({ a: SMART, b: SMART });
  const facts = run(
    "check-judges.sh",
    [factsTask("cjf-good")],
    env2(factsPi.path),
  );
  assert.equal(facts.status, 0, facts.stdout + facts.stderr);
  const lines = facts.stdout.trim().split("\n");
  assert.equal(lines.length, 3);
  lines.forEach((line, i) =>
    assert.equal(
      line,
      "f" + (i + 1) + " hit: a=yes b=yes; decoys only: a=no b=no; ok",
    ),
  );
  const review = run(
    "check-judges.sh",
    [makeTask("cjr-good")],
    env2(good.path),
  );
  assert.equal(review.status, 0, review.stdout + review.stderr);
  assert.equal(
    review.stdout
      .trim()
      .split("\n")
      .filter((l) => l.endsWith("; ok")).length,
    3,
  );
  // the facts hit run's subject is the hit text and the decoys, one per line; the decoys run's is the decoys alone
  assert.match(
    factsPi.seen("a")!.at(-1)!,
    /<answer>\ndecoy claim one\ndecoy claim two\n<\/answer>/,
  );
  for (const task of [factsTask("cjf-yes"), makeTask("cjr-yes")]) {
    const yes = run(
      "check-judges.sh",
      [task],
      env2(makePi({ a: YES, b: YES }).path),
    );
    assert.equal(yes.status, 1, yes.stdout + yes.stderr);
    assert.equal(
      yes.stdout
        .trim()
        .split("\n")
        .filter((l) => l.endsWith("; MISS")).length,
      3,
    );
  }
});

test("check-judges.sh: decoys come from the task; fewer than two, or none, or a task with no items exits 2 with a message", () => {
  for (const [name, over] of [
    ["none", { decoys: undefined }],
    ["one", { decoys: ["only"] }],
    ["not strings", { decoys: ["a", 2] }],
  ] as const) {
    for (const make of [
      (id: string) => makeTask(id, over),
      (id: string) => factsTask(id, over),
    ]) {
      const r = run("check-judges.sh", [make("cjd-" + name + id())], {
        EVAL_JUDGE_PI: makePi({ a: SMART, b: SMART }).path,
        EVAL_REAL_HOME: realHome,
      });
      assert.equal(r.status, 2, name);
      assert.match(r.stderr, /decoys/, name);
    }
  }
  assert.equal(
    run("check-judges.sh", [makeTask("cjd-items", { defects: undefined })])
      .status,
    2,
  );
});
