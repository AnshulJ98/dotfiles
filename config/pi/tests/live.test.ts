// Run: node --test 'config/pi/tests/*.test.ts'
// The events log (lib/events.ts), the live-state files (lib/live.ts) and bin/pi-health over them.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
	assert.deepEqual(sweep((pid) => pid === 11, NOW, dir, false).map((p) => p.pid), [12]);
	assert.equal(existsSync(join(dir, "12.json")), true);
	assert.equal(existsSync(join(dir, "13.json")), true, "non-removing sweep leaves stateless files too");
	assert.deepEqual(sweep((pid) => pid === 11, NOW, dir).map((p) => p.pid), [12], "13 is gone too, and left no state");
	assert.deepEqual(readLive(dir).map((p) => p.pid), [11]);
	assert.deepEqual(sweep(() => true, NOW + 1, dir).map((p) => p.pid), [11], "written before this boot: the pid is not that process");
	setLive({ state: "idle" }, dir, 14);
	dropLive(dir, 14);
	assert.equal(existsSync(join(dir, "14.json")), false);
	setLive({ state: "idle" }, join(dir, "14.json", "under-a-file"), 15);
});

test("pi-watch: three panes beside the current one in kitty, each next to the last; the three commands anywhere else", () => {
	const watch = resolve(import.meta.dirname, "../bin/pi-watch");
	const fake = temp("watch");
	const calls = join(fake, "calls");
	writeFileSync(join(fake, "kitten"), `#!/bin/sh\nprintf '%s\\n' "$*" >>"${calls}"\necho $((40 + $(wc -l <"${calls}")))\n`);
	chmodSync(join(fake, "kitten"), 0o755);
	const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${fake}:${process.env.PATH}`, PI_LOG_DIR: "/logs" };
	delete env.KITTY_LISTEN_ON;
	delete env.ZMX_SESSION; // set in every kitty pane; pi-watch would look up the real kitty
	const plain = spawnSync(watch, [], { env, encoding: "utf8" });
	assert.equal(plain.status, 0);
	assert.match(plain.stdout, /^'\S+\/bin\/pi-health' --watch 5\ntail -n 40 -F '\/logs\/bash\.log'\ntail -n 20 -F '\/logs\/events\.log'\n$/);
	assert.equal(existsSync(calls), false);
	const inKitty = spawnSync(watch, [], { env: { ...env, KITTY_LISTEN_ON: "unix:/tmp/k", KITTY_WINDOW_ID: "7" }, encoding: "utf8" });
	assert.equal(inKitty.status, 0, inKitty.stderr);
	const launched = readFileSync(calls, "utf8").trimEnd().split("\n");
	assert.equal(launched.length, 3);
	assert.match(launched[0], /^@ launch --match window_id:7 --source-window id:7 --add-to-session \. --next-to id:7 --location vsplit .* --title pi-health \/bin\/zsh -lc exec '\S+pi-health' --watch 5$/);
	assert.match(launched[1], /--next-to id:41 --location hsplit .* --title bash-log .*bash\.log'$/);
	assert.match(launched[2], /--next-to id:42 --location hsplit .* --title events .*events\.log'$/);
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

test("pi-health --json: clean, quiet, dead main until plain clears it, and orphan run", () => {
	const logs = temp("health-json"), cwd = temp("health-json-cwd");
	const json = (...args: string[]) => {
		const result = health(logs, cwd, "--json", ...args);
		assert.equal(result.out.split("\n").length, 2, "one JSON line");
		return { status: result.status, problems: JSON.parse(result.out).problems };
	};
	assert.deepEqual(json(), { status: 0, problems: [] });
	const now = Date.now(), session = "01a1-session-abc123";
	setLive(live({ cwd, since: now - 5000, active: now - 5000 }), join(logs, "live"));
	const quiet = json("--limit", "1");
	assert.equal(quiet.status, 1);
	assert.deepEqual(quiet.problems, [{ key: `quiet ${process.pid}`, who: `main abc123 ${cwd}`, flag: "no activity for 5s", session }]);
	dropLive(join(logs, "live"));
	const dead = spawnSync("true").pid!;
	setLive(live({ cwd, active: now, since: now }), join(logs, "live"), dead);
	const died = { status: 1, problems: [{ key: `gone ${dead}`, who: `main abc123 ${cwd}`, flag: "died without a clean shutdown", session }] };
	assert.deepEqual(json(), died);
	assert.deepEqual(json(), died);
	assert.equal(existsSync(join(logs, "live", `${dead}.json`)), true);
	const plain = health(logs, cwd);
	assert.equal(plain.status, 1);
	assert.match(plain.out, /main   abc123 .*died without a clean shutdown/);
	assert.equal(existsSync(join(logs, "live", `${dead}.json`)), false);
	assert.deepEqual(json(), { status: 0, problems: [] });
	setLive(live({ cwd, active: 1, since: 1 }), join(logs, "live"), dead);
	assert.deepEqual(json(), { status: 0, problems: [] });
	assert.equal(existsSync(join(logs, "live", `${dead}.json`)), true);
	assert.equal(health(logs, cwd).status, 1);
	assert.equal(existsSync(join(logs, "live", `${dead}.json`)), false);
	execFileSync("git", ["init", "-q", cwd]);
	writeFileSync(join(cwd, "AUTO.md"), "session: absent\n- [ ] 1. parse, branch slice/parse\n");
	assert.deepEqual(json(), { status: 1, problems: [{ key: `run ${cwd}`, who: `auto ${cwd}`, flag: "its session (absent) is not running", session: "" }] });
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

	// A second run on the repo: the worker carries the run that started its slice (pi-auto/<effort>/<slice>.new), not both.
	writeFileSync(join(repo, "AUTO.md"), "- [ ] 1. parse, branch slice/parse\n");
	git("checkout", "-q", "-b", "auto/a");
	git("worktree", "add", "-q", "-b", "auto/b", `${repo}.auto-b`);
	writeFileSync(join(`${repo}.auto-b`, "AUTO.md"), "- [ ] 1. cache, branch slice/cache\n");
	mkdirSync(join(repo, ".git", "pi-auto", "a"), { recursive: true });
	writeFileSync(join(repo, ".git", "pi-auto", "a", "parse.new"), "");
	const two = health(logs, repo);
	assert.equal(two.status, 1);
	assert.deepEqual(two.out.match(/^! auto .*$/gm), [`! auto   ${repo}.auto-b  1 open, next: 1. cache  \u00b7 no session owns it (no session: line)`], two.out);
});

test("pi-health: a repo a pi process was seen in is remembered, so its run is reported from anywhere once nothing is live", () => {
	const logs = temp("health-known");
	const repo = temp("health-known-repo");
	const elsewhere = temp("health-elsewhere");
	execFileSync("git", ["init", "-q", repo]);
	const now = Date.now();
	setLive(live({ session: "s1", cwd: repo, state: "idle", what: "", since: now, active: now }), join(logs, "live"));
	writeFileSync(join(repo, "AUTO.md"), "session: s1\n- [ ] 1. parse, branch slice/parse\n");
	assert.equal(health(logs, elsewhere).status, 0);
	assert.equal(health(logs, elsewhere).status, 0, "the shell's own folder is looked at, not remembered");
	assert.equal(readFileSync(join(logs, "repos"), "utf8"), `${join(repo, ".git")}\n`);
	rmSync(join(logs, "live"), { recursive: true });
	const later = health(logs, elsewhere);
	assert.equal(later.status, 1);
	assert.match(later.out, /^! auto   \S+  1 open, next: 1\. parse  \u00b7 its session \(s1\) is not running\n$/);
	rmSync(repo, { recursive: true });
	assert.equal(health(logs, elsewhere).status, 0, "a repo that no longer exists is dropped");
	assert.equal(readFileSync(join(logs, "repos"), "utf8"), "");
});
