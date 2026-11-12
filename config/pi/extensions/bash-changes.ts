/**
 * Bash change notice: when a bash call changes repo files, the user sees which ones, as it happens.
 *
 * A `git status` snapshot is taken at `tool_call` and another at `tool_result` for bash; the
 * difference (lib/bash-changes.ts) is shown with `ctx.ui.notify`. Detection is by effect, not by
 * command shape, so `sed -i`, a Python rewrite, a heredoc, a formatter and a script inside
 * codemode are all covered. Two git status calls per bash call; a repo where git takes over 2
 * seconds gets no notice instead of a slower bash.
 *
 * Adds nothing to the model's context: both handlers return nothing, so no tokens are spent.
 *
 * Cannot see: gitignored paths, files outside the repo, or a commit/merge/checkout (the tree
 * moved, which is not an edit). Parallel bash calls overlap, so each can report the same change.
 * Worker children report out-of-bounds changes in the result instead: see worker-sensors.ts.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { changedBy, describe, snapshot, type Snapshot } from "../lib/bash-changes.ts";

export default function (pi: ExtensionAPI) {
	const before = new Map<string, Snapshot>();

	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return undefined;
		const snap = snapshot(process.cwd());
		if (snap) before.set(event.toolCallId, snap);
		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const start = before.get(event.toolCallId);
		before.delete(event.toolCallId);
		if (!start || !ctx.hasUI) return undefined;
		const end = snapshot(process.cwd());
		if (!end) return undefined;
		const changes = changedBy(start, end);
		if (changes.length) ctx.ui.notify(`bash changed: ${describe(changes, end.root)}`, "info");
		return undefined;
	});
}
