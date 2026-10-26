/**
 * Stream watchdog: aborts a model response whose stream has gone silent, then
 * asks once for a continuation.
 *
 * Pi's httpIdleTimeoutMs never reaches the Bedrock path (pi-ai
 * bedrock-converse-stream.js calls client.send with only an abort signal), and
 * work reports showed hung responses killed by hand after 8 to 47 minutes.
 * Every provider stream event (text, thinking summary, tool-call delta) resets
 * the clock. On a stall: ctx.abort(), then one "continue" user message once the
 * run settles (agent_before_settle does not fire after an abort, so the resume
 * goes through agent_settled). A second stall in a row only reports.
 *
 * Loaded in the main session and passed to scout children with -e. bin/scout
 * has an outer, longer limit for a child whose event loop is itself stuck.
 * PI_STREAM_STALL_MS overrides the limit (tests).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const MINUTE = 60_000;
const RESUME = "The previous response stalled and was cut off. Continue where you stopped.";

export default function (pi: ExtensionAPI): void {
	let timer: NodeJS.Timeout | undefined;
	let stalled = false;
	let resumed = false;

	const limitMs = (): number => {
		const override = Number(process.env.PI_STREAM_STALL_MS);
		if (override > 0) return override;
		const level = pi.getThinkingLevel();
		// Long thinking may stream nothing for minutes when the provider sends no summaries; workers run unattended
		return level === "xhigh" || level === "max" || process.env.PI_WORKER_SPEC ? 10 * MINUTE : 5 * MINUTE;
	};
	const disarm = () => {
		clearTimeout(timer);
		timer = undefined;
	};
	const arm = (ctx: ExtensionContext) => {
		disarm();
		// A local server (mlx-local) can take longer than any limit to read a long prompt; there is no network to hang
		if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(ctx.model?.baseUrl ?? "")) return;
		const ms = limitMs();
		timer = setTimeout(() => {
			timer = undefined;
			stalled = true;
			const note = `stream-watchdog: no model output for ${Math.round(ms / 1000)}s; aborting the response`;
			if (ctx.hasUI) ctx.ui.notify(note, "warning");
			else process.stderr.write(`${note}\n`);
			ctx.abort();
		}, ms);
		timer.unref();
	};

	pi.on("before_provider_request", (_event, ctx) => {
		arm(ctx);
		return undefined;
	});
	pi.on("provider_stream_event", (_event, ctx) => {
		if (timer) arm(ctx);
	});
	pi.on("message_end", (event) => {
		if (event.message.role === "assistant") disarm();
	});
	pi.on("agent_settled", (event, ctx) => {
		disarm();
		if (!stalled) {
			resumed = false;
			return;
		}
		stalled = false;
		if (!event.aborted) return;
		if (resumed) {
			const note = "stream-watchdog: the model stream stalled again after one resume; stopping";
			if (ctx.hasUI) ctx.ui.notify(note, "error");
			else process.stderr.write(`${note}\n`);
			resumed = false;
			return;
		}
		resumed = true;
		pi.sendUserMessage(RESUME);
	});
	pi.on("session_shutdown", () => {
		disarm();
	});
}
