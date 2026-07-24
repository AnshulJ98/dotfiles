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
 * Fires on BOTH turn_end and agent_settled. ctx.compact() aborts any in-flight
 * agent run (AgentSession.compact() disconnects + aborts) — the turn_end path
 * accepts that abort deliberately: it fires at a clean turn boundary (assistant
 * message + tool executions complete) and prime-reminder.ts auto-resumes the
 * task via a queued follow-up, so context stops within one turn of the cap
 * instead of ballooning 20-50k while the run finishes. The agent_settled path
 * covers growth that lands on a run's final message; nothing to resume there.
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

const DEFAULT_THRESHOLD = 165_000;

// Handshake keys shared with prime-reminder.ts (Symbol.for = cross-file safe).
// FIRING: a cap compaction is in flight. INTERRUPTED: it aborted a running
// agent (turn_end path), so prime-reminder must auto-resume the task.
// Caveat: the cap is only as good as getContextUsage(), which reflects the
// provider's usage accounting — on models with junk telemetry (e.g.
// qwen3.7-max via opencode-go) it is blind. Per-provider guarantee, not absolute.
const FIRING = Symbol.for("pi.compact-cap.firing");
const INTERRUPTED = Symbol.for("pi.compact-cap.interrupted");

export default function (pi: ExtensionAPI) {
  if (DEFAULT_THRESHOLD <= 0) return; // hard-disabled via constant
  if (process.env.PI_SUBAGENT_CHILD === "1") return; // never run in subagent children

  let enabled = true;
  let threshold = DEFAULT_THRESHOLD;
  let compacting = false; // guard against re-entrant compaction

  interface CapCtx {
    getContextUsage(): { tokens?: number | null } | undefined;
    compact(options?: { onComplete?: () => void; onError?: (e: Error) => void }): void;
  }

  const overBudget = (ctx: CapCtx) => {
    const usage = ctx.getContextUsage();
    if (!usage || usage.tokens == null) return false; // tokens null right after a compaction
    return usage.tokens > threshold;
  };

  const fire = (ctx: CapCtx, interruptsRun: boolean) => {
    compacting = true;
    const g = globalThis as Record<symbol, unknown>;
    g[FIRING] = true;
    g[INTERRUPTED] = interruptsRun;
    // The resume of an interrupted run is prime-reminder's job — its
    // session_compact ctx has sendUserMessage; the turn_end ctx here does NOT
    // (calling it crashed pi with an uncaught TypeError, 2026-07-23). The
    // session_compact event is emitted BEFORE compact() resolves, so the
    // symbols are still set when prime-reminder reads them.
    const clear = () => {
      compacting = false;
      g[FIRING] = false;
      g[INTERRUPTED] = false;
    };
    ctx.compact({ onComplete: clear, onError: clear });
  };

  // Mid-run path: turn_end fires at turn boundaries inside the agentic loop
  // (assistant message + its tool executions complete, next LLM call not yet
  // useful). ctx.compact() aborts the run — prime-reminder auto-resumes it via
  // a queued follow-up, so the task continues from the summary instead of
  // ballooning 20-50k past the cap while the run finishes on its own.
  pi.on("turn_end", async (_event, ctx) => {
    if (process.env.PI_COMPACT_CAP_DEBUG === "1") {
      const u = ctx.getContextUsage();
      (ctx as unknown as { ui: { notify(m: string, t: string): void } }).ui.notify(
        `compact-cap turn_end: tokens=${String(u?.tokens)} threshold=${threshold} enabled=${String(enabled)} compacting=${String(compacting)}`,
        "info",
      );
    }
    if (!enabled || compacting) return;
    if (!overBudget(ctx)) return;
    fire(ctx, true);
  });

  // Settled path: catches growth that lands between runs (final assistant
  // message of a run, or sessions resumed over the cap). Nothing to resume.
  pi.on("agent_settled", async (_event, ctx) => {
    if (!enabled || compacting) return;
    if (!overBudget(ctx)) return;
    fire(ctx, false);
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
        // Floor: below compaction's own output size (keepRecentTokens ~16k +
        // summary) the cap re-trips immediately after every compaction — a
        // compact/resume thrash loop. 30k clears that floor with margin.
        if (n > 0 && n < 30_000) {
          ctx.ui.notify(
            "compact-cap: thresholds below 30k thrash (compaction output alone exceeds them) — not set",
            "warning",
          );
          return;
        }
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
