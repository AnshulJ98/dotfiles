/**
 * Thinking up front: every thinking run starts open, so the reasoning reads
 * without a click per row.
 *
 * pi-tidy folds every thinking run into a 56-cell row that opens on click. The
 * run before a reply's text starts open (pi-tidy's framed box). The runs of a
 * tool-only step start open too, under their row inside the group: one click
 * on `▸ N calls` shows the whole group's reasoning. A click still folds any.
 *
 * Mechanism: pi's AssistantMessageComponent keeps thinkingVisibilityOverrides
 * (run index -> hidden) and reads it in updateContent; pi-tidy fills in `true`
 * only for runs without an entry. Writing `false` once, before pi reads the map,
 * opens the run and leaves later clicks alone. Run indices follow pi's count:
 * consecutive thinking blocks with any non-blank text are one run.
 *
 * A tool-only step (a pi-tidy "carrier") also needs pi-tidy's private
 * Symbol.for("pi-toolbox:thought-open") set, or it draws the row folded
 * whatever the map says (tool-group-view.ts renderCarrier). Known defect: that
 * marker is pi-tidy internal; tests/thinking-open.test.ts fails if it is renamed.
 */
import { AssistantMessageComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PATCHED = Symbol.for("thinking-open.patched");
const DEFAULTED = Symbol.for("thinking-open.defaulted");
const CARRIER_OPENED = Symbol.for("thinking-open.carrier");
/** pi-tidy's "this carrier's thinking was expanded" marker. */
export const THOUGHT_OPEN = Symbol.for("pi-toolbox:thought-open");

interface Block {
	type?: string;
	text?: string;
	thinking?: string;
}

interface Component {
	thinkingVisibilityOverrides?: Map<number, boolean>;
	[DEFAULTED]?: Set<number>;
	[CARRIER_OPENED]?: true;
	[THOUGHT_OPEN]?: boolean;
}

type UpdateContent = ((this: Component, message: { content?: unknown; stopReason?: unknown }, ...rest: unknown[]) => unknown) & { [PATCHED]?: true };

/** Indices of the thinking runs that some reply text follows. */
export function runsBeforeText(content: readonly Block[]): number[] {
	const open: number[] = [];
	let run = 0;
	let i = 0;
	while (i < content.length) {
		if (content[i].type !== "thinking") {
			i++;
			continue;
		}
		let visible = false;
		for (; i < content.length && content[i].type === "thinking"; i++) visible ||= Boolean(content[i].thinking?.trim());
		if (!visible) continue;
		if (content.slice(i).some((b) => b.type === "text" && b.text?.trim())) open.push(run);
		run++;
	}
	return open;
}

/** Indices of every visible thinking run, counted like pi does. */
function visibleRuns(content: readonly Block[]): number[] {
	const runs: number[] = [];
	let run = 0;
	let i = 0;
	while (i < content.length) {
		if (content[i].type !== "thinking") {
			i++;
			continue;
		}
		let visible = false;
		for (; i < content.length && content[i].type === "thinking"; i++) visible ||= Boolean(content[i].thinking?.trim());
		if (visible) runs.push(run++);
	}
	return runs;
}

/**
 * What to open on this message: the runs before reply text, or for a tool-only
 * step all of its runs. The step test is pi-tidy's classifyAssistant carrier
 * test: no reply text, a tool call, and not cut off at the length limit.
 */
export function runsToOpen(content: readonly Block[], stopReason?: unknown): { runs: number[]; carrier: boolean } {
	const hasText = content.some((b) => b.type === "text" && b.text?.trim());
	const runs = visibleRuns(content);
	const toolOnly = !hasText && stopReason !== "length" && content.some((b) => b.type === "toolCall");
	if (toolOnly && runs.length > 0) return { runs, carrier: true };
	return { runs: runsBeforeText(content), carrier: false };
}

export default function (_pi: ExtensionAPI) {
	const proto = AssistantMessageComponent.prototype as unknown as { updateContent?: UpdateContent };
	const original = proto.updateContent;
	if (typeof original !== "function" || original[PATCHED]) return;
	const patched: UpdateContent = function (this: Component, message, ...rest) {
		const overrides = this.thinkingVisibilityOverrides;
		const content = Array.isArray(message?.content) ? (message.content as Block[]) : [];
		if (overrides) {
			const defaulted = (this[DEFAULTED] ??= new Set());
			const { runs, carrier } = runsToOpen(content, message?.stopReason);
			for (const run of runs) {
				if (defaulted.has(run)) continue;
				defaulted.add(run);
				if (!overrides.has(run)) overrides.set(run, false);
			}
			// Once only, so a click that folds the step stays folded. Forced, not seeded: while the step streamed
			// without its tool call it was a plain message, and pi-tidy may have filled in `true` already
			if (carrier && !this[CARRIER_OPENED]) {
				this[CARRIER_OPENED] = true;
				for (const run of runs) overrides.set(run, false);
				this[THOUGHT_OPEN] = true;
			}
		}
		return original.call(this, message, ...rest);
	};
	patched[PATCHED] = true;
	proto.updateContent = patched;
}
