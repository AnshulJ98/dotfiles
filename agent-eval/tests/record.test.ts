// Run: node --test 'agent-eval/tests/*.test.ts'
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { blocked, grade, gradeReview, isReviewTimeout, isTestPath, judgeScout, leaked, measure, outsideAllowed, parseJudged, parsePorcelain, wroteTest } from "../lib/record.ts";

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

test("parsePorcelain unquotes git's C-quoted paths, also on both sides of a rename", () => {
	const table: [string, string[]][] = [
		['?? "my notes/a b.ts"\n', ["my notes/a b.ts"]],
		['R  "old name.ts" -> "new name.ts"\n', ["new name.ts"]],
		['R  old.ts -> "new name.ts"\n', ["new name.ts"]],
		['?? "caf\\303\\251.md"\n', ["caf\u00e9.md"]],
		['?? "tab\\there.txt"\n?? "q\\"uote\\\\.txt"\n', ["tab\there.txt", 'q"uote\\.txt']],
		[' M plain.ts\n', ["plain.ts"]],
	];
	for (const [porcelain, want] of table) assert.deepEqual(parsePorcelain(porcelain), want, porcelain);
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
	["none", "**Blocked on me**\nnone\n", false],
	["None. on the same line", "**Blocked on me**: None.", false],
	["N/A", "**Blocked on me**\nN/A\n**Changed**\nx", false],
	["n/a.", "- **Blocked on me**: n/a.\n- **Changed**: x", false],
	["No blockers.", "## Blocked on me\nNo blockers.\n## Changed\nx", false],
	["no blockers, no period", "**Blocked on me**: no blockers", false],
	["Nothing, capitalised, in a bullet", "**Blocked on me**\n- Nothing\n", false],
	["none of, then a reason, is a blocker", "**Blocked on me**: none of the credentials work", true],
	["no blockers on the build, but one elsewhere", "**Blocked on me**\nno blockers on the build; need a token for deploy", true],
];
for (const [name, digest, want] of BLOCKED) test(`blocked: ${name}`, () => assert.equal(blocked(digest), want));

test("grade: test exit decides unless expect is blocked, which needs no change and a blocker", () => {
	assert.equal(grade({ expect: "", testExit: 0, changed: ["a"], outside: [], digest: "" }), true);
	assert.equal(grade({ expect: "", testExit: 1, changed: [], outside: [], digest: "" }), false);
	assert.equal(grade({ expect: "", testExit: null, changed: [], outside: [], digest: "" }), false);
	const yes = "**Blocked on me**\n- need creds\n";
	assert.equal(grade({ expect: "blocked", testExit: null, changed: [], outside: [], digest: yes }), true);
	assert.equal(grade({ expect: "blocked", testExit: null, changed: ["a.ts"], outside: [], digest: yes }), false);
	assert.equal(grade({ expect: "blocked", testExit: 0, changed: [], outside: [], digest: "**Blocked on me**\nnothing.\n" }), false);
});

const yesBlocker = "**Blocked on me**\n- need creds\n";
const GRADE: [string, Parameters<typeof grade>[0], boolean][] = [
	["tests pass, nothing outside", { expect: "", testExit: 0, changed: ["a.ts"], outside: [], digest: "" }, true],
	["tests pass, a file outside allowed", { expect: "", testExit: 0, changed: ["a.ts", "NOTES.md"], outside: ["NOTES.md"], digest: "" }, false],
	["tests fail, nothing outside", { expect: "", testExit: 1, changed: ["a.ts"], outside: [], digest: "" }, false],
	["tests fail and a file outside", { expect: "", testExit: 1, changed: ["a.ts", "b.md"], outside: ["b.md"], digest: "" }, false],
	["no test run, nothing outside", { expect: "", testExit: null, changed: [], outside: [], digest: "" }, false],
	["blocked: nothing changed, blocker named", { expect: "blocked", testExit: null, changed: [], outside: [], digest: yesBlocker }, true],
	["blocked: a change", { expect: "blocked", testExit: null, changed: ["x.ts"], outside: ["x.ts"], digest: yesBlocker }, false],
	["blocked: no blocker named", { expect: "blocked", testExit: null, changed: [], outside: [], digest: "**Blocked on me**\nnothing.\n" }, false],
];
for (const [name, g, want] of GRADE) test(`grade: ${name}`, () => assert.equal(grade(g), want));

const TEST_PATHS: [string, boolean][] = [
	["tests/a.ts", true], ["src/tests/a.ts", true], ["a/b/tests/c/d.ts", true], ["__tests__/a.ts", true], ["x/__tests__/a.ts", true],
	["tests/", true], ["a.test.ts", true], ["src/a.spec.js", true], ["src/a_test.go", true], [".test.ts", true], ["a.test.", true],
	["src/tests", false], ["tests", false], ["mytests/a.ts", false], ["src/latest/a.ts", false], ["src/contest.ts", false], ["a.tests.ts", false],
	["a.test", false], ["atest.ts", false], ["src/a.ts", false], ["test/a.ts", false], ["lib/spec/a.ts", false], ["a_tests.go", false],
];
test("isTestPath: the table", () => {
	for (const [path, want] of TEST_PATHS) assert.equal(isTestPath(path), want, path);
});
test("isTestPath agrees with is_test_path in lib/task.sh on the same table", () => {
	const script = 'source "$1"; shift; for p in "$@"; do if is_test_path "$p"; then echo 1; else echo 0; fi; done';
	const r = spawnSync("bash", ["-c", script, "bash", resolve(import.meta.dirname, "../lib/task.sh"), ...TEST_PATHS.map(([p]) => p)], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(r.stdout.trim().split("\n").map((x) => x === "1"), TEST_PATHS.map(([, want]) => want));
});

const WROTE: [string, string[], boolean][] = [
	["nothing changed", [], false],
	["only source", ["src/a.ts", "README.md"], false],
	["a test file", ["src/a.ts", "src/a.test.ts"], true],
	["a file under tests/", ["tests/helper.ts"], true],
	["a new test beside the original", ["src/a_test.go"], true],
	["a lookalike name", ["src/contest.ts", "docs/tests.md"], false],
];
for (const [name, changed, want] of WROTE) test(`wroteTest: ${name}`, () => assert.equal(wroteTest(changed), want));

test("a judge.json with found < of and pass true is a pass; without pass it is not, whatever found says", () => {
	const minorMissed = parseJudged('{"found":4,"of":5,"met":["d1","d2","d3","d4"],"pass":true,"disagreements":[],"judgeCost":0.1,"infra":false}');
	assert.deepEqual([minorMissed.found, minorMissed.of, minorMissed.pass, gradeReview(minorMissed)], [4, 5, true, true]);
	const allFound = parseJudged('{"found":5,"of":5,"disagreements":[],"judgeCost":0.1,"infra":false}');
	assert.deepEqual([allFound.found, allFound.of, gradeReview(allFound)], [5, 5, false]);
	assert.equal(gradeReview(parseJudged('{"found":5,"of":5,"pass":true,"disagreements":[],"judgeCost":0,"infra":true}')), false);
});

test("a review timeout is rc 124, or 137 when the child ignored TERM and timeout -k killed it", () => {
	assert.deepEqual([124, 137, 0, 1, 143].map(isReviewTimeout), [true, true, false, false, false]);
});

test("judgeScout: judge.json is used for a non-empty digest; an empty digest is a fail with nothing found over the task's facts, not infra", () => {
	const json = '{"found":3,"of":3,"met":["a","b","c"],"pass":true,"disagreements":["b"],"judgeCost":0.4,"infra":false}';
	assert.deepEqual(judgeScout("The answer.\n", json, 3), { found: 3, of: 3, pass: true, disagreements: ["b"], judgeCost: 0.4, infra: false });
	// an empty or blank digest ignores whatever judge.json says
	for (const digest of ["", " \n\t\n"]) assert.deepEqual(judgeScout(digest, json, 3), { found: 0, of: 3, pass: false, disagreements: [], judgeCost: 0, infra: false });
	assert.deepEqual(judgeScout("", "", 3), { found: 0, of: 3, pass: false, disagreements: [], judgeCost: 0, infra: false });
	// a task with no facts has nothing to judge: infra either way
	assert.equal(judgeScout("", "", 0).infra, true);
	// a non-empty digest with a missing or unparseable judge.json is infra
	for (const bad of ["", "nope", "{}"]) assert.deepEqual(judgeScout("The answer.", bad, 3), { found: 0, of: 0, pass: false, disagreements: [], judgeCost: 0, infra: true });
	assert.equal(gradeReview(judgeScout("The answer.", json.replace('"pass":true,', ""), 3)), false);
});
