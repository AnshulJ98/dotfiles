// Run: node --test 'config/pi/tests/*.test.ts'
// tests/hermetic.ts, seen from a child process that imports it.
import "./hermetic.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const HERMETIC = pathToFileURL(
  resolve(import.meta.dirname, "hermetic.ts"),
).href;

/** Runs body as an ES module that imports hermetic.ts first; returns its JSON output. */
function probe(body: string, env: NodeJS.ProcessEnv): unknown {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hermetic-probe-")));
  try {
    const file = join(dir, "probe.mjs");
    writeFileSync(file, "import " + JSON.stringify(HERMETIC) + ";\n" + body);
    const run = spawnSync(process.execPath, [file], {
      env: { ...process.env, TMPDIR: dir, ...env },
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a test process gets its own TMPDIR, a child node process uses it, and it is gone after exit", () => {
  // A shell child is not covered on macOS: /usr/bin/mktemp ignores TMPDIR there.
  const out = probe(
    [
      'import { execFileSync } from "node:child_process";',
      'import { mkdtempSync, writeFileSync } from "node:fs";',
      'import { tmpdir } from "node:os";',
      'import { join } from "node:path";',
      'const own = mkdtempSync(join(tmpdir(), "own-"));',
      'writeFileSync(join(own, "f"), "1");',
      'const child = execFileSync(process.execPath, ["-p", "fs.mkdtempSync(path.join(os.tmpdir(), \'child-\'))"], { encoding: "utf8" }).trim();',
      "console.log(JSON.stringify({ root: process.env.TMPDIR, own, child }));",
    ].join("\n"),
    {},
  ) as Record<string, string>;
  assert.match(out.root, /\/pi-test-[^/]+$/);
  assert.ok(out.own.startsWith(out.root + "/"), out.own);
  assert.ok(out.child.startsWith(out.root + "/"), out.child);
  assert.equal(existsSync(out.root), false, "TMPDIR root left behind");
});

test("secret-looking variables are dropped; ordinary ones stay", () => {
  const kept = probe(
    'console.log(JSON.stringify(Object.keys(process.env).filter((k) => k.startsWith("HT_")).sort()));',
    {
      HT_GITHUB_PERSONAL_ACCESS_TOKEN: "x",
      HT_AWS_SECRET_ACCESS_KEY: "x",
      HT_OPENAI_API_KEY: "x",
      HT_DB_PASSWORD: "x",
      HT_GOOGLE_CREDENTIALS: "x",
      HT_SSH_AUTH_SOCK: "/tmp/s",
      HT_PATHLIKE: "/bin",
    },
  );
  assert.deepEqual(kept, ["HT_PATHLIKE", "HT_SSH_AUTH_SOCK"]);
});
