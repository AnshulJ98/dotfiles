// Ask Bedrock Converse for OpenAI GPT reasoning summaries so Pi shows thinking.
// Pi sends additionalModelRequestFields.reasoning.effort for GPT models but no
// summary; the Bedrock model card says Converse returns summaries only when
// reasoning.summary is set. Replaces the hand-written work "mantle" extension,
// which went through a separate OpenAI-compatible endpoint. Use the us. or
// global. model ids: the bare openai.gpt-5.6-luna id fails on runtime.
// Streaming summaries also keep stream-watchdog.ts from mistaking thinking for a stall.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEBUG = process.env.PI_BEDROCK_REASONING_DEBUG === "1";

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

export default function (pi: ExtensionAPI): void {
	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== "amazon-bedrock") return undefined;
		const p = event.payload;
		if (!isRecord(p) || !isRecord(p.additionalModelRequestFields)) return undefined;
		const reasoning = p.additionalModelRequestFields.reasoning;
		if (!isRecord(reasoning) || reasoning.summary !== undefined) return undefined;
		const next = {
			...p,
			additionalModelRequestFields: {
				...p.additionalModelRequestFields,
				reasoning: { ...reasoning, summary: "auto" },
			},
		};
		if (DEBUG) process.stderr.write(`[bedrock-reasoning] ${JSON.stringify(next.additionalModelRequestFields)}\n`);
		return next;
	});
}
