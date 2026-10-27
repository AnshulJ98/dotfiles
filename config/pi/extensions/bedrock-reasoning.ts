// Ask Bedrock Converse for OpenAI GPT reasoning summaries so Pi shows thinking.
// Pi sends additionalModelRequestFields.reasoning.effort for GPT models but no
// summary; the Bedrock model card says Converse returns summaries only when
// reasoning.summary is set. Replaces the hand-written work "mantle" extension,
// which went through a separate OpenAI-compatible endpoint. Use the us. or
// global. model ids: the bare openai.gpt-5.6-luna id fails on runtime.
// Streaming summaries also keep stream-watchdog.ts from mistaking thinking for a stall.
//
// pi-ai replays earlier non-Claude thinking as reasoningContent.reasoningText, and
// Bedrock GPT rejects it ("This model doesn't support the
// reasoningContent.reasoningText.text field for assistant messages"), so every
// request after a tool call failed. Those blocks are dropped from GPT history;
// encrypted reasoning (reasoningContent.redactedContent) is still replayed. An
// assistant message left empty is dropped, as pi-ai drops empty ones.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEBUG = process.env.PI_BEDROCK_REASONING_DEBUG === "1";

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isReasoningText(block: unknown): boolean {
	return isRecord(block) && isRecord(block.reasoningContent) && block.reasoningContent.reasoningText !== undefined;
}

/** The messages without replayed reasoning text, or undefined when there is none. */
function withoutReasoningText(messages: unknown): unknown[] | undefined {
	if (!Array.isArray(messages)) return undefined;
	let changed = false;
	const next: unknown[] = [];
	for (const m of messages) {
		if (!isRecord(m) || m.role !== "assistant" || !Array.isArray(m.content) || !m.content.some(isReasoningText)) {
			next.push(m);
			continue;
		}
		changed = true;
		const content = m.content.filter((b) => !isReasoningText(b));
		if (content.length > 0) next.push({ ...m, content });
	}
	return changed ? next : undefined;
}

export default function (pi: ExtensionAPI): void {
	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== "amazon-bedrock") return undefined;
		const p = event.payload;
		if (!isRecord(p)) return undefined;

		const messages = ctx.model.id.includes("openai.") ? withoutReasoningText(p.messages) : undefined;

		const fields = p.additionalModelRequestFields;
		const reasoning = isRecord(fields) ? fields.reasoning : undefined;
		const addSummary = isRecord(fields) && isRecord(reasoning) && reasoning.summary === undefined;

		if (!messages && !addSummary) return undefined;
		const next = {
			...p,
			...(messages ? { messages } : {}),
			...(addSummary ? { additionalModelRequestFields: { ...fields, reasoning: { ...reasoning, summary: "auto" } } } : {}),
		};
		if (DEBUG) process.stderr.write(`[bedrock-reasoning] ${JSON.stringify(next.additionalModelRequestFields)}\n`);
		return next;
	});
}
