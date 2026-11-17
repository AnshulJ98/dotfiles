/**
 * /where: where we are, by outcome, as a card laid out by code.
 *
 * `/where` gathers facts (your last messages verbatim, git status and this
 * session's commits, pi-blackhole's high and critical observations, the last
 * card while it is still in context), sends them with the rules in
 * lib/where-rules.md as a hidden message, and activates the where_card tool for
 * that one run. The model fills the card; lib/where-card.ts checks it (errors go
 * back to the model), lays it out to 100 columns, and shows a ✓ whose proof is
 * not in the facts as unverified. `/where <n>` asks for a brief of action n.
 *
 * The tool is inactive outside a /where run, so it costs no prompt tokens otherwise.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  type BranchEntry,
  type Brief,
  type Card,
  type CardDetails,
  CHECK_STATES,
  type Facts,
  factsFromBranch,
  GROUPS,
  LEVELS,
  buildPrompt,
  proofChecker,
  renderBrief,
  renderCard,
  validateBrief,
  validateCard,
} from "../lib/where-card.ts";

const TOOL = "where_card";
const RULES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../lib/where-rules.md",
);

const params = Type.Object({
  kind: StringEnum(["card", "brief"] as const),
  rungs: Type.Optional(
    Type.Array(
      Type.Object({
        level: StringEnum(LEVELS),
        outcome: Type.String({
          description: "What is true when this rung is done",
        }),
        checks: Type.Array(
          Type.Object({
            state: StringEnum(CHECK_STATES),
            text: Type.String(),
            proof: Type.Optional(
              Type.String({
                description: "done: one sha, path, test output or memory id",
              }),
            ),
            where: Type.Optional(
              Type.String({ description: "reported: where it was reported" }),
            ),
            actions: Type.Optional(
              Type.Array(Type.Integer(), {
                description: "doing/open: numbers of the actions that close it",
              }),
            ),
          }),
        ),
      }),
    ),
  ),
  actions: Type.Optional(
    Type.Array(
      Type.Object({
        n: Type.Integer({ minimum: 1 }),
        group: StringEnum(GROUPS),
        text: Type.String({ description: "Verb first, one move" }),
        options: Type.Optional(Type.Array(Type.String())),
        pick: Type.Optional(Type.String()),
        needs: Type.Optional(Type.String()),
        until: Type.Optional(Type.String()),
      }),
    ),
  ),
  ideas: Type.Optional(Type.String()),
  reply: Type.Optional(Type.String()),
  brief: Type.Optional(
    Type.Object({
      subject: Type.String({
        description:
          "The action or rung briefed, e.g. 'action 3: run the probe'",
      }),
      what: Type.String(),
      where: Type.String(),
      why: Type.String(),
      how: Type.String(),
      effort: Type.String(),
      impact: Type.String(),
      pick: Type.String(),
      context: Type.String(),
    }),
  ),
});

async function git(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
): Promise<string> {
  try {
    const r = await pi.exec("git", args, { cwd, timeout: 5000 });
    return r.code === 0 ? r.stdout.trim() : "";
  } catch {
    return ""; // not a repo or no git: the card goes without git facts
  }
}

export default function (pi: ExtensionAPI) {
  // Facts of the /where run in flight; the tool checks proof against them.
  let facts: (Facts & { toolText: string }) | null = null;

  const branch = (ctx: ExtensionContext) =>
    ctx.sessionManager.getBranch() as unknown as BranchEntry[];

  pi.registerTool({
    name: TOOL,
    label: "Where card",
    defaultActive: false,
    // model-only: a direct call, not one inside codemode, so terminate ends the run and the card shows as its own result
    exposure: "model-only",
    description:
      "Report where we are by outcome as a card (kind card) or a brief of one action or rung (kind brief). Only during /where.",
    parameters: params,
    async execute(_id, p, _signal, _onUpdate, ctx) {
      if (p.kind === "brief") {
        const b = p.brief as Brief | undefined;
        const errs = b
          ? validateBrief(b)
          : ['kind "brief" needs a brief object'];
        if (errs.length) throw new Error(errs.join("\n"));
        const text = renderBrief(b as Brief);
        return {
          content: [{ type: "text", text }],
          details: { kind: "brief", text } satisfies CardDetails,
          terminate: true,
        };
      }
      // StringEnum fields come through as unknown in the static type (pi-ai's Schema vs this typebox); the schema already checked them.
      const card: Card = {
        rungs: (p.rungs ?? []) as Card["rungs"],
        actions: (p.actions ?? []) as Card["actions"],
        ideas: p.ideas,
        reply: p.reply,
      };
      const errs = validateCard(card);
      if (errs.length)
        throw new Error(
          "Fix and call where_card again:\n- " + errs.join("\n- "),
        );
      const f = facts ?? {
        ...factsFromBranch(branch(ctx)),
        gitStatus: "",
        gitLog: "",
      };
      const exists = (p: string) =>
        existsSync(isAbsolute(p) ? p : resolve(ctx.cwd, p));
      const { text, unverified } = renderCard(
        card,
        proofChecker(f, f.toolText, exists),
      );
      const note = unverified.length
        ? `\n\n(${unverified.length} done check(s) shown unverified: proof not found in git, files, memory or tool output)`
        : "";
      return {
        content: [{ type: "text", text: text + note }],
        details: { kind: "card", text } satisfies CardDetails,
        terminate: true,
      };
    },
  });

  pi.registerCommand("where", {
    description:
      "Where we are by outcome: a card with done-when checks and numbered actions; /where <n> briefs action n",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const b = factsFromBranch(branch(ctx));
      const since = b.since ? ["--since=" + b.since] : ["-n", "15"];
      const [gitStatus, gitLog] = await Promise.all([
        git(pi, ctx.cwd, ["status", "--short", "--branch"]),
        git(pi, ctx.cwd, ["log", "--oneline", "-n", "15", ...since]),
      ]);
      // a brief of action n needs the card that numbered it, even from before a compaction
      const lastCard = args?.trim() ? b.anyCard : b.lastCard;
      facts = {
        ...b,
        lastCard,
        gitStatus: gitStatus.split("\n").slice(0, 25).join("\n"),
        gitLog,
      };
      pi.setActiveTools([...new Set([...pi.getActiveTools(), TOOL])]);
      pi.sendMessage(
        {
          customType: "where-request",
          content: buildPrompt(readFileSync(RULES, "utf8"), facts, args ?? ""),
          display: false,
        },
        { triggerTurn: true },
      );
      // Hold the command until the card is out: `pi -p "/where"` exits when the handler returns,
      // which aborted the run it had just started (seen on pi 1.5.2).
      await ctx.waitForIdle();
    },
  });

  pi.on("agent_end", async () => {
    if (!pi.getActiveTools().includes(TOOL)) return;
    pi.setActiveTools(pi.getActiveTools().filter((t) => t !== TOOL));
    facts = null;
  });
}
