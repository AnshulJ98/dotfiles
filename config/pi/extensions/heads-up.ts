/**
 * Heads-up — after a task with 3+ tool calls, asks the session's model for the
 * one thing the user might have missed and records it in the chat.
 *
 * Based on pi-heads-up 0.1.1 (github.com/Pringled/pi-extensions, MIT,
 * Copyright (c) Thomas van Dongen). Changes from upstream:
 * - The note is a session entry (pi.appendEntry), not a widget, so it stays in
 *   the scrollback after the next run starts. Entries are never sent to the model.
 * - Each entry shows what the side request cost and its cache-hit share, so the
 *   token spend is visible instead of hidden from the session totals.
 * - A NONE answer is recorded but not drawn, so its cost still reaches the
 *   footer total (context-bar.ts sums heads-up entries).
 * - Thinking is off: the note is one or two sentences, and thinking tokens
 *   would cost more than the answer.
 */
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { normalizeContext, type Usage } from "@earendil-works/pi-ai";
import { convertToLlm, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const PROMPT = `[Heads-up mode] Look back at the last task in this conversation. Is there one thing the user should know but could easily have missed? For example a tradeoff or assumption made without saying so, something that wasn't verified, a result that looks off, or a change beyond what they asked for. Leave out anything the last reply already says clearly, and anything minor. If there is such a thing, describe it in one or two plain sentences, at most 40 words, without markdown. Otherwise reply with exactly: NONE`;
// A quick question doesn't need a second look, only real work does
const MIN_TOOL_CALLS = 3;
// The note is optional, and a Bedrock stream has no timeout of its own
const TIMEOUT_MS = 60_000;

interface HeadsUpEntry {
	note: string | null;
	cost: number;
	cacheHit: number;
}

function cacheHitShare(usage: Usage): number {
	const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
	return prompt > 0 ? usage.cacheRead / prompt : 0;
}

export default function (pi: ExtensionAPI) {
	let pending: AbortController | undefined;

	pi.registerEntryRenderer<HeadsUpEntry>("heads-up", (entry, _options, theme) => {
		const d = entry.data;
		if (!d) return undefined;
		const pct = Math.round(d.cacheHit * 100);
		const meta = theme.fg("dim", ` · $${d.cost.toFixed(3)} · cache ${pct}%`);
		if (!d.note) return undefined;
		return new Text(theme.fg("warning", "✦ heads-up: ") + theme.fg("muted", d.note) + meta, 1, 0);
	});

	// A new run makes an in-flight question pointless; a finished note stays in the chat
	const cancel = async () => pending?.abort();
	pi.on("agent_start", cancel);
	pi.on("session_tree", cancel);

	pi.on("agent_end", async (event, ctx) => {
		const reply = event.messages.at(-1);
		if (ctx.mode !== "tui" || !ctx.model || reply?.role !== "assistant" || reply.stopReason !== "stop") return;
		if (ctx.hasPendingMessages() || event.messages.filter((m) => m.role === "toolResult").length < MIN_TOOL_CALLS) return;

		const controller = new AbortController();
		pending = controller;
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		timer.unref();
		const ask: AgentMessage = { role: "user", content: [{ type: "text", text: PROMPT }], timestamp: Date.now() };
		try {
			// The conversation exactly as pi sends it, so the request reuses pi's prompt cache
			const answer = await ctx.modelRegistry
				.streamSimple(ctx.model, normalizeContext({ messages: convertToLlm([...ctx.sessionManager.buildSessionProjection().messages, ask]) }), {
					maxTokens: 2000,
					sessionId: ctx.sessionManager.getSessionId(),
					signal: controller.signal,
				})
				.result();
			if (controller.signal.aborted || answer.stopReason !== "stop") return;
			const text = answer.content
				.map((part) => (part.type === "text" ? part.text : ""))
				.join("")
				.replace(/`/g, "")
				.replace(/\s+/g, " ")
				.trim();
			const note = text && !/^none\.?$/i.test(text) ? text : null;
			pi.appendEntry<HeadsUpEntry>("heads-up", { note, cost: answer.usage.cost.total, cacheHit: cacheHitShare(answer.usage) });
		} catch {
			// The note is optional, so failures stay quiet
		} finally {
			clearTimeout(timer);
			if (pending === controller) pending = undefined;
		}
	});
}
