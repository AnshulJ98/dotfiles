/**
 * What the agent is doing, as it happens and at no token cost: a line in the bash log when a
 * tool call starts and when it ends, this process's live-state file, and a notice naming the
 * repo files a bash call changed.
 *
 * The log (lib/bash-log.ts, ~/.pi/agent/logs/bash.log) takes every tool call of the main session
 * and of scout and worker children, including calls made inside codemode scripts, so one pane
 * running `tail -F` shows what every agent on the machine is running and for how long.
 *
 * The live state (lib/live.ts, ~/.pi/agent/logs/live/<pid>.json) is the same events kept as
 * "now": idle, waiting on the model, or the open tool calls. bin/pi-health reads it to show a
 * session that has stopped moving. A call another extension blocked gets no result, so the open
 * calls are dropped at the end of each turn.
 *
 * For the changes, a `git status` snapshot is taken at `tool_call` and another at `tool_result`
 * for bash; the difference (lib/bash-changes.ts) goes on the log's end line and, in a session
 * with a UI, to `ctx.ui.notify`. Detection is by effect, not by command shape, so `sed -i`, a
 * Python rewrite, a heredoc, a formatter and a script inside codemode are all covered. Two git
 * status calls per bash call; a repo where git takes over 2 seconds gets no change list instead
 * of a slower bash.
 *
 * Adds nothing to the model's context: every handler returns nothing.
 *
 * Cannot see: gitignored paths, files outside the repo, or a commit/merge/checkout (the tree
 * moved, which is not an edit). Parallel bash calls overlap, so each can report the same change.
 * Worker children also get out-of-bounds changes in the result: see worker-sensors.ts.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { changedBy, describe, snapshot, type Snapshot } from "../lib/bash-changes.ts";
import { append, endLine, logPath, roleOf, rotate, startLine, subjectOf, summarize, toolLine, type Who } from "../lib/bash-log.ts";
import { dropLive, setLive } from "../lib/live.ts";
import { WATCHDOG_TAG } from "../lib/watchdog.ts";

interface Started {
	at: number;
	who: Who;
	/** For the live state: the tool and what it is pointed at. */
	what: string;
	/** bash only. */
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

	const log = (line: string, ctx: ExtensionContext): void => {
		if (!writable || append(path, line)) return;
		writable = false;
		if (ctx.hasUI) ctx.ui.notify(`bash log: cannot write ${path}; no more lines this session.`, "warning");
	};

	/** With no call open the process is waiting: on the model during a run, on the user after it. */
	const live = (ctx: ExtensionContext, resting: "idle" | "model" = "model"): void => {
		const now = Date.now();
		const calls = [...started.values()];
		setLive({
			role,
			session: ctx.sessionManager.getSessionId(),
			parent: role === "main" ? undefined : process.env.PI_SESSION_ID,
			sessionFile: ctx.sessionManager.getSessionFile(),
			cwd: process.cwd(),
			state: calls.length ? "tool" : resting,
			what: calls.map((call) => call.what).join(" \u203a "),
			since: calls[0]?.at ?? now,
			active: now,
		});
	};

	pi.on("session_start", async (_event, ctx) => live(ctx, "idle"));
	pi.on("agent_start", async (_event, ctx) => live(ctx));
	pi.on("turn_end", async (_event, ctx) => {
		started.clear();
		live(ctx);
		return undefined;
	});
	pi.on("agent_settled", async (_event, ctx) => {
		started.clear();
		live(ctx, "idle");
	});
	pi.on("session_shutdown", async () => dropLive());

	pi.on("tool_call", async (event, ctx) => {
		const bash = event.toolName === "bash";
		const command = String((event.input as { command?: unknown }).command ?? "");
		const who: Who = { role, session: ctx.sessionManager.getSessionId(), call: event.toolCallId };
		started.set(event.toolCallId, {
			at: Date.now(),
			who,
			what: bash ? `bash ${summarize(command)}` : `${event.toolName} ${subjectOf(event.input)}`.trimEnd(),
			snap: bash ? snapshot(process.cwd()) : undefined,
		});
		log(bash ? startLine(new Date(), who, process.cwd(), command) : toolLine(new Date(), who, event.toolName, event.input), ctx);
		live(ctx);
		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
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
				killed: event.toolName === "bash" ? watchdogLine(event.content) : undefined,
				changed,
			}),
			ctx,
		);
		live(ctx);
		if (changed && ctx.hasUI) ctx.ui.notify(`bash changed: ${changed}`, "info");
		return undefined;
	});
}
