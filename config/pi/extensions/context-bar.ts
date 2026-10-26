/**
 * Context bar — one-line footer: model, branch, context bar, cache, cost.
 *
 * Based on pi-context-bar 0.1.0 (github.com/Pringled/pi-extensions, MIT,
 * Copyright (c) Thomas van Dongen). Changes from upstream:
 * - The bar fills against compact-cap's live threshold, not the model window: with
 *   a 1M window the upstream bar sits at 0 cells until ~60k and compaction fires
 *   at 21%. compact-cap.ts publishes it under Symbol.for("pi.compact-cap.threshold");
 *   0 (off) or missing falls back to the model window.
 * - The cwd folder name precedes the branch.
 * - The cost total includes heads-up side requests (heads-up.ts entries).
 * - Shows the last request's cache-hit share, which pi's default footer had.
 * - Renders extension statuses (ctx.ui.setStatus, e.g. scout) on a second
 *   line; upstream dropped them.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";

const BAR_WIDTH = 20;
const MIN_BAR_WIDTH = 5;
const CAP = Symbol.for("pi.compact-cap.threshold");

function compactCap(): number {
	const value = (globalThis as Record<symbol, unknown>)[CAP];
	return typeof value === "number" && value > 0 ? value : 0;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export default function (pi: ExtensionAPI) {
	let redraw = () => {};
	pi.on("thinking_level_select", async () => redraw());

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			redraw = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					let cost = 0;
					let last: AssistantMessage | undefined;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							last = e.message as AssistantMessage;
							cost += last.usage.cost.total;
						} else if (e.type === "custom" && e.customType === "heads-up") {
							const sideCost = (e.data as { cost?: unknown } | undefined)?.cost;
							if (typeof sideCost === "number") cost += sideCost;
						}
					}

					const contextUsage = ctx.getContextUsage();
					const used = contextUsage?.tokens ?? 0;
					const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const cap = compactCap();
					const limit = cap > 0 && contextWindow > 0 ? Math.min(contextWindow, cap) : cap > 0 ? cap : contextWindow;
					const pctUsed = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
					const barColor = pctUsed >= 80 ? "error" : pctUsed >= 50 ? "warning" : "success";
					const bar = (size: number) => {
						const filled = Math.round((pctUsed / 100) * size);
						return theme.fg(barColor, "█".repeat(filled)) + theme.fg("dim", "░".repeat(size - filled));
					};

					const branch = footerData.getGitBranch();
					let cwdSeg = theme.fg("muted", `${basename(ctx.cwd)} `);
					const branchSeg = theme.fg("mdLink", branch ? `⎇ ${branch}` : "no git");
					// The thinking level only means something for models that can think
					const thinking = ctx.model?.reasoning ? theme.fg("muted", ` · ${pi.getThinkingLevel()}`) : "";
					const modelSeg = theme.fg("accent", `${ctx.model?.provider ?? "?"}/${ctx.model?.id ?? "none"}`) + thinking;
					let windowNote = contextWindow > limit ? theme.fg("dim", ` of ${fmtTokens(contextWindow)}`) : "";
					const contextSeg = (barSize: number) =>
						theme.fg("muted", "Context: [") +
						bar(barSize) +
						theme.fg("muted", "] ") +
						theme.fg("mdCode", `${fmtTokens(used)}/${fmtTokens(limit)}`) +
						theme.fg(barColor, ` (${pctUsed.toFixed(0)}%)`) +
						windowNote;

					let cacheSeg = "";
					if (last) {
						const u = last.usage;
						const prompt = u.input + u.cacheRead + u.cacheWrite;
						if (prompt > 0) {
							const hit = (u.cacheRead / prompt) * 100;
							cacheSeg = theme.fg(hit >= 90 ? "success" : hit >= 50 ? "warning" : "error", `cache ${hit.toFixed(0)}%`);
						}
					}
					const costSeg = theme.fg("success", `$${cost.toFixed(3)}`);

					const sep = theme.fg("dim", " │ ");
					const line = (barSize: number) => [modelSeg, cwdSeg + branchSeg, contextSeg(barSize), cacheSeg, costSeg].filter(Boolean).join(sep);

					// Drop the window size and the cwd name, then shrink the bar, before cutting anything off, so the cost stays visible
					if (visibleWidth(line(MIN_BAR_WIDTH)) > width) windowNote = "";
					if (visibleWidth(line(MIN_BAR_WIDTH)) > width) cwdSeg = "";
					const overflow = visibleWidth(line(BAR_WIDTH)) - width;
					const barSize = Math.max(MIN_BAR_WIDTH, BAR_WIDTH - Math.max(0, overflow));
					const lines = [truncateToWidth(line(barSize), width)];

					const statuses = [...footerData.getExtensionStatuses().values()].filter((s) => s.trim() !== "");
					if (statuses.length > 0) lines.push(truncateToWidth(statuses.join(theme.fg("dim", " · ")), width));
					return lines;
				},
			};
		});
	});
}
