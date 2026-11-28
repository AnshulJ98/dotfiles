// Run: node --test 'agent-eval/tests/*.test.ts'
// Pure review-grading helpers (lib/review.ts, lib/record.ts) and judge.sh / check-judges.sh / the review branch of
// trial.sh / validate.sh driven by stub pi binaries: no model, no tokens.
import "../../config/pi/tests/hermetic.ts";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { gradeReview, parseJudged } from "../lib/record.ts";
import {
  combine,
  finalReply,
  metIds,
  normalizeItems,
  numberDefects,
  parseFindings,
  parseVerdicts,
  passes,
  render,
} from "../lib/review.ts";
import {
  EVAL_DIR,
  scratch,
  shimHome,
  run,
  write,
  git,
  finding,
  FINDINGS,
  VERDICTS,
  ITEMS,
  SHIM,
  DEFECTS,
  FACTS,
  PROMPT,
  makeTask,
  type Role,
  YES,
  FOUND_ONE,
  id,
  record,
  judge,
  near,
  flag,
  factsTask,
  ANSWER,
  trial,
  workspace,
} from "./review-harness.ts";

for (const [name, text, want] of FINDINGS)
  test("parseFindings: " + name, () =>
    assert.deepEqual(parseFindings(text), want),
  );

for (const [name, text, n, want] of VERDICTS)
  test("parseVerdicts: " + name, () =>
    assert.deepEqual(parseVerdicts(text, n), want),
  );

test("combine: found needs both yes, a split is listed, agreeing no is not a disagreement, lengths must match", () => {
  const ids = ["d1", "d2", "d3"];
  assert.deepEqual(combine([true, true, true], [true, true, true], ids), {
    found: 3,
    disagreements: [],
  });
  assert.deepEqual(combine([true, true, false], [true, false, true], ids), {
    found: 1,
    disagreements: ["d2", "d3"],
  });
  assert.deepEqual(combine([true, false, false], [true, false, false], ids), {
    found: 1,
    disagreements: [],
  });
  assert.throws(() => combine([true], [true, false], ["d1", "d2"]), RangeError);
});

test("render replaces each placeholder once, leaves placeholders inside values alone; defects are numbered from 1", () => {
  assert.equal(
    render("a {{X}} b {{Y}} {{X}} {{Z}}", { X: "{{Y}}", Y: "y" }),
    "a {{Y}} b y {{Y}} {{Z}}",
  );
  assert.equal(
    numberDefects([
      { id: "d1", text: "one", hit: "h1" },
      { id: "d2", text: "two", hit: "h2" },
    ]),
    "1. one\n2. two",
  );
});

test("finalReply is the text of the last assistant message that has any", () => {
  const msg = (role: string, content: object[]) =>
    JSON.stringify({ type: "message_end", message: { role, content } });
  const text = (t: string) => ({ type: "text", text: t });
  const stream = [
    msg("user", [text("prompt")]),
    msg("assistant", [text("first")]),
    "not json",
    msg("assistant", [text("one"), { type: "toolCall" }, text("two")]),
    msg("assistant", [{ type: "toolCall" }]),
  ];
  assert.equal(finalReply(stream), "one\ntwo");
  assert.equal(finalReply([]), "");
});

test("parseJudged reads judge.sh's line, anything else is infra; a review passes only when judge.sh says pass", () => {
  const line =
    '{"found":3,"of":3,"met":["d1","d2","d3"],"pass":true,"disagreements":["d2"],"judgeCost":0.5,"infra":false}\n';
  assert.deepEqual(parseJudged(line), {
    found: 3,
    of: 3,
    pass: true,
    disagreements: ["d2"],
    judgeCost: 0.5,
    infra: false,
  });
  for (const bad of ["", "nope", '{"found":1}'])
    assert.deepEqual(parseJudged(bad), {
      found: 0,
      of: 0,
      pass: false,
      disagreements: [],
      judgeCost: 0,
      infra: true,
    });
  assert.equal(
    parseJudged(
      '{"found":3,"of":3,"disagreements":[],"judgeCost":0,"infra":false}',
    ).pass,
    false,
    "a judge.json without pass is not a pass",
  );
  const j = {
    found: 3,
    of: 3,
    pass: true,
    disagreements: [],
    judgeCost: 0,
    infra: false,
  };
  assert.deepEqual(
    [
      gradeReview(j),
      gradeReview({ ...j, pass: false }),
      gradeReview({ ...j, infra: true }),
      gradeReview({ ...j, found: 0, of: 0 }),
    ],
    [true, false, false, false],
  );
});

for (const [name, raw, want] of ITEMS) {
  test("normalizeItems: " + name, () => {
    if (want === undefined) assert.throws(() => normalizeItems(raw), Error);
    else assert.deepEqual(normalizeItems(raw), want);
  });
}

test("metIds lists the ids both judges said yes to, in item order; passes ignores minor items", () => {
  const ids = ["d1", "d2", "d3"];
  assert.deepEqual(metIds([true, true, false], [true, false, false], ids), [
    "d1",
  ]);
  assert.deepEqual(metIds([true, true, true], [true, true, true], ids), ids);
  assert.throws(() => metIds([true], [true, false], ["d1", "d2"]), RangeError);
  const items = [
    { id: "d1", text: "t", minor: false },
    { id: "d2", text: "t", minor: false },
    { id: "d3", text: "t", minor: true },
  ];
  const table: [string, string[], boolean, boolean][] = [
    ["all met", ["d1", "d2", "d3"], false, true],
    ["only the minor one missed", ["d1", "d2"], false, true],
    ["a non-minor one missed", ["d1", "d3"], false, false],
    ["nothing met", [], false, false],
    ["infra is never a pass", ["d1", "d2", "d3"], true, false],
  ];
  for (const [name, met, infra, want] of table)
    assert.equal(passes(items, met, infra), want, name);
  assert.equal(passes([], [], false), false, "no items is not a pass");
  assert.equal(
    passes([{ id: "m", text: "t", minor: true }], [], false),
    true,
    "only minor items, all missed, still passes",
  );
  assert.equal(
    passes(
      items.map((i) => ({ ...i, minor: false })),
      ["d1", "d2"],
      false,
    ),
    false,
    "without minor, a miss fails",
  );
});

// ---- stubs and fixtures ----
// A role with no reply configured fails (exit 1, no output, no session).

test("judge.sh: both judges yes on everything passes; bare flags, blinded prompts, costs, own session dirs", () => {
  const { r, pi, trial, out } = judge({ extract: FOUND_ONE, a: YES, b: YES });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(
    [out.found, out.of, out.disagreements, out.infra],
    [3, 3, [], false],
  );
  near(out.judgeCost, 0.31);
  assert.equal(
    readFileSync(join(trial, "judge.json"), "utf8").trim(),
    JSON.stringify(out),
  );
  const bare = [
    "-p",
    "-nt",
    "-ne",
    "-ns",
    "-np",
    "-nc",
    "--no-mcp",
    "--thinking",
    "medium",
  ];
  const models = {
    extract: "anthropic/claude-haiku-5-5",
    a: "anthropic/claude-opus-5-5",
    b: "openai-codex/gpt-6.1-sol",
  };
  for (const role of ["extract", "a", "b"] as const) {
    const args = pi.seen(role)!;
    assert.ok(args, role + " was not called");
    for (const f of bare) assert.ok(args.includes(f), role + " lacks " + f);
    assert.ok(
      !args.includes("--no-session") && !args.includes("-e"),
      role + " has --no-session or -e",
    );
    assert.equal(flag(args, "--model"), models[role]);
    assert.equal(
      flag(args, "--session-dir"),
      join(trial, "judge", role, "sessions"),
    );
    assert.equal(args[0], "HOME=" + join(trial, "judge/home"));
  }
  const extract = pi.seen("extract")!.at(-1)!;
  assert.match(extract, /The review text\./);
  assert.doesNotMatch(extract, /\{\{/);
  const a = pi.seen("a")!.at(-1)!;
  assert.equal(a, pi.seen("b")!.at(-1)!);
  assert.match(a, /claim one/);
  assert.match(a, /^1\. defect text 1$/m);
  assert.match(a, /^3\. defect text 3$/m);
  assert.doesNotMatch(a, /HITMARK|\{\{/);
});

test("judge.sh: the Anthropic auth shim is passed to every judge when it is installed", () => {
  const { pi, out } = judge(
    { extract: FOUND_ONE, a: YES, b: YES },
    { home: shimHome },
  );
  assert.equal(out.infra, false);
  for (const role of ["extract", "a", "b"] as const) {
    const args = pi.seen(role)!;
    assert.deepEqual(args.slice(args.indexOf("-ne"), args.indexOf("-ne") + 4), [
      "-ne",
      "-e",
      SHIM,
      "-ns",
    ]);
  }
});

test("judge.sh: judges split on d2 -> found 2 of 3, disagreement d2; both no on d2 is not a disagreement", () => {
  const split = judge({
    extract: FOUND_ONE,
    a: YES,
    b: '["yes","no","yes"]',
  }).out;
  assert.deepEqual(
    [split.found, split.of, split.disagreements, split.infra],
    [2, 3, ["d2"], false],
  );
  const agree = judge({
    extract: FOUND_ONE,
    a: '["yes","no","yes"]',
    b: '["yes","no","yes"]',
  }).out;
  assert.deepEqual(
    [agree.found, agree.disagreements, agree.infra],
    [2, [], false],
  );
});

test("judge.sh: an unparseable, short or missing judge reply, or a bad extraction, is infra", () => {
  const cases: [string, Partial<Record<Role, string>>][] = [
    ["prose reply", { extract: FOUND_ONE, a: YES, b: "I cannot decide." }],
    ["wrong length", { extract: FOUND_ONE, a: '["yes","yes"]', b: YES }],
    ["a judge that fails", { extract: FOUND_ONE, a: YES }],
    ["unparseable extraction", { extract: "no findings", a: YES, b: YES }],
  ];
  for (const [name, replies] of cases) {
    const { r, out } = judge(replies);
    assert.equal(r.status, 0, name + ": " + r.stderr);
    assert.deepEqual(
      [out.found, out.of, out.disagreements, out.infra],
      [0, 3, [], true],
      name,
    );
  }
  assert.equal(
    judge({ extract: "no findings", a: YES, b: YES }).pi.seen("a"),
    undefined,
    "judges run on a bad extraction",
  );
});

test("judge.sh: an empty or missing review is infra without any model call", () => {
  for (const review of ["  \n", undefined]) {
    const { r, pi, out } = judge(
      { extract: FOUND_ONE, a: YES, b: YES },
      { review },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      [out.found, out.of, out.infra, out.judgeCost],
      [0, 3, true, 0],
    );
    assert.equal(pi.seen("extract"), undefined);
  }
});

test("judge.sh --findings skips the extraction; invalid findings are infra; usage errors exit 2", () => {
  const findings = join(scratch, "findings-" + id() + ".json");
  write(findings, FOUND_ONE);
  const ok = judge(
    { a: YES, b: YES },
    { args: ["--findings", findings], review: undefined },
  );
  assert.deepEqual(
    [ok.out.found, ok.out.infra, ok.pi.seen("extract")],
    [3, false, undefined],
  );
  near(ok.out.judgeCost, 0.3);
  assert.match(ok.pi.seen("a")!.at(-1)!, /claim one/);
  write(findings, "nothing");
  assert.equal(
    judge(
      { a: YES, b: YES },
      { args: ["--findings", findings], review: undefined },
    ).out.infra,
    true,
  );
  assert.equal(run("judge.sh", []).status, 2);
  assert.equal(run("judge.sh", [scratch, join(scratch, "no-task")]).status, 2);
  assert.equal(
    run("judge.sh", [scratch, makeTask("jt-usage"), "--findings"]).status,
    2,
  );
});

test("judge.sh --extract-only: counts findings and high severity, extraction failures are infra, subject required", () => {
  const subject = join(scratch, "extract-subject.txt");
  write(subject, "A standalone review.\n");
  for (const [reply, findings, high, infra] of [
    [
      JSON.stringify([finding, finding, { ...finding, severity: "low" }]),
      3,
      2,
      false,
    ],
    ["[]", 0, 0, false],
    ["not JSON", 0, 0, true],
  ] as const) {
    const { r, pi, trial, out } = judge(
      { extract: reply },
      {
        task: makeTask("extract-" + id(), { defects: undefined }),
        args: ["--extract-only", "--subject", subject],
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(out, { findings, high, judgeCost: 0.01, infra });
    assert.equal(pi.seen("a"), undefined);
    assert.equal(pi.seen("b"), undefined);
    const args = pi.seen("extract")!;
    assert.equal(flag(args, "--model"), "anthropic/claude-haiku-5-5");
    assert.equal(args[0], "HOME=" + join(trial, "judge/home"));
    assert.equal(
      flag(args, "--session-dir"),
      join(trial, "judge/extract/sessions"),
    );
    assert.equal(
      args.at(-1),
      render(
        readFileSync(join(EVAL_DIR, "prompts/judge-extract.txt"), "utf8"),
        { REVIEW: "A standalone review.\n" },
      ).trimEnd(),
    );
  }
  assert.equal(judge({}, { args: ["--extract-only"] }).r.status, 2);
  for (const body of ["", " \n"]) {
    write(subject, body);
    const { out, pi } = judge(
      {},
      { args: ["--extract-only", "--subject", subject] },
    );
    assert.deepEqual(out, { findings: 0, high: 0, judgeCost: 0, infra: true });
    assert.equal(pi.seen("extract"), undefined);
  }
});

// ---- judge.sh kinds ----

test("judge.sh --kind facts: the digest is the subject, the task's facts are the items, no extractor call", () => {
  const { r, pi, trial, out } = judge(
    { a: YES, b: '["yes","no","yes"]' },
    {
      review: undefined,
      files: { "digest.txt": ANSWER },
      task: factsTask("jf-1"),
      args: ["--kind", "facts"],
    },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(Object.keys(out).sort(), [
    "disagreements",
    "found",
    "infra",
    "judgeCost",
    "met",
    "of",
    "pass",
  ]);
  assert.deepEqual(
    [out.found, out.of, out.met, out.disagreements, out.infra],
    [2, 3, ["f1", "f3"], ["f2"], false],
  );
  near(out.judgeCost, 0.3);
  assert.equal(pi.seen("extract"), undefined);
  assert.equal(
    readFileSync(join(trial, "judge.json"), "utf8").trim(),
    JSON.stringify(out),
  );
  const prompt = pi.seen("a")!.at(-1)!;
  assert.equal(prompt, pi.seen("b")!.at(-1)!);
  assert.match(prompt, /The answer says fact one and fact two\./);
  assert.match(prompt, /^1\. fact text 1$/m);
  assert.match(prompt, /^3\. fact text 3$/m);
  assert.match(prompt, /states specific known facts/);
  assert.doesNotMatch(prompt, /HITMARK|\{\{/);
});

test("judge.sh --kind rubric: --subject and --items are required; the items come from the file, the context is in the prompt", () => {
  const subject = join(scratch, "subject-" + id() + ".md");
  const itemsFile = join(scratch, "items-" + id() + ".json");
  const context = join(scratch, "context-" + id() + ".md");
  write(subject, "PLAN BODY\n");
  write(
    itemsFile,
    JSON.stringify([
      { id: "c1", text: "criterion one" },
      { id: "c2", text: "criterion two" },
      { id: "c3", text: "criterion three", minor: true },
    ]),
  );
  write(context, "BACKGROUND TEXT\n");
  const withCtx = judge(
    { a: YES, b: YES },
    {
      review: undefined,
      task: factsTask("jr-1"),
      args: [
        "--kind",
        "rubric",
        "--subject",
        subject,
        "--items",
        itemsFile,
        "--context",
        context,
      ],
    },
  );
  assert.deepEqual(
    [
      withCtx.out.found,
      withCtx.out.of,
      withCtx.out.met,
      withCtx.out.infra,
      withCtx.out.pass,
    ],
    [3, 3, ["c1", "c2", "c3"], false, true],
  );
  const prompt = withCtx.pi.seen("a")!.at(-1)!;
  assert.match(prompt, /<background>\nBACKGROUND TEXT\n<\/background>/);
  assert.match(prompt, /<document>\nPLAN BODY\n<\/document>/);
  assert.match(prompt, /^2\. criterion two$/m);
  assert.doesNotMatch(prompt, /fact text|\{\{/);
  assert.equal(withCtx.pi.seen("extract"), undefined);
  const noCtx = judge(
    { a: YES, b: YES },
    {
      review: undefined,
      task: factsTask("jr-2"),
      args: ["--kind", "rubric", "--subject", subject, "--items", itemsFile],
    },
  );
  assert.match(
    noCtx.pi.seen("a")!.at(-1)!,
    /<background>\n\(none\)\n<\/background>/,
  );
  const minorMissed = judge(
    { a: '["yes","yes","no"]', b: YES },
    {
      review: undefined,
      task: factsTask("jr-3"),
      args: ["--kind", "rubric", "--subject", subject, "--items", itemsFile],
    },
  ).out;
  assert.deepEqual(
    [
      minorMissed.found,
      minorMissed.met,
      minorMissed.disagreements,
      minorMissed.pass,
    ],
    [2, ["c1", "c2"], ["c3"], true],
  );
  const task = factsTask("jr-4");
  for (const args of [
    ["--kind", "rubric"],
    ["--kind", "rubric", "--subject", subject],
    ["--kind", "rubric", "--items", itemsFile],
  ]) {
    const t = join(scratch, "trial-" + id());
    mkdirSync(t);
    assert.equal(run("judge.sh", [t, task, ...args]).status, 2, args.join(" "));
  }
});

test("judge.sh --items replaces the task's list for any kind; met follows item order for review too", () => {
  const itemsFile = join(scratch, "items-" + id() + ".json");
  write(
    itemsFile,
    JSON.stringify([
      { id: "x1", text: "own one" },
      { id: "x2", text: "own two" },
    ]),
  );
  const r = judge(
    { a: '["no","yes"]', b: '["yes","yes"]' },
    {
      review: undefined,
      files: { "digest.txt": ANSWER },
      task: factsTask("ji-1"),
      args: ["--kind", "facts", "--items", itemsFile],
    },
  );
  assert.deepEqual(
    [r.out.found, r.out.of, r.out.met, r.out.disagreements, r.out.pass],
    [1, 2, ["x2"], ["x1"], false],
  );
  assert.match(r.pi.seen("a")!.at(-1)!, /^1\. own one$/m);
  const review = judge({
    extract: FOUND_ONE,
    a: '["no","yes","yes"]',
    b: '["yes","yes","yes"]',
  }).out;
  assert.deepEqual(
    [review.met, review.disagreements, review.pass],
    [["d2", "d3"], ["d1"], false],
  );
});

test("judge.sh: a review defect marked minor does not decide pass or fail", () => {
  const minor = (id: string) =>
    makeTask(id, {
      defects: DEFECTS.map((d, i) => (i === 2 ? { ...d, minor: true } : d)),
    });
  const onlyMinor = judge(
    { extract: FOUND_ONE, a: '["yes","yes","no"]', b: '["yes","yes","yes"]' },
    { task: minor("jm-1") },
  ).out;
  assert.deepEqual(
    [onlyMinor.found, onlyMinor.of, onlyMinor.pass, onlyMinor.infra],
    [2, 3, true, false],
  );
  const bothNo = judge(
    { extract: FOUND_ONE, a: '["yes","yes","no"]', b: '["yes","yes","no"]' },
    { task: minor("jm-2") },
  ).out;
  assert.deepEqual([bothNo.found, bothNo.pass], [2, true]);
  const nonMinor = judge(
    { extract: FOUND_ONE, a: '["no","yes","yes"]', b: '["yes","yes","yes"]' },
    { task: minor("jm-3") },
  ).out;
  assert.deepEqual([nonMinor.found, nonMinor.pass], [2, false]);
  const none = judge({ extract: FOUND_ONE, a: YES, b: YES }).out;
  assert.deepEqual([none.found, none.pass], [3, true]);
});

test("judge.sh kinds: an empty or missing subject, a missing or empty or bad item list, is infra without a model call; unknown kind or flag exits 2", () => {
  const noItems = factsTask("jx-1", { facts: undefined });
  const cases: [string, Parameters<typeof judge>[1]][] = [
    [
      "empty digest",
      {
        review: undefined,
        files: { "digest.txt": " \n" },
        task: factsTask("jx-0"),
        args: ["--kind", "facts"],
      },
    ],
    [
      "no digest",
      {
        review: undefined,
        task: factsTask("jx-00"),
        args: ["--kind", "facts"],
      },
    ],
    [
      "task without facts",
      {
        review: undefined,
        files: { "digest.txt": ANSWER },
        task: noItems,
        args: ["--kind", "facts"],
      },
    ],
    [
      "empty facts",
      {
        review: undefined,
        files: { "digest.txt": ANSWER },
        task: factsTask("jx-2", { facts: [] }),
        args: ["--kind", "facts"],
      },
    ],
    [
      "a fact without text",
      {
        review: undefined,
        files: { "digest.txt": ANSWER },
        task: factsTask("jx-3", { facts: [{ id: "f1" }] }),
        args: ["--kind", "facts"],
      },
    ],
    [
      "a --items file that is missing",
      {
        review: undefined,
        files: { "digest.txt": ANSWER },
        task: factsTask("jx-4"),
        args: ["--kind", "facts", "--items", join(scratch, "nope.json")],
      },
    ],
  ];
  for (const [name, opts] of cases) {
    const { r, pi, out } = judge({ a: YES, b: YES }, opts);
    assert.equal(r.status, 0, name + ": " + r.stderr);
    assert.deepEqual(
      [out.found, out.met, out.pass, out.infra, out.judgeCost, pi.seen("a")],
      [0, [], false, true, 0, undefined],
      name,
    );
  }
  const t = join(scratch, "trial-" + id());
  mkdirSync(t);
  for (const args of [
    ["--kind", "nope"],
    ["--kind"],
    ["--bogus", "x"],
    ["--kind", "facts", "--findings", "x.json"],
    ["extra"],
  ])
    assert.equal(
      run("judge.sh", [t, makeTask("jx-u"), ...args]).status,
      2,
      args.join(" "),
    );
});

test("the facts and rubric prompts hold the subject and the numbered items and never a hit sample", () => {
  const items = normalizeItems(FACTS);
  const list = numberDefects(items);
  assert.equal(list, "1. fact text 1\n2. fact text 2\n3. fact text 3");
  for (const name of ["judge-facts.txt", "judge-rubric.txt"]) {
    const text = render(readFileSync(join(EVAL_DIR, "prompts", name), "utf8"), {
      SUBJECT: "SUBJ",
      ITEMS: list,
      CONTEXT: "(none)",
    });
    assert.match(text, /SUBJ/, name);
    assert.ok(text.includes(list), name);
    assert.doesNotMatch(text, /HITMARK|\{\{/, name);
  }
});

// ---- trial.sh, review branch ----

test("trial.sh review: a review that finds everything passes; the record, the workspace at rev, the reviewer's flags", () => {
  const { r, rec, pi, out } = trial({
    reviewer: "REVIEW BODY",
    extract: FOUND_ONE,
    a: YES,
    b: YES,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(out, "utf8").trim().split("\n").length, 1);
  const { dir, seconds, judgeCost, ...rest } = rec;
  assert.deepEqual(rest, {
    task: rec.task,
    role: "review",
    model: "prov/model-x",
    thinking: "high",
    trial: 2,
    pass: true,
    found: 3,
    of: 3,
    disagreements: [],
    rc: 0,
    cost: 0.5,
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    turns: 1,
    leak: false,
    infra: false,
  });
  assert.equal(typeof seconds, "number");
  near(judgeCost, 0.31);
  assert.equal(readFileSync(join(dir, "review.txt"), "utf8"), "REVIEW BODY");
  const ws = join(dir, "ws");
  assert.equal(
    readFileSync(join(ws, "booking/src/a.ts"), "utf8"),
    "export const a = 1;\n",
  );
  for (const gone of ["README.md", "log.md", "booking/src/late.ts"])
    assert.ok(!existsSync(join(ws, gone)), gone + " is in the workspace");
  assert.equal(git(ws, "rev-list", "--count", "HEAD"), "1");
  const args = pi.seen("reviewer")!;
  assert.equal(args[0], "HOME=" + join(dir, "home"));
  assert.deepEqual(args.slice(1), [
    "-p",
    "--mode",
    "json",
    "--session-dir",
    join(dir, "home/.pi/agent/sessions/review"),
    "--model",
    "prov/model-x",
    "--thinking",
    "high",
    PROMPT.trim(),
  ]);
  assert.match(pi.seen("extract")!.at(-1)!, /REVIEW BODY/);
});

test("trial.sh review: a split judge fails the trial and names the disagreement; no review is infra, not a fail", () => {
  const split = trial({
    reviewer: "REVIEW BODY",
    extract: FOUND_ONE,
    a: YES,
    b: '["yes","no","yes"]',
  }).rec;
  assert.deepEqual(
    [split.pass, split.found, split.of, split.disagreements, split.infra],
    [false, 2, 3, ["d2"], false],
  );
  const quiet = trial({ extract: FOUND_ONE, a: YES, b: YES });
  assert.equal(quiet.r.status, 0, quiet.r.stderr);
  assert.deepEqual(
    [
      quiet.rec.pass,
      quiet.rec.infra,
      quiet.rec.turns,
      quiet.rec.rc,
      quiet.rec.found,
    ],
    [false, true, 0, 1, 0],
  );
  const judgeDown = trial({
    reviewer: "REVIEW BODY",
    extract: FOUND_ONE,
    a: "no",
    b: YES,
  }).rec;
  assert.deepEqual(
    [judgeDown.pass, judgeDown.infra, judgeDown.turns],
    [false, true, 1],
  );
});

test("trial.sh: a review task without rev is still unsupported", () => {
  const r = run("trial.sh", [
    makeTask("rt-norev", { rev: undefined }),
    "m",
    "low",
    "1",
    join(scratch, "x.jsonl"),
  ]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /role not supported yet/);
});

// ---- validate.sh, review tasks ----
