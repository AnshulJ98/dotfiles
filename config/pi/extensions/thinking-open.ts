/**
 * Thinking up front: the reasoning that leads into a reply starts open.
 *
 * pi-tidy folds every thinking run into a 56-cell row that opens on click. The
 * run right before a reply's text is the one worth reading, so it starts open
 * (pi-tidy's framed box); runs between tool calls stay folded in their group,
 * and a click still folds an open one.
 *
 * Mechanism: pi's AssistantMessageComponent keeps thinkingVisibilityOverrides
 * (run index -> hidden) and reads it in updateContent; pi-tidy fills in `true`
 * only for runs without an entry. Writing `false` once, before pi reads the map,
 * opens the run and leaves later clicks alone. Run indices follow pi's count:
 * consecutive thinking blocks with any non-blank text are one run.
 */
import { AssistantMessageComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PATCHED = Symbol.for("thinking-open.patched");
const DEFAULTED = Symbol.for("thinking-open.defaulted");

interface Block {
	type?: string;
	text?: string;
	thinking?: string;
}

interface Component {
	thinkingVisibilityOverrides?: Map<number, boolean>;
	[DEFAULTED]?: Set<number>;
}

type UpdateContent = ((this: Component, message: { content?: unknown }, ...rest: unknown[]) => unknown) & { [PATCHED]?: true };

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

export default function (_pi: ExtensionAPI) {
	const proto = AssistantMessageComponent.prototype as unknown as { updateContent?: UpdateContent };
	const original = proto.updateContent;
	if (typeof original !== "function" || original[PATCHED]) return;
	const patched: UpdateContent = function (this: Component, message, ...rest) {
		const overrides = this.thinkingVisibilityOverrides;
		const content = Array.isArray(message?.content) ? (message.content as Block[]) : [];
		if (overrides) {
			const defaulted = (this[DEFAULTED] ??= new Set());
			for (const run of runsBeforeText(content)) {
				if (defaulted.has(run)) continue;
				defaulted.add(run);
				if (!overrides.has(run)) overrides.set(run, false);
			}
		}
		return original.call(this, message, ...rest);
	};
	patched[PATCHED] = true;
	proto.updateContent = patched;
}
