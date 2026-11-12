/**
 * Live state: one small file per pi process (<logs>/live/<pid>.json) saying what it is doing
 * right now, so a hung session can be seen from outside it. extensions/bash-changes.ts writes
 * the state on every tool and agent event and removes the file at shutdown; background.ts adds
 * the running bg_run jobs; bin/pi-health reads the files and prints flagFor()'s verdicts.
 *
 * The judging is pure; setLive(), dropLive() and readLive() are the only I/O.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { logsDir, type Role } from "./bash-log.ts";

export interface Job {
	id: string;
	command: string;
	log: string;
	/** Epoch ms. */
	started: number;
}

export interface Live {
	pid: number;
	role: Role;
	session: string;
	/** For a scout or worker: the session whose bash call started it (PI_SESSION_ID), when known. */
	parent?: string;
	sessionFile?: string;
	cwd: string;
	/** idle: waiting for the user; model: waiting for the model; tool: a tool call is open. */
	state: "idle" | "model" | "tool";
	/** The open tool calls, outermost first, joined with " › ". */
	what: string;
	/** Epoch ms the state began. */
	since: number;
	/** Epoch ms of the last tool or agent event. */
	active: number;
	jobs?: Job[];
}

export function liveDir(env: NodeJS.ProcessEnv = process.env): string {
	return join(logsDir(env), "live");
}

/** Merges the patch into this process's file. Never throws. */
export function setLive(patch: Partial<Live>, dir = liveDir(), pid = process.pid): void {
	const path = join(dir, `${pid}.json`);
	try {
		let current: Partial<Live> = {};
		try {
			current = JSON.parse(readFileSync(path, "utf8")) as Partial<Live>;
		} catch {
			// First write, or a file cut short: start over.
		}
		mkdirSync(dir, { recursive: true });
		writeFileSync(`${path}.tmp`, JSON.stringify({ ...current, ...patch, pid }));
		renameSync(`${path}.tmp`, path);
	} catch {
		// An unwritable logs directory costs the outside view, not the session.
	}
}

export function dropLive(dir = liveDir(), pid = process.pid): void {
	rmSync(join(dir, `${pid}.json`), { force: true });
}

/**
 * Removes the files of processes that are gone and returns the states they left. Gone: the pid
 * is not running, or the file was last written before this boot (the pid is someone else's now).
 */
export function sweep(isRunning: (pid: number) => boolean, bootMs: number, dir = liveDir()): Live[] {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const dead: Live[] = [];
	for (const name of names) {
		if (!/^\d+\.json$/.test(name)) continue;
		let live: Partial<Live> = {};
		try {
			live = JSON.parse(readFileSync(join(dir, name), "utf8")) as Partial<Live>;
		} catch {
			// Damaged: judged by its pid alone.
		}
		if (isRunning(Number.parseInt(name, 10)) && (live.active ?? bootMs) >= bootMs) continue;
		rmSync(join(dir, name), { force: true });
		if (live.state) dead.push(live as Live);
	}
	return dead;
}

/** Every readable state file that has a state (background.ts alone writes only the jobs). */
export function readLive(dir = liveDir()): Live[] {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const found: Live[] = [];
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		try {
			const live = JSON.parse(readFileSync(join(dir, name), "utf8")) as Live;
			if (typeof live.pid === "number" && live.state) found.push(live);
		} catch {
			// Mid-rename or damaged: the next read sees it.
		}
	}
	return found.sort((a, b) => a.since - b.since);
}

/**
 * The repos (git common dirs) a pi process has been seen in, kept in <logs>/repos with the ones
 * passed in added and the ones that no longer exist dropped. An auto run outlives the session
 * that started it; without the list it would be forgotten once nothing is running in its repo.
 */
export function knownRepos(seen: string[], file = join(logsDir(), "repos")): string[] {
	let known: string[] = [];
	try {
		known = readFileSync(file, "utf8").split("\n").filter(Boolean);
	} catch {
		// No list yet.
	}
	const all = [...new Set([...known, ...seen])].filter((dir) => existsSync(dir));
	if (all.join("\n") !== known.join("\n")) {
		try {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, all.map((dir) => `${dir}\n`).join(""));
		} catch {
			// Unwritable: this call still looks at what it was given.
		}
	}
	return all;
}

/** "45s", "2m10s", "1h05m". */
export function age(ms: number): string {
	const secs = Math.max(0, Math.round(ms / 1000));
	if (secs < 60) return `${secs}s`;
	if (secs < 3600) return `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, "0")}s`;
	return `${Math.floor(secs / 3600)}h${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}m`;
}

/**
 * What is wrong with a process, or undefined. A dead main session left its file behind, so it
 * did not shut down; a dead scout or worker is bin/scout's to report. A busy process is wrong
 * when it has had no tool or agent event for limitMs, which is set past every bound the harness
 * puts on one call (bash 10 min, a scout 15, the model stream 10), so reaching it means one of
 * those failed. Waiting on ask_user is waiting on a person, and a session whose scout or worker
 * is still active (childActive) is waiting on that.
 */
export function flagFor(live: Live, alive: boolean, now: number, limitMs: number, childActive = false): string | undefined {
	if (!alive) return live.role === "main" ? "died without a clean shutdown" : undefined;
	if (live.state === "idle" || childActive || /(^| \u203a )ask_user\b/.test(live.what)) return undefined;
	const quiet = now - live.active;
	return quiet > limitMs ? `no activity for ${age(quiet)}` : undefined;
}

export interface RunState {
	open: number;
	/** The first unticked slice line's text, or "". */
	next: string;
	stopped: boolean;
	flag?: string;
}

/**
 * An auto run from its AUTO.md. It is orphaned when slices are open, it is not stopped, and
 * nothing live is carrying it: no live session matches its `session:` line and no worker or
 * review is running in its worktrees (childInRun). Nobody is nudged for such a run.
 */
export function runState(autoMd: string, liveSessions: string[], childInRun: boolean): RunState {
	const open = autoMd.split("\n").filter((line) => /^- \[ \] /.test(line));
	const stopped = /^stopped:/m.test(autoMd);
	const owner = /^session:\s*(\S+)/m.exec(autoMd)?.[1];
	const state: RunState = { open: open.length, next: (open[0] ?? "").replace(/^- \[ \] /, "").split(",")[0], stopped };
	if (open.length === 0 || stopped || childInRun || (owner && liveSessions.includes(owner))) return state;
	return { ...state, flag: owner ? `its session (${owner.slice(-6)}) is not running` : "no session owns it (no session: line)" };
}
