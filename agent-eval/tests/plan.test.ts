// Run: node --test 'agent-eval/tests/*.test.ts'
// Pure plan grading (lib/plan-grade.ts): assembling the worker spec from a planner's reply and the six mechanical checks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble, mechanical, renderPrompt } from "../lib/plan-grade.ts";

const BLOCK = "---\nfiles-allowed: [src/add.ts, src/add.test.ts]\ntests: npm test\n---";
const PLAN = [
	"**Goal**: make add add. See src/add.ts:2 and src/add.test.ts.",
	"",
	"1. Add a failing test in src/add.test.ts → check: npm test fails on the new test",
	"2. Change the operator in src/add.ts → check: npm test passes",
].join("\n");

test("assemble: a bare block, with the body after it", () => {
	const got = assemble(PLAN + "\n\n" + BLOCK + "\n");
	assert.deepEqual(got, { spec: BLOCK + "\n\n" + PLAN + "\n", body: PLAN });
});

test("assemble: a block inside a code fence loses the fence; text after the fence stays in the body", () => {
	const got = assemble(PLAN + "\n\n```\n" + BLOCK + "\n```\n\nTrailing note.\n");
	assert.equal(got?.body, PLAN + "\n\nTrailing note.");
	assert.equal(got?.spec, BLOCK + "\n\n" + PLAN + "\n\nTrailing note.\n");
	assert.equal(got?.spec.includes("```"), false);
	assert.equal(assemble("```yaml\n" + BLOCK + "\n```\n" + PLAN)?.body, PLAN);
});

test("assemble: the last block wins; a horizontal rule after it, or before the plan, does not confuse it", () => {
	const other = "---\nfiles-allowed: [old.ts]\ntests: x\n---";
	assert.match(assemble(other + "\n\n" + PLAN + "\n\n" + BLOCK)?.spec ?? "", /^---\nfiles-allowed: \[src\/add.ts, src\/add.test.ts\]/);
	assert.equal(assemble(other + "\n\n" + PLAN + "\n\n" + BLOCK)?.body.includes("old.ts"), true);
	assert.equal(assemble("Intro\n\n---\n\n" + PLAN + "\n\n```\n" + BLOCK + "\n```\n\n---\n")?.spec.startsWith(BLOCK + "\n\n"), true);
	assert.equal(assemble("---\n" + PLAN + "\n---\n" + BLOCK)?.spec.startsWith(BLOCK), true);
});

const NO_BLOCK: [string, string][] = [
	["empty reply", ""],
	["no block", PLAN],
	["a block without files-allowed", "---\ntests: npm test\n---\n" + PLAN],
	["no closing line", "---\nfiles-allowed: [a.ts]\ntests: x\n\n" + PLAN],
	["only one rule", PLAN + "\n---\n"],
];
for (const [name, reply] of NO_BLOCK) test("assemble: " + name + " gives undefined", () => assert.equal(assemble(reply), undefined));

const withBlock = (frontmatter: string, body = PLAN): string => "```\n---\n" + frontmatter + "\n---\n```\n\n" + body;
const FRONT = "files-allowed: [src/add.ts, src/add.test.ts]\ntests: npm test";
const GOOD = {
	reply: withBlock(FRONT),
	fixFiles: ["src/add.ts"],
	testPaths: ["src/add.test.ts"],
	existing: (p: string) => ["src/add.ts", "src/add.test.ts"].includes(p),
	changed: [] as string[],
};
type Input = typeof GOOD;
const ALL = { accepted: true, covers: true, tight: true, grounded: true, readonly: true, short: true };
const NONE = { accepted: false, covers: false, tight: false, grounded: false, readonly: true, short: false };
const step = (n: number): string => n + ". Step " + n + " → check: run it";

const CASES: [string, Partial<Input>, Partial<typeof ALL>][] = [
	["a good plan passes everything", {}, {}],
	["the planner changed a file: only readonly fails", { changed: ["src/add.ts"] }, { readonly: false }],
	["no spec block: accepted fails, the rest false, readonly kept", { reply: PLAN }, NONE],
	["files-allowed in block form", { reply: withBlock("files-allowed:\n  - src/add.ts\n  - src/add.test.ts\ntests: npm test") }, {}],
	["files-allowed with quotes and ./", { reply: withBlock("files-allowed: ['./src/add.ts', \"src/add.test.ts\"]\ntests: npm test") }, {}],
	["an empty files-allowed list", { reply: withBlock("files-allowed: []\ntests: npm test") }, NONE],
	["files-allowed that is not a list", { reply: withBlock("files-allowed: src/add.ts\ntests: npm test") }, NONE],
	["an unterminated flow list", { reply: withBlock("files-allowed: [src/add.ts\ntests: npm test") }, NONE],
	["a flow list with trailing junk", { reply: withBlock("files-allowed: [src/add.ts] junk\ntests: npm test") }, NONE],
	["no tests line", { reply: withBlock("files-allowed: [src/add.ts]") }, NONE],
	["tests naming a path under /tmp", { reply: withBlock("files-allowed: [src/add.ts]\ntests: bash /tmp/check.sh") }, NONE],
	["tests in a repo directory named tmp is fine", { reply: withBlock("files-allowed: [src/add.ts, src/add.test.ts]\ntests: bash scripts/tmp/check.sh") }, {}],
	["no numbered step", { reply: withBlock(FRONT, "Do it → check: npm test\n- one\n- two") }, NONE],
	["a numbered step with ) is fine", { reply: withBlock(FRONT, "1) Do it → check: npm test") }, {}],
	["no check: line", { reply: withBlock(FRONT, "1. Change src/add.ts, then run npm test") }, NONE],
	["covers fails when a fix file is missing from files-allowed", { fixFiles: ["src/add.ts", "src/other.ts"], existing: (p: string) => p !== "x" }, { covers: false }],
	["tight fails on an extra non-test file", { reply: withBlock("files-allowed: [src/add.ts, src/add.test.ts, src/extra.ts]\ntests: npm test"), existing: () => true }, { tight: false }],
	["tight allows a test path the fix did not touch", { reply: withBlock("files-allowed: [src/add.ts, tests/new.test.ts]\ntests: npm test"), testPaths: [] }, {}],
	["grounded fails on a named path that does not exist", { reply: withBlock(FRONT, PLAN + "\nSee src/ghost.ts:4.") }, { grounded: false }],
	["a path that is in files-allowed but does not exist yet is grounded", { existing: (p: string) => p === "src/add.ts" }, {}],
	["grounded ignores ~ and absolute paths, bare names and globs", { reply: withBlock(FRONT, PLAN + "\nSee ~/x/y.md, /etc/z.conf, package.json, src/*.ts, https://example.com/a/b.html.") }, {}],
	["grounded strips :line and :a-b suffixes and trailing punctuation", { reply: withBlock(FRONT, PLAN + "\nAt (src/add.ts:2-3), src/add.ts:9.") }, {}],
	["450 words is short", { reply: withBlock(FRONT, step(1) + " " + "w ".repeat(450 - 7)) }, {}],
	["451 words is not", { reply: withBlock(FRONT, step(1) + " " + "w ".repeat(451 - 7)) }, { short: false }],
];
for (const [name, over, want] of CASES) test("mechanical: " + name, () => assert.deepEqual(mechanical({ ...GOOD, ...over }), { ...ALL, ...want }));

test("mechanical: a reply with no spec block does not read the other inputs", () => {
	const input = { ...GOOD, reply: "just words", existing: () => { throw new Error("must not be called"); } };
	assert.deepEqual(mechanical(input), NONE);
});

test("renderPrompt: strips the leading frontmatter and puts the ticket in place of every $@", () => {
	const prompt = "---\ndescription: d\nargument-hint: x\n---\nPlan this: $@\n\nAgain: $@ and `$&`.\n---\nkept\n";
	assert.equal(renderPrompt(prompt, "Ticket $1 text.\n"), "Plan this: Ticket $1 text.\n\nAgain: Ticket $1 text. and `$&`.\n---\nkept\n");
	assert.equal(renderPrompt("No frontmatter $@", "T"), "No frontmatter T");
});
