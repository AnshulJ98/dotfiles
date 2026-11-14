// Pure helpers for grading a list of items against a text (see judge.sh): item normalisation, parsing judge replies,
// the found/met/pass arithmetic, prompt rendering, plus a thin CLI for judge.sh and trial.sh (commands: see main).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "./usage.ts";
import { render } from "./render.ts";
export { render } from "./render.ts";

export interface Finding { file: string; line: number | null; severity: "high" | "medium" | "low"; claim: string }
export interface Defect { id: string; text: string; hit: string }
/** What the judges are asked about: a review defect, a fact or a rubric criterion. A minor item does not decide pass or fail. */
export interface Item { id: string; text: string; minor: boolean }

/** [{id, text, minor}] from a JSON list; throws an Error when it is not a list or an item lacks a non-empty string id or text. minor is true only for true. */
export function normalizeItems(raw: unknown): Item[] {
	if (!Array.isArray(raw)) throw new Error("items must be a list");
	return raw.map((x: unknown, i): Item => {
		const v = x as Record<string, unknown> | null;
		if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`item ${i + 1} is not an object`);
		if (typeof v.id !== "string" || v.id.trim() === "") throw new Error(`item ${i + 1} needs a non-empty string id`);
		if (typeof v.text !== "string" || v.text.trim() === "") throw new Error(`item ${i + 1} needs a non-empty string text`);
		return { id: v.id, text: v.text, minor: v.minor === true };
	});
}

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

/** The ids both judges said yes to, in item order. */
export function metIds(a: boolean[], b: boolean[], ids: string[]): string[] {
	if (a.length !== b.length || a.length !== ids.length) throw new RangeError("verdict and id lists differ in length");
	return ids.filter((_, i) => a[i] && b[i]);
}

/** A pass needs a judged result, at least one item, and every non-minor item met. */
export function passes(items: Item[], met: string[], infra: boolean): boolean {
	return !infra && items.length > 0 && items.every((x) => x.minor || met.includes(x.id));
}

/** The item list as a match prompt shows it: numbered from 1, text only (never the hit sample). */
export const numberDefects = (defects: { text: string }[]): string => defects.map((d, i) => `${i + 1}. ${d.text}`).join("\n");

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
 *   items <source.json> <key|-> <out.json>                 normalise the list at source[key] (- : the file is the list), write it, print its length; exit 1 when invalid or empty
 *   render-match <template> <items.json> [NAME=file ...]   the matcher prompt: {{ITEMS}} and {{DEFECTS}} are the numbered items, {{CONTEXT}} is "(none)" unless given, each NAME=file sets {{NAME}} to the file's trimmed text
 *   findings <reply.txt> <out.json>                        parse an extractor reply, write the normalised findings
 *   verdicts <reply.txt> <n> <out.json>                    parse a judge reply, write the booleans
 *   result <items.json> <judge-dir>                        judge.sh's JSON line from <judge-dir>/verdicts-{a,b}.json and session costs (infra, of 0 when items.json is missing)
 *   extract-result <judge-dir>                            extraction counts and session costs; infra when the extractor reply is missing or unparseable
 *   final-reply <stream.jsonl>                             the reviewer's final text
 */
function main([command, ...args]: string[]): number {
	const read = (path: string): string => readFileSync(path, "utf8");
	const write = (path: string, value: unknown): number => (writeFileSync(path, JSON.stringify(value) + "\n"), 0);
	switch (command) {
		case "render-extract":
			return (process.stdout.write(render(read(args[0]), { REVIEW: read(args[1]) })), 0);
		case "items": {
			let items: Item[];
			try {
				const source: unknown = JSON.parse(read(args[0]));
				items = normalizeItems(args[1] === "-" ? source : (source as Record<string, unknown> | null)?.[args[1]]);
			} catch (e) {
				return (console.error(`items: ${e instanceof Error ? e.message : e}`), 1);
			}
			if (items.length === 0) return (console.error("items: the list is empty"), 1);
			write(args[2], items);
			return (console.log(items.length), 0);
		}
		case "render-match": {
			const list = numberDefects(JSON.parse(read(args[1])));
			const values: Record<string, string> = { ITEMS: list, DEFECTS: list, CONTEXT: "(none)" };
			for (const pair of args.slice(2)) values[pair.slice(0, pair.indexOf("="))] = read(pair.slice(pair.indexOf("=") + 1)).trim();
			return (process.stdout.write(render(read(args[0]), values)), 0);
		}
		case "findings": {
			const findings = parseFindings(read(args[0]));
			return findings === undefined ? 1 : write(args[1], findings);
		}
		case "verdicts": {
			const verdicts = parseVerdicts(read(args[0]), Number(args[1]));
			return verdicts === undefined ? 1 : write(args[2], verdicts);
		}
		case "extract-result": {
			let findings: Finding[] | undefined;
			try {
				findings = parseFindings(read(join(args[0], "extract.reply.txt")));
			} catch {
				// Missing extractor reply is infra, just like an unparseable reply.
			}
			console.log(JSON.stringify({
				findings: findings?.length ?? 0,
				high: findings?.filter((f) => f.severity === "high").length ?? 0,
				judgeCost: judgeCost(args[0]), infra: findings === undefined,
			}));
			return 0;
		}
		case "result": {
			let items: Item[] = [];
			try {
				items = normalizeItems(JSON.parse(read(args[0])));
			} catch {
				// no usable item list: infra with nothing asked about
			}
			const ids = items.map((x) => x.id);
			const a = readVerdicts(join(args[1], "verdicts-a.json"));
			const b = readVerdicts(join(args[1], "verdicts-b.json"));
			const judged = ids.length > 0 && a !== undefined && b !== undefined && a.length === ids.length && b.length === ids.length;
			const { found, disagreements } = judged ? combine(a, b, ids) : { found: 0, disagreements: [] };
			const met = judged ? metIds(a, b, ids) : [];
			console.log(JSON.stringify({ found, of: ids.length, met, pass: passes(items, met, !judged), disagreements, judgeCost: judgeCost(args[1]), infra: !judged }));
			return 0;
		}
		case "final-reply":
			return (process.stdout.write(finalReply(lines(args[0]))), 0);
		default:
			console.error("usage: review.ts render-extract|items|render-match|findings|verdicts|result|extract-result|final-reply ...");
			return 2;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
