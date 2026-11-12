// Pure helpers for grading a review (see judge.sh): parsing judge replies, the found/disagreement arithmetic, prompt
// rendering, plus a thin CLI for judge.sh and trial.sh (commands: see main).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "./record.ts";

export interface Finding { file: string; line: number | null; severity: "high" | "medium" | "low"; claim: string }
export interface Defect { id: string; text: string; hit: string }

/** The outermost JSON array in a reply (first "[" to last "]"), parsed; undefined when there is none or it is not JSON. */
function outerArray(text: string): unknown[] | undefined {
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	if (start === -1 || end < start) return undefined;
	try {
		const parsed: unknown = JSON.parse(text.slice(start, end + 1));
		return Array.isArray(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

/** Findings from an extractor reply; every item needs a non-empty claim, the rest is normalised. Undefined when unparseable. */
export function parseFindings(text: string): Finding[] | undefined {
	const items = outerArray(text);
	if (items === undefined) return undefined;
	const findings: Finding[] = [];
	for (const item of items) {
		const v = item as Record<string, unknown> | null;
		if (typeof v !== "object" || v === null || typeof v.claim !== "string" || v.claim.trim() === "") return undefined;
		const severity = typeof v.severity === "string" ? v.severity.toLowerCase() : "";
		findings.push({
			file: typeof v.file === "string" ? v.file : "",
			line: typeof v.line === "number" && Number.isFinite(v.line) ? v.line : null,
			severity: severity === "high" || severity === "low" ? severity : "medium",
			claim: v.claim,
		});
	}
	return findings;
}

/** One boolean per defect from a judge reply ("yes"/"no" strings); undefined when unparseable or not exactly n answers. */
export function parseVerdicts(text: string, n: number): boolean[] | undefined {
	const items = outerArray(text);
	if (items === undefined || items.length !== n) return undefined;
	const answers = items.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""));
	return answers.every((a) => a === "yes" || a === "no") ? answers.map((a) => a === "yes") : undefined;
}

/** A defect is found when both judges say yes; disagreements lists the ids the judges split on. */
export function combine(a: boolean[], b: boolean[], ids: string[]): { found: number; disagreements: string[] } {
	if (a.length !== b.length || a.length !== ids.length) throw new RangeError("verdict and id lists differ in length");
	return { found: ids.filter((_, i) => a[i] && b[i]).length, disagreements: ids.filter((_, i) => a[i] !== b[i]) };
}

/** Replace each {{NAME}} by its value in one pass, so a value that contains a placeholder is left alone. */
export function render(template: string, values: Record<string, string>): string {
	return template.replace(/\{\{([A-Z]+)\}\}/g, (whole, name: string) => (name in values ? values[name] : whole));
}

/** The defect list as the match prompt shows it: numbered from 1, text only (never the hit sample). */
export const numberDefects = (defects: Defect[]): string => defects.map((d, i) => `${i + 1}. ${d.text}`).join("\n");

/** Text of the last assistant message (in a pi --mode json stream) that has any text. */
export function finalReply(streamLines: string[]): string {
	let reply = "";
	for (const line of streamLines) {
		let e: { type?: unknown; message?: { role?: unknown; content?: { type?: unknown; text?: unknown }[] } } | null;
		try {
			e = JSON.parse(line);
		} catch {
			continue;
		}
		if (e?.type !== "message_end" || e.message?.role !== "assistant" || !Array.isArray(e.message.content)) continue;
		const text = e.message.content.filter((p) => p?.type === "text").map((p) => String(p.text)).join("\n");
		if (text.trim() !== "") reply = text;
	}
	return reply;
}

const readDefects = (taskFile: string): Defect[] => JSON.parse(readFileSync(taskFile, "utf8")).defects;
const lines = (path: string): string[] => readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");

function judgeCost(dir: string): number {
	try {
		const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".jsonl"));
		return measure(files.flatMap((f) => lines(join(dir, f)))).cost;
	} catch {
		return 0;
	}
}

function readVerdicts(path: string): boolean[] | undefined {
	try {
		const v: unknown = JSON.parse(readFileSync(path, "utf8"));
		return Array.isArray(v) && v.every((x) => typeof x === "boolean") ? v : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Commands (output on stdout; exit 1 when a reply cannot be parsed):
 *   render-extract <template> <review.txt>                 the extractor prompt
 *   render-match <template> <findings.json> <task.json>    the matcher prompt
 *   findings <reply.txt> <out.json>                        parse an extractor reply, write the normalised findings
 *   verdicts <reply.txt> <n> <out.json>                    parse a judge reply, write the booleans
 *   result <task.json> <judge-dir>                         judge.sh's JSON line from <judge-dir>/verdicts-{a,b}.json and session costs
 *   final-reply <stream.jsonl>                             the reviewer's final text
 */
function main([command, ...args]: string[]): number {
	const read = (path: string): string => readFileSync(path, "utf8");
	const write = (path: string, value: unknown): number => (writeFileSync(path, JSON.stringify(value) + "\n"), 0);
	switch (command) {
		case "render-extract":
			return (process.stdout.write(render(read(args[0]), { REVIEW: read(args[1]) })), 0);
		case "render-match":
			return (process.stdout.write(render(read(args[0]), { FINDINGS: read(args[1]).trim(), DEFECTS: numberDefects(readDefects(args[2])) })), 0);
		case "findings": {
			const findings = parseFindings(read(args[0]));
			return findings === undefined ? 1 : write(args[1], findings);
		}
		case "verdicts": {
			const verdicts = parseVerdicts(read(args[0]), Number(args[1]));
			return verdicts === undefined ? 1 : write(args[2], verdicts);
		}
		case "result": {
			const ids = readDefects(args[0]).map((d) => d.id);
			const a = readVerdicts(join(args[1], "verdicts-a.json"));
			const b = readVerdicts(join(args[1], "verdicts-b.json"));
			const judged = a !== undefined && b !== undefined && a.length === ids.length && b.length === ids.length;
			const { found, disagreements } = judged ? combine(a, b, ids) : { found: 0, disagreements: [] };
			console.log(JSON.stringify({ found, of: ids.length, disagreements, judgeCost: judgeCost(args[1]), infra: !judged }));
			return 0;
		}
		case "final-reply":
			return (process.stdout.write(finalReply(lines(args[0]))), 0);
		default:
			console.error("usage: review.ts render-extract|render-match|findings|verdicts|result|final-reply ...");
			return 2;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
