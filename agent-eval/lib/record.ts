// Pure functions that build one worker-trial record, plus a thin CLI for trial.sh (flags: see main).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface Usage {
	cost: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	turns: number;
}

function parseLine(line: string): Json | undefined {
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

function asObject(value: Json | undefined): JsonObject | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function num(value: Json | undefined): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function messageOf(line: string): JsonObject | undefined {
	const entry = asObject(parseLine(line));
	return entry?.type === "message" ? asObject(entry.message) : undefined;
}

/** Sum usage over every assistant turn in the session lines. */
export function measure(sessionLines: string[]): Usage {
	const total: Usage = { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };
	for (const line of sessionLines) {
		const message = messageOf(line);
		if (message?.role !== "assistant") continue;
		const usage = asObject(message.usage);
		total.turns += 1;
		total.input += num(usage?.input);
		total.output += num(usage?.output);
		total.cacheRead += num(usage?.cacheRead);
		total.cacheWrite += num(usage?.cacheWrite);
		total.cost += num(asObject(usage?.cost)?.total);
	}
	return total;
}

/** True when any tool call's JSON-encoded arguments contain one of the needles. */
export function leaked(sessionLines: string[], needles: string[]): boolean {
	const wanted = needles.filter((n) => n !== "");
	return sessionLines.some((line) => {
		const content = messageOf(line)?.content;
		if (!Array.isArray(content)) return false;
		return content.some((part) => {
			const call = asObject(part);
			return call?.type === "toolCall" && wanted.some((n) => JSON.stringify(call.arguments ?? null).includes(n));
		});
	});
}

const clean = (path: string): string => path.replace(/^(\.\/)+/, "");

/** Changed files not covered by allowed (exact path, or a directory entry ending in "/"). */
export function outsideAllowed(changed: string[], allowed: string[]): string[] {
	const ok = allowed.map(clean);
	return changed.filter((f) => !ok.some((a) => (a.endsWith("/") ? clean(f).startsWith(a) : clean(f) === a)));
}

/** Paths from `git status --porcelain` output (the target of "a -> b"). */
export function parsePorcelain(porcelain: string): string[] {
	return porcelain
		.split("\n")
		.filter((l) => l.length > 3)
		.map((l) => l.slice(3).replace(/^.* -> /, ""));
}

/**
 * True when the digest has a "Blocked on me" section whose body is not "nothing" (an empty body is nothing).
 * The section ends at the next heading or the next bold label of the same shape.
 */
export function blocked(digest: string): boolean {
	const lines = digest.split("\n");
	const head = /^( *)([-*] +|#{1,6} +)?\*{0,2}Blocked on me:?\*{0,2}:? *(.*)$/i;
	for (let i = 0; i < lines.length; i++) {
		const m = head.exec(lines[i]);
		if (!m) continue;
		const bullet = m[2] !== undefined && /^[-*]/.test(m[2]) ? "([-*] +)?" : "";
		const label = new RegExp(`^ {0,${m[1].length}}${bullet}\\*\\*[^*]+\\*\\*`);
		const body = [m[3]];
		for (let j = i + 1; j < lines.length && !/^#{1,6} /.test(lines[j]) && !label.test(lines[j]); j++) body.push(lines[j]);
		const text = body.join(" ").replace(/\s+/g, " ").trim().replace(/^[-*] +/, "").replace(/[. ]+$/, "").toLowerCase();
		return text !== "" && text !== "nothing";
	}
	return false;
}

/** Pass: for expect "blocked", nothing changed and the digest names a blocker; else test exit 0. */
export function grade(g: { expect: string; testExit: number | null; changed: string[]; digest: string }): boolean {
	return g.expect === "blocked" ? g.changed.length === 0 && blocked(g.digest) : g.testExit === 0;
}

export interface Judged {
	found: number;
	of: number;
	disagreements: string[];
	judgeCost: number;
	infra: boolean;
}

/** judge.sh's JSON line; anything unreadable is an infra result with nothing found. */
export function parseJudged(text: string): Judged {
	const none: Judged = { found: 0, of: 0, disagreements: [], judgeCost: 0, infra: true };
	const v = asObject(parseLine(text.trim()));
	if (v === undefined || typeof v.found !== "number" || typeof v.of !== "number" || !Array.isArray(v.disagreements)) return none;
	return {
		found: v.found, of: v.of, disagreements: v.disagreements.filter((d): d is string => typeof d === "string"),
		judgeCost: num(v.judgeCost), infra: v.infra === true,
	};
}

/** A review passes when it found every defect and the judging itself worked. */
export function gradeReview(j: Judged): boolean {
	return !j.infra && j.of > 0 && j.found === j.of;
}

function readText(path: string | undefined): string {
	try {
		return readFileSync(path ?? "", "utf8");
	} catch {
		return "";
	}
}

const lines = (text: string): string[] => text.split("\n").filter((l) => l.trim() !== "");

function main(argv: string[]): void {
	const str = { type: "string", default: "" } as const;
	const { values: v } = parseArgs({
		args: argv,
		options: {
			task: str, role: str, model: str, thinking: str, trial: str, rc: str, seconds: str, expect: str,
			"test-exit": str, porcelain: str, "allowed-file": str, added: str, "sessions-dir": str, "digest-file": str, dir: str, "judge-file": str,
			needle: { type: "string", multiple: true, default: [] },
		},
	});
	const files = readdirSync(v["sessions-dir"] ?? "", { recursive: true, encoding: "utf8" }).sort().map((p) => join(v["sessions-dir"] ?? "", p));
	const sessionLines = files.filter((f) => f.endsWith(".jsonl")).flatMap((f) => lines(readText(f)));
	const verdictFile = files.filter((f) => f.endsWith("/verdict.json")).pop();
	const verdict = asObject(parseLine(readText(verdictFile)))?.verdict;
	const usage = measure(sessionLines);
	if (v.role === "review") {
		const judged = parseJudged(readText(v["judge-file"]));
		console.log(JSON.stringify({
			task: v.task, role: v.role, model: v.model, thinking: v.thinking, trial: Number(v.trial),
			pass: gradeReview(judged), found: judged.found, of: judged.of, disagreements: judged.disagreements, judgeCost: judged.judgeCost,
			rc: Number(v.rc), seconds: Number(v.seconds), ...usage,
			leak: leaked(sessionLines, v.needle ?? []), infra: usage.turns === 0 || judged.infra, dir: v.dir,
		}));
		return;
	}
	const changed = parsePorcelain(readText(v.porcelain));
	const testExit = v["test-exit"] === "" ? null : Number(v["test-exit"]);
	const record = {
		task: v.task, role: v.role, model: v.model, thinking: v.thinking, trial: Number(v.trial),
		pass: grade({ expect: v.expect ?? "", testExit, changed, digest: readText(v["digest-file"]) }),
		sensors: typeof verdict === "string" ? verdict : null,
		rc: Number(v.rc), seconds: Number(v.seconds),
		outside: outsideAllowed(changed, lines(readText(v["allowed-file"]))),
		added: Number(v.added), ...usage,
		leak: leaked(sessionLines, v.needle ?? []), infra: usage.turns === 0, dir: v.dir,
	};
	console.log(JSON.stringify(record));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
