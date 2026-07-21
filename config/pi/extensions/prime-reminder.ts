/**
 * Compaction UX: post-compaction instruction reminder + manual-compact resume.
 *
 * Two behaviors, both timed to the moment instructions/tasks actually break:
 *
 * 1. MANUAL /compact mid-task ABORTS the run and pi never resumes it (core
 *    behavior: AgentSession.compact() disconnects + aborts, no retry). This
 *    extension auto-resumes: after a user-initiated compaction it sends one
 *    continuation message (reminder + "resume the in-progress task").
 *
 * 2. Any OTHER compaction (native threshold, overflow, compact-cap backstop)
 *    arms a one-shot reminder injected on the NEXT user turn — a brief pointer
 *    back to the Prime Directives / Solution Ladder, not a re-injection of the
 *    rules themselves. Sessions that never compact never pay a token.
 *
 * compact-cap.ts marks its own firings via globalThis.__compactCapFiring so a
 * backstop compaction (task already settled) never triggers the auto-resume.
 * Skipped in pi-subagents children.
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
  "in progress, say you are ready and stop.";

export default function (pi: ExtensionAPI) {
  if (process.env.PI_SUBAGENT_CHILD === "1") return; // children are short-lived; not worth the tokens

  let pending = false;

  pi.on("session_compact", async (event, ctx) => {
    const fromCap = Boolean(
      (globalThis as { __compactCapFiring?: boolean }).__compactCapFiring,
    );
    // Always arm the passive reminder — whichever turn comes next (auto-resume
    // or the user's manual re-prompt) gets the pointer injected. Fail-open.
    pending = true;
    if (event.reason === "manual" && !event.willRetry && !fromCap) {
      // Manual /compact aborted the run; try to resume it. Deferred past
      // compact()'s unwind: pi drops prompts that arrive while a compaction
      // is settling (verified 2026-07-21 — accepted with success:true, never
      // run). 1s landed inside that window; 5s clears it in testing. If the
      // resume is still swallowed, the armed reminder above fires on the
      // user's next prompt — this attempt can only help, never harm.
      setTimeout(() => {
        ctx.sendUserMessage(RESUME);
      }, 5000);
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
