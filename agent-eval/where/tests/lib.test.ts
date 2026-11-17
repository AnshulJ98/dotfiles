// Run: node --test 'agent-eval/where/tests/*.test.ts'
import assert from "node:assert/strict";
import { test } from "node:test";
import { comparePair, parseCard, pickCuts, splice, stability } from "../lib.ts";

const CARD = [
  "```",
  "target  ◇ /where cards stay stable across runs, done when:",
  "          ☐ spike 0 measures run-to-run agreement           1",
  "slice   ▸ spike harness runs on real sessions, done when:",
  "          ✓ isolate drops the live blackhole                 tests/isolate.test.ts",
  "          ☐ corpus of 4 sessions cut                         2",
  "this    ● scorer parses a card, done when:",
  "          ▸ parseCard reads rungs, checks and actions",
  "",
  "needs you   1 ● pick the budget                 a · b          my pick: a",
  "I do next   2   cut the corpus                  needs nothing",
  "waiting     3   run spike 2                     until 2",
  "ideas       none",
  "reply       1a: I start 2",
  "```",
].join("\n");

test("parseCard reads rungs, checks, actions and layout faults", () => {
  const c = parseCard(CARD);
  assert.deepEqual(
    c.rungs.map((r) => r.rung),
    ["target", "slice", "this"],
  );
  assert.equal(c.rungs[0].text, "/where cards stay stable across runs");
  assert.deepEqual(
    c.checks.map((x) => x.mark),
    ["☐", "✓", "☐", "▸"],
  );
  assert.equal(c.checks[1].right, "tests/isolate.test.ts");
  assert.deepEqual(
    c.actions.map((a) => [a.n, a.group, a.text]),
    [
      [1, "needs you", "pick the budget"],
      [2, "I do next", "cut the corpus"],
      [3, "waiting", "run spike 2"],
    ],
  );
  assert.equal(c.openWithoutAction, 1);
  assert.equal(c.outside, 0);
  assert.equal(c.longRows, 0);
  assert.equal(parseCard("text before\n" + CARD + "\nafter").outside, 2);
  assert.equal(parseCard("no card").parsed, false);
});

test("a card compared with itself agrees on everything; a renumbered one does not", () => {
  const c = parseCard(CARD);
  assert.deepEqual(comparePair(c, c), {
    sameRungs: true,
    rungSim: 1,
    checkSim: 1,
    markAgree: 1,
    actionSim: 1,
    numberAgree: 1,
  });
  const renum = parseCard(
    CARD.replace("1 ● pick", "4 ● pick").replace("2   cut", "1   cut"),
  );
  assert.equal(comparePair(c, renum).numberAgree, 1 / 3);
  const s = stability([c, c, parseCard("no card")]);
  assert.equal(s.parsed, 2);
  assert.equal(s.sameRungs, 1);
});

const L = (o: object) => JSON.stringify(o);
const u = (id: string, p: string) =>
  L({
    type: "message",
    id,
    parentId: p,
    message: { role: "user", content: "q" + id },
  });
const a = (id: string, p: string) =>
  L({
    type: "message",
    id,
    parentId: p,
    message: { role: "assistant", content: [{ type: "text", text: "a" + id }] },
  });

test("pickCuts finds the first compaction with 3 user turns before and 5 after", () => {
  const lines = [L({ type: "session" })];
  let p = "r";
  const add = (l: string, id: string) => {
    lines.push(l);
    p = id;
  };
  for (let i = 0; i < 3; i++) {
    add(u("u" + i, p), "u" + i);
    add(a("a" + i, p), "a" + i);
  }
  add(L({ type: "compaction", id: "c", parentId: p }), "c");
  for (let i = 3; i < 9; i++) {
    add(u("u" + i, p), "u" + i);
    add(a("a" + i, p), "a" + i);
  }
  const c = pickCuts(lines)!;
  assert.equal(lines[c.aCross].includes('"u1"'), true);
  assert.equal(lines[c.aSame].includes('"u4"'), true);
  assert.equal(lines[c.b].includes('"u7"'), true);
  assert.equal(pickCuts(lines.slice(0, 10)), null);
});

test("splice re-parents the first original line after the extra entries", () => {
  const lines = [
    L({ type: "session" }),
    u("u0", "r"),
    a("a0", "u0"),
    u("u1", "a0"),
    a("a1", "u1"),
  ];
  const out = splice(lines, 3, 5, [u("w", "a0"), a("wa", "w")]);
  assert.equal(out.length, 7);
  assert.equal(JSON.parse(out[5]).parentId, "wa");
  assert.equal(out[6], lines[4]);
});
