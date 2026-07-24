/**
 * Compaction UX: post-compaction instruction reminder + manual-compact resume.
 *
 * Two behaviors, both timed to the moment instructions/tasks actually break:
 *
 * 1. Compactions that ABORT a running task get an auto-resume (pi never
 *    retries the run itself: AgentSession.compact() disconnects + aborts).
 *    Two cases: manual /compact mid-task, and compact-cap's turn_end path
 *    (mid-run cap firing). One queued continuation message resumes the task.
 *
 * 2. Every compaction (native threshold, overflow, cap-after-settle) arms a
 *    one-shot reminder injected on the NEXT turn — a brief pointer back to
 *    the Prime Directives / Solution Ladder, not a re-injection of the rules.
 *    Sessions that never compact never pay a token.
 *
 * compact-cap.ts signals via Symbol.for keys whether a compaction is its own
 * firing and whether that firing interrupted a run. Skipped in pi-subagents
 * children.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REMINDER =
  "Post-compaction reminder: your core instructions survived intact and still bind — " +
  "the Prime Directives and Solution Ladder sit at the END of your system prompt. " +
  "Re-adhere before acting: open with the finding, hold question scope, climb the " +
  "ladder before writing code, delegate per the dispatch policy.";

const RESUME =
  "A task was likely in progress when this compaction interrupted the run: resume it " +
  "from where it left off using the compaction summary above. If nothing was actually " +
  "in progress, say you are ready and stop. Do not ask interactive questions " +
  "(ask_user) to resume — if input is genuinely required, state what is needed and stop.";

// Shared with compact-cap.ts. FIRING: cap compaction in flight. INTERRUPTED:
// it fired mid-run (turn_end path) and aborted an active task — resume it.
const FIRING = Symbol.for("pi.compact-cap.firing");
const INTERRUPTED = Symbol.for("pi.compact-cap.interrupted");

export default function (pi: ExtensionAPI) {
  if (process.env.PI_SUBAGENT_CHILD === "1") return; // children are short-lived; not worth the tokens

  if (process.env.PI_PRIME_REMINDER_DEBUG === "1") {
    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.notify("prime-reminder: loaded, handlers registered", "info");
    });
  }

  let pending = false;
  let resumeScheduled = false; // dedup: one resume per compaction cycle

  pi.on("session_compact", async (event, ctx) => {
    const g = globalThis as Record<symbol, unknown>;
    const fromCap = Boolean(g[FIRING]);
    const capInterrupted = Boolean(g[INTERRUPTED]);
    if (process.env.PI_PRIME_REMINDER_DEBUG === "1") {
      ctx.ui.notify(
        `prime-reminder: session_compact reason=${event.reason} willRetry=${String(event.willRetry)} fromCap=${String(fromCap)} interrupted=${String(capInterrupted)}`,
        "info",
      );
    }
    // Always arm the passive reminder — whichever turn comes next (auto-resume
    // or the user's manual re-prompt) gets the pointer injected. Fail-open.
    pending = true;
    // Resume whenever a RUNNING task was aborted: manual /compact mid-task,
    // or compact-cap's turn_end firing (INTERRUPTED symbol). Sends from
    // inside THIS handler race the compaction's agent-disconnect window
    // (session_compact is emitted before reconnect) and get eaten; deferring
    // 1500ms clears both that window and the aborted run's unwind. The send
    // itself is guarded — an uncaught throw inside setTimeout kills the pi
    // process (learned 2026-07-23). Fail-open: if the send is still lost,
    // the armed reminder above injects on the user's next prompt.
    const manualInterrupt = event.reason === "manual" && !event.willRetry && !fromCap;
    if ((manualInterrupt || (fromCap && capInterrupted)) && !resumeScheduled) {
      resumeScheduled = true; // dedup: one resume per compaction cycle
      // Debug notifies must never throw: ctx.ui's getter asserts the runtime
      // is still active and throws stale-ctx after a session switch/reload —
      // uncaught inside a timer, that kills pi.
      const debugNotify = (msg: string, type: "info" | "warning") => {
        if (process.env.PI_PRIME_REMINDER_DEBUG !== "1") return;
        try {
          ctx.ui.notify(msg, type);
        } catch {
          // stale ctx — drop the notify
        }
      };
      debugNotify("prime-reminder: scheduling RESUME send", "info");
      setTimeout(() => {
        resumeScheduled = false;
        try {
          // pi.sendUserMessage, NOT ctx.sendUserMessage: 0.81.x exposes the
          // send on the ExtensionAPI object; the events ctx lacks it (calling
          // it there throws "not a function" — the silent resume failure).
          pi.sendUserMessage(RESUME);
          debugNotify("prime-reminder: RESUME sendUserMessage returned", "info");
        } catch (e) {
          // reminder remains armed; never crash the harness from a timer
          debugNotify(
            `prime-reminder: RESUME send threw: ${e instanceof Error ? e.message : String(e)}`,
            "warning",
          );
        }
      }, 1500);
    }
  });

  pi.on("before_agent_start", async () => {
    if (!pending) return;
    pending = false;
    return {
      message: {
        customType: "prime-reminder",
        content: REMINDER,
        display: true,
      },
    };
  });
}
