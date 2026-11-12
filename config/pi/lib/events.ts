/**
 * The events log: one line each time a watchdog, guard or sensor trips, from every session,
 * scout and worker, so "how often does X fire" is a grep and not a scan of session files.
 *
 *   2026-11-11 22:43:10 main a31835 bash.kill killed: idle 90s (no output/CPU/network): npm test
 *   2026-11-11 22:51:02 worker 48654 worker.verdict PASS retries=0
 *
 * Kinds: stream.stall stream.stop bash.kill job.alert auto.block auto.dirty auto.nudge
 * worker.block worker.outside worker.retry worker.verdict, and from the shell scripts (which
 * write the same line with printf) scout.timeout scout.stall scout.refused review.round
 * slice.stop. The id is a session id's last six characters, or the scout directory's name for
 * a worker and for bin/scout, which is what auto-slice records per dispatch.
 */
import { join } from "node:path";
import { append, logsDir, roleOf, rotate } from "./bash-log.ts";

const MAX_DETAIL = 300;

/** Every line of the log; bin/scout and bin/auto-slice are tested against it too. */
export const EVENT_LINE = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d (main|scout|worker|review|auto) \S+ [a-z]+\.[a-z]+( .*)?$/;

export function eventsPath(env: NodeJS.ProcessEnv = process.env): string {
	return join(logsDir(env), "events.log");
}

export function eventLine(at: Date, role: string, id: string, kind: string, detail: string): string {
	const two = (n: number) => String(n).padStart(2, "0");
	const stamp = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
	const flat = detail.replace(/\s+/g, " ").trim();
	const shown = flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL)}\u2026` : flat;
	return `${stamp} ${role} ${id.slice(-6) || "-"} ${kind} ${shown}`.trimEnd();
}

/** Appends one event. Never throws: a log that cannot be written must not break the thing that tripped. */
export function logEvent(kind: string, detail: string, id = "", env: NodeJS.ProcessEnv = process.env): void {
	const path = eventsPath(env);
	rotate(path);
	append(path, eventLine(new Date(), roleOf(env), id, kind, detail));
}
