import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keep, summary } from "../lib/health.ts";
import type { Problem } from "../lib/health.ts";

const health = fileURLToPath(new URL("../bin/pi-health", import.meta.url));

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let held: Array<Problem & { seen: number }> = [];
	let busy = false;
	let generation = 0;
	let stopped = false;

	const check = async (ctx: ExtensionContext): Promise<void> => {
		if (!ctx.hasUI || busy || stopped) return;
		busy = true;
		const started = generation;
		let text: string | undefined;
		try {
			const stdout = await new Promise<string>((resolve, reject) => {
				execFile(health, ["--json"], { timeout: 10_000, encoding: "utf8", cwd: ctx.cwd, env: { ...process.env } }, (err, stdout) => {
					if (err && (err.code !== 1 || err.killed || err.signal)) reject(err);
					else resolve(stdout);
				});
			});
			const data = JSON.parse(stdout);
			if (!data || !Array.isArray(data.problems) || !data.problems.every((p: unknown) =>
				p !== null && typeof p === "object" && ["key", "who", "flag", "session"].every((key) => typeof (p as Record<string, unknown>)[key] === "string")
			)) throw new Error("invalid JSON problems");
			if (stopped || started !== generation) return;
			held = keep(held, data.problems, Date.now(), 10 * 60_000);
			text = summary(held, ctx.sessionManager.getSessionId());
		} catch (err) {
			text = `! pi-health failed: ${String(err instanceof Error ? err.message : err).replace(/\s+/g, " ").trim()}`.slice(0, 110);
		} finally {
			busy = false;
		}
		if (!stopped && started === generation) ctx.ui.setStatus("health", text === undefined ? undefined : ctx.ui.theme.fg("warning", text));
	};

	pi.on("session_start", async (_event, ctx) => {
		generation++;
		stopped = false;
		if (timer) clearInterval(timer);
		timer = undefined;
		if (!ctx.hasUI) return;
		timer = setInterval(() => { void check(ctx); }, 60_000);
		timer.unref();
		void check(ctx);
	});
	pi.on("agent_end", async (_event, ctx) => { void check(ctx); });
	pi.on("session_shutdown", async () => {
		stopped = true;
		generation++;
		if (timer) clearInterval(timer);
		timer = undefined;
	});
}
