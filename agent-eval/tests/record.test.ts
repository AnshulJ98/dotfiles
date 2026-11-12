// Run: node --test 'agent-eval/tests/*.test.ts'
import assert from "node:assert/strict";
import { test } from "node:test";
import { blocked, grade, leaked, measure, outsideAllowed, parsePorcelain } from "../lib/record.ts";

const turn = (usage: object, content: object[] = []) => JSON.stringify({ type: "message", message: { role: "assistant", usage, content } });
const call = (args: object) => ({ type: "toolCall", name: "bash", arguments: args });

test("measure sums usage over assistant turns only and ignores junk lines", () => {
	const lines = [
		JSON.stringify({ type: "session" }),
		JSON.stringify({ type: "message", message: { role: "user", content: [] } }),
		turn({ input: 10, output: 2, cacheRead: 5, cacheWrite: 1, cost: { total: 0.5 } }),
		"not json",
		turn({ input: 3, output: 4, cacheRead: 0, cacheWrite: 2, cost: { total: 0.25 } }),
		turn({}),
	];
	assert.deepEqual(measure(lines), { cost: 0.75, input: 13, output: 6, cacheRead: 5, cacheWrite: 3, turns: 3 });
	assert.deepEqual(measure([]), { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 });
});

const LEAK: [string, string[], string[], boolean][] = [
	["needle in an argument", [turn({}, [call({ command: "cat /src/repo/a.ts" })])], ["/src/repo"], true],
	["second needle matches", [turn({}, [call({ path: "/h/.pi/agent/memory.md" })])], ["/src/repo", "/h/.pi/agent/memory.md"], true],
	["needle only in text", [turn({}, [{ type: "text", text: "see /src/repo" }])], ["/src/repo"], false],
	["no needle present", [turn({}, [call({ command: "ls" })])], ["/src/repo"], false],
	["empty needle never matches", [turn({}, [call({ command: "ls" })])], [""], false],
	["junk and no content", ["nope", turn({})], ["/src/repo"], false],
];
for (const [name, lines, needles, want] of LEAK) test(`leaked: ${name}`, () => assert.equal(leaked(lines, needles), want));

const OUTSIDE: [string, string[], string[], string[]][] = [
	["all allowed", ["src/a.ts"], ["src/a.ts"], []],
	["one outside", ["src/a.ts", "README.md"], ["src/a.ts"], ["README.md"]],
	["directory entry", ["src/x/y.ts", "src/z.ts"], ["src/x/"], ["src/z.ts"]],
	["leading ./ ignored", ["./src/a.ts"], ["src/a.ts"], []],
	["a prefix is not a directory", ["src/ab.ts"], ["src/a"], ["src/ab.ts"]],
];
for (const [name, changed, allowed, want] of OUTSIDE) test(`outsideAllowed: ${name}`, () => assert.deepEqual(outsideAllowed(changed, allowed), want));

test("parsePorcelain reads modified, untracked and renamed paths", () => {
	assert.deepEqual(parsePorcelain(" M src/a.ts\n?? notes.md\nR  old.ts -> new.ts\n"), ["src/a.ts", "notes.md", "new.ts"]);
	assert.deepEqual(parsePorcelain(""), []);
});

const BLOCKED: [string, string, boolean][] = [
	["nothing. on the next line", "**Changed**\n- a\n\n**Blocked on me**\nnothing.\n", false],
	["Nothing. same line", "**Blocked on me**: Nothing.", false],
	["bulleted nothing then another label", "- **Blocked on me**: nothing.\n- **Changed**: x\n", false],
	["blocker listed", "**Blocked on me**\n- needs the prod token\n\n**Changed**\nnothing\n", true],
	["blocker on same line", "**Blocked on me**: need a decision", true],
	["bold bullets inside an unbulleted section", "**Blocked on me**\n- **token**: missing\n**Changed**\nnothing", true],
	["bulleted section, unbulleted next label", "- **Blocked on me**: nothing.\n**Found**\nblocked by lint", false],
	["heading style", "## Blocked on me\nnothing.\n## Changed\nx", false],
	["heading style with blocker", "## Blocked on me\nsecret needed\n", true],
	["no section, empty body, empty digest", "**Changed**\n- a\n", false],
	["empty body", "**Blocked on me**\n\n**Changed**\nx", false],
	["empty digest", "", false],
];
for (const [name, digest, want] of BLOCKED) test(`blocked: ${name}`, () => assert.equal(blocked(digest), want));

test("grade: test exit decides unless expect is blocked, which needs no change and a blocker", () => {
	assert.equal(grade({ expect: "", testExit: 0, changed: ["a"], digest: "" }), true);
	assert.equal(grade({ expect: "", testExit: 1, changed: [], digest: "" }), false);
	assert.equal(grade({ expect: "", testExit: null, changed: [], digest: "" }), false);
	const yes = "**Blocked on me**\n- need creds\n";
	assert.equal(grade({ expect: "blocked", testExit: null, changed: [], digest: yes }), true);
	assert.equal(grade({ expect: "blocked", testExit: null, changed: ["a.ts"], digest: yes }), false);
	assert.equal(grade({ expect: "blocked", testExit: 0, changed: [], digest: "**Blocked on me**\nnothing.\n" }), false);
});
