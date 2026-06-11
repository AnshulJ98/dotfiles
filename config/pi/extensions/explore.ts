/**
 * explore — minimal background retrieval sub-agent.
 *
 * Registers a single `explore` tool. The MAIN agent calls it with a focused,
 * READ-ONLY retrieval query; it spawns a cheap Haiku child via `pi -p`,
 * restricted to read+bash, and returns only the child's digest — keeping the
 * crawl's noise OUT of the main (expensive) context window.
 *
 * Deliberately NOT the official 1009-line subagent framework: no parallel/chain
 * fan-out, single synchronous task, Haiku-pinned, retrieval-only. Lightweight by
 * design, and the cheap-model offload is the whole point under token billing.
 *
 * Built from the documented API: defineTool/registerTool (hello.ts) + spawn
 * (subagent example). Loaded via settings.json "extensions".
 */
import { spawn } from "node:child_process";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXPLORE_MODEL = "github-copilot/claude-haiku-4.5";

const EXPLORE_SYSTEM = [
  "You are a read-only retrieval assistant.",
  "Use read and bash (grep, find, ls, sed -n) to locate facts in the codebase.",
  "Do MECHANICAL retrieval only: file paths, line numbers, symbols, call-sites, imports, config values.",
  "Do NOT judge architecture, propose changes, write, or edit anything.",
  "Return a TIGHT digest as bullet points with file:line references. No preamble, no conclusions.",
].join(" ");

const exploreTool = defineTool({
  name: "explore",
  label: "Explore",
  description:
    "Delegate a focused, READ-ONLY codebase retrieval task to a cheap Haiku sub-agent and get back a short digest. " +
    "Use for mechanical lookups that would otherwise flood your context: 'where is X defined', 'which files import Y', " +
    "'list all call-sites of Z', 'find the config for W'. Big-crawl in, small-digest out. " +
    "NOT for judgment, planning, design, or edits — do those yourself.",
  parameters: Type.Object({
    query: Type.String({
      description: "The retrieval task. Be specific and mechanical (locate / list / find), not open-ended.",
    }),
  }),

  async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
    if (typeof params.query !== "string" || params.query.startsWith("-")) {
      return {
        content: [{ type: "text", text: "explore: invalid query — must be a non-empty string that does not start with '-'." }],
        isError: true,
      };
    }

    const args = [
      "-p",
      "--no-skills",
      "--no-extensions",
      "--no-session",
      "--model",
      EXPLORE_MODEL,
      "--thinking",
      "minimal",
      "--tools",
      "read,bash",
      "--append-system-prompt",
      EXPLORE_SYSTEM,
      params.query,
    ];

    return await new Promise((resolve) => {
      let out = "";
      let err = "";
      const proc = spawn("pi", args, { cwd: process.cwd(), signal, stdio: ["ignore", "pipe", "pipe"] });
      proc.stdout.on("data", (d) => (out += d.toString()));
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("error", (e) =>
        resolve({
          content: [{ type: "text", text: `explore failed to spawn pi: ${e.message}` }],
          isError: true,
        }),
      );
      proc.on("close", (code) => {
        const text = out.trim() || err.trim() || "(no output)";
        resolve({
          content: [{ type: "text", text }],
          details: { model: EXPLORE_MODEL, exitCode: code ?? -1 },
          isError: code !== 0,
        });
      });
    });
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(exploreTool);
}
