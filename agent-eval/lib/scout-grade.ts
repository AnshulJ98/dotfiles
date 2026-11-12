// Pure grading of a scout digest against a task's expect list, plus a thin CLI for trial.sh and validate.sh:
//   scout-grade.ts grade <task.json> <digest-file>   print {"hits":n,"of":n,"pass":bool}
//   scout-grade.ts check <task.json> <workspace>     print nothing when every expect entry holds in the workspace, else the reason
// An expect entry is {file, lines: [a, b], must: [regex]}, or {at: [{file, lines}, ...], must: [regex]} when several
// places state the same fact (the definition and the use site, a header comment, a doc line). It is satisfied when the
// digest cites file:line (or file:a-b) inside [a, b] of any listed location and every must regex (case-insensitive)
// matches the digest.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Location { file: string; lines: [number, number] }
export type Expect = (Location | { at: Location[] }) & { must: string[] };
export interface Citation { file: string; from: number; to: number }
export interface ScoutGrade { hits: number; of: number; pass: boolean }

const CITATION = /([A-Za-z0-9_@.~+/-]+):L?(\d+)(?:[-\u2013]L?(\d+))?(?!\d)/g;

/** Every `path:line` and `path:a-b` in the digest, paths without a leading ./ and ranges ordered. */
export function citations(digest: string): Citation[] {
	const found: Citation[] = [];
	for (const m of digest.matchAll(CITATION)) {
		const a = Number(m[2]);
		const b = m[3] === undefined ? a : Number(m[3]);
		found.push({ file: m[1].replace(/^(\.\/)+/, ""), from: Math.min(a, b), to: Math.max(a, b) });
	}
	return found;
}

/** Where an entry's answer can be cited: its `at` list, or the one file and range of the short form. */
export function locations(e: Expect): Location[] {
	return "at" in e ? e.at : [{ file: e.file, lines: e.lines }];
}

/** A citation names the expected file when one path ends with the other at a "/" boundary (`bin/scout` and `scout` name config/pi/bin/scout; `out` does not). */
const names = (cited: string, file: string): boolean => cited === file || cited.endsWith(`/${file}`) || file.endsWith(`/${cited}`);

function matches(pattern: string, text: string): boolean {
	try {
		return new RegExp(pattern, "i").test(text);
	} catch {
		return false;
	}
}

/** hits: expect entries with an overlapping citation and every must matching the digest; pass: all of them, and at least one. */
export function grade(digest: string, expect: readonly Expect[]): ScoutGrade {
	const cited = citations(digest);
	const hits = expect.filter(
		(e) =>
			locations(e).some((at) => cited.some((c) => names(c.file, at.file) && c.from <= at.lines[1] && c.to >= at.lines[0])) &&
			e.must.every((pattern) => matches(pattern, digest)),
	).length;
	return { hits, of: expect.length, pass: expect.length > 0 && hits === expect.length };
}

/** The expect list of a parsed task.json, or the reason it is malformed. */
export function parseExpect(value: unknown): Expect[] | string {
	if (!Array.isArray(value) || value.length === 0) return "expect must be a non-empty list of {file, lines, must} or {at, must}";
	const list: Expect[] = [];
	for (const item of value as unknown[]) {
		const e = item as { at?: unknown; must?: unknown } | null;
		const must = typeof e === "object" && e !== null && Array.isArray(e.must) && e.must.every((p) => typeof p === "string") ? (e.must as string[]) : undefined;
		const places = must && (Array.isArray(e?.at) ? (e.at as unknown[]).map(parseLocation) : [parseLocation(item)]);
		if (!must || !places || places.length === 0 || places.some((l) => l === undefined)) return `bad expect entry: ${JSON.stringify(item)}`;
		list.push(Array.isArray(e?.at) ? { at: places as Location[], must } : { ...(places[0] as Location), must });
	}
	return list;
}

/** A {file, lines: [a, b]} with 1 <= a <= b, or undefined. */
function parseLocation(value: unknown): Location | undefined {
	const l = value as { file?: unknown; lines?: unknown } | null;
	const range = l?.lines;
	if (typeof l !== "object" || l === null || typeof l.file !== "string" || l.file === "") return undefined;
	if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => Number.isInteger(n) && n > 0) || range[0] > range[1]) return undefined;
	return { file: l.file, lines: [range[0], range[1]] };
}

/** Why an entry does not hold in the workspace text, or undefined: for every listed location the file exists, reaches line b, and lines a..b match every must. */
export function checkEntry(e: Expect, read: (file: string) => string | undefined): string | undefined {
	for (const at of locations(e)) {
		const text = read(at.file);
		if (text === undefined) return `${at.file} is not in the workspace`;
		const lines = text.split("\n");
		if (lines[lines.length - 1] === "") lines.pop();
		if (lines.length < at.lines[1]) return `${at.file} has ${lines.length} lines, expect ends at ${at.lines[1]}`;
		const range = lines.slice(at.lines[0] - 1, at.lines[1]).join("\n");
		for (const pattern of e.must) {
			try {
				new RegExp(pattern, "i");
			} catch {
				return `${at.file}: must is not a regex: ${pattern}`;
			}
			if (!matches(pattern, range)) return `${at.file}:${at.lines[0]}-${at.lines[1]} does not match /${pattern}/`;
		}
	}
	return undefined;
}

/** The first reason an entry of the task's expect list fails against the workspace directory, or "" when all hold. */
export function checkWorkspace(expectValue: unknown, ws: string): string {
	const expect = parseExpect(expectValue);
	if (typeof expect === "string") return expect;
	const read = (file: string): string | undefined => (existsSync(join(ws, file)) ? readFileSync(join(ws, file), "utf8") : undefined);
	for (const e of expect) {
		const reason = checkEntry(e, read);
		if (reason) return reason;
	}
	return "";
}

function expectOf(taskJson: string): unknown {
	return (JSON.parse(readFileSync(taskJson, "utf8")) as { expect?: unknown }).expect;
}

function main(argv: string[]): number {
	const [command, taskJson, target] = argv;
	if (!taskJson || !target) {
		console.error("usage: scout-grade.ts grade <task.json> <digest-file> | check <task.json> <workspace>");
		return 2;
	}
	if (command === "check") {
		const reason = checkWorkspace(expectOf(taskJson), target);
		if (reason) console.log(reason);
		return 0;
	}
	if (command === "grade") {
		const expect = parseExpect(expectOf(taskJson));
		const digest = existsSync(target) ? readFileSync(target, "utf8") : "";
		console.log(JSON.stringify(typeof expect === "string" ? { hits: 0, of: 0, pass: false } : grade(digest, expect)));
		return 0;
	}
	console.error(`scout-grade.ts: unknown command: ${String(command)}`);
	return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
