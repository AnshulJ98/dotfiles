/**
 * Scout pane — loaded only by bin/scout when it runs the child as an
 * interactive pi in a herdr tab instead of `pi -p`. When the run settles idle,
 * it writes the last assistant text to SCOUT_DIGEST, the digest `pi -p` would
 * have printed, and exits. If the last turn errored or was aborted (or there is
 * none), it also writes 1 to SCOUT_PANE_RC, since exiting the TUI is rc 0.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

export default function (pi: ExtensionAPI) {
	const digest = process.env.SCOUT_DIGEST;
	if (!digest) return;
	pi.on("agent_settled", async (_event, ctx) => {
		if (!ctx.isIdle()) return;
		let last: AssistantMessage | undefined;
		for (const e of ctx.sessionManager.getBranch()) {
			if (e.type === "message" && e.message.role === "assistant") last = e.message as AssistantMessage;
		}
		const text = (last?.content ?? []).flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
		const failed = last?.stopReason === "error" || last?.stopReason === "aborted" || !last;
		const shown = failed && !text ? (last?.errorMessage ?? `pi stopped: ${last?.stopReason ?? "no reply"}`) : text;
		writeFileSync(digest, shown.endsWith("\n") ? shown : `${shown}\n`);
		if (failed && process.env.SCOUT_PANE_RC) writeFileSync(process.env.SCOUT_PANE_RC, "1\n");
		ctx.shutdown();
	});
}
