import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { kittyEnvironment } from "../lib/kitty.ts";

test("remote-control identity follows a zmx reattach, never the stale pane", () => {
  const root = mkdtempSync(join(tmpdir(), "kitty-env-"));
  writeFileSync(join(root, "zmx"), '#!/bin/sh\n[ "$GONE" = 1 ] && exit 1\nprintf "KITTY_LISTEN_ON=unix:/tmp/current\\nKITTY_WINDOW_ID=81\\n-SSH_AUTH_SOCK\\n"\n');
  chmodSync(join(root, "zmx"), 0o755);
  const env = { PATH: root, ZMX_SESSION: "held", KITTY_WINDOW_ID: "1", KITTY_LISTEN_ON: "unix:/tmp/dead" };
  assert.deepEqual(kittyEnvironment({ ...env, ZMX_SESSION: "" }), { ...env, ZMX_SESSION: "" });
  assert.deepEqual(kittyEnvironment(env), { ...env, KITTY_WINDOW_ID: "81", KITTY_LISTEN_ON: "unix:/tmp/current" });
  const gone = kittyEnvironment({ ...env, GONE: "1" });
  assert.equal(gone.KITTY_WINDOW_ID, undefined);
  assert.equal(gone.KITTY_LISTEN_ON, undefined);
});
