// Run: node --test 'config/pi/tests/*.test.ts'
// Drives pi's real edit renderers (from the installed release) so a change to the
// `preview` field or the box's [header, spacer, body] layout fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const agentDir = join(homedir(), ".pi", "agent");
const version = readFileSync(join(agentDir, "install", "current-version"), "utf8").trim().replace(/^v/, "");
const piRoot = join(agentDir, "install", "releases", version, "node_modules");
const piModules = pathToFileURL(join(piRoot, "x.js")).href;
register(
	`data:text/javascript,${encodeURIComponent(`
		export async function resolve(specifier, context, next) {
			if (/^(@earendil-works\\/|typebox)/.test(specifier)) return next(specifier, { ...context, parentURL: ${JSON.stringify(piModules)} });
			return next(specifier, context);
		}`)}`,
);

const dist = join(piRoot, "@earendil-works", "pi-coding-agent", "dist");
const { initTheme, theme } = await import(pathToFileURL(join(dist, "modes/interactive/theme/theme.js")).href);
const { editRenderers } = await import(pathToFileURL(join(dist, "core/tools/renderers/edit.js")).href);
const { COLLAPSED_LINES, MIN_WIDTH, patchBox } = await import("../extensions/split-diff.ts");
initTheme("dark");

const DIFF = "-1 a\n+1 b";
const args = { path: "/tmp/x.ts", oldText: "a", newText: "b" };

/** A pi edit box after the tool returned `diff`, as the transcript holds it. */
function settledBox(diff: string | undefined, isError = false) {
	const ctx = { state: {}, argsComplete: false, cwd: "/tmp", outputPad: 1, invalidate() {}, expanded: false, isError, args };
	const box = editRenderers.renderCall(args, theme, ctx);
	const details = diff === undefined ? undefined : { diff, firstChangedLine: 1 };
	const content = isError ? [{ type: "text", text: "oldText not found" }] : [];
	editRenderers.renderResult({ content, details }, { expanded: false }, theme, ctx);
	return { box, ctx };
}

function fakeSplit() {
	const calls: { diff: string; maxLines?: number }[] = [];
	const split = (input: { diff: string; maxLines?: number }) => {
		calls.push(input);
		return { lines: [`SPLIT ${input.diff.replace("\n", " ")}`] };
	};
	return { calls, split };
}

const has = (lines: string[], text: string) => lines.some((line) => line.includes(text));

test("split-diff: pi's settled edit box still holds preview.diff and three children", () => {
	const { box } = settledBox(DIFF);
	assert.equal(box.preview?.diff, DIFF);
	assert.equal(box.children.length, 3);
});

test("split-diff: render swap by width and expansion", async (t) => {
	const cases = [
		{ name: "wide collapsed splits with the row budget", width: MIN_WIDTH + 10, expanded: false, split: true, maxLines: COLLAPSED_LINES },
		{ name: "wide expanded splits the whole diff", width: MIN_WIDTH + 10, expanded: true, split: true, maxLines: undefined },
		{ name: "narrow keeps pi's unified diff", width: MIN_WIDTH - 10, expanded: false, split: false, maxLines: undefined },
	];
	for (const c of cases) {
		await t.test(c.name, () => {
			const { box } = settledBox(DIFF);
			const { calls, split } = fakeSplit();
			patchBox(box, { theme, path: args.path, expanded: c.expanded }, split);
			const lines = box.render(c.width);
			assert.equal(has(lines, "SPLIT -1 a +1 b"), c.split);
			assert.ok(has(lines, "edit"), "header row kept");
			if (c.split) assert.equal(calls[0]?.maxLines, c.maxLines);
		});
	}
});

test("split-diff: a failed edit keeps pi's box untouched", () => {
	const { box } = settledBox(undefined, true);
	const { calls, split } = fakeSplit();
	const before = box.render(MIN_WIDTH + 10);
	patchBox(box, { theme, expanded: false }, split);
	assert.deepEqual(box.render(MIN_WIDTH + 10), before);
	assert.equal(calls.length, 0);
});

test("split-diff: pi rebuilding the box on a new result still draws split", () => {
	const { box, ctx } = settledBox(DIFF);
	const { split } = fakeSplit();
	patchBox(box, { theme, expanded: false }, split);
	box.render(MIN_WIDTH + 10);
	editRenderers.renderResult({ content: [], details: { diff: "-1 a\n+1 c", firstChangedLine: 1 } }, { expanded: false }, theme, ctx);
	assert.ok(has(box.render(MIN_WIDTH + 10), "SPLIT -1 a +1 c"));
});

test("split-diff: renderSplitDiff returning null falls back to pi's diff", () => {
	const { box } = settledBox(DIFF);
	const before = box.render(MIN_WIDTH + 10);
	patchBox(box, { theme, expanded: false }, () => null);
	assert.deepEqual(box.render(MIN_WIDTH + 10), before);
});
