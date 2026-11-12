// Run: node --test 'config/pi/tests/*.test.ts'
// lib/bash-changes.ts: changedBy as a table, snapshot and describe against real git in temp repos;
// extensions/bash-changes.ts through a fake pi and a fake ctx.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import bashChanges from "../extensions/bash-changes.ts";
import { changedBy, describe, parsePorcelain, snapshot, type Change, type FileState, type Snapshot } from "../lib/bash-changes.ts";
import { append, endLine, logPath, logsDir, roleOf, rotate, startLine, subjectOf, summarize, toolLine, type Who } from "../lib/bash-log.ts";
import type { Live } from "../lib/live.ts";

// The extension appends to the bash log; keep the tests out of the real one.
const LOG = join(realpathSync(mkdtempSync(join(tmpdir(), "bash-log-"))), "logs", "bash.log");
process.env.PI_BASH_LOG = LOG;
process.env.PI_LOG_DIR = join(LOG, "..");
const LIVE = join(LOG, "..", "live", `${process.pid}.json`);
const liveNow = (): Live => JSON.parse(readFileSync(LIVE, "utf8")) as Live;
const logged = (): string[] => (existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean) : []);

function snap(files: Record<string, FileState>, head = "h1"): Snapshot {
	return { root: "/r", head, files: new Map(Object.entries(files)) };
}
const state = (status: string, size: number, mtimeMs: number): FileState => ({ status, size, mtimeMs });

const TABLE: Array<[name: string, before: Snapshot, after: Snapshot, expected: Change[]]> = [
	["a new untracked file", snap({}), snap({ "n.ts": state("??", 3, 10) }), [{ path: "n.ts", kind: "new" }]],
	["a clean file modified", snap({}), snap({ "a.ts": state(" M", 5, 10) }), [{ path: "a.ts", kind: "modified" }]],
	["a dirty file modified again (mtime)", snap({ "a.ts": state(" M", 5, 10) }), snap({ "a.ts": state(" M", 5, 20) }), [{ path: "a.ts", kind: "modified" }]],
	["a dirty file modified again (size)", snap({ "a.ts": state(" M", 5, 10) }), snap({ "a.ts": state(" M", 9, 10) }), [{ path: "a.ts", kind: "modified" }]],
	["a tracked file deleted", snap({}), snap({ "o.ts": { status: " D" } }), [{ path: "o.ts", kind: "deleted" }]],
	["an untouched dirty file", snap({ "a.ts": state(" M", 5, 10) }), snap({ "a.ts": state(" M", 5, 10) }), []],
	["a dirty tracked file put back as HEAD has it", snap({ "a.ts": state(" M", 5, 10) }), snap({}), [{ path: "a.ts", kind: "reverted" }]],
	["a deleted tracked file restored", snap({ "o.ts": { status: " D" } }), snap({}), [{ path: "o.ts", kind: "reverted" }]],
	["an untracked file removed", snap({ "n.ts": state("??", 3, 10), "a.ts": state(" M", 5, 10) }), snap({ "a.ts": state(" M", 5, 10) }), [{ path: "n.ts", kind: "deleted" }]],
	["HEAD moved", snap({}), snap({ "a.ts": state(" M", 5, 10) }, "h2"), []],
];
for (const [name, before, after, expected] of TABLE) {
	test(`changedBy: ${name}`, () => assert.deepEqual(changedBy(before, after), expected));
}

test("parsePorcelain reads statuses and skips a rename's source entry", () => {
	assert.deepEqual(parsePorcelain(" M a.ts\0?? b c.ts\0R  new.ts\0old.ts\0A  z.ts\0"), [
		{ status: " M", path: "a.ts" },
		{ status: "??", path: "b c.ts" },
		{ status: "R ", path: "new.ts" },
		{ status: "A ", path: "z.ts" },
	]);
	assert.deepEqual(parsePorcelain(""), []);
});

function makeRepo(): string {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), "bash-changes-")));
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
	git("init", "-q");
	mkdirSync(join(repo, "src"));
	writeFileSync(join(repo, "src", "a.ts"), "one\ntwo\nthree\n");
	writeFileSync(join(repo, "old.ts"), "old\n");
	git("add", ".");
	git("commit", "-qm", "init", "--no-verify");
	return repo;
}

test("snapshot: root, HEAD, dirty paths with stat; undefined outside a repo", () => {
	const repo = makeRepo();
	writeFileSync(join(repo, "src", "a.ts"), "one\n");
	mkdirSync(join(repo, "dir"));
	writeFileSync(join(repo, "dir", "n.ts"), "n\n");
	rmSync(join(repo, "old.ts"));
	const taken = snapshot(join(repo, "src"));
	assert.ok(taken);
	assert.equal(taken.root, repo);
	assert.match(taken.head, /^[0-9a-f]{40}$/);
	assert.deepEqual([...taken.files.keys()].sort(), ["dir/n.ts", "old.ts", "src/a.ts"]);
	assert.equal(taken.files.get("src/a.ts")?.size, 4);
	assert.equal(taken.files.get("dir/n.ts")?.status, "??");
	assert.equal(taken.files.get("old.ts")?.size, undefined);
	assert.equal(snapshot(realpathSync(mkdtempSync(join(tmpdir(), "bash-changes-none-")))), undefined);
});

test("describe: counts for modified files, new and deleted named, capped at 8", () => {
	const repo = makeRepo();
	writeFileSync(join(repo, "src", "a.ts"), "one\nTWO\nthree\nfour\nfive\n");
	writeFileSync(join(repo, "new.ts"), "x\n");
	rmSync(join(repo, "old.ts"));
	const changes: Change[] = [
		{ path: "src/a.ts", kind: "modified" },
		{ path: "new.ts", kind: "new" },
		{ path: "old.ts", kind: "deleted" },
	];
	assert.equal(describe(changes, repo), "src/a.ts (+3 \u22121), new.ts (new), old.ts (deleted)");
	const many: Change[] = Array.from({ length: 11 }, (_, i) => ({ path: `f${i}.ts`, kind: "new" as const }));
	assert.equal(describe(many, repo), `${many.slice(0, 8).map((c) => `${c.path} (new)`).join(", ")}, \u2026 and 3 more`);
});

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

function armed(hasUI = true): { on: Map<string, Handler>; notes: string[]; ctx: unknown } {
	const on = new Map<string, Handler>();
	bashChanges({ on: (name: string, handler: Handler) => on.set(name, handler) } as unknown as Parameters<typeof bashChanges>[0]);
	const notes: string[] = [];
	return { on, notes, ctx: { hasUI, ui: { notify: (text: string) => notes.push(text) }, sessionManager: { getSessionId: () => "01a1-session-abc123", getSessionFile: () => "/s/abc123.jsonl" } } };
}

async function inRepo(body: (repo: string) => Promise<void>): Promise<void> {
	const repo = makeRepo();
	const cwd = process.cwd();
	process.chdir(repo);
	try {
		await body(repo);
	} finally {
		process.chdir(cwd);
	}
}

test("handler: a bash call that edits a file gives exactly one notice naming it", async () => {
	await inRepo(async (repo) => {
		const { on, notes, ctx } = armed();
		const event = { toolName: "bash", toolCallId: "c1", input: { command: "sed -i" } };
		assert.equal(await on.get("tool_call")?.(event, ctx), undefined);
		writeFileSync(join(repo, "src", "a.ts"), "changed\n");
		assert.equal(await on.get("tool_result")?.(event, ctx), undefined);
		assert.deepEqual(notes, ["bash changed: src/a.ts (+1 \u22123)"]);
		// The stored snapshot is gone: a second result for the same id is a no-op.
		await on.get("tool_result")?.(event, ctx);
		assert.equal(notes.length, 1);
	});
});

test("handler: a bash call that changes nothing, or has no snapshot, or is not bash, gives no notice", async () => {
	await inRepo(async (repo) => {
		const { on, notes, ctx } = armed();
		const event = { toolName: "bash", toolCallId: "c2", input: { command: "true" } };
		await on.get("tool_call")?.(event, ctx);
		await on.get("tool_result")?.(event, ctx);
		writeFileSync(join(repo, "src", "a.ts"), "changed\n");
		await on.get("tool_result")?.({ toolName: "bash", toolCallId: "never-called" }, ctx);
		await on.get("tool_call")?.({ toolName: "read", toolCallId: "c3", input: { path: "src/a.ts" } }, ctx);
		await on.get("tool_result")?.({ toolName: "read", toolCallId: "c3", input: { path: "src/a.ts" } }, ctx);
		assert.deepEqual(notes, []);
	});
});

test("handler: without a UI nothing is notified", async () => {
	await inRepo(async (repo) => {
		const { on, notes, ctx } = armed(false);
		const event = { toolName: "bash", toolCallId: "c4", input: { command: "x" } };
		await on.get("tool_call")?.(event, ctx);
		writeFileSync(join(repo, "n.ts"), "n\n");
		await on.get("tool_result")?.(event, ctx);
		assert.deepEqual(notes, []);
	});
});

const WHO: Who = { role: "main", session: "01a1-session-abc123", call: "toolu_019f2c" };
const AT = new Date(2026, 10, 11, 22, 41, 7);

test("bash log lines: start names the role, session, call, cwd and command; end the time, exit, kill and changes", () => {
	assert.equal(startLine(AT, WHO, "/home/u/Dev/repo", "git add -- a.ts", "/home/u"), "22:41:07 main abc123 #9f2c \u25b6 [~/Dev/repo] git add -- a.ts");
	assert.equal(startLine(AT, WHO, "/tmp/x", "\ncat > f <<'EOF'\none\n\ntwo\nEOF\n", "/home/u"), "22:41:07 main abc123 #9f2c \u25b6 [/tmp/x] cat > f <<'EOF' (+3 lines)");
	assert.equal(summarize("x".repeat(200)), `${"x".repeat(160)}\u2026`);
	const rows: Array<[Parameters<typeof endLine>[2], string]> = [
		[{ ms: 412, failed: false, exitCode: 0, changed: "" }, "\u2713 0.4s"],
		[{ ms: 412, failed: false, changed: "src/a.ts (+3 \u22121)" }, "\u2713 0.4s \u00b7 changed: src/a.ts (+3 \u22121)"],
		[{ ms: 1500, failed: false, exitCode: 2, changed: "" }, "\u2717 1.5s exit 2"],
		[{ ms: 91200, failed: true, exitCode: 137, killed: "[watchdog] killed: idle 90s", changed: "" }, "\u2717 91.2s exit 137 \u00b7 [watchdog] killed: idle 90s"],
		[{ ms: 100, failed: true, changed: "" }, "\u2717 0.1s"],
	];
	for (const [ended, tail] of rows) assert.equal(endLine(AT, WHO, ended), `22:41:07 main abc123 #9f2c ${tail}`);
});

test("bash log lines: any other tool is named with what it is pointed at", () => {
	const rows: Array<[tool: string, input: unknown, tail: string]> = [
		["edit", { path: "/home/u/Dev/repo/a.ts", edits: [] }, "edit ~/Dev/repo/a.ts"],
		["codemode", { code: "// @options: {}\nconst r = await tools.bash({});\nreturn r;" }, "codemode // @options: {} (+2 lines)"],
		["fetch_content", { urls: ["https://a", "https://b"] }, 'fetch_content ["https://a","https://b"]'],
		["web_search", { numResults: 5, queries: ["x"] }, 'web_search ["x"]'],
		["bg_kill", { id: "bg3" }, "bg_kill bg3"],
		["odd", { depth: 2 }, "odd 2"],
		["bare", {}, "bare"],
		["bare", undefined, "bare"],
	];
	for (const [tool, input, tail] of rows) assert.equal(toolLine(AT, WHO, tool, input, "/home/u"), `22:41:07 main abc123 #9f2c \u25b6 ${tail}`);
	assert.equal(subjectOf({ path: "/elsewhere/a" }, "/home/u"), "/elsewhere/a");
});

test("bash log: role and path come from the environment; a log over 5 MB is rotated once; an unwritable path reports false", () => {
	assert.equal(roleOf({}), "main");
	assert.equal(roleOf({ PI_SCOUT_DEPTH: "0" }), "main");
	assert.equal(roleOf({ PI_SCOUT_DEPTH: "1" }), "scout");
	assert.equal(roleOf({ PI_SCOUT_DEPTH: "1", PI_WORKER_SPEC: "/s.md" }), "worker");
	assert.equal(logPath({ PI_CODING_AGENT_DIR: "/agent" }), "/agent/logs/bash.log");
	assert.equal(logPath({ PI_BASH_LOG: "/x.log", PI_CODING_AGENT_DIR: "/agent" }), "/x.log");
	assert.equal(logsDir({ PI_LOG_DIR: "/logs", PI_CODING_AGENT_DIR: "/agent", NODE_TEST_CONTEXT: "child-v8" }), "/logs");
	assert.equal(logsDir({ PI_CODING_AGENT_DIR: "/agent", NODE_TEST_CONTEXT: "child-v8" }), join(tmpdir(), "pi-test-logs"), "a test run stays out of the real logs");
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "bash-log-rotate-")));
	const path = join(dir, "sub", "bash.log");
	assert.equal(append(path, "one"), true);
	rotate(path);
	assert.equal(existsSync(`${path}.1`), false);
	writeFileSync(path, "x".repeat(5 * 1024 * 1024 + 1));
	rotate(path);
	assert.equal(statSync(`${path}.1`).size, 5 * 1024 * 1024 + 1);
	assert.equal(existsSync(path), false);
	writeFileSync(join(dir, "file"), "");
	assert.equal(append(join(dir, "file", "bash.log"), "one"), false);
});

test("handler: every tool call gets a start and an end line in the log and is the live state while it runs", async () => {
	await inRepo(async (repo) => {
		const { on, ctx } = armed(false);
		const from = logged().length;
		const event = { toolName: "bash", toolCallId: "call-aaaa", input: { command: "sed -i s/a/b/ src/a.ts" } };
		await on.get("session_start")?.({}, ctx);
		assert.deepEqual([liveNow().state, liveNow().role, liveNow().session, liveNow().cwd, liveNow().pid], ["idle", "main", "01a1-session-abc123", repo, process.pid]);
		await on.get("tool_call")?.(event, ctx);
		assert.match(logged().at(-1) ?? "", /^\d\d:\d\d:\d\d main abc123 #aaaa \u25b6 \[.*\] sed -i s\/a\/b\/ src\/a\.ts$/);
		assert.deepEqual([liveNow().state, liveNow().what], ["tool", "bash sed -i s/a/b/ src/a.ts"]);
		writeFileSync(LIVE, JSON.stringify({ ...liveNow(), active: 1 }));
		await on.get("provider_stream_event")?.({}, ctx);
		assert.ok(liveNow().active > 1, "model output counts as activity");
		assert.equal(liveNow().what, "bash sed -i s/a/b/ src/a.ts", "and changes nothing else");
		writeFileSync(LIVE, JSON.stringify({ ...liveNow(), active: 1 }));
		await on.get("provider_stream_event")?.({}, ctx);
		assert.equal(liveNow().active, 1, "at most one write per 30 s");
		writeFileSync(join(repo, "src", "a.ts"), "changed\n");
		const killed = [{ type: "text", text: "partial\n[watchdog] killed: idle 90s (no output/CPU/network)\n" }];
		await on.get("tool_result")?.({ ...event, isError: true, content: killed, structuredContent: { exit_code: 137 } }, ctx);
		assert.match(logged().at(-1) ?? "", /^\d\d:\d\d:\d\d main abc123 #aaaa \u2717 \d+\.\ds exit 137 \u00b7 \[watchdog\] killed: idle 90s \(no output\/CPU\/network\) \u00b7 changed: src\/a\.ts \(\+1 \u22123\)$/);
		assert.deepEqual([liveNow().state, liveNow().what], ["model", ""]);
		const script = { toolName: "codemode", toolCallId: "call-dddd", input: { code: "return 1;" } };
		const read = { toolName: "read", toolCallId: "call-dddd/1", input: { path: "a" } };
		await on.get("tool_call")?.(script, ctx);
		await on.get("tool_call")?.(read, ctx);
		assert.match(logged().at(-1) ?? "", /#dd\/1 \u25b6 read a$/);
		assert.equal(liveNow().what, "codemode return 1; \u203a read a", "outermost first");
		await on.get("tool_result")?.({ ...read, isError: true, content: [] }, ctx);
		assert.match(logged().at(-1) ?? "", /#dd\/1 \u2717 \d+\.\ds$/);
		assert.equal(liveNow().what, "codemode return 1;");
		assert.equal(logged().length, from + 5);
		await on.get("turn_end")?.({}, ctx);
		assert.deepEqual([liveNow().state, liveNow().what], ["model", ""], "a blocked call gets no result; the turn's end closes it");
		await on.get("agent_settled")?.({}, ctx);
		assert.equal(liveNow().state, "idle");
		await on.get("session_shutdown")?.({}, ctx);
		assert.equal(existsSync(LIVE), false);
	});
	const outside = realpathSync(mkdtempSync(join(tmpdir(), "bash-log-norepo-")));
	const cwd = process.cwd();
	process.chdir(outside);
	try {
		const { on, ctx } = armed();
		const event = { toolName: "bash", toolCallId: "call-cccc", input: { command: "ls" } };
		await on.get("tool_call")?.(event, ctx);
		await on.get("tool_result")?.({ ...event, content: [{ type: "text", text: "a\n" }] }, ctx);
		assert.match(logged().at(-1) ?? "", /#cccc \u2713 \d+\.\ds$/);
	} finally {
		process.chdir(cwd);
	}
});
