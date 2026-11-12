// Run: node --test 'config/pi/tests/*.test.ts'
// lib/bash-changes.ts: changedBy as a table, snapshot and describe against real git in temp repos;
// extensions/bash-changes.ts through a fake pi and a fake ctx.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import bashChanges from "../extensions/bash-changes.ts";
import { changedBy, describe, parsePorcelain, snapshot, type Change, type FileState, type Snapshot } from "../lib/bash-changes.ts";

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
	["a path that left the dirty set", snap({ "a.ts": state(" M", 5, 10) }), snap({}), []],
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
	return { on, notes, ctx: { hasUI, ui: { notify: (text: string) => notes.push(text) } } };
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
		await on.get("tool_call")?.({ toolName: "read", toolCallId: "c3" }, ctx);
		await on.get("tool_result")?.({ toolName: "read", toolCallId: "c3" }, ctx);
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
