// Run: node --test 'agent-eval/long/tests/*.test.ts'
// Pure helpers: no files, no processes.
import "../../../config/pi/tests/hermetic.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fillTemplate,
  patchBlackhole,
  rewritePaths,
  sessionCosts,
  usageTotals,
} from "../lib.ts";

const OPEN =
  'return (r,s,i)=>{let a=i?.sessionId,c=typeof a=="string"&&a.length>0?a:void 0;if(!c)return o(r,s,i);';
const CLOSE = "transformHeaders:YC(r,c,u)})}}function eh(e,t){";
const fakeDist =
  "import {appendFileSync}from'fs';function Qn(e,t){let o=(r,s,i)=>e(r,s,i);" +
  OPEN +
  "return o(r,s,{...i,headers:1," +
  CLOSE +
  "return 1}";

test("patchBlackhole: wraps the stream fn, logs usage, and is idempotent", async () => {
  const out = patchBlackhole(fakeDist);
  assert.ok(out.includes("EVAL PATCH"));
  assert.equal(patchBlackhole(out), out);
  // the patched module still parses
  await import(
    "data:text/javascript," + encodeURIComponent(out + ";export{Qn}")
  );
});

for (const [name, src] of [
  ["missing open anchor", fakeDist.replace(OPEN, "")],
  ["missing close anchor", fakeDist.replace(CLOSE, "")],
  ["duplicated open anchor", fakeDist + OPEN],
] as const) {
  test("patchBlackhole throws on " + name, () =>
    assert.throws(() => patchBlackhole(src), /pi-blackhole patch/),
  );
}

test("usageTotals: sums cost, counts calls without cost, skips blank, counts malformed", () => {
  const text = [
    JSON.stringify({ usage: { cost: { total: 0.25 } } }),
    "",
    JSON.stringify({ usage: {} }),
    "not json",
    JSON.stringify({ usage: { cost: { total: 0.5 } } }),
  ].join("\n");
  assert.deepEqual(usageTotals(text), { calls: 3, cost: 0.75, malformed: 1 });
  assert.deepEqual(usageTotals(""), { calls: 0, cost: 0, malformed: 0 });
});

test("sessionCosts: splits main and compaction cost, measures context after the first compaction", () => {
  const turn = (cost: number, ctx: number) =>
    JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        usage: {
          input: 0,
          cacheRead: ctx,
          cacheWrite: 0,
          cost: { total: cost },
        },
      },
    });
  const text = [
    JSON.stringify({ type: "session" }),
    turn(1, 100),
    JSON.stringify({ type: "message", message: { role: "user" } }),
    JSON.stringify({ type: "compaction", usage: { cost: { total: 0.4 } } }),
    turn(2, 30),
    turn(3, 50),
    JSON.stringify({ type: "compaction" }),
    "{broken",
  ].join("\n");
  assert.deepEqual(sessionCosts(text), {
    turns: 3,
    mainCost: 6,
    compactionCost: 0.4,
    compactions: 2,
    turnsAfterFirstCompaction: 2,
    avgContextAfterFirstCompaction: 40,
  });
  assert.equal(sessionCosts(text, 2).turns, 2); // skip the seed's lines
});

test("fillTemplate: fills, and refuses unknown or inherited keys", () => {
  assert.equal(
    fillTemplate("drop {{DROP}} now", { DROP: "E7" }),
    "drop E7 now",
  );
  assert.throws(() => fillTemplate("{{X}}", {}), /no value for \{\{X\}\}/);
  assert.throws(() => fillTemplate("{{CONSTRUCTOR}}", {}), /no value/);
});

test("rewritePaths: replaces every occurrence, ignores empty from", () => {
  assert.equal(
    rewritePaths("/a/seed x /a/seed/y", [
      ["/a/seed", "/b/arm"],
      ["", "z"],
    ]),
    "/b/arm x /b/arm/y",
  );
});
