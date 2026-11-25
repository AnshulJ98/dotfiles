// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/where.ts imports pi packages at runtime; they resolve from the installed pi release.
// The tool list must stay fixed: Bedrock sends it at the head of every request, so a
// change rewrites the whole prompt cache. Outside a /where run the tool refuses.
import assert from "node:assert/strict";
import { register } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { piPackage } from "./pi-package.ts";

const piModules = pathToFileURL(join(piPackage(), "package.json")).href;
register(
  `data:text/javascript,${encodeURIComponent(`
		export async function resolve(specifier, context, next) {
			if (/^(@earendil-works\\/|typebox)/.test(specifier)) return next(specifier, { ...context, parentURL: ${JSON.stringify(piModules)} });
			return next(specifier, context);
		}`)}`,
);

const { default: where } = await import("../extensions/where.ts");

type Exec = (id: string, p: unknown) => Promise<{ terminate?: boolean }>;

function load() {
  const tools: Array<{ name: string; defaultActive?: boolean; execute: Exec }> =
    [];
  const commands: Record<
    string,
    { handler: (args: string, ctx: unknown) => Promise<void> }
  > = {};
  const handlers: Record<string, () => Promise<void>> = {};
  const toolListChanges: string[][] = [];
  const sent: unknown[] = [];
  where({
    registerTool: (tool: (typeof tools)[number]) => tools.push(tool),
    registerCommand: (name: string, c: (typeof commands)[string]) =>
      (commands[name] = c),
    on: (event: string, h: () => Promise<void>) => (handlers[event] = h),
    exec: async () => ({ code: 1, stdout: "", stderr: "" }),
    sendMessage: (m: unknown) => sent.push(m),
    getActiveTools: () => [],
    setActiveTools: (names: string[]) => toolListChanges.push(names),
  } as never);
  const ctx = {
    cwd: process.cwd(),
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => [] },
  };
  return { tool: tools[0], commands, handlers, toolListChanges, sent, ctx };
}

const card = {
  kind: "card",
  rungs: [
    {
      level: "target",
      outcome: "where_card stays in the tool list",
      checks: [{ state: "open", text: "fix merged", actions: [1] }],
    },
  ],
  actions: [
    { n: 1, group: "I do next", text: "merge the fix", needs: "needs nothing" },
  ],
};

test("where_card is active from the start", () => {
  const { tool } = load();
  assert.equal(tool.name, "where_card");
  assert.notEqual(tool.defaultActive, false);
});

test("where_card refuses a call outside /where", async () => {
  const { tool } = load();
  await assert.rejects(tool.execute("1", card), /only inside \/where/);
});

test("/where runs the card without touching the tool list, then refuses again after agent_end", async () => {
  const { tool, commands, handlers, toolListChanges, sent, ctx } = load();
  await commands.where.handler("", ctx);
  assert.equal(sent.length, 1);
  const result = await tool.execute("1", card);
  assert.equal(result.terminate, true);
  await handlers.agent_end();
  await assert.rejects(tool.execute("2", card), /only inside \/where/);
  assert.deepEqual(toolListChanges, []);
});
