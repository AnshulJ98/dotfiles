// Run: node --test config/pi/tests/
// The before_provider_request handler gets the Bedrock Converse input pi-ai builds
// (bedrock-converse-stream.js: onPayload(commandInput, model)).
import assert from "node:assert/strict";
import { test } from "node:test";
import bedrockReasoning from "../extensions/bedrock-reasoning.ts";

type Handler = (event: { payload: unknown }, ctx: { model?: { provider: string; id: string } }) => unknown;

let handler: Handler | undefined;
bedrockReasoning({ on: (_name: string, fn: Handler) => { handler = fn; } } as never);

function run(payload: unknown, provider: string, id: string): unknown {
	assert.ok(handler, "extension registered no handler");
	return handler({ payload }, { model: { provider, id } });
}

function deepFreeze<T>(value: T): T {
	if (typeof value === "object" && value !== null) {
		for (const v of Object.values(value)) deepFreeze(v);
		Object.freeze(value);
	}
	return value;
}

const thinking = { reasoningContent: { reasoningText: { text: "Clarifying the request" } } };
const encrypted = { reasoningContent: { redactedContent: "AAEC" } };
const toolUse = { toolUse: { toolUseId: "t1", name: "ask_user", input: {} } };

function gptPayload() {
	return deepFreeze({
		modelId: "us.openai.gpt-5.6-sol",
		messages: [
			{ role: "user", content: [{ text: "sine & cosine" }] },
			{ role: "assistant", content: [thinking, encrypted, { text: "Which one?" }, toolUse] },
			{ role: "user", content: [{ toolResult: { toolUseId: "t1", content: [{ text: "graphs" }] } }] },
			{ role: "assistant", content: [thinking] },
			{ role: "user", content: [{ text: "go on" }] },
		],
		additionalModelRequestFields: { reasoning: { effort: "high" } },
	});
}

test("Bedrock GPT: replayed reasoning text is dropped, encrypted reasoning, text and tool calls stay", () => {
	const input = gptPayload();
	const out = run(input, "amazon-bedrock", "us.openai.gpt-5.6-sol");
	assert.deepEqual(out, {
		modelId: "us.openai.gpt-5.6-sol",
		messages: [
			{ role: "user", content: [{ text: "sine & cosine" }] },
			{ role: "assistant", content: [encrypted, { text: "Which one?" }, toolUse] },
			{ role: "user", content: [{ toolResult: { toolUseId: "t1", content: [{ text: "graphs" }] } }] },
			{ role: "user", content: [{ text: "go on" }] },
		],
		additionalModelRequestFields: { reasoning: { effort: "high", summary: "auto" } },
	});
});

test("Bedrock GPT with the summary already set still loses replayed reasoning text", () => {
	const input = deepFreeze({
		messages: [{ role: "assistant", content: [thinking, { text: "hi" }] }],
		additionalModelRequestFields: { reasoning: { effort: "low", summary: "detailed" } },
	});
	assert.deepEqual(run(input, "amazon-bedrock", "global.openai.gpt-5.6-luna"), {
		messages: [{ role: "assistant", content: [{ text: "hi" }] }],
		additionalModelRequestFields: { reasoning: { effort: "low", summary: "detailed" } },
	});
});

test("payloads that need no change return undefined", () => {
	const claude = deepFreeze({
		messages: [{ role: "assistant", content: [{ reasoningContent: { reasoningText: { text: "t", signature: "s" } } }] }],
		additionalModelRequestFields: { thinking: { type: "enabled" } },
	});
	assert.equal(run(claude, "amazon-bedrock", "us.anthropic.claude-sonnet-5-5"), undefined);
	assert.equal(run(gptPayload(), "openai", "gpt-5.6-sol"), undefined);
	const clean = deepFreeze({
		messages: [{ role: "assistant", content: [encrypted, { text: "hi" }] }],
		additionalModelRequestFields: { reasoning: { effort: "high", summary: "auto" } },
	});
	assert.equal(run(clean, "amazon-bedrock", "us.openai.gpt-5.6-sol"), undefined);
});
