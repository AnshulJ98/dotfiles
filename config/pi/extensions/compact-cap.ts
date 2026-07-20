/**
 * Compaction safety-net — force auto-compaction near a flat token budget as a
 * backstop to manual /compact.
 *
 * Pi's native trigger is `contextTokens > contextWindow - reserveTokens`, which
 * scales per model, so large-window models only compact far past 200k (Copilot
 * extended-context models now declare 1M windows — native would fire at ~984k).
 * This clamps every model to a flat ceiling. It names NO models, so it survives
 * model-id rotation — the only moving parts are two stable ctx methods
 * (getContextUsage, compact).
 *
 * Fires on agent_settled, NOT turn_end: ctx.compact() aborts any in-flight
 * agent run (AgentSession.compact() disconnects + aborts), and turn_end fires
 * per-turn INSIDE a running agentic loop — compacting there would kill the rest
 * of the run. agent_settled fires only after the run is fully settled with no
 * retry or native compaction pending, matching pi's own post-run check.
 *
 * Skipped in pi-subagents children (PI_SUBAGENT_CHILD=1): children inherit
 * settings.json extensions, and compacting a child session wastes an LLM
 * summarization call on a context that is about to be discarded.
 *
 * DEFAULT_THRESHOLD below is the authoritative setting — this file is tracked
 * in dotfiles; edit the constant to retune permanently (0 disables entirely).
 * In-session, session-scoped only (resets on restart):
 *   /compact-cap           show state
 *   /compact-cap off | on  toggle
 *   /compact-cap 150k      set threshold (also accepts raw 150000)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_THRESHOLD = 190_000;

export default function (pi: ExtensionAPI) {
  if (DEFAULT_THRESHOLD <= 0) return; // hard-disabled via constant
  if (process.env.PI_SUBAGENT_CHILD === "1") return; // never run in subagent children

  let enabled = true;
  let threshold = DEFAULT_THRESHOLD;
  let compacting = false; // guard against re-entrant compaction

  pi.on("agent_settled", async (_event, ctx) => {
    if (!enabled || compacting) return;
    const usage = ctx.getContextUsage();
    if (!usage || usage.tokens == null) return; // tokens null right after a compaction
    if (usage.tokens <= threshold) return;
    compacting = true;
    ctx.compact({
      onComplete: () => {
        compacting = false;
      },
      onError: () => {
        compacting = false;
      },
    });
  });

  pi.registerCommand("compact-cap", {
    description:
      "Compaction safety-net: show state, on|off, or set threshold (e.g. 150k). Session-scoped.",
    getArgumentCompletions: (prefix) =>
      ["on", "off"].filter((v) => v.startsWith(prefix)).map((v) => ({ value: v, label: v })),
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "") {
        ctx.ui.notify(
          enabled
            ? `compact-cap: on, threshold ${threshold.toLocaleString()} tokens` +
                (threshold === DEFAULT_THRESHOLD ? " (default)" : " (session)")
            : "compact-cap: off (session)",
          "info",
        );
        return;
      }
      if (arg === "off") {
        enabled = false;
        ctx.ui.notify("compact-cap: off for this session", "info");
        return;
      }
      if (arg === "on") {
        enabled = true;
        ctx.ui.notify(`compact-cap: on, threshold ${threshold.toLocaleString()} tokens`, "info");
        return;
      }
      const m = arg.match(/^(\d+(?:\.\d+)?)(k)?$/);
      if (m) {
        const n = Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1));
        if (n > 0) {
          threshold = n;
          enabled = true;
          ctx.ui.notify(
            `compact-cap: threshold ${threshold.toLocaleString()} tokens for this session`,
            "info",
          );
          return;
        }
      }
      ctx.ui.notify("compact-cap: usage — /compact-cap [on|off|<tokens>[k]]", "warning");
    },
  });
}
