// Run: node --test 'agent-eval/tests/*.test.ts'
// validate.sh and make_workspace for review tasks with patches, against stub pi binaries: no model, no tokens.
import "../../config/pi/tests/hermetic.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  scratch,
  run,
  write,
  git,
  DEFECTS,
  makeTask,
  id,
  patchedTask,
  workspace,
} from "./review-harness.ts";

test("validate.sh: a review task is VALID when the workspace builds, the prompt's files exist and defects are complete", () => {
  const good = run("validate.sh", [makeTask("vr-good")]);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.equal(good.stdout.trim(), "VALID vr-good");
  const bad: [string, Record<string, unknown>, string | undefined, RegExp][] = [
    [
      "a file the prompt names is missing",
      {},
      "Review booking/src/missing.ts\n",
      /missing from the workspace: booking\/src\/missing.ts/,
    ],
    [
      "a file the prompt names was excluded",
      {},
      "Review README.md\n",
      /missing from the workspace: README.md/,
    ],
    ["the prompt names no file", {}, "Review the code\n", /names no file/],
    ["no defects", { defects: [] }, undefined, /non-empty list/],
    [
      "a defect without a hit",
      { defects: [{ id: "d1", text: "t" }] },
      undefined,
      /non-empty list/,
    ],
    [
      "duplicate ids",
      { defects: [DEFECTS[0], DEFECTS[0]] },
      undefined,
      /not unique/,
    ],
    [
      "a rev that does not exist",
      { rev: "0".repeat(40) },
      undefined,
      /cannot build/,
    ],
    [
      "an exclude path outside the workspace",
      { exclude: ["../x"] },
      undefined,
      /cannot build/,
    ],
  ];
  for (const [name, over, prompt, reason] of bad) {
    const r = run("validate.sh", [makeTask("vr-bad", over, prompt)]);
    assert.notEqual(r.status, 0, name);
    assert.match(r.stdout, new RegExp("^INVALID vr-bad: .*"), name);
    assert.match(r.stdout, reason, name);
  }
});

// ---- injected review patches ----

test("make_workspace: patches are ordered, applied after excludes and hidden in a clean single commit", () => {
  const task = patchedTask("wp", {
    paths: undefined,
    patches: ["a.patch", "next.patch"],
  });
  write(
    join(task, "next.patch"),
    readFileSync(join(task, "a.patch"), "utf8")
      .replace("-export const a = 1;", "-export const a = 9;")
      .replace("+export const a = 9;", "+export const a = 7;"),
  );
  const ws = join(scratch, "patched-ws");
  const r = workspace(task, ws);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    readFileSync(join(ws, "booking/src/a.ts"), "utf8"),
    "export const a = 7;\n",
  );
  assert.ok(!existsSync(join(ws, "README.md")));
  assert.equal(git(ws, "status", "--porcelain"), "");
  assert.equal(git(ws, "rev-list", "--count", "HEAD"), "1");
  assert.deepEqual(git(ws, "ls-files").split("\n"), [
    "booking/src/a.ts",
    "booking/src/b.ts",
  ]);
});

test("make_workspace: a failing or unsafe patch is non-zero and named", () => {
  for (const patch of [
    "missing.patch",
    "../a.patch",
    "/tmp/a.patch",
    "bad.patch",
  ]) {
    const task = patchedTask("wp-bad", { patches: [patch] });
    write(join(task, "bad.patch"), "not a patch\n");
    const r = workspace(task, join(scratch, "bad-ws-" + id()));
    assert.notEqual(r.status, 0, patch);
    assert.ok(r.stderr.includes(patch), r.stderr);
  }
  const task = patchedTask("wp-excluded", {
    exclude: ["booking/src/a.ts"],
    patches: ["a.patch"],
  });
  const r = workspace(task, join(scratch, "excluded-ws"));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /a.patch/);
});

test("validate.sh: review patches each fail tests alone on a full tree, with links", () => {
  const r = run("validate.sh", [patchedTask("vp-good")]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), "VALID vp-good");
});

test("validate.sh: rejects unproven review patches with the reason and patch name", () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ["passing", { test: "test -f README.md" }, /a.patch.*tests pass/],
    [
      "only-a",
      { test: "test -f README.md && grep -q 'a = 1' booking/src/a.ts" },
      /b.patch.*tests pass/,
    ],
    ["excluded", { exclude: ["booking/src/a.ts"] }, /cannot build.*a.patch/s],
    ["baseline", { test: "exit 1" }, /tests fail.*without patches/],
    ["missing-test", { test: undefined }, /patches.*test/],
    ["apply", { patches: ["missing.patch"] }, /missing.patch.*apply/],
    ["together", { patches: ["a.patch", "a.patch"] }, /a.patch.*apply/],
    [
      "timeout",
      { test: "grep -q 'a = 1' booking/src/a.ts || sleep 10" },
      /a.patch.*test.*124/,
    ],
  ];
  for (const [id, over, reason] of cases) {
    const r = run("validate.sh", [patchedTask("vp-" + id, over)], {
      EVAL_TEST_TIMEOUT: "1",
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^INVALID vp-/);
    assert.match(r.stdout, reason);
  }
});

// ---- check-judges.sh ----
