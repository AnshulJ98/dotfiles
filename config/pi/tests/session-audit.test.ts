// Run: node --test 'config/pi/tests/*.test.ts'
// Drives bin/session-audit over a two-session fixture built in a temp dir.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const AUDIT = resolve(import.meta.dirname, "../bin/session-audit");

type Part = { type: "text"; text: string } | { type: "toolCall"; name: string; arguments: Record<string, unknown> };
const session = (cwd: string): string => JSON.stringify({ type: "session", cwd });
const user = (text: string): string => JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text }] } });
const assistant = (...content: Part[]): string => JSON.stringify({ type: "message", message: { role: "assistant", content } });
const bash = (command: string): Part => ({ type: "toolCall", name: "bash", arguments: { command } });
const read = (path: string): Part => ({ type: "toolCall", name: "read", arguments: { path } });

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "session-audit-"));
	// Session dirs nest one level, as ~/.pi/agent/sessions/<cwd-slug>/<id>.jsonl does.
	mkdirSync(join(root, "--repo--"));
	writeFileSync(
		join(root, "--repo--", "a.jsonl"),
		[
			session("/repo"),
			user("fix the thing"),
			assistant(bash("git status --short"), bash("node --test 'src/*.test.ts' | tail -5"), read("src/a.ts")),
			user("Review the following; if nothing is specified, review `git diff`:"),
			assistant({ type: "text", text: "- `src/a.ts:12` exported function without a return type; add `: number`\n- clean: errors" }),
			"{not json",
			"",
		].join("\n"),
	);
	writeFileSync(
		join(root, "--repo--", "b.jsonl"),
		[session("/repo"), assistant(bash("git status --short"), bash("cd /repo && node --test x.test.ts"), read("src/a.ts"), read("~/notes.md")), ""].join("\n"),
	);
	return root;
}

function rows(out: string): Map<string, { sessions: number; count: number }> {
	const table = new Map<string, { sessions: number; count: number }>();
	for (const line of out.split("\n")) {
		const m = /^\| (\w+) \| `(.*)` \| (\d+) \| (\d+) \|$/.exec(line);
		if (m) table.set(`${m[1]} ${m[2]}`, { sessions: Number(m[3]), count: Number(m[4]) });
	}
	return table;
}

test("session-audit: counts repeated commands, shapes, sequences, reads and review categories across sessions", () => {
	const root = fixture();
	const r = spawnSync(process.execPath, [AUDIT, root], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /^2 session files, 7 tool calls, under /);
	const table = rows(r.stdout);
	assert.deepEqual(table.get("cmd git status --short"), { sessions: 2, count: 2 });
	assert.deepEqual(table.get("shape git status"), { sessions: 2, count: 2 });
	// `cd` is dropped and a pipeline keeps its first stage, so both node calls share a shape
	assert.deepEqual(table.get("shape node --test"), { sessions: 2, count: 2 });
	assert.deepEqual(table.get("seq git status -> node --test"), { sessions: 2, count: 2 });
	assert.deepEqual(table.get("read /repo/src/a.ts"), { sessions: 2, count: 2 });
	assert.equal(table.has("read ~/notes.md"), false, "a file read in one session is not reported");
	assert.deepEqual(table.get("review types"), { sessions: 1, count: 1 });
	assert.equal([...table.keys()].filter((k) => k.startsWith("review ")).length, 1, "the clean line is not a finding");
});

test("session-audit --models: per-turn medians by model and thinking level, compactions counted, scout runs left out", () => {
	const root = mkdtempSync(join(tmpdir(), "session-audit-models-"));
	const reply = (model: string, reasoning: number, content: Part[], thinkingLevel?: string): string =>
		JSON.stringify({ type: "message", message: { role: "assistant", model, thinkingLevel, usage: { reasoning }, content } });
	const say = (text: string): Part => ({ type: "text", text });
	mkdirSync(join(root, "--repo--"));
	writeFileSync(
		join(root, "--repo--", "a.jsonl"),
		[
			session("/repo"),
			user("one"),
			reply("m1", 10, [bash("ls"), bash("pwd")], "high"),
			reply("m1", 30, [say("done")], "high"),
			JSON.stringify({ type: "compaction" }),
			user("two"),
			reply("m1", 5, [say("ok")], "high"),
			user("three"),
			reply("m1", 4, [read("a.ts")], "high"),
			reply("m1", 5, [say("sixsix")], "high"),
			"{not json",
		].join("\n"),
	);
	// An older session names the level only in a change entry.
	writeFileSync(
		join(root, "--repo--", "b.jsonl"),
		[session("/repo"), JSON.stringify({ type: "thinking_level_change", thinkingLevel: "medium" }), user("one"), reply("m2", 7, [say("hi")])].join("\n"),
	);
	mkdirSync(join(root, "scout", "1"), { recursive: true });
	writeFileSync(join(root, "scout", "1", "c.jsonl"), [user("look"), reply("child", 1, [say("digest")], "low")].join("\n"));

	const r = spawnSync(process.execPath, [AUDIT, "--models", root], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /^2 session files under /);
	const lines = r.stdout.split("\n").filter((l) => /^\| m\d/.test(l));
	// model:thinking | sessions | turns | reasoning tokens | tool calls | final chars | compactions
	assert.deepEqual(lines, ["| m1:high | 1 | 3 | 9 | 1 | 4 | 1 |", "| m2:medium | 1 | 1 | 7 | 0 | 2 | 0 |"]);
	assert.doesNotMatch(r.stdout, /child/);
});

test("session-audit: an empty sessions dir prints the header and no rows", () => {
	const root = mkdtempSync(join(tmpdir(), "session-audit-empty-"));
	const r = spawnSync(process.execPath, [AUDIT, root], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /^0 session files, 0 tool calls/);
	assert.equal(rows(r.stdout).size, 0);
});
