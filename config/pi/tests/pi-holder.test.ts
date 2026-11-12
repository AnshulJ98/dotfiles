import assert from "node:assert/strict";
import { test } from "node:test";
import piHolder from "../extensions/pi-holder.ts";

type Handler = (event: unknown, ctx: unknown) => unknown;

test("kitty notifications: settled completion and input prompts, not turns, aborts, RPC or scouts", async () => {
  const saved = { kitty: process.env.KITTY_WINDOW_ID, scout: process.env.SCOUT_DIGEST };
  process.env.KITTY_WINDOW_ID = "42";
  delete process.env.SCOUT_DIGEST;
  const handlers = new Map<string, Handler>();
  const chunks: string[] = [];
  const write = test.mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    piHolder({ on: (name: string, fn: Handler) => handlers.set(name, fn) } as never);
    const ctx = { mode: "tui", cwd: "/tmp/my project", sessionManager: { getSessionId: () => "session-123" }, getContextUsage: () => undefined };
    const fire = async (name: string, event: unknown, context = ctx) => { await handlers.get(name)?.(event, context); };
    await fire("turn_end", {});
    assert.equal(chunks.filter((s) => s.includes("]99;")).length, 0);
    await fire("agent_settled", { aborted: true });
    await fire("agent_settled", { aborted: false }, { ...ctx, mode: "rpc" });
    process.env.SCOUT_DIGEST = "/tmp/child.out";
    await fire("agent_settled", { aborted: false });
    delete process.env.SCOUT_DIGEST;
    assert.equal(chunks.filter((s) => s.includes("]99;")).length, 0);
    await fire("agent_settled", { aborted: false });
    await fire("ui_prompt_start", { title: "Choice\x1b]injection\x07" });
    const notes = chunks.filter((s) => s.includes("]99;"));
    assert.equal(notes.length, 4);
    for (const note of notes) {
      assert.match(note, /^\x1b\]99;i=pi-session-123:.*o=unfocused:.*e=1(?::[^;]*)?;/);
      assert.ok(note.endsWith("\x1b\\"));
      assert.doesNotMatch(note, /Choice|injection|my project/);
    }
    assert.equal(Buffer.from(notes[1].split(";").at(-1)!.slice(0, -2), "base64").toString(), "my project: ready for input");
    assert.match(Buffer.from(notes[3].split(";").at(-1)!.slice(0, -2), "base64").toString(), /Choice/);
  } finally {
    write.mock.restore();
    for (const [key, value] of [["KITTY_WINDOW_ID", saved.kitty], ["SCOUT_DIGEST", saved.scout]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
