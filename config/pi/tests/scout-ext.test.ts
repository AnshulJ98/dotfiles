// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/scout.ts imports pi packages at runtime; they resolve from the installed pi release.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { homedir, tmpdir } from "node:os";
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

test("a scout killed with SIGKILL still gets a chat entry with its cost", async () => {
	const root = mkdtempSync(join(tmpdir(), "scout-ext-"));
	process.env.PI_CODING_AGENT_DIR = root;
	const scoutRoot = join(root, "sessions", "scout");
	const pid = spawnSync("true").pid; // exited, so its pid reads as dead
	const started = Date.now() - 5_000;
	mkdirSync(join(scoutRoot, ".running"), { recursive: true });
	mkdirSync(join(scoutRoot, ".done"), { recursive: true });
	mkdirSync(join(scoutRoot, String(pid)), { recursive: true });
	writeFileSync(join(scoutRoot, ".running", `${pid}.meta`), `pid=${pid}\nmodel=m/x\nthinking=high\nstarted=${started}\nsession=/s.jsonl\ntask=t\n`);
	writeFileSync(join(scoutRoot, ".running", `${pid}.out`), "partial digest\n");
	const message = { role: "assistant", timestamp: started + 1_000, usage: { cost: { total: 0.25 } } };
	writeFileSync(join(scoutRoot, String(pid), "s.jsonl"), `${JSON.stringify({ type: "message", message })}\n`);

	const { default: extension } = await import("../extensions/scout.ts");
	const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
	const entries: Array<{ rc: number; cost: number; digest: string }> = [];
	extension({
		on: (name: string, fn: (event: unknown, ctx: unknown) => Promise<void>) => handlers.set(name, fn),
		registerEntryRenderer: () => {},
		appendEntry: (_type: string, data: { rc: number; cost: number; digest: string }) => entries.push(data),
	} as never);
	const ctx = { sessionManager: { getSessionFile: () => "/s.jsonl" }, ui: { setStatus: () => {}, theme: { fg: (_c: string, s: string) => s } } };
	await handlers.get("session_shutdown")?.({}, ctx);

	assert.equal(entries.length, 1);
	assert.equal(entries[0].rc, 137);
	assert.equal(entries[0].cost, 0.25);
	assert.equal(entries[0].digest, "partial digest");
});
