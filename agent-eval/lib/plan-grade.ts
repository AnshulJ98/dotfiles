// Pure grading of a plan (the "plan" role): assemble the worker's spec from a planner's reply and run the six
// mechanical checks on it; plus a thin CLI for trial.sh, check-judges.sh and validate.sh (commands: see main).
// A spec block is "---", a files-allowed: line, other frontmatter lines, "---"; the planner's /plan prompt ends its
// plan with one (usually in a code fence). The spec the worker gets is that block, a blank line, then the rest of the reply.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTestPath, parsePorcelain } from "./record.ts";
import { normalizeItems } from "./review.ts";

export interface Assembled { spec: string; body: string }
export interface Mechanical { accepted: boolean; covers: boolean; tight: boolean; grounded: boolean; readonly: boolean; short: boolean }
export interface MechanicalInput {
	reply: string;
	/** non-test files the reference fix changes */
	fixFiles: string[];
	/** test files the reference fix changes */
	testPaths: string[];
	/** does this repo-relative path exist in the planner's workspace */
	existing: (path: string) => boolean;
	/** paths the planner changed in the workspace */
	changed: string[];
}

const isRule = (line: string): boolean => line.trim() === "---";
const isFence = (line: string): boolean => line.trim().startsWith("```");

/** The last "---" ... "---" block of the reply that has a files-allowed: line (fence around it removed), and the rest as the body. */
export function assemble(reply: string): Assembled | undefined {
	const lines = reply.split("\n");
	for (let j = lines.length - 1; j >= 0; j--) {
		if (!isRule(lines[j])) continue;
		let i = j - 1;
		while (i >= 0 && !isRule(lines[i])) i--;
		if (i < 0) return undefined;
		if (!lines.slice(i + 1, j).some((l) => /^\s*files-allowed:/.test(l))) continue;
		let from = i;
		let to = j;
		let a = i - 1;
		let b = j + 1;
		while (a >= 0 && lines[a].trim() === "") a--;
		while (b < lines.length && lines[b].trim() === "") b++;
		if (a >= 0 && b < lines.length && isFence(lines[a]) && lines[b].trim() === "```") [from, to] = [a, b];
		const block = lines.slice(i, j + 1).join("\n");
		const before = lines.slice(0, from).join("\n").trim();
		const after = lines.slice(to + 1).join("\n").trim();
		const body = before !== "" && after !== "" ? before + "\n\n" + after : before + after;
		return { spec: block + "\n\n" + body + "\n", body };
	}
	return undefined;
}

const unquote = (s: string): string => s.trim().replace(/^(['"`])(.*)\1$/, "$2").trim().replace(/^(\.\/)+/, "");

/** The files-allowed list (flow "[a, b]" or block "- a" form) and the tests value of a block; a list in any other form is empty. */
function frontmatter(spec: string): { files: string[]; tests: string } {
	const lines = spec.split("\n");
	const end = lines.findIndex((l, k) => k > 0 && isRule(l));
	const fm = lines.slice(1, end === -1 ? lines.length : end);
	let files: string[] = [];
	const at = fm.findIndex((l) => /^files-allowed:/.test(l));
	if (at !== -1) {
		const rest = fm[at].slice("files-allowed:".length).trim();
		if (rest.startsWith("[")) {
			let text = rest;
			for (let k = at + 1; !text.includes("]") && k < fm.length; k++) text += " " + fm[k].trim();
			const close = text.indexOf("]");
			if (close !== -1 && /^(?:\s*#.*)?$/.test(text.slice(close + 1))) files = text.slice(1, close).split(",").map(unquote);
		} else if (rest === "") {
			for (let k = at + 1; k < fm.length; k++) {
				const m = /^\s*-\s+(.*)$/.exec(fm[k]);
				if (m) files.push(unquote(m[1]));
				else if (fm[k].trim() !== "") break;
			}
		}
	}
	const tests = fm.find((l) => /^tests:/.test(l))?.slice("tests:".length).trim() ?? "";
	return { files: files.filter((f) => f !== ""), tests };
}

const UNDER_TMP = /(^|[^\w/.~-])\/tmp(?![\w-])/;
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,7}$/;
const PATHLIKE = /^[A-Za-z0-9_@.][A-Za-z0-9_.@-]*(\/[A-Za-z0-9_.@-]+)+$/;

/** Repo-relative file paths a text names: tokens with a "/" and a file extension, not starting with "~" or "/", ":<line>" removed. */
export function namedPaths(text: string): string[] {
	const found = text
		.split(/[\s`'"()[\]{}<>,;|]+/)
		.map((t) => t.replace(/^\*+/, "").replace(/[*.:!?]+$/, "").replace(/(:\d+)+(-\d+)?$/, "").replace(/[*.:!?]+$/, ""))
		.filter((t) => PATHLIKE.test(t) && EXTENSION.test(t))
		.map((t) => t.replace(/^(\.\/)+/, ""));
	return [...new Set(found)];
}

/** The six checks. When no usable spec was found only readonly can be true. */
export function mechanical(input: MechanicalInput): Mechanical {
	const readonly = input.changed.length === 0;
	const none: Mechanical = { accepted: false, covers: false, tight: false, grounded: false, readonly, short: false };
	const got = assemble(input.reply);
	if (got === undefined) return none;
	const { files, tests } = frontmatter(got.spec);
	const numbered = /^\s*\d+[.)]\s/m.test(got.body);
	if (files.length === 0 || tests === "" || UNDER_TMP.test(tests) || !numbered || !got.body.includes("check:")) return none;
	const fix = input.fixFiles.map((f) => f.replace(/^(\.\/)+/, ""));
	const known = new Set([...fix, ...input.testPaths]);
	return {
		accepted: true,
		covers: fix.every((f) => files.includes(f)),
		tight: files.every((f) => known.has(f) || isTestPath(f)),
		grounded: namedPaths(got.body).every((p) => files.includes(p) || input.existing(p)),
		readonly,
		short: got.body.split(/\s+/).filter((w) => w !== "").length <= 450,
	};
}

/** The planner's prompt: the prompt file without its leading frontmatter, every "$@" replaced by the ticket. */
export function renderPrompt(prompt: string, ticket: string): string {
	let body = prompt;
	if (/^---[ \t]*\n/.test(body)) {
		const close = /\n---[ \t]*(\n|$)/.exec(body.slice(3));
		if (close) body = body.slice(3 + close.index + close[0].length);
	}
	return body.split("$@").join(ticket.trim());
}

const git = (repo: string, ...args: string[]): string => execFileSync("git", ["-C", repo, "-c", "core.quotepath=off", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });

/** The reference fix's changed paths, split into non-test files and test files. */
export function fixPaths(repo: string, fix: string): { fixFiles: string[]; testPaths: string[] } {
	const names = git(repo, "diff", "--name-only", fix + "^", fix).split("\n").filter((l) => l !== "");
	return { fixFiles: names.filter((n) => !isTestPath(n)), testPaths: names.filter(isTestPath) };
}

const RUBRIC_FILE = join(import.meta.dirname, "../fixtures/plan/rubric.json");
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const home = (p: string): string => p.replace(/^~(?=\/|$)/, process.env.HOME ?? "~");

interface Task { repo: string; fix: string; decisions: unknown }
function readTask(dir: string): Task {
	const t = readJson(join(dir, "task.json")) as Record<string, unknown>;
	return { repo: home(String(t.repo ?? "")), fix: String(t.fix ?? ""), decisions: t.decisions };
}

/** The rubric followed by the task's decisions, as [{id, text}]; throws when decisions are not a list of {id, text}. */
function allItems(decisions: unknown): { id: string; text: string }[] {
	const items = [...normalizeItems(readJson(RUBRIC_FILE)), ...normalizeItems(decisions ?? [])];
	if (new Set(items.map((x) => x.id)).size !== items.length) throw new Error("item ids are not unique");
	return items.map(({ id, text }) => ({ id, text }));
}

const jsonOr = <T>(path: string, fallback: T): T => {
	try { return readJson(path) as T; } catch { return fallback; }
};
const readOr = (path: string): string => {
	try { return readFileSync(path, "utf8"); } catch { return ""; }
};

function mechanicalFor(reply: string, ws: string, changed: string[], task: Task): Mechanical {
	const within = (p: string): boolean => resolve(ws, p).startsWith(resolve(ws) + "/") && existsSync(resolve(ws, p));
	return mechanical({ reply, ...fixPaths(task.repo, task.fix), existing: within, changed });
}

/** Empty when the task's files are sound (ticket, decisions, samples, gold), else the first reason. */
function checkTask(dir: string, ws: string): string {
	if (readOr(join(dir, "ticket.md")).trim() === "") return "ticket.md is missing or empty";
	const task = readTask(dir);
	const rubric = (readJson(RUBRIC_FILE) as { id: string }[]).map((x) => x.id);
	const d = task.decisions;
	const bad = (x: unknown): boolean => typeof x !== "object" || x === null || ["id", "text"].some((k) => typeof (x as Record<string, unknown>)[k] !== "string" || ((x as Record<string, string>)[k]).trim() === "");
	if (!Array.isArray(d) || d.some(bad)) return "decisions must be a list of {id, text}";
	const ids = (d as { id: string }[]).map((x) => x.id);
	if (new Set(ids).size !== ids.length) return "decision ids are not unique";
	if (ids.some((id) => rubric.includes(id))) return "a decision id collides with a rubric id";
	if (!existsSync(join(dir, "samples.json"))) return "";
	const samples: unknown = (() => { try { return readJson(join(dir, "samples.json")); } catch { return undefined; } })();
	const known = new Set([...rubric, ...ids]);
	const idList = (x: unknown): x is string[] => Array.isArray(x) && x.every((i) => typeof i === "string");
	const shape = "samples.json must be a JSON list of {file, yes, no}";
	if (!Array.isArray(samples)) return shape;
	for (const s of samples as { file?: unknown; yes?: unknown; no?: unknown }[]) {
		if (typeof s?.file !== "string" || !idList(s.yes ?? []) || !idList(s.no ?? [])) return shape;
		if (!existsSync(join(dir, s.file))) return "samples.json names a file that does not exist: " + s.file;
		const unknown = [...(s.yes ?? []), ...(s.no ?? [])].find((i) => !known.has(i));
		if (unknown !== undefined) return "samples.json names an unknown item id: " + unknown;
	}
	if (!existsSync(join(dir, "gold.md"))) return "samples.json needs gold.md";
	const m = mechanicalFor(readOr(join(dir, "gold.md")), ws, [], task);
	const failed = Object.entries(m).filter(([, ok]) => !ok).map(([k]) => k);
	return failed.length ? "gold.md fails the mechanical check: " + failed.join(", ") : "";
}

/**
 * Commands: render <prompt.md> <ticket.md> (the planner prompt); assemble <reply.txt> <spec.md> (exit 1, empty file, without a
 * spec block); mechanical <reply.txt> <ws> <porcelain.txt> <task-dir> (the checks as a JSON line); items <task-dir> <out.json> (the
 * rubric, then the decisions; exit 1 when invalid); context <task-dir> <out.txt> (ticket and reference diff); check <task-dir> <ws>
 * (prints why the task's files are unsound); sample-files <task-dir>; report <task-dir> <file> <trial-dir> (one line per sample id
 * from the judge run in <trial-dir>; exit 1 on a miss).
 */
function main([command, ...args]: string[]): number {
	switch (command) {
		case "render":
			return (process.stdout.write(renderPrompt(readFileSync(args[0], "utf8"), readFileSync(args[1], "utf8"))), 0);
		case "assemble": {
			const got = assemble(readOr(args[0]));
			writeFileSync(args[1], got?.spec ?? "");
			return got ? 0 : 1;
		}
		case "mechanical": {
			const changed = parsePorcelain(readOr(args[2]));
			console.log(JSON.stringify(mechanicalFor(readOr(args[0]), args[1], changed, readTask(args[3]))));
			return 0;
		}
		case "items": {
			try {
				writeFileSync(args[1], JSON.stringify(allItems(readTask(args[0]).decisions)) + "\n");
			} catch (e) {
				return (console.error(`items: ${e instanceof Error ? e.message : e}`), 1);
			}
			return 0;
		}
		case "context": {
			const task = readTask(args[0]);
			writeFileSync(args[1], readFileSync(join(args[0], "ticket.md"), "utf8").trim() + "\n\nReference diff:\n" + git(task.repo, "diff", task.fix + "^", task.fix));
			return 0;
		}
		case "check": {
			const reason = (() => { try { return checkTask(args[0], args[1]); } catch (e) { return e instanceof Error ? e.message : String(e); } })();
			if (reason) console.log(reason);
			return 0;
		}
		case "sample-files":
			return (jsonOr<{ file: string }[]>(join(args[0], "samples.json"), []).forEach((s) => console.log(s.file)), 0);
		case "report": {
			const sample = jsonOr<{ file: string; yes?: string[]; no?: string[] }[]>(join(args[0], "samples.json"), []).find((s) => s.file === args[1]);
			const judge = join(args[2], "judge");
			const ids = jsonOr<{ id: string }[]>(join(judge, "items.json"), []).map((x) => x.id);
			const [a, b] = ["a", "b"].map((side) => jsonOr<boolean[]>(join(judge, `verdicts-${side}.json`), []));
			const show = (v: boolean | undefined): string => (v === true ? "yes" : v === false ? "no" : "none");
			let status = 0;
			for (const [want, list] of [["yes", sample?.yes ?? []], ["no", sample?.no ?? []]] as const) {
				for (const id of list) {
					const [x, y] = [a, b].map((v) => show(v[ids.indexOf(id)]));
					if (x !== want || y !== want) status = 1;
					console.log(`${args[1]} ${id} want=${want}: a=${x} b=${y}; ${x === want && y === want ? "ok" : "MISS"}`);
				}
			}
			return status;
		}
		default:
			console.error("usage: plan-grade.ts render|assemble|mechanical|items|context|check|sample-files|report ...");
			return 2;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
