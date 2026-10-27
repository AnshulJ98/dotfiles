/**
 * Context bar — one-line footer: cwd and branch on the left; cache, context bar,
 * model and cost on the right.
 *
 * Based on pi-context-bar 0.1.0 (github.com/Pringled/pi-extensions, MIT,
 * Copyright (c) Thomas van Dongen). Changes from upstream:
 * - The bar fills against compact-cap's live threshold, not the model window: with
 *   a 1M window the upstream bar sits at 0 cells until ~60k and compaction fires
 *   at 21%. compact-cap.ts publishes it under Symbol.for("pi.compact-cap.threshold");
 *   0 (off) or missing falls back to the model window.
 * - The cwd folder name precedes the branch.
 * - cwd and branch sit flush left, the rest flush right with the cost last.
 * - Too narrow for one line (a half split), it wraps to two like pi's own footer
 *   instead of cutting off the cost: cwd and branch, then model and cost pinned
 *   top right; cache and context flush right below. Narrower still, the model
 *   name is cut before the cost, and the cache hit goes before the context.
 * - The cost total includes heads-up side requests (heads-up.ts entries).
 * - Shows the last request's cache-hit share, which pi's default footer had.
 * - Renders extension statuses (ctx.ui.setStatus, e.g. scout) on a line of
 *   their own under the footer; upstream dropped them.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";

const BAR_WIDTH = 10;
const MIN_BAR_WIDTH = 4;
const CAP = Symbol.for("pi.compact-cap.threshold");

function compactCap(): number {
	const value = (globalThis as Record<symbol, unknown>)[CAP];
	return typeof value === "number" && value > 0 ? value : 0;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${Number((n / 1_000_000).toFixed(1))}M`;
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
						return theme.fg(barColor, "▰".repeat(filled)) + theme.fg("dim", "▱".repeat(size - filled));
					};

					const branch = footerData.getGitBranch();
					const cwdSeg = theme.fg("muted", `${basename(ctx.cwd)} `);
					const branchSeg = theme.fg("mdLink", branch ? `⎇ ${branch}` : "no git");
					// The thinking level only means something for models that can think
					const thinking = ctx.model?.reasoning ? theme.fg("muted", ` · ${pi.getThinkingLevel()}`) : "";
					const modelSeg = theme.fg("accent", `${ctx.model?.provider ?? "?"}/${ctx.model?.id ?? "none"}`) + thinking;
					// The model's full window in brackets when compact-cap holds the session below it
					const windowNote = contextWindow > limit ? theme.fg("dim", ` (${fmtTokens(contextWindow)})`) : "";
					const contextSeg = (barSize: number) =>
						`${bar(barSize)} ` +
						theme.fg("muted", `${fmtTokens(used)}/${fmtTokens(limit)}`) +
						windowNote +
						theme.fg(barColor, ` ${pctUsed.toFixed(0)}%`);

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
					const where = cwdSeg + branchSeg;
					const join = (...segs: string[]) => segs.filter(Boolean).join(sep);
					const right = (barSize: number) => join(cacheSeg, contextSeg(barSize), modelSeg, costSeg);
					const meter = (barSize: number) => join(cacheSeg, contextSeg(barSize));
					// Narrower still, the cache hit goes before the context does
					const lean = (barSize: number) => contextSeg(barSize);
					// Left flush left, right flush right, at least two spaces between
					const spread = (left: string, rightSide: string) =>
						left + " ".repeat(Math.max(2, width - visibleWidth(left) - visibleWidth(rightSide))) + rightSide;
					const oneLine = (barSize: number) => spread(where, right(barSize));
					// Shrink the bar before giving up the line
					const fitBar = (render: (barSize: number) => string) =>
						Math.max(MIN_BAR_WIDTH, BAR_WIDTH - Math.max(0, visibleWidth(render(BAR_WIDTH)) - width));

					const lines: string[] = [];
					if (visibleWidth(oneLine(MIN_BAR_WIDTH)) <= width) {
						lines.push(oneLine(fitBar(oneLine)));
					} else {
						// Too narrow (a half split): two lines like pi's own footer. Where, model and cost on top, the meter below;
						// the cost stays pinned top right, so the model name is cut first, then the branch
						const room = width - visibleWidth(where) - 2 - visibleWidth(sep + costSeg);
						const model = room >= visibleWidth(modelSeg) ? modelSeg : room > 3 ? truncateToWidth(modelSeg, room) : "";
						const pinned = model ? model + sep + costSeg : costSeg;
						const left = truncateToWidth(where, Math.max(0, width - 2 - visibleWidth(pinned)));
						lines.push(truncateToWidth(spread(left, pinned), width));
						const fits = visibleWidth(meter(MIN_BAR_WIDTH)) <= width ? meter : lean;
						const bottom = truncateToWidth(fits(fitBar(fits)), width);
						lines.push(" ".repeat(Math.max(0, width - visibleWidth(bottom))) + bottom);
					}

					const statuses = [...footerData.getExtensionStatuses().values()].filter((s) => s.trim() !== "");
					if (statuses.length > 0) lines.push(truncateToWidth(statuses.join(theme.fg("dim", " · ")), width));
					return lines;
				},
			};
		});
	});
}
