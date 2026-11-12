/**
 * What bash did, as it happens: a line in the bash log when a call starts and when it ends, and
 * a notice naming the repo files it changed.
 *
 * The log (lib/bash-log.ts, ~/.pi/agent/logs/bash.log) takes every bash call of the main session
 * and of scout and worker children, including calls made inside codemode scripts, so one pane
 * running `tail -F` shows what every agent on the machine is running and for how long.
 *
 * For the changes, a `git status` snapshot is taken at `tool_call` and another at `tool_result`;
 * the difference (lib/bash-changes.ts) goes on the log's end line and, in a session with a UI, to
 * `ctx.ui.notify`. Detection is by effect, not by command shape, so `sed -i`, a Python rewrite,
 * a heredoc, a formatter and a script inside codemode are all covered. Two git status calls per
 * bash call; a repo where git takes over 2 seconds gets no change list instead of a slower bash.
 *
 * Adds nothing to the model's context: both handlers return nothing, so no tokens are spent.
 *
 * Cannot see: gitignored paths, files outside the repo, or a commit/merge/checkout (the tree
 * moved, which is not an edit). Parallel bash calls overlap, so each can report the same change.
 * Worker children also get out-of-bounds changes in the result: see worker-sensors.ts.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { changedBy, describe, snapshot, type Snapshot } from "../lib/bash-changes.ts";
import { append, endLine, logPath, roleOf, rotate, startLine, type Who } from "../lib/bash-log.ts";
import { WATCHDOG_TAG } from "../lib/watchdog.ts";

interface Started {
	at: number;
	who: Who;
	snap: Snapshot | undefined;
}

/** The watchdog's line in a bash result (background.ts appends it when it kills the command). */
function watchdogLine(content: unknown): string | undefined {
	if (!Array.isArray(content)) return undefined;
	for (const block of content as Array<{ type?: string; text?: unknown }>) {
		if (block.type !== "text" || typeof block.text !== "string") continue;
		const line = block.text.split("\n").find((text) => text.startsWith(WATCHDOG_TAG));
		if (line) return line;
	}
	return undefined;
}

export default function (pi: ExtensionAPI) {
	const started = new Map<string, Started>();
	const path = logPath();
	const role = roleOf(process.env);
	let writable = true;
	rotate(path);

	const log = (line: string, ctx: { hasUI: boolean; ui: { notify(text: string, level: "warning"): void } }): void => {
		if (!writable || append(path, line)) return;
		writable = false;
		if (ctx.hasUI) ctx.ui.notify(`bash log: cannot write ${path}; no more lines this session.`, "warning");
	};

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const who: Who = { role, session: ctx.sessionManager.getSessionId(), call: event.toolCallId };
		started.set(event.toolCallId, { at: Date.now(), who, snap: snapshot(process.cwd()) });
		log(startLine(new Date(), who, process.cwd(), String((event.input as { command?: unknown }).command ?? "")), ctx);
		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const start = started.get(event.toolCallId);
		started.delete(event.toolCallId);
		if (!start) return undefined;
		const end = start.snap && snapshot(process.cwd());
		const changes = start.snap && end ? changedBy(start.snap, end) : [];
		const changed = end && changes.length ? describe(changes, end.root) : "";
		const exit = (event.structuredContent as { exit_code?: unknown } | undefined)?.exit_code;
		log(
			endLine(new Date(), start.who, {
				ms: Date.now() - start.at,
				failed: event.isError === true,
				exitCode: typeof exit === "number" ? exit : undefined,
				killed: watchdogLine(event.content),
				changed,
			}),
			ctx,
		);
		if (changed && ctx.hasUI) ctx.ui.notify(`bash changed: ${changed}`, "info");
		return undefined;
	});
}
