// Run: node --test 'config/pi/tests/*.test.ts'
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type BranchEntry,
  type Card,
  buildPrompt,
  factsFromBranch,
  fit,
  movesThis,
  proofChecker,
  renderBrief,
  renderCard,
  validateBrief,
  validateCard,
  WIDTH,
} from "../lib/where-card.ts";

const good = (): Card => ({
  rungs: [
    {
      level: "target",
      outcome: "/where cards are stable and honest",
      checks: [{ state: "open", text: "card tool merged", actions: [2] }],
    },
    {
      level: "slice",
      outcome: "where_card tool and renderer built",
      checks: [
        { state: "done", text: "spikes committed", proof: "0e0ca87" },
        {
          state: "reported",
          text: "tests green on winpc",
          where: "your 11-15 message",
        },
      ],
    },
    {
      level: "this",
      outcome: "renderer lays out 100 columns",
      checks: [
        { state: "doing", text: "renderer tests pass", actions: [1, 3] },
      ],
    },
  ],
  actions: [
    {
      n: 1,
      group: "I do next",
      text: "finish the renderer tests",
      needs: "needs nothing",
    },
    {
      n: 2,
      group: "needs you",
      text: "approve the merge",
      options: ["merge", "hold"],
      pick: "merge",
    },
    { n: 3, group: "waiting", text: "try it on a live session", until: "1" },
  ],
  ideas: "pin the card in a widget",
  reply: "2 merge: I merge and push",
});

const broken: [string, (c: Card) => void, RegExp][] = [
  ["target first", (c) => c.rungs.shift(), /first rung must be target/],
  ["order", (c) => c.rungs.reverse(), /in that order/],
  ["duplicate rung", (c) => c.rungs.push({ ...c.rungs[1] }), /appears twice/],
  ["empty rung", (c) => (c.rungs[1].checks = []), /has no check/],
  [
    "six checks",
    (c) =>
      (c.rungs[1].checks = Array.from({ length: 6 }, (_, i) => ({
        state: "done" as const,
        text: "x" + i,
        proof: "p",
      }))),
    /more than 5 checks/,
  ],
  ["done without proof", (c) => (c.rungs[1].checks[0].proof = " "), /no proof/],
  [
    "reported without where",
    (c) => delete c.rungs[1].checks[1].where,
    /does not say where/,
  ],
  [
    "open without action",
    (c) => (c.rungs[0].checks[0].actions = []),
    /no action closes it/,
  ],
  [
    "unknown action",
    (c) => (c.rungs[0].checks[0].actions = [2, 9]),
    /action 9, which does not exist/,
  ],
  [
    "orphan action",
    (c) => c.actions.push({ n: 4, group: "I do next", text: "x", needs: "y" }),
    /action 4 closes no open check/,
  ],
  ["duplicate number", (c) => (c.actions[2].n = 1), /share a number/],
  [
    "needs you without pick",
    (c) => delete c.actions[1].pick,
    /options and a pick/,
  ],
  [
    "I do next without needs",
    (c) => delete c.actions[0].needs,
    /needs "needs"/,
  ],
  ["waiting without until", (c) => delete c.actions[2].until, /no "until"/],
];

test("validateCard accepts a good card", () =>
  assert.deepEqual(validateCard(good()), []));
for (const [name, mutate, want] of broken) {
  test(`validateCard rejects: ${name}`, () => {
    const c = good();
    mutate(c);
    assert.match(validateCard(c).join("\n"), want);
  });
}
test("validateCard rejects more than 30 rows", () => {
  const done = Array.from({ length: 4 }, (_, i) => ({
    state: "done" as const,
    text: "x" + i,
    proof: "p",
  }));
  const c: Card = {
    rungs: (["target", "higher", "beyond", "slice", "this"] as const).map(
      (level, i) => ({
        level,
        outcome: level,
        checks: [
          ...done,
          { state: "open" as const, text: "o", actions: [i + 1] },
        ],
      }),
    ),
    actions: Array.from({ length: 5 }, (_, i) => ({
      n: i + 1,
      group: "I do next" as const,
      text: "y",
      needs: "z",
    })),
  };
  assert.match(validateCard(c).join("\n"), /the card has 36 rows; at most 30/);
  c.rungs = c.rungs.slice(0, 4); // 24 ladder rows + blank + 5 actions = 30: fits
  c.actions = c.actions.slice(0, 4);
  c.actions.push({
    n: 5,
    group: "needs you",
    text: "pick",
    options: ["a"],
    pick: "a",
  });
  c.rungs[3].checks[4].actions = [4, 5]; // the decision's options row makes 31
  assert.match(validateCard(c).join("\n"), /the card has 31 rows/);
});

test("renderCard: every row fits, marks and the action column line up, ● on the action moving this", () => {
  const c = good();
  c.rungs[0].outcome = "a very long outcome ".repeat(10);
  c.actions[0].text = "a very long action text ".repeat(6);
  const { text, unverified } = renderCard(c, (p) => p === "0e0ca87");
  const rows = text.split("\n");
  for (const r of rows)
    assert.ok([...r].length <= WIDTH, `${[...r].length}: ${r}`);
  assert.deepEqual(unverified, []);
  assert.match(text, /^target  ◇ a very long outcome .*…, done when:$/m);
  const checkRows = rows.filter((r) => /^ {10}[✓?▸☐] /.test(r));
  assert.equal(checkRows.length, 4);
  const rights = ["2", "0e0ca87", "your 11-15 message", "1 3"];
  const rightCols = checkRows.map((r, i) => r.lastIndexOf(rights[i]));
  assert.equal(new Set(rightCols).size, 1, checkRows.join("\n"));
  assert.match(text, /^I do next {3}1 ● a very long action text/m);
  assert.match(text, /^needs you {3}2 {3}approve the merge$/m);
  assert.match(text, /^ {16}merge · hold {2}my pick: merge$/m);
  assert.match(text, /^waiting {5}3 {3}try it on a live session +until 1$/m);
  assert.equal(rows[rows.findIndex((r) => r.startsWith("this")) + 2], "");
  assert.equal(movesThis(c), 1);
  const groupRows = rows
    .filter((r) => /^(needs you|I do next|waiting) /.test(r))
    .map((r) => r.slice(0, 9));
  assert.deepEqual(groupRows, ["needs you", "I do next", "waiting  "]);
});

test("renderCard shows a done check whose proof is not found as unverified", () => {
  const { text, unverified } = renderCard(good(), () => false);
  assert.deepEqual(unverified, ["spikes committed"]);
  assert.match(text, /^ {10}\? spikes committed +unverified: 0e0ca87$/m);
});

test("proofChecker: a sha from the log, a memory id, an existing path, or text from a tool result", () => {
  const facts = {
    userWords: [],
    gitStatus: "",
    gitLog: "0e0ca87 feat: spikes\nce5b696 fix: x",
    observations: [{ id: "3b77c08842cf", content: "c", relevance: "high" }],
    lastCard: null,
  };
  const known = proofChecker(
    facts,
    "tests 29 passed, 0 failed\n[main 7b394d7] feat: x",
    (p) => p === "config/pi/lib/where-card.ts",
  );
  const cases: [string, boolean][] = [
    ["0e0ca87", true],
    ["merged at 0e0ca87ffff", true],
    ["80cd2ae", false],
    ["7b394d7; pi list shows it", true],
    ["3b77c08842cf", true],
    ["config/pi/lib/where-card.ts:12", true],
    ["config/pi/lib/missing.ts", false],
    ["29 passed, 0 failed", true],
    ["51/51 on winpc", false],
    ["", false],
  ];
  for (const [proof, want] of cases) assert.equal(known(proof), want, proof);
});

test("fit cuts with an ellipsis and collapses whitespace", () => {
  assert.equal(fit("a  b\nc", 10), "a b c");
  assert.equal(fit("abcdefghij", 5), "abcd…");
});

test("brief: every row is required and laid out under a rule", () => {
  const b = {
    subject: "action 2: approve the merge",
    what: "merge",
    where: "feature/where-card",
    why: "ship",
    how: "git merge --no-ff",
    effort: "not sized",
    impact: "not sized",
    pick: "merge",
    context: "spikes w1",
  };
  assert.deepEqual(validateBrief(b), []);
  assert.match(validateBrief({ ...b, why: "" }).join(), /"why"/);
  const rows = renderBrief(b).split("\n");
  assert.equal(rows.length, 9);
  assert.match(rows[0], /^── action 2: approve the merge ─+$/);
  assert.equal(rows[5], "effort   not sized");
});

const obs = (id: string, relevance: string) => ({
  id,
  content: "obs " + id,
  relevance,
  timestamp: "t",
  sourceEntryIds: ["x"],
  tokenCount: 3,
});
const msg = (
  role: string,
  content: unknown,
  extra: object = {},
): BranchEntry => ({
  type: "message",
  timestamp: "2026-11-16T10:00:00Z",
  message: { role, content, ...extra },
});

test("factsFromBranch reads pi-blackhole 0.5.18 ledger entries, user words, tool text and the last card", () => {
  const entries: BranchEntry[] = [
    { type: "session", timestamp: "2026-11-16T09:00:00Z" },
    msg("user", "first ask"),
    {
      type: "custom",
      customType: "om.observations.recorded",
      data: {
        coversFromId: "a",
        coversUpToId: "b",
        observations: [
          obs("aaaaaaaaaaaa", "high"),
          obs("bbbbbbbbbbbb", "low"),
          obs("cccccccccccc", "critical"),
        ],
      },
    },
    msg("toolResult", [{ type: "text", text: "29 passed" }], {
      toolName: "bash",
    }),
    msg("toolResult", [{ type: "text", text: "card A" }], {
      toolName: "where_card",
      details: { kind: "card", text: "card A" },
    }),
    {
      type: "custom",
      customType: "om.observations.dropped",
      data: { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "c" },
    },
    msg("user", [{ type: "text", text: "second ask" }]),
    msg("user", "third"),
    msg("user", "fourth"),
  ];
  const f = factsFromBranch(entries);
  assert.deepEqual(f.userWords, ["second ask", "third", "fourth"]);
  assert.deepEqual(
    f.observations.map((o) => o.id),
    ["cccccccccccc"],
  );
  assert.equal(f.lastCard, "card A");
  assert.match(f.toolText, /29 passed/);
  assert.equal(f.since, "2026-11-16T09:00:00Z");
  const after = factsFromBranch([...entries, { type: "compaction" }]);
  assert.equal(after.lastCard, null);
  assert.equal(after.anyCard, "card A");
});

test("buildPrompt anchors to the last card only when there is one, and asks for a brief on expand", () => {
  const facts = {
    userWords: ["ship it"],
    gitStatus: "## main",
    gitLog: "0e0ca87 x",
    observations: [],
    lastCard: null,
  };
  const plain = buildPrompt("RULES", facts, "");
  assert.match(plain, /^\[\/where\]\n\nRULES/);
  assert.match(plain, /- ship it/);
  assert.doesNotMatch(plain, /Your last card/);
  assert.match(plain, /kind "card"/);
  const anchored = buildPrompt("RULES", { ...facts, lastCard: "CARD" }, "3");
  assert.match(anchored, /Keep each rung's wording[\s\S]*CARD/);
  assert.match(anchored, /Expand: 3\. Call where_card once with kind "brief"/);
});
