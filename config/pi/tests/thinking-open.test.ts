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

const { runsBeforeText } = await import("../extensions/thinking-open.ts");

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
