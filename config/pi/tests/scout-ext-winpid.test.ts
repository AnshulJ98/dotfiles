// Run: node --test 'config/pi/tests/*.test.ts'
// Its own file: extensions/scout.ts fixes its directories at import, from PI_CODING_AGENT_DIR.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
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

// Under Git Bash the wrapper's $$ is an MSYS pid that process.kill cannot see; the Windows
// pid of the same process is meta's winpid. Judging by pid reaped live scouts mid-run.
test("a running scout is judged alive by its winpid when the meta has one", async () => {
  const root = mkdtempSync(join(tmpdir(), "scout-ext-"));
  process.env.PI_CODING_AGENT_DIR = root;
  delete process.env.PI_SCOUT_DEPTH;
  const scoutRoot = join(root, "sessions", "scout");
  const pid = spawnSync(process.execPath, ["-e", ""]).pid; // exited, so its pid reads as dead
  const meta = join(scoutRoot, ".running", `${pid}.meta`);
  mkdirSync(join(scoutRoot, ".running"), { recursive: true });
  mkdirSync(join(scoutRoot, ".done"), { recursive: true });
  writeFileSync(
    meta,
    `pid=${pid}\nwinpid=${process.pid}\nmodel=m/x\nthinking=high\nstarted=${Date.now()}\nsession=/s.jsonl\ntask=t\n`,
  );
  writeFileSync(join(scoutRoot, ".running", `${pid}.out`), "");

  const { default: extension } = await import("../extensions/scout.ts");
  const handlers = new Map<
    string,
    (event: unknown, ctx: unknown) => Promise<void>
  >();
  const entries: unknown[] = [];
  extension({
    on: (name: string, fn: (event: unknown, ctx: unknown) => Promise<void>) =>
      handlers.set(name, fn),
    registerEntryRenderer: () => {},
    appendEntry: (_type: string, data: unknown) => entries.push(data),
  } as never);
  const ctx = {
    sessionManager: { getSessionFile: () => "/s.jsonl" },
    ui: { setStatus: () => {}, theme: { fg: (_c: string, s: string) => s } },
  };
  await handlers.get("session_shutdown")?.({}, ctx);

  assert.equal(entries.length, 0);
  assert.ok(existsSync(meta), "the running scout's meta was reaped");
  assert.ok(!existsSync(join(scoutRoot, ".done", `${pid}.meta`)));
});
