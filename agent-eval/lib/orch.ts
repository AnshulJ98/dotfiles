// Pure helpers for the orch role (a model picks the action the user's orchestration rules prescribe for one situation),
// plus a thin CLI for trial.sh and validate.sh (commands: see main).
// A reply's decision is the word after "DECISION:" on the first line of the reply that has one (any case, optional
// markdown bold or backticks around the label or the word, trailing text allowed). Only merge, rework, stop and fix are
// decisions; a reply without such a line, or whose first such line has another word, has no decision.
// An orch task is task.json {id, role: "orch", expect, rule: {lines: [from, to], must}} plus scenario.md; the rule
// points at the lines of fixtures/orch/rules.md that decide it and a phrase that occurs in them.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./review.ts";

export const DECISIONS = ["merge", "rework", "stop", "fix"] as const;
export type Decision = (typeof DECISIONS)[number];

const isDecision = (word: string): word is Decision => (DECISIONS as readonly string[]).includes(word);

/** The decision in a reply, or null. */
export function parseDecision(reply: string): Decision | null {
	for (const line of reply.split(/\r?\n/)) {
		const m = /\bDECISION[*`_ \t]*:[*`_ \t]*([A-Za-z]+)/i.exec(line);
		if (!m) continue;
		const word = m[1].toLowerCase();
		return isDecision(word) ? word : null;
	}
	return null;
}

/** Pass: the reply's decision equals expect (which must be one of the four). */
export function gradeOrch(reply: string, expect: string): boolean {
	const decision = parseDecision(reply);
	return decision !== null && decision === expect;
}

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Why a task is not valid, or "" when it is: expect is one of the four words, scenario.md is non-empty, and rule is
 * {lines: [from, to], must} with the phrase occurring (whitespace-insensitive) within those lines of the rules file.
 */
export function checkTask(taskDir: string, rulesPath: string): string {
	let task: unknown;
	try {
		task = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf8"));
	} catch {
		return "task.json is missing or not JSON";
	}
	const t = (typeof task === "object" && task !== null ? task : {}) as Record<string, unknown>;
	if (typeof t.expect !== "string" || !isDecision(t.expect)) return `expect must be one of ${DECISIONS.join(", ")}`;
	if (!existsSync(join(taskDir, "scenario.md")) || squash(readFileSync(join(taskDir, "scenario.md"), "utf8")) === "") return "scenario.md is missing or empty";
	const rule = (typeof t.rule === "object" && t.rule !== null ? t.rule : {}) as Record<string, unknown>;
	const range = rule.lines;
	if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => Number.isInteger(n))) return "rule.lines must be [from, to]";
	const rules = readFileSync(rulesPath, "utf8").replace(/\n$/, "").split("\n");
	const [from, to] = range as number[];
	if (from < 1 || to < from || to > rules.length) return `rule.lines must satisfy 1 <= from <= to <= ${rules.length}`;
	if (typeof rule.must !== "string" || squash(rule.must) === "") return "rule.must must be a non-empty phrase";
	if (!squash(rules.slice(from - 1, to).join(" ")).includes(squash(rule.must))) return `rule.must is not in the rules fixture lines ${from}-${to}`;
	return "";
}

/**
 * Commands (output on stdout):
 *   render <template> <rules.md> <scenario.md>   the prompt: {{RULES}} and {{SCENARIO}} are the files' text without the final newline
 *   check <task-dir> <rules.md>                  nothing when the task is valid, else the reason
 */
function main([command, ...args]: string[]): number {
	const trimmed = (path: string): string => readFileSync(path, "utf8").replace(/\s+$/, "");
	switch (command) {
		case "render":
			return (process.stdout.write(render(readFileSync(args[0], "utf8"), { RULES: trimmed(args[1]), SCENARIO: trimmed(args[2]) })), 0);
		case "check": {
			const reason = checkTask(args[0], args[1]);
			if (reason !== "") console.log(reason);
			return 0;
		}
		default:
			console.error("usage: orch.ts render|check ...");
			return 2;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
