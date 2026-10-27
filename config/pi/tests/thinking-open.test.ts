// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/thinking-open.ts imports pi packages at runtime; they resolve from the installed pi release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const agentDir = join(homedir(), ".pi", "agent");
const version = readFileSync(join(agentDir, "install", "current-version"), "utf8").trim().replace(/^v/, "");
const piModules = pathToFileURL(join(agentDir, "install", "releases", version, "node_modules", "x.js")).href;
register(
	`data:text/javascript,${encodeURIComponent(`
		export async function resolve(specifier, context, next) {
			if (/^(@earendil-works\\/|typebox)/.test(specifier)) return next(specifier, { ...context, parentURL: ${JSON.stringify(piModules)} });
			return next(specifier, context);
		}`)}`,
);

const { runsBeforeText, runsToOpen, THOUGHT_OPEN } = await import("../extensions/thinking-open.ts");

const think = (thinking: string) => ({ type: "thinking", thinking });
const text = (t: string) => ({ type: "text", text: t });
const call = { type: "toolCall" };

test("only thinking runs that reply text follows are opened", () => {
	const rows: Array<[string, Array<{ type?: string; text?: string; thinking?: string }>, number[]]> = [
		["thinking then reply", [think("plan"), text("answer")], [0]],
		["thinking then a tool call only", [think("plan"), call], []],
		["two blocks in a row are one run", [think("a"), think("b"), text("answer")], [0]],
		["blank thinking is not a run", [think("  "), think("real"), call, text("x")], [0]],
		["a blank run between does not shift the count", [think(""), text("x"), think("later"), text("y")], [0]],
		["every run before the last text opens", [think("a"), text("x"), think("b"), text("y")], [0, 1]],
		["run after the last text stays folded", [think("a"), text("x"), think("b"), call], [0]],
		["blank reply text does not count", [think("a"), text("  ")], []],
	];
	for (const [name, content, want] of rows) assert.deepEqual(runsBeforeText(content), want, name);
});

test("a tool-only step opens all its runs; a step with reply text opens the runs before it", () => {
	const rows: Array<[string, Array<{ type?: string; text?: string; thinking?: string }>, { runs: number[]; carrier: boolean }]> = [
		["thinking then a tool call", [think("plan"), call], { runs: [0], carrier: true }],
		["two runs around a call", [think("a"), call, think("b"), call], { runs: [0, 1], carrier: true }],
		["blank thinking before a call", [think(" "), call], { runs: [], carrier: false }],
		["reply text makes it a boundary", [think("a"), text("x"), call], { runs: [0], carrier: false }],
		["thinking only, still streaming", [think("a")], { runs: [], carrier: false }],
	];
	for (const [name, content, want] of rows) assert.deepEqual(runsToOpen(content), want, name);
	// pi-tidy draws a step cut off at the length limit itself, unfolded
	assert.deepEqual(runsToOpen([think("plan"), call], "length"), { runs: [], carrier: false });
});

test("pi-tidy still reads the thought-open marker this extension sets", () => {
	// Fails when pi-tidy renames its private marker; then carrier steps silently stay folded
	const source = readFileSync(join(agentDir, "npm", "node_modules", "pi-tidy", "tool-group-view.ts"), "utf8");
	assert.equal(THOUGHT_OPEN.description, "pi-toolbox:thought-open");
	assert.match(source, /Symbol\.for\("pi-toolbox:thought-open"\)/);
	assert.match(source, /\[THOUGHT_OPEN\] === true && component\.thinkingVisibilityOverrides\?\.get\?\.\(0\) === false/);
});
