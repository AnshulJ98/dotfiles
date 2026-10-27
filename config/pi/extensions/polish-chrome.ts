// Based on pi-polish 0.1.3 extensions/chrome.ts (github.com/Pringled/pi-extensions, MIT,
// Copyright (c) 2026 Thomas van Dongen). Local changes: the ❯/● markers sit in column 1 with text
// in column 3, the gutter pi's own tool rows and notices use (upstream: column 0, text in 2). The "Waiting for your
// answer" phase keys on pi-ask-user's ask_user (upstream: questionnaire).
// Cut: upstream's blanking of hidden-thinking rows; pi-minimalist owns thinking rows.
import { AssistantMessageComponent, CustomEditor, type ExtensionAPI, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

const PROMPT = "❯";
const REPLY = "●";
const ORANGE = "\x1b[38;2;217;119;87m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
// ✱ rather than ✳, which Windows Terminal draws as a green emoji
const SPINNER = ["·", "✢", "✱", "✶", "✻", "✽", "✻", "✶", "✱", "✢"].map((f) => `${ORANGE}${f}${RESET}`);
const PAD = 3;
const LEADING_ESCAPES = new RegExp(`^((?:\\x1b\\[[0-9;]*m|\\x1b\\][^\\x07]*\\x07)*) {${PAD}}`);
const OSC133_START = "\x1b]133;A\x07";
const OSC133_END = "\x1b]133;B\x07\x1b]133;C\x07";
const patched = Symbol.for("pi-polish.patched");

function markFirstLine(line: string, marker: string): string {
	return line.replace(LEADING_ESCAPES, (_m, esc: string) => `${esc} ${marker} `);
}

function patchOnce(proto: any, method: string, wrap: (original: (...args: any[]) => any) => (...args: any[]) => any) {
	if (!proto || typeof proto[method] !== "function" || proto[method][patched]) return;
	const replacement: any = wrap(proto[method]);
	replacement[patched] = true;
	proto[method] = replacement;
}

export default function (pi: ExtensionAPI) {
	try {
		patchOnce(AssistantMessageComponent.prototype, "updateContent", (original) =>
			function (this: any, message: any, ...rest: any[]) {
				// Padding so reply text lines up behind the ● marker, like tool rows
				this.outputPad = Math.max(this.outputPad ?? 1, PAD);
				original.call(this, message, ...rest);
				// Text blocks are the Markdown children without a default style; thinking blocks carry one
				for (const child of this.contentContainer?.children ?? []) {
					if (!(child instanceof Markdown) || (child as any).defaultTextStyle !== undefined || (child as any)[patched]) continue;
					const render = child.render.bind(child);
					child.render = (width: number) => {
						const lines: string[] = render(width);
						const first = lines.findIndex((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim());
						if (first >= 0) lines[first] = markFirstLine(lines[first], REPLY);
						return lines;
					};
					(child as any)[patched] = true;
				}
			},
		);

		// Past prompts: one highlighted line with the ❯ marker instead of a padded three-line box
		patchOnce(UserMessageComponent.prototype, "rebuild", (original) =>
			function (this: any) {
				this.outputPad = Math.max(this.outputPad ?? 1, PAD);
				return original.call(this);
			},
		);
		patchOnce(UserMessageComponent.prototype, "render", (original) =>
			function (this: any, width: number) {
				const lines: string[] = original.call(this, width);
				if (lines.length < 3) return lines;
				const strip = (l: string) => l.replace(OSC133_START, "").replace(OSC133_END, "");
				const body = lines.slice(1, -1).map(strip);
				body[0] = OSC133_START + markFirstLine(body[0], `${DIM}${PROMPT}\x1b[22m`);
				body[body.length - 1] = body[body.length - 1] + OSC133_END;
				return body;
			},
		);
	} catch (err) {
		console.error(`[pi-polish] could not patch message components: ${(err as Error).message}`);
	}

	// Orange working line: what pi is doing now, elapsed time and output tokens for this run
	let started = 0;
	let tokens = 0;
	let streamed = 0;
	let phase = "Thinking";
	let timer: NodeJS.Timeout | undefined;
	const fmtTokens = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);
	const show = (ctx: any) => {
		const secs = Math.round((Date.now() - started) / 1000);
		const stats = `(${secs}s · ↓ ${fmtTokens(tokens + Math.round(streamed / 4))} tokens)`;
		ctx.ui.setWorkingMessage(`${ORANGE}${phase}…${RESET} ${DIM}${stats}${RESET}`);
	};
	const toolPhase = (name: string, args: any) => {
		const path = String(args?.path ?? "").split("/").pop();
		switch (name) {
			case "bash":
				return `Running ${String(args?.command ?? "").split("\n")[0].slice(0, 60)}`;
			case "read":
				return `Reading ${path}`;
			case "edit":
				return `Editing ${path}`;
			case "write":
				return `Writing ${path}`;
			case "grep":
			case "find":
				return `Searching for ${String(args?.pattern ?? "").slice(0, 40)}`;
			case "bg_run":
				return "Starting a background job";
			case "ask_user":
				return "Waiting for your answer";
			default:
				return `Running ${name}`;
		}
	};
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setWorkingIndicator({ frames: SPINNER, intervalMs: 120 });
	});
	pi.on("agent_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		started = Date.now();
		tokens = 0;
		streamed = 0;
		phase = "Thinking";
		show(ctx);
		clearInterval(timer);
		timer = setInterval(() => show(ctx), 1000);
	});
	pi.on("message_update", async (event, ctx) => {
		if (!ctx.hasUI || event.message.role !== "assistant") return;
		const parts = (event.message as any).content ?? [];
		const last = parts[parts.length - 1];
		phase = last?.type === "text" ? "Responding" : last?.type === "toolCall" ? "Preparing a tool call" : "Thinking";
		streamed = parts.reduce((n: number, c: any) => n + (c.text?.length ?? c.thinking?.length ?? 0), 0);
	});
	pi.on("message_end", async (event) => {
		if (event.message.role !== "assistant") return;
		tokens += (event.message as any).usage?.output ?? 0;
		streamed = 0;
	});
	pi.on("tool_execution_start", async (event, ctx) => {
		if (!ctx.hasUI) return;
		phase = toolPhase(event.toolName, event.args);
		show(ctx);
	});
	pi.on("tool_execution_end", async () => {
		phase = "Thinking";
	});
	pi.on("agent_end", async (_event, ctx) => {
		clearInterval(timer);
		timer = undefined;
		if (ctx.hasUI) ctx.ui.setWorkingMessage();
	});
	pi.on("session_shutdown", async () => clearInterval(timer));

	// ❯ before the input: editor padding, with the marker drawn into the first content line
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const previous = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor: any = previous?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
			const render = editor.render.bind(editor);
			editor.render = (width: number) => {
				// Set on every render because pi may apply its own editor padding setting after creation
				editor.paddingX = PAD;
				const lines: string[] = render(width);
				if (lines.length > 1) lines[1] = markFirstLine(lines[1], PROMPT);
				return lines;
			};
			return editor;
		});
	});
}
