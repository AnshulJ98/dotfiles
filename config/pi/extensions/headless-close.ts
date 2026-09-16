/**
 * Headless close enforcement.
 *
 * `ops.md` and `ladder.md` both state that a headless (`-p`) reply must never
 * end on a question: the agent states the decision needed and the default it
 * took. Measured adherence on this repository's own prompt is 70% (3 of 10
 * premise-probe runs closed with a question mark). Restating the rule a third
 * time is the move Harness-IF predicts will not work — it is an against-prior
 * instruction, and every model tested degrades on those. So check it instead.
 *
 * Interactive sessions are untouched: closing on a question is correct there.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CORRECTION =
  "Your reply closed on a question, which a headless run cannot do — there is no " +
  "user to answer it. Restate that closing line as a declaration: name the decision " +
  "that is needed, name the default you are taking, and stop. Output only the " +
  "corrected closing, not the whole reply again.";

/** Trailing fenced code, tables, and list punctuation are not a closing question. */
function lastProseLine(text: string): string {
  const lines = text.split("\n");
  let inFence = false;
  let last = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line) continue;
    if (line.startsWith("|") || /^[-*+]\s|^\d+\.\s|^#{1,6}\s/.test(line)) {
      last = line.replace(/^[-*+]\s|^\d+\.\s|^#{1,6}\s/, "");
      continue;
    }
    last = line;
  }
  return last;
}

/**
 * True when `text` closes on a question and therefore violates the headless
 * close rule. Exported for the table test; the extension body is the shell.
 */
export function closesOnQuestion(text: string): boolean {
  const line = lastProseLine(text);
  // Strip trailing emphasis/quote punctuation before testing the final char.
  return /\?["'`*_)\]]*$/.test(line);
}

/** True when this process is a non-interactive `pi -p` run. */
export function isHeadless(argv: readonly string[]): boolean {
  return argv.includes("-p") || argv.includes("--print");
}

export default function (pi: ExtensionAPI) {
  if (!isHeadless(process.argv)) return;
  if (process.env.PI_SUBAGENT_CHILD === "1") return; // children report to a parent, not a human

  let corrected = false; // one correction per run; never loop

  pi.on("agent_end", async (event) => {
    if (corrected) return;
    const assistant = [...event.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!assistant) return;
    const text =
      typeof assistant.content === "string"
        ? assistant.content
        : (assistant.content ?? [])
            .map((c: { type: string; text?: string }) =>
              c.type === "text" ? (c.text ?? "") : "",
            )
            .join("");
    if (!closesOnQuestion(text)) return;
    corrected = true;
    try {
      pi.sendUserMessage(CORRECTION, { deliverAs: "followUp" });
    } catch {
      // Never crash a headless run over a style correction. Fail open.
    }
  });
}
