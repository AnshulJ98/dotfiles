/**
 * The bash log: one line when a tool call starts and one when it ends, from every session,
 * scout and worker on the machine, in one file a pane can follow (`tail -F`). It began with
 * bash and kept the name; a bash line carries the cwd, any other tool its name.
 *
 *   22:41:07 main a31835 #9f2c ▶ [~/Dev/dotfiles] git add -- config/pi (+2 lines)
 *   22:41:08 main a31835 #9f2c ✓ 0.4s · changed: src/a.ts (+3 −1)
 *   22:41:09 main a31835 #c1/2 ▶ edit ~/Dev/dotfiles/src/a.ts
 *   22:43:10 worker 0c11d2 #77aa ✗ 91.2s exit 137 · [watchdog] killed: idle 90s (no output/CPU/network)
 *
 * A start line with no end line is a call still running, a call another extension blocked, or
 * a pi that died under it.
 * Formatting is pure; append() and rotate() are the only I/O.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

const MAX_COMMAND = 160;
const MAX_BYTES = 5 * 1024 * 1024;

export type Role = "main" | "scout" | "worker";

export interface Who {
	role: Role;
	/** Session id; the last six characters are shown. */
	session: string;
	/** Tool call id; the last four characters pair a start line with its end line. */
	call: string;
}

export interface Ended {
	ms: number;
	failed: boolean;
	exitCode?: number;
	/** The watchdog's line when it killed the command. */
	killed?: string;
	/** describe() of the files the call changed, or "". */
	changed: string;
}

/** bin/scout sets PI_SCOUT_DEPTH for every child and PI_WORKER_SPEC for a worker. */
export function roleOf(env: NodeJS.ProcessEnv): Role {
	if (env.PI_WORKER_SPEC) return "worker";
	return (env.PI_SCOUT_DEPTH ?? "0") === "0" ? "main" : "scout";
}

/**
 * Where the bash log, the events log and the live-state files go. `node --test` sets
 * NODE_TEST_CONTEXT in every test process: a test run never writes into the real directory.
 */
export function logsDir(env: NodeJS.ProcessEnv = process.env): string {
	if (env.PI_LOG_DIR) return env.PI_LOG_DIR;
	if (env.NODE_TEST_CONTEXT) return join(tmpdir(), "pi-test-logs");
	return join(env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "logs");
}

export function logPath(env: NodeJS.ProcessEnv = process.env): string {
	return env.PI_BASH_LOG ?? join(logsDir(env), "bash.log");
}

function prefix(at: Date, who: Who): string {
	const clock = [at.getHours(), at.getMinutes(), at.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
	return `${clock} ${who.role} ${who.session.slice(-6)} #${who.call.slice(-4)}`;
}

/** The command's first non-empty line, cut at 160 characters, with a count of the lines left out. */
export function summarize(command: string): string {
	const lines = command.split("\n").filter((line) => line.trim());
	const first = (lines[0] ?? "").trim();
	const shown = first.length > MAX_COMMAND ? `${first.slice(0, MAX_COMMAND)}\u2026` : first;
	return lines.length > 1 ? `${shown} (+${lines.length - 1} lines)` : shown;
}

function tilde(path: string, home: string): string {
	return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export function startLine(at: Date, who: Who, cwd: string, command: string, home = homedir()): string {
	return `${prefix(at, who)} \u25b6 [${tilde(cwd, home)}] ${summarize(command)}`;
}

/** The input fields that say what a call is pointed at, in the order tried. */
const SUBJECT_KEYS = ["path", "command", "url", "urls", "query", "queries", "question", "code", "library", "id"];

/** What a tool call is pointed at: its path, URL, query or a script's first line; else its first input field. */
export function subjectOf(input: unknown, home = homedir()): string {
	if (!input || typeof input !== "object") return "";
	const fields = input as Record<string, unknown>;
	const key = SUBJECT_KEYS.find((name) => fields[name] !== undefined) ?? Object.keys(fields)[0];
	if (key === undefined) return "";
	const value = fields[key];
	const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
	return summarize(key === "path" ? tilde(text, home) : text);
}

/** The start line of a tool other than bash. */
export function toolLine(at: Date, who: Who, tool: string, input: unknown, home = homedir()): string {
	return `${prefix(at, who)} \u25b6 ${tool} ${subjectOf(input, home)}`.trimEnd();
}

export function endLine(at: Date, who: Who, ended: Ended): string {
	const parts = [`${(ended.ms / 1000).toFixed(1)}s${ended.exitCode ? ` exit ${ended.exitCode}` : ""}`];
	if (ended.killed) parts.push(ended.killed);
	if (ended.changed) parts.push(`changed: ${ended.changed}`);
	return `${prefix(at, who)} ${ended.failed || ended.exitCode ? "\u2717" : "\u2713"} ${parts.join(" \u00b7 ")}`;
}

/** Keeps one old file: a log over 5 MB becomes <path>.1. Called once per process. */
export function rotate(path: string): void {
	try {
		if (statSync(path).size > MAX_BYTES) renameSync(path, `${path}.1`);
	} catch {
		// No log yet.
	}
}

/** Appends one line; false when the log cannot be written. */
export function append(path: string, line: string): boolean {
	try {
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, `${line}\n`);
		return true;
	} catch {
		return false;
	}
}
