/**
 * Job watchdog decisions: pure functions, no I/O. extensions/background.ts
 * samples processes and feeds readings in; tests/watchdog.test.ts covers the
 * rows the spikes established.
 *
 * Order of trust: exit, wake_on, declared signals ($PI_HEARTBEAT, a bg_run
 * health command), output, then CPU/network/process changes. Once a job has
 * declared a signal (touched the heartbeat once), that signal decides in both
 * directions. No evidence (ps or nettop failed) never kills and never wakes.
 *
 * Kept outside extensions/ so a machine that loads that directory wholesale
 * never mistakes this file for an extension.
 */

/** One sample of a job's process group. */
export interface Reading {
	/** Summed CPU seconds of the group. */
	cpu: number;
	/** Sorted pid list, so a fork or exit shows as a change. */
	pids: string;
	/** Summed nettop bytes in+out, or undefined when nettop failed. */
	net: number | undefined;
}

export type Activity = "cpu" | "net" | "procs";

/** Per-job clocks. Monotonic times (performance.now) except heartbeat math, which uses wall time. */
export interface Track {
	lastOut: number;
	lastActive: number;
	lastTick: number;
	/** Wall-clock ms of the start or the last gap reset; a heartbeat older than this counts from here. */
	sinceWall: number;
	prev?: Reading;
	why?: Activity;
	/** The last tick had full evidence (ps and nettop both answered). */
	evidence: boolean;
}

/**
 * Any CPU increase counts: a throttled download used 0.01s per 15s and a 0.05
 * threshold killed it. ps reports 0.01s steps; this only absorbs float noise.
 */
export const CPU_EPSILON = 1e-6;
/** A tick gap longer than this many ticks (Mac sleep, a blocked event loop) restarts the quiet clocks. */
export const GAP_TICKS = 3;

export function startTrack(now: number, wallNow: number): Track {
	return { lastOut: now, lastActive: now, lastTick: now, sinceWall: wallNow, evidence: false };
}

export function noteOutput(track: Track, now: number): Track {
	return { ...track, lastOut: now };
}

/** Fold one sampler tick into the track. `reading` undefined means ps failed or the group is gone. */
export function observe(track: Track, reading: Reading | undefined, now: number, wallNow: number, tickMs: number): Track {
	if (now - track.lastTick > GAP_TICKS * tickMs) {
		return { lastOut: now, lastActive: now, lastTick: now, sinceWall: wallNow, prev: reading, evidence: false };
	}
	if (!reading) return { ...track, lastTick: now, evidence: false };
	const prev = track.prev;
	let why: Activity | undefined;
	if (prev) {
		if (reading.cpu - prev.cpu > CPU_EPSILON) why = "cpu";
		else if (reading.net !== undefined && prev.net !== undefined && reading.net > prev.net) why = "net";
		else if (reading.pids !== prev.pids) why = "procs";
	}
	return {
		...track,
		lastTick: now,
		prev: reading,
		lastActive: why ? now : track.lastActive,
		why: why ?? track.why,
		evidence: prev !== undefined && reading.net !== undefined,
	};
}

/** ms since the heartbeat file was last touched, counted from the track's start; undefined when never touched. */
export function heartbeatAge(heartbeatMtime: number | undefined, track: Track, wallNow: number): number | undefined {
	if (heartbeatMtime === undefined || heartbeatMtime <= 0) return undefined;
	return wallNow - Math.max(heartbeatMtime, track.sinceWall);
}

export interface ForegroundInput {
	now: number;
	idleMs: number;
	/** From heartbeatAge; undefined when the command never touched $PI_HEARTBEAT. */
	heartbeatAgeMs: number | undefined;
	/** ssh, docker, scout and the like: legitimately silent, killed only by a stale declared heartbeat. */
	exempt: boolean;
}

/** Whether a foreground bash command should be killed as idle. */
export function foregroundVerdict(track: Track, input: ForegroundInput): "keep" | "kill" {
	if (input.heartbeatAgeMs !== undefined) return input.heartbeatAgeMs >= input.idleMs ? "kill" : "keep";
	if (input.exempt || !track.evidence) return "keep";
	const quiet = input.now - track.lastOut;
	const idle = input.now - track.lastActive;
	return quiet >= input.idleMs && idle >= input.idleMs ? "kill" : "keep";
}

export interface BackgroundState {
	wakes: number;
	/** Monotonic time of the last watchdog wake, 0 before the first. */
	lastWakeAt: number;
	/** The health command failed on the previous check, so a new failure is not news. */
	unhealthy: boolean;
}

export interface BackgroundInput {
	now: number;
	idleMs: number;
	busyMs: number;
	maxWakes: number;
	heartbeatAgeMs: number | undefined;
	/** Result of a health check run this tick; undefined when none ran. */
	healthy: boolean | undefined;
	/** Fall back to output/CPU/network; false when the job declared a signal or waits on wake_on. */
	inferred: boolean;
}

export interface BackgroundResult {
	state: BackgroundState;
	/** Why Pi should be woken, or undefined. */
	alert?: string;
}

function minutes(ms: number): string {
	return `${Math.round(ms / 60_000)}m`;
}

/**
 * Whether a background job deserves one wake. Never kills: the model decides.
 * Each repeat waits three times longer (5m, 15m, 45m), up to maxWakes per job.
 * A failing health check is a declared signal, so it wakes even past the cap.
 */
export function backgroundVerdict(track: Track, state: BackgroundState, input: BackgroundInput): BackgroundResult {
	const healthState = input.healthy === undefined ? state : { ...state, unhealthy: !input.healthy };
	const wake = (alert: string): BackgroundResult => ({ state: { ...healthState, wakes: state.wakes + 1, lastWakeAt: input.now }, alert });
	if (input.healthy === false && !state.unhealthy) return wake("health check failed");
	if (state.wakes >= input.maxWakes) return { state: healthState };
	const scale = 3 ** state.wakes;
	const idleLimit = input.idleMs * scale;
	const sinceWake = state.lastWakeAt > 0 ? input.now - state.lastWakeAt : Number.POSITIVE_INFINITY;
	if (sinceWake < idleLimit) return { state: healthState };
	if (input.heartbeatAgeMs !== undefined) {
		return input.heartbeatAgeMs >= idleLimit ? wake(`no heartbeat for ${minutes(input.heartbeatAgeMs)}`) : { state: healthState };
	}
	if (!input.inferred || !track.evidence) return { state: healthState };
	const quiet = input.now - Math.max(track.lastOut, state.lastWakeAt);
	const idle = input.now - Math.max(track.lastActive, state.lastWakeAt);
	if (quiet >= idleLimit && idle >= idleLimit) return wake(`no output, CPU or network for ${minutes(quiet)}`);
	if (quiet >= input.busyMs * scale) return wake(`busy but no output for ${minutes(quiet)}`);
	return { state: healthState };
}

/** The job-line suffix: "quiet 7m · busy", or "" while output is recent. */
export function describeQuiet(track: Track, now: number, tickMs: number): string {
	const quiet = now - track.lastOut;
	if (quiet < 60_000) return "";
	const recent = now - track.lastActive <= 2 * tickMs;
	const label = !recent ? "idle" : track.why === "net" ? "downloading" : track.why === "procs" ? "working" : "busy";
	return `quiet ${minutes(quiet)} · ${label}`;
}

const EXEMPT = /(^|[;&|(\s])(ssh|mosh|docker|podman|kubectl|scout|timeout|gtimeout)(\s|$)/;

/** Commands that wait silently by design; the idle kill leaves them alone unless they declare a heartbeat. */
export function isExempt(command: string): boolean {
	return EXEMPT.test(command.replace(/(^|\s)\S*\/(?=\w)/g, "$1"));
}
