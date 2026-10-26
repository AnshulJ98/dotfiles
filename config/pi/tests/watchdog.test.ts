// Run: node --test config/pi/tests/
// Rows mirror the /tmp spikes run against Pi 1.4.0's bash operations (hung curl,
// sleep, chatty loop, busy loop, throttled download, heartbeat, broken ps).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	backgroundVerdict,
	type BackgroundState,
	describeQuiet,
	foregroundVerdict,
	heartbeatAge,
	isExempt,
	noteOutput,
	observe,
	type Reading,
	startTrack,
	type Track,
} from "../lib/watchdog.ts";

const TICK = 5_000;
const IDLE = 90_000;

interface Tick {
	cpu?: number; // CPU seconds added this tick
	net?: number; // bytes added this tick
	fork?: boolean; // pid set changed
	out?: boolean; // printed output this tick
	noPs?: boolean; // ps failed
	noNet?: boolean; // nettop failed
}

/** Replays `count` ticks of `tick` from t=0 and returns the final track and time. */
function replay(count: number, tick: Tick | ((i: number) => Tick)): { track: Track; now: number } {
	let track = startTrack(0, 1_000_000);
	let cpu = 1;
	let net = 100;
	let pids = "10,11";
	let now = 0;
	for (let i = 1; i <= count; i += 1) {
		now = i * TICK;
		const t = typeof tick === "function" ? tick(i) : tick;
		cpu += t.cpu ?? 0;
		net += t.net ?? 0;
		if (t.fork) pids = `10,11,${100 + i}`;
		if (t.out) track = noteOutput(track, now);
		const reading: Reading | undefined = t.noPs ? undefined : { cpu, pids, net: t.noNet ? undefined : net };
		track = observe(track, reading, now, 1_000_000 + now, TICK);
	}
	return { track, now };
}

const fg = (track: Track, now: number, extra: { exempt?: boolean; heartbeatAgeMs?: number } = {}) =>
	foregroundVerdict(track, { now, idleMs: IDLE, heartbeatAgeMs: extra.heartbeatAgeMs, exempt: extra.exempt ?? false });

const FOREGROUND: Array<[string, number, Tick | ((i: number) => Tick), "keep" | "kill", { exempt?: boolean; heartbeatAgeMs?: number }?]> = [
	["hung curl: no output, CPU, network or forks", 20, {}, "kill"],
	["sleep: idle just under the limit", 17, {}, "keep"],
	["chatty loop prints every tick", 40, { out: true }, "keep"],
	["busy loop burns CPU silently", 40, { cpu: 5 }, "keep"],
	["throttled download: 0.01s CPU and bytes each tick", 40, { cpu: 0.01, net: 300_000 }, "keep"],
	["download with flat CPU but growing bytes", 40, { net: 50_000 }, "keep"],
	["one ps step (0.01s CPU) still counts", 40, { cpu: 0.01 }, "keep"],
	["process churn counts as activity", 40, (i) => ({ fork: i % 2 === 0 }), "keep"],
	["broken ps: no evidence, never kill", 40, { noPs: true }, "keep"],
	["broken nettop: no evidence, never kill", 40, { noNet: true }, "keep"],
	["exempt command (ssh) idle", 40, {}, "keep", { exempt: true }],
	["fresh heartbeat beats idle CPU", 40, {}, "keep", { heartbeatAgeMs: 10_000 }],
	["stale heartbeat beats busy CPU", 40, { cpu: 5 }, "kill", { heartbeatAgeMs: IDLE }],
	["stale heartbeat kills even an exempt command", 40, {}, "kill", { exempt: true, heartbeatAgeMs: IDLE + 1 }],
	["went quiet after early output", 40, (i) => ({ out: i < 10 }), "kill"],
];

for (const [name, ticks, tick, want, extra] of FOREGROUND) {
	test(`foreground: ${name}`, () => {
		const { track, now } = replay(ticks, tick);
		assert.equal(fg(track, now, extra), want);
	});
}

test("foreground: a tick gap (Mac sleep) restarts the quiet clocks", () => {
	let { track } = replay(10, {});
	const late = 10 * TICK + 4 * TICK + 1;
	track = observe(track, { cpu: 1, pids: "10,11", net: 100 }, late, 1_000_000 + late, TICK);
	assert.equal(track.lastOut, late);
	assert.equal(track.lastActive, late);
	assert.equal(fg(track, late + IDLE - 1), "keep");
});

test("heartbeatAge: never touched is undefined; older than the start counts from the start", () => {
	const track = startTrack(0, 5_000);
	assert.equal(heartbeatAge(undefined, track, 9_000), undefined);
	assert.equal(heartbeatAge(1_000, track, 9_000), 4_000);
	assert.equal(heartbeatAge(8_000, track, 9_000), 1_000);
});

const BG = { idleMs: 5 * 60_000, busyMs: 30 * 60_000, maxWakes: 3 };
const fresh: BackgroundState = { wakes: 0, lastWakeAt: 0, unhealthy: false };

/** Runs the background verdict every tick for `minutes` and returns the alerts with the minute they fired. */
function bgRun(
	minutes: number,
	tick: Tick,
	opts: { heartbeatAgeMs?: (now: number) => number | undefined; healthy?: (i: number) => boolean | undefined; inferred?: boolean } = {},
): string[] {
	let track = startTrack(0, 0);
	let state = fresh;
	let cpu = 1;
	let net = 0;
	const alerts: string[] = [];
	const ticks = (minutes * 60_000) / TICK;
	for (let i = 1; i <= ticks; i += 1) {
		const now = i * TICK;
		cpu += tick.cpu ?? 0;
		net += tick.net ?? 0;
		if (tick.out) track = noteOutput(track, now);
		track = observe(track, tick.noPs ? undefined : { cpu, pids: "1", net }, now, now, TICK);
		const result = backgroundVerdict(track, state, { ...BG, now, heartbeatAgeMs: opts.heartbeatAgeMs?.(now), healthy: opts.healthy?.(i), inferred: opts.inferred ?? true });
		state = result.state;
		if (result.alert) alerts.push(`${Math.round(now / 60_000)}m ${result.alert}`);
	}
	return alerts;
}

test("background: idle job wakes at 5m, then 15m and 45m later, then stops", () => {
	assert.deepEqual(bgRun(120, {}), ["5m no output, CPU or network for 5m", "20m no output, CPU or network for 15m", "65m no output, CPU or network for 45m"]);
});

test("background: busy but silent wakes at 30m only", () => {
	assert.deepEqual(bgRun(60, { cpu: 2 }), ["30m busy but no output for 30m"]);
});

test("background: chatty job never wakes", () => {
	assert.deepEqual(bgRun(120, { out: true }), []);
});

test("background: download (bytes moving) never wakes before the busy limit", () => {
	assert.deepEqual(bgRun(29, { net: 1000 }), []);
});

test("background: wake_on or declared jobs are not judged by CPU/network", () => {
	assert.deepEqual(bgRun(120, {}, { inferred: false }), []);
});

test("background: no evidence never wakes", () => {
	assert.deepEqual(bgRun(60, { noPs: true }), []);
});

test("background: health failure wakes at once, once per failure streak", () => {
	// Checked every 30s (6 ticks): down from 2m to 4m, up again, down again at 5m.
	const healthy = (i: number) => (i % 6 !== 0 ? undefined : !((i >= 24 && i <= 48) || i === 60));
	assert.deepEqual(bgRun(6, { out: true }, { healthy }), ["2m health check failed", "5m health check failed"]);
});

test("background: declared heartbeat decides both ways", () => {
	assert.deepEqual(bgRun(30, {}, { heartbeatAgeMs: () => 1_000 }), []);
	assert.deepEqual(bgRun(6, { cpu: 2, out: true }, { heartbeatAgeMs: (now) => now }), ["5m no heartbeat for 5m"]);
});

test("describeQuiet labels what the quiet job is doing", () => {
	const busy = replay(20, { cpu: 1 });
	assert.equal(describeQuiet(busy.track, busy.now, TICK), "quiet 2m · busy");
	const dl = replay(20, { net: 10 });
	assert.equal(describeQuiet(dl.track, dl.now, TICK), "quiet 2m · downloading");
	const idle = replay(20, {});
	assert.equal(describeQuiet(idle.track, idle.now, TICK), "quiet 2m · idle");
	const chatty = replay(20, { out: true });
	assert.equal(describeQuiet(chatty.track, chatty.now, TICK), "");
});

const EXEMPT: Array<[string, boolean]> = [
	["ssh host uptime", true],
	["/usr/local/bin/docker logs -f web", true],
	["cd app && kubectl rollout status deploy/x", true],
	["timeout 30 make test", true],
	["~/.pi/agent/bin/scout 'map the repo'", true],
	["curl -s http://x/", false],
	["sleep 20", false],
	["npm test", false],
	["sshfs-helper --version", false],
];
for (const [command, want] of EXEMPT) {
	test(`isExempt: ${command}`, () => assert.equal(isExempt(command), want));
}
