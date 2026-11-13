// Run: node --test 'agent-eval/tests/*.test.ts'
// The orch role: the decision parser and grader (pure), the prompt render, and validate.sh on orch tasks. No model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { checkTask, DECISIONS, gradeOrch, parseDecision } from "../lib/orch.ts";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "orch-test-")));
after(() => rmSync(scratch, { recursive: true, force: true }));

const DECISION: [string, string, string | null][] = [
	["plain", "DECISION: merge", "merge"],
	["lower case label and word", "decision: Rework", "rework"],
	["bold around the whole line", "**DECISION: stop**", "stop"],
	["bold around the label only", "**DECISION:** fix", "fix"],
	["backticks around the line", "`DECISION: merge`", "merge"],
	["backticks around the word", "DECISION: `stop`", "stop"],
	["trailing text", "DECISION: rework - the sensors failed once", "rework"],
	["trailing text after a period", "DECISION: merge. Rule: the script says the slice passed.", "merge"],
	["no space after the colon", "DECISION:stop", "stop"],
	["after other lines", "Thinking it over.\n\nDECISION: fix\nBecause.", "fix"],
	["the first line that has one decides", "DECISION: merge\nDECISION: stop", "merge"],
	["the first line that has one decides even when its word is not a decision", "DECISION: maybe\nDECISION: stop", null],
	["CRLF line ends", "DECISION: stop\r\nThen a sentence.", "stop"],
	["a word outside the four", "DECISION: ship", null],
	["a longer word that starts with a decision", "DECISION: stopping", null],
	["no word", "DECISION:", null],
	["the word on the next line", "DECISION:\nmerge", null],
	["no decision line", "I would merge it.", null],
	["a bare decision word", "merge", null],
	["empty reply", "", null],
];
for (const [name, reply, want] of DECISION) test(`parseDecision: ${name}`, () => assert.equal(parseDecision(reply), want));

test("the four decisions are merge, rework, stop and fix", () => assert.deepEqual([...DECISIONS], ["merge", "rework", "stop", "fix"]));

test("gradeOrch: pass is decision === expect", () => {
	assert.equal(gradeOrch("DECISION: stop", "stop"), true);
	assert.equal(gradeOrch("**DECISION: Stop** because", "stop"), true);
	assert.equal(gradeOrch("DECISION: merge", "stop"), false);
	assert.equal(gradeOrch("no decision here", "stop"), false);
	assert.equal(gradeOrch("DECISION: ship", "ship"), false);
	assert.equal(gradeOrch("DECISION: stop", ""), false);
});

const node = (...args: string[]) => spawnSync("node", args, { encoding: "utf8" });
const read = (path: string) => readFileSync(join(EVAL_DIR, path), "utf8");

test("the rendered prompt carries the fixture's first and last line and the scenario", () => {
	const r = node(join(EVAL_DIR, "lib/orch.ts"), "render", join(EVAL_DIR, "prompts/orch.txt"), join(EVAL_DIR, "fixtures/orch/rules.md"), join(EVAL_DIR, "tasks/orch-first-fail/scenario.md"));
	assert.equal(r.status, 0, r.stderr);
	const rules = read("fixtures/orch/rules.md").trimEnd().split("\n");
	assert.ok(r.stdout.includes(rules[0]));
	assert.ok(r.stdout.includes(rules[rules.length - 1]));
	assert.ok(r.stdout.includes(read("tasks/orch-first-fail/scenario.md").trim()));
	assert.ok(!/\{\{[A-Z]+\}\}/.test(r.stdout));
	assert.match(r.stdout, /<rules>\n- \*\*"go"\*\*/);
	assert.match(r.stdout, /<\/rules>\n\n<situation>\nAn auto run/);
});

const GOOD_RULE = { lines: [86, 88], must: "a slice that does not pass its rework" };
function makeTask(id: string, over: Record<string, unknown> = {}, scenario = "A situation.\n"): string {
	const dir = join(scratch, id);
	mkdirSync(dir, { recursive: true });
	const task = { id, role: "orch", expect: "stop", rule: GOOD_RULE, ...over };
	writeFileSync(join(dir, "task.json"), JSON.stringify(task));
	writeFileSync(join(dir, "scenario.md"), scenario);
	return dir;
}
const validate = (dir: string) => spawnSync(join(EVAL_DIR, "validate.sh"), [dir], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: scratch } });

test("validate.sh: a good orch task is VALID, also when the phrase spans a line break", () => {
	const good = validate(makeTask("v-good"));
	assert.equal(good.status, 0, good.stdout + good.stderr);
	assert.equal(good.stdout.trim(), "VALID v-good");
	const span = validate(makeTask("v-span", { rule: { lines: [16, 17], must: "dispatch once more, then fix by hand" }, expect: "fix" }));
	assert.equal(span.stdout.trim(), "VALID v-span");
});

const INVALID: [string, string, Record<string, unknown>, string][] = [
	["i-must", "a must phrase that is not in the fixture", { rule: { lines: [86, 88], must: "never merge on a Tuesday" } }, "A situation.\n"],
	["i-outside", "a must phrase that is in the fixture but outside the lines", { rule: { ...GOOD_RULE, lines: [1, 2] } }, "A situation.\n"],
	["i-expect", "a bad expect", { expect: "ship" }, "A situation.\n"],
	["i-noexpect", "no expect", { expect: undefined }, "A situation.\n"],
	["i-empty", "an empty scenario", {}, "  \n"],
	["i-norule", "no rule", { rule: undefined }, "A situation.\n"],
	["i-range", "lines past the end of the fixture", { rule: { lines: [100, 400], must: "auto/<effort>" } }, "A situation.\n"],
	["i-order", "lines out of order", { rule: { lines: [88, 86], must: "a PASS with anything under Blocked on me" } }, "A situation.\n"],
	["i-emptymust", "an empty must", { rule: { lines: [86, 88], must: " " } }, "A situation.\n"],
];
for (const [id, name, over, scenario] of INVALID) {
	test(`validate.sh: INVALID for ${name}`, () => {
		const dir = makeTask(id, over, scenario);
		const r = validate(dir);
		assert.notEqual(r.status, 0);
		assert.match(r.stdout, new RegExp(`^INVALID ${id}: .+`, "m"));
		assert.notEqual(checkTask(dir, join(EVAL_DIR, "fixtures/orch/rules.md")), "");
	});
}

test("validate.sh: a fixture that differs from plan.md lines 89-204 gives a note on stderr, not a failure", () => {
	const repo = join(scratch, "note-repo");
	mkdirSync(join(repo, "agent-eval/lib"), { recursive: true });
	mkdirSync(join(repo, "agent-eval/fixtures/orch"), { recursive: true });
	mkdirSync(join(repo, "config/pi/prompts"), { recursive: true });
	for (const f of ["validate.sh", "lib/task.sh", "lib/orch.ts", "lib/review.ts", "lib/record.ts", "lib/scout-grade.ts"]) writeFileSync(join(repo, "agent-eval", f), read(f), { mode: 0o755 });
	const rules = read("fixtures/orch/rules.md");
	writeFileSync(join(repo, "agent-eval/fixtures/orch/rules.md"), rules);
	const plan = () => writeFileSync(join(repo, "config/pi/prompts/plan.md"), "x\n".repeat(88) + rules);
	spawnSync("git", ["init", "-q"], { cwd: repo });
	const dir = makeTask("v-note");
	// The whole environment, not just PATH: git on PATH may be a wrapper that needs its own variables.
	const run = () => spawnSync(join(repo, "agent-eval/validate.sh"), [dir], { encoding: "utf8", env: { ...process.env, HOME: scratch } });
	plan();
	const same = run();
	assert.equal(same.status, 0, same.stdout + same.stderr);
	assert.doesNotMatch(same.stderr, /NOTE/);
	writeFileSync(join(repo, "config/pi/prompts/plan.md"), "x\n".repeat(88) + rules.replace("never", "ever") + "more\n");
	const moved = run();
	assert.equal(moved.status, 0, moved.stdout + moved.stderr);
	assert.equal(moved.stdout.trim(), "VALID v-note");
	assert.match(moved.stderr, /^NOTE: .*differs from lines 89-204 of config\/pi\/prompts\/plan\.md/m);
});
