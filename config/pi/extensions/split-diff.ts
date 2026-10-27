/**
 * Split diffs for the edit tool: old | new side by side, drawn inside pi's own
 * edit box. Nothing else about the transcript changes.
 *
 * The drawing is pi-tidy's `renderSplitDiff` (MIT, Andy8647/pi-tidy), imported
 * from the pinned package. settings.json installs pi-tidy with
 * `"extensions": []`, so none of pi-tidy's own patches load.
 *
 * Mechanism: a tool renderer wraps edit's renderCall and gives pi's call box a
 * render override that swaps the unified diff body for a split one. pi keeps
 * the diff on that box as `preview.diff`, and both of pi's edit renderers
 * rebuild the box's children, so the swap happens at render time. Known defect:
 * `preview` and the [header, spacer, body] child layout are pi internals;
 * tests/split-diff.test.ts fails if either changes. Anything unexpected
 * (no diff yet, an error, a narrow box) draws pi's unified diff unchanged.
 */
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

/** Box content width below which the panes get too narrow to read. */
export const MIN_WIDTH = 120;
/** Diff rows drawn while the box is collapsed; ctrl+o draws all of them. */
export const COLLAPSED_LINES = 10;

interface Theme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}
export type RenderSplit = (input: {
	diff: string;
	width: number;
	theme: Theme;
	filePath?: string;
	maxLines?: number;
}) => { lines: string[] } | null;

interface Child {
	render(width: number): string[];
	invalidate?(): void;
}
/** The fields of pi's edit call box (a Box) this file reads. */
export interface EditBox extends Child {
	children: Child[];
	preview?: { diff?: string } | { error: string };
}

const PATCHED = Symbol.for("split-diff.patched");
const VIEW = Symbol.for("split-diff.view");

interface View {
	theme: Theme;
	path?: string;
	expanded: boolean;
}
type Patched = EditBox & { [PATCHED]?: true; [VIEW]?: View };

/** The diff body: split when wide enough, else whatever pi drew. */
class SplitBody implements Child {
	private readonly diff: string;
	private readonly fallback: Child;
	private readonly view: View;
	private readonly split: RenderSplit;
	constructor(diff: string, fallback: Child, view: View, split: RenderSplit) {
		this.diff = diff;
		this.fallback = fallback;
		this.view = view;
		this.split = split;
	}
	render(width: number): string[] {
		if (width >= MIN_WIDTH) {
			const out = this.split({
				diff: this.diff,
				width,
				theme: this.view.theme,
				filePath: this.view.path,
				maxLines: this.view.expanded ? undefined : COLLAPSED_LINES,
			});
			if (out) return out.lines;
		}
		return this.fallback.render(width);
	}
	invalidate(): void {
		this.fallback.invalidate?.();
	}
}

/** Swap pi's unified body for a split one; a no-op unless the box looks as expected. */
export function swapBody(box: EditBox, view: View, split: RenderSplit): void {
	const preview = box.preview;
	if (!preview || "error" in preview || typeof preview.diff !== "string") return;
	const body = box.children[2];
	if (box.children.length !== 3 || !body || body instanceof SplitBody) return;
	box.children[2] = new SplitBody(preview.diff, body, view, split);
}

/** Give one of pi's edit boxes a render that swaps its body first. */
export function patchBox(box: EditBox, view: View, split: RenderSplit): void {
	const target = box as Patched;
	target[VIEW] = view;
	if (target[PATCHED]) return;
	target[PATCHED] = true;
	const render = box.render.bind(box);
	box.render = (width: number) => {
		swapBody(box, target[VIEW] ?? view, split);
		return render(width);
	};
}

function isEditBox(value: unknown): value is EditBox {
	return typeof value === "object" && value !== null && Array.isArray((value as EditBox).children);
}

export default async function (pi: ExtensionAPI): Promise<void> {
	const file = join(getAgentDir(), "npm", "node_modules", "pi-tidy", "split-diff.ts");
	let split: RenderSplit;
	try {
		split = ((await import(file)) as { renderSplitDiff: RenderSplit }).renderSplitDiff;
	} catch (error) {
		pi.on("session_start", (_event, ctx) => {
			ctx.ui.notify(`split-diff: cannot load ${file} (${String(error)}); edits keep pi's unified diff.`, "warning");
		});
		return;
	}

	pi.registerToolRenderer((toolName, next) => {
		const renderers = next();
		const renderCall = renderers?.renderCall;
		if (toolName !== "edit" || !renderers || !renderCall) return renderers;
		return {
			...renderers,
			renderCall(args, theme, context) {
				const box = renderCall(args, theme, context);
				if (isEditBox(box)) {
					const path = (args as { path?: unknown; file_path?: unknown } | undefined)?.path ?? (args as { file_path?: unknown })?.file_path;
					patchBox(box, { theme, path: typeof path === "string" ? path : undefined, expanded: context.expanded === true }, split);
				}
				return box;
			},
		};
	});
}
