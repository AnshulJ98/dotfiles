// Run: node --test 'config/pi/tests/*.test.ts'
// The events log (lib/events.ts), the live-state files (lib/live.ts) and bin/pi-health over them.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { EVENT_LINE, eventLine, eventsPath, logEvent } from "../lib/events.ts";
import { age, dropLive, flagFor, readLive, runState, setLive, sweep, type Live } from "../lib/live.ts";

const HEALTH = resolve(import.meta.dirname, "../bin/pi-health");
const temp = (name: string): string => realpathSync(mkdtempSync(join(tmpdir(), `${name}-`)));
const NOW = 1_800_000_000_000;
const MIN = 60_000;

function live(over: Partial<Live> = {}): Live {
	return { pid: process.pid, role: "main", session: "01a1-session-abc123", cwd: "/repo", state: "tool", what: "bash npm test", since: NOW - 30 * MIN, active: NOW - 30 * MIN, ...over };
}

test("event line: date, role, id, kind and a one-line detail; logEvent appends it under the logs directory", () => {
	const at = new Date(2026, 10, 11, 22, 43, 10);
	assert.equal(eventLine(at, "main", "01a1-session-abc123", "bash.kill", "killed: idle 90s:\n  npm   test"), "2026-11-11 22:43:10 main abc123 bash.kill killed: idle 90s: npm test");
	assert.equal(eventLine(at, "worker", "", "worker.verdict", ""), "2026-11-11 22:43:10 worker - worker.verdict");
	assert.equal(eventLine(at, "main", "s1", "auto.block", "x".repeat(400)).length, "2026-11-11 22:43:10 main s1 auto.block ".length + 301);
	const dir = temp("events");
	logEvent("stream.stall", "no model output for 300s", "01a1-session-abc123", { PI_LOG_DIR: dir, PI_WORKER_SPEC: "/s.md" });
	logEvent("worker.verdict", "PASS retries=0", "48654", { PI_LOG_DIR: dir, PI_WORKER_SPEC: "/s.md" });
	const lines = readFileSync(eventsPath({ PI_LOG_DIR: dir }), "utf8").trimEnd().split("\n");
	assert.equal(lines.length, 2);
	for (const line of lines) assert.match(line, EVENT_LINE);
	assert.match(lines[1], / worker 48654 worker\.verdict PASS retries=0$/);
	logEvent("bash.kill", "x", "", { PI_LOG_DIR: join(dir, "events.log") });
});

test("flagFor: quiet past the limit while busy, unless idle, waiting on a person or on a live child; a dead main session", () => {
	const limit = 20 * MIN;
	const rows: Array<[name: string, state: Live, alive: boolean, childActive: boolean, expected: string | undefined]> = [
		["busy and quiet", live(), true, false, "no activity for 30m00s"],
		["busy, active a minute ago", live({ active: NOW - MIN }), true, false, undefined],
		["waiting on the model too long", live({ state: "model", what: "" }), true, false, "no activity for 30m00s"],
		["idle", live({ state: "idle", what: "" }), true, false, undefined],
		["asking the user", live({ what: "ask_user Which one?" }), true, false, undefined],
		["a script that mentions ask_user", live({ what: "codemode ask_user" }), true, false, "no activity for 30m00s"],
		["its worker is active", live({ what: "bash auto-slice dispatch parse spec.md" }), true, true, undefined],
		["dead main", live({ state: "idle" }), false, false, "died without a clean shutdown"],
		["dead worker", live({ role: "worker" }), false, false, undefined],
	];
	for (const [name, state, alive, childActive, expected] of rows) assert.equal(flagFor(state, alive, NOW, limit, childActive), expected, name);
	assert.deepEqual([age(45_000), age(130_000), age(3_900_000), age(-5)], ["45s", "2m10s", "1h05m", "0s"]);
});

test("runState: an auto run is orphaned when slices are open and nothing live carries it", () => {
	const slices = "- [x] 1. parse, branch slice/parse\n- [ ] 2. render, branch slice/render, the html\n- [ ] 3. ship, branch slice/ship\n";
	const rows: Array<[name: string, autoMd: string, sessions: string[], child: boolean, expected: ReturnType<typeof runState>]> = [
		["owner is live", `session: s1\n${slices}`, ["s1"], false, { open: 2, next: "2. render", stopped: false }],
		["owner is gone", `session: 01a1-session-abc123\n${slices}`, ["s1"], false, { open: 2, next: "2. render", stopped: false, flag: "its session (abc123) is not running" }],
		["no session line", slices, ["s1"], false, { open: 2, next: "2. render", stopped: false, flag: "no session owns it (no session: line)" }],
		["a worker is running in its worktrees", slices, [], true, { open: 2, next: "2. render", stopped: false }],
		["stopped", `${slices}stopped: review said rework\n`, [], false, { open: 2, next: "2. render", stopped: true }],
		["every slice ticked", "- [x] 1. parse, branch slice/parse\n", [], false, { open: 0, next: "", stopped: false }],
	];
	for (const [name, autoMd, sessions, child, expected] of rows) assert.deepEqual(runState(autoMd, sessions, child), expected, name);
});

test("live files: patches merge per pid, partial files are not read, sweep removes the dead and returns what they left", () => {
	const dir = join(temp("live"), "live");
	assert.deepEqual(readLive(dir), []);
	assert.deepEqual(sweep(() => true, 0, dir), []);
	setLive({ jobs: [{ id: "bg1", command: "npm run dev", log: "/tmp/bg1.log", started: NOW }] }, dir, 11);
	assert.deepEqual(readLive(dir), [], "background.ts wrote its jobs before the state");
	setLive({ role: "main", session: "s1", cwd: "/repo", state: "idle", what: "", since: NOW, active: NOW }, dir, 11);
	setLive({ role: "worker", session: "s2", cwd: "/repo", state: "tool", what: "edit a.ts", since: NOW + 1, active: NOW + 1 }, dir, 12);
	setLive({ jobs: [] }, dir, 13);
	assert.deepEqual(readLive(dir).map((p) => [p.pid, p.state, p.jobs?.length]), [[11, "idle", 1], [12, "tool", undefined]]);
	assert.deepEqual(sweep((pid) => pid === 11, NOW, dir).map((p) => p.pid), [12], "13 is gone too, and left no state");
	assert.deepEqual(readLive(dir).map((p) => p.pid), [11]);
	assert.deepEqual(sweep(() => true, NOW + 1, dir).map((p) => p.pid), [11], "written before this boot: the pid is not that process");
	setLive({ state: "idle" }, dir, 14);
	dropLive(dir, 14);
	assert.equal(existsSync(join(dir, "14.json")), false);
	setLive({ state: "idle" }, join(dir, "14.json", "under-a-file"), 15);
});

function health(logs: string, cwd: string, ...args: string[]): { status: number | null; out: string } {
	const run = spawnSync(HEALTH, args, { cwd, env: { ...process.env, PI_LOG_DIR: logs }, encoding: "utf8" });
	return { status: run.status, out: run.stdout + run.stderr };
}

test("pi-health: lists each process and its jobs, exits 1 on a quiet one and on a dead main session, which it reports once", () => {
	const logs = temp("health");
	const cwd = temp("health-cwd");
	assert.deepEqual(health(logs, cwd), { status: 0, out: "  no pi process has a live-state file\n" });
	const now = Date.now();
	const jobLog = join(cwd, "bg1.log");
	writeFileSync(jobLog, "listening\n");
	setLive({ ...live({ cwd, since: now - 5000, active: now - 5000 }), jobs: [{ id: "bg1", command: "npm run dev", log: jobLog, started: now - 90_000 }] }, join(logs, "live"));
	const fine = health(logs, cwd);
	assert.equal(fine.status, 0, fine.out);
	assert.match(fine.out, /^  main   abc123  \S+  5s  bash npm test\n      bg1  running 1m30s, last output \ds ago  npm run dev\n$/);
	const quiet = health(logs, cwd, "--limit", "1");
	assert.equal(quiet.status, 1);
	assert.match(quiet.out, /^! main   abc123 .* bash npm test  \u00b7 no activity for \ds\n/);
	const gone = spawnSync("true").pid ?? 0;
	setLive(live({ session: "01a1-session-dead00", cwd, state: "idle", what: "", since: now, active: now }), join(logs, "live"), gone);
	const died = health(logs, cwd);
	assert.equal(died.status, 1);
	assert.match(died.out, /^! main   dead00  \S+  \u00b7 died without a clean shutdown\n/);
	assert.equal(health(logs, cwd).status, 0, "reported once");
	assert.equal(health(logs, cwd, "--help").status, 0);
});

test("pi-health: an auto run whose session is not running is a problem; one whose session is live is not", () => {
	const logs = temp("health-run");
	const repo = temp("health-repo");
	execFileSync("git", ["init", "-q", repo]);
	const now = Date.now();
	setLive(live({ session: "s1", cwd: repo, state: "idle", what: "", since: now, active: now }), join(logs, "live"));
	writeFileSync(join(repo, "AUTO.md"), "session: s1\n- [ ] 1. parse, branch slice/parse\n");
	const owned = health(logs, repo);
	assert.equal(owned.status, 0, owned.out);
	assert.match(owned.out, /\n  auto   \S+  1 open, next: 1\. parse\n$/);
	writeFileSync(join(repo, "AUTO.md"), "session: s2\n- [ ] 1. parse, branch slice/parse\n");
	const orphaned = health(logs, repo);
	assert.equal(orphaned.status, 1);
	assert.match(orphaned.out, /\n! auto   \S+  1 open, next: 1\. parse  \u00b7 its session \(s2\) is not running\n$/);
	mkdirSync(join(repo, "docs"));
	setLive(live({ role: "scout", session: "c1", cwd: join(repo, "docs"), since: now, active: now }), join(logs, "live"), process.ppid);
	assert.equal(health(logs, repo).status, 1, "a scout elsewhere in the repo is not carrying the run");
	const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { stdio: "ignore" });
	git("commit", "-q", "--allow-empty", "-m", "init");
	const slice = `${repo}.slice-parse`;
	git("worktree", "add", "-q", "-b", "slice/parse", slice);
	setLive(live({ role: "worker", session: "c1", cwd: slice, since: now, active: now }), join(logs, "live"), process.ppid);
	const carried = health(logs, repo);
	assert.equal(carried.status, 0, carried.out);
});
