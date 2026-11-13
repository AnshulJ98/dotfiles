import assert from "node:assert/strict";
import childProcess, { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import footer from "../extensions/health-footer.ts";
import { summary } from "../lib/health.ts";
import type { Problem } from "../lib/health.ts";
import { setLive } from "../lib/live.ts";

const gone: Problem = { key: "gone 42", who: "main abc123 ~/repo", flag: "died without a clean shutdown", session: "other" };
const quiet: Problem = { ...gone, key: "quiet 43", flag: "no activity for 30m00s" };
test("summary: empty, self excluded, auto, count, single gone clear hint, and 110 character cap", () => {
	const auto = { ...gone, key: "run /repo", who: "auto ~/repo", session: "" };
	const rows: Array<[Problem[], string | undefined]> = [
		[[], undefined], [[{ ...gone, session: "own" }], undefined],
		[[gone], "! main abc123 ~/repo · died without a clean shutdown (run pi-health to clear)"],
		[[{ ...gone, session: "own" }, gone], "! main abc123 ~/repo · died without a clean shutdown (run pi-health to clear)"],
		[[quiet], "! main abc123 ~/repo · no activity for 30m00s"],
		[[{ ...gone, session: "own" }, auto], "! auto ~/repo · died without a clean shutdown"],
		[[gone, quiet, auto], "! main abc123 ~/repo · died without a clean shutdown (+2 more, run pi-health)"],
		[[{ ...gone, who: "x".repeat(200) }], "! " + "x".repeat(108)],
	];
	for (const [problems, expected] of rows) assert.equal(summary(problems, "own"), expected);
});

function load(cwd: string, hasUI = true) {
	const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
	const statuses: Array<[string, string | undefined]> = [];
	const ctx = { cwd, hasUI, sessionManager: { getSessionId: () => "own" }, ui: {
		setStatus: (key: string, text: string | undefined) => { statuses.push([key, text]); },
		theme: { fg: (colour: string, text: string) => { assert.equal(colour, "warning"); return text; } },
	} };
	footer({ on: (name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => handlers.set(name, handler) } as never);
	return { statuses, fire: (name: string) => handlers.get(name)!({}, ctx), waitForStatus: async (count: number) => {
		const deadline = Date.now() + 5000;
		while (statuses.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
		assert.equal(statuses.length, count, "expected status update");
	} };
}

test("extension: real child reports a dead sibling, clears clean state, and does nothing without UI", async () => {
	const previous = process.env.PI_LOG_DIR;
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "health-footer-")));
	process.env.PI_LOG_DIR = dir;
	try {
		for (const mode of ["dead", "clean", "headless"]) {
			const dead = spawnSync("true").pid!;
			if (mode !== "clean") setLive({ ...gone, pid: dead, role: "main", session: "other", cwd: "/repo", state: "idle", what: "", since: Date.now(), active: Date.now() }, join(dir, "live"), dead);
			const pi = load(dir, mode !== "headless");
			try {
				await pi.fire("session_start");
				if (mode !== "headless") await pi.waitForStatus(1);
				if (mode === "dead") {
					const sibling = load(dir);
					try {
						await sibling.fire("session_start");
						await sibling.waitForStatus(1);
						for (const session of [pi, sibling]) {
							assert.match(session.statuses[0][1]!, /died without a clean shutdown \(run pi-health to clear\)/);
							await session.fire("agent_end");
							await session.waitForStatus(2);
							assert.deepEqual(session.statuses[1], session.statuses[0]);
						}
						assert.equal(existsSync(join(dir, "live", `${dead}.json`)), true);
					} finally { await sibling.fire("session_shutdown"); }
					rmSync(join(dir, "live", `${dead}.json`));
				} else if (mode === "clean") assert.deepEqual(pi.statuses, [["health", undefined]]);
				else {
					await pi.fire("agent_end");
					assert.deepEqual(pi.statuses, []);
					assert.equal(existsSync(join(dir, "live", `${dead}.json`)), true);
				}
			} finally { await pi.fire("session_shutdown"); }
		}
	} finally {
		if (previous === undefined) delete process.env.PI_LOG_DIR; else process.env.PI_LOG_DIR = previous;
		rmSync(dir, { recursive: true, force: true });
	}
});

test("extension: each poll replaces the status, with no held dead or quiet problems", async (t) => {
	let problems: Problem[] = [gone];
	t.mock.method(childProcess, "execFile", (_file: string, _args: readonly string[], _options: object, callback: (error: Error | null, stdout: string) => void) => {
		callback(null, JSON.stringify({ problems }));
	});
	syncBuiltinESMExports();
	const pi = load(tmpdir());
	try {
		await pi.fire("session_start");
		await pi.waitForStatus(1);
		assert.equal(pi.statuses[0][1], summary([gone], "own"));
		problems = [];
		await pi.fire("agent_end");
		await pi.waitForStatus(2);
		assert.deepEqual(pi.statuses[1], ["health", undefined]);
		problems = [quiet];
		await pi.fire("agent_end");
		await pi.waitForStatus(3);
		assert.equal(pi.statuses[2][1], summary([quiet], "own"));
		problems = [];
		await pi.fire("agent_end");
		await pi.waitForStatus(4);
		assert.deepEqual(pi.statuses[3], ["health", undefined]);
	} finally {
		await pi.fire("session_shutdown"); t.mock.restoreAll(); syncBuiltinESMExports();
	}
});

test("extension: session_start and agent_end return while the child never calls back", async (t) => {
	let calls = 0;
	t.mock.method(childProcess, "execFile", () => { calls++; });
	syncBuiltinESMExports();
	const pi = load(tmpdir());
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			(async () => { await pi.fire("session_start"); await pi.fire("agent_end"); })(),
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => reject(new Error("handlers waited for the child")), 1000);
			}),
		]);
		assert.equal(calls, 1);
		assert.deepEqual(pi.statuses, []);
	} finally {
		clearTimeout(timeout);
		await pi.fire("session_shutdown"); t.mock.restoreAll(); syncBuiltinESMExports();
	}
});

test("extension: single flight, minute polling, failures, timeout, and shutdown", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	let calls = 0;
	let finish: (err: unknown, stdout: string) => void = () => {};
	t.mock.method(childProcess, "execFile", (_file: string, args: string[], options: { timeout: number; env: NodeJS.ProcessEnv }, callback: typeof finish) => {
		calls++; assert.deepEqual(args, ["--json"]); assert.equal(options.timeout, 10_000);
		assert.deepEqual(options.env, { ...process.env }); finish = callback;
	});
	syncBuiltinESMExports();
	const pi = load(tmpdir());
	try {
		const headless = load(tmpdir(), false);
		await headless.fire("session_start"); await headless.fire("agent_end");
		t.mock.timers.tick(60_000);
		assert.equal(calls, 0); assert.deepEqual(headless.statuses, []);
		await headless.fire("session_shutdown");
		await pi.fire("session_start");
		await pi.fire("agent_end"); t.mock.timers.tick(60_000);
		assert.equal(calls, 1);
		finish(null, '{"problems":[]}'); await pi.waitForStatus(1);
		for (const output of ['no json', '{"problems":[{"key":"bad"}]}']) {
			await pi.fire("agent_end");
			const count = pi.statuses.length;
			finish(null, output); await pi.waitForStatus(count + 1);
			assert.match(pi.statuses.at(-1)![1]!, /^! pi-health failed: [^\n]+$/);
		}
		t.mock.timers.tick(60_000);
		assert.equal(calls, 4);
		finish(new Error("cannot run\nchild"), "");
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(pi.statuses.at(-1)![1], "! pi-health failed: cannot run child");
		await pi.fire("agent_end");
		finish(Object.assign(new Error("timed out"), { code: 1, killed: true }), '{"problems":[]}'); await pi.waitForStatus(5);
		assert.equal(pi.statuses.at(-1)![1], "! pi-health failed: timed out");
		await pi.fire("agent_end");
		const count = pi.statuses.length;
		await pi.fire("session_shutdown"); finish(null, '{"problems":[]}');
		await new Promise((resolve) => setImmediate(resolve));
		t.mock.timers.tick(60_000);
		assert.equal(calls, 6); assert.equal(pi.statuses.length, count);
	} finally {
		await pi.fire("session_shutdown"); t.mock.restoreAll(); syncBuiltinESMExports();
	}
});
