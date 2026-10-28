/**
 * OpenAI models (Copilot GPT, Sol) fill in every field of a tool's schema, and
 * pi-ask-user 0.17.0 rejects what they send, so the model resends the same call
 * until the turn runs out (edlsh/pi-ask-user#88, open). Two shapes seen from
 * github-copilot/gpt-6-luna:
 * - A batch with `"context": "", "options": [], "allowMultiple": false` at the top
 *   level: any non-null top-level field next to `questions` is an error
 *   (index.ts normalizeBatchQuestions).
 * - One question padded into `questions` to reach the 2-entry minimum, with a blank
 *   entry or the same question twice.
 *
 * Before ask_user runs, this drops blank and repeated entries; a single entry left
 * over becomes a plain single question. For a real batch it drops the top-level
 * booleans and an empty context or options. A real top-level context or options
 * list is left in place, so pi-ask-user still tells the model to move it.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const isEmpty = (value: unknown) => value == null || value === "" || (Array.isArray(value) && value.length === 0);
const ENTRY_FIELDS = ["context", "options", "allowMultiple", "allowFreeform"] as const;

export function normalizeAskArgs(input: Record<string, unknown>): void {
	if (!Array.isArray(input.questions)) return;
	const seen = new Set<string>();
	const entries = input.questions.filter((entry): entry is Record<string, unknown> => {
		const text = typeof entry?.question === "string" ? entry.question.trim().toLowerCase() : "";
		if (!text || seen.has(text)) return false;
		seen.add(text);
		return true;
	});
	if (entries.length < 2) {
		delete input.questions;
		const [only] = entries;
		if (!only) return;
		input.question = only.question;
		for (const field of ENTRY_FIELDS) if (!isEmpty(only[field])) input[field] = only[field];
		return;
	}
	input.questions = entries;
	delete input.allowMultiple;
	delete input.allowFreeform;
	if (isEmpty(input.context)) delete input.context;
	if (isEmpty(input.options)) delete input.options;
}

export default function (pi: ExtensionAPI): void {
	pi.on("tool_call", async (event) => {
		if (event.toolName === "ask_user") normalizeAskArgs(event.input as Record<string, unknown>);
	});
}
