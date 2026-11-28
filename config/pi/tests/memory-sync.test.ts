// Run: node --test 'config/pi/tests/*.test.ts'
// config/memory/memory-sync against a real bare origin and clones: a failed sync fails loudly
// (exit 1, a marker pi-health reports, one notification), and a clean run clears it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const SYNC = resolve(import.meta.dirname, "../../memory/memory-sync");
const root = realpathSync(mkdtempSync(join(tmpdir(), "memory-sync-")));
after(() => rmSync(root, { recursive: true, force: true }));

// The user's git config (signing, hooks, credential helpers) stays out of it.
writeFileSync(join(root, "gitconfig"), "");
const bin = join(root, "bin");
mkdirSync(bin);
// Stands in for osascript and notify-send: records each notification instead of showing it.
for (const name of ["osascript", "notify-send"]) {
  writeFileSync(
    join(bin, name),
    `#!/bin/sh\necho "$*" >>"${join(root, "notified")}"\n`,
  );
  chmodSync(join(bin, name), 0o755);
}
const env = {
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  PI_LOG_DIR: join(root, "logs"),
};
const git = (cwd: string, ...args: string[]): string => {
  const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
};
const sync = (repo: string) =>
  spawnSync(SYNC, [], { env: { ...env, MEMORY_REPO: repo }, encoding: "utf8" });
const marker = join(root, "logs", "memory-sync.failed");
const notified = (): string[] =>
  existsSync(join(root, "notified"))
    ? readFileSync(join(root, "notified"), "utf8").trim().split("\n")
    : [];

test("a rebase conflict exits 1, keeps the local commit, writes the marker and notifies once; a clean run clears it", () => {
  const origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  const seed = join(root, "seed");
  git(root, "clone", "-q", origin, seed);
  writeFileSync(join(seed, "notes.txt"), "base\n");
  git(seed, "add", "notes.txt");
  git(seed, "commit", "-q", "-m", "base");
  git(seed, "push", "-q", "origin", "HEAD:main");
  const mac = join(root, "mac");
  const box = join(root, "box");
  git(root, "clone", "-q", origin, mac);
  git(root, "clone", "-q", origin, box);
  writeFileSync(join(box, "notes.txt"), "from box\n");
  git(box, "commit", "-q", "-am", "box");
  git(box, "push", "-q");
  writeFileSync(join(mac, "notes.txt"), "from mac\n");

  const first = sync(mac);
  assert.equal(first.status, 1, first.stdout + first.stderr);
  assert.match(first.stderr, /FAILED .*rebase conflict/);
  assert.match(
    readFileSync(marker, "utf8"),
    /^\d{4}-\d\d-\d\d \d\d:\d\d rebase conflict in /,
  );
  assert.equal(
    existsSync(join(mac, ".git", "rebase-merge")),
    false,
    "rebase left in progress",
  );
  assert.ok(git(mac, "log", "-1", "--format=%s").startsWith("memory: "));
  assert.equal(notified().length, 1);

  // Still broken: the marker stays, and no second notification every 10 minutes
  assert.equal(sync(mac).status, 1);
  assert.equal(existsSync(marker), true);
  assert.equal(notified().length, 1);

  git(mac, "reset", "-q", "--hard", "origin/main");
  const clean = sync(mac);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /ok [0-9a-f]+/);
  assert.equal(existsSync(marker), false);
});

test("an unreachable origin is a failure too, named as a pull failure, not a conflict", () => {
  const repo = join(root, "orphan");
  git(root, "init", "-q", "-b", "main", repo);
  git(repo, "remote", "add", "origin", join(root, "missing.git"));
  writeFileSync(join(repo, "memory.md"), "- [fact] x\n");
  git(repo, "add", "memory.md");
  git(repo, "commit", "-q", "-m", "x");
  git(repo, "config", "branch.main.remote", "origin");
  git(repo, "config", "branch.main.merge", "refs/heads/main");
  const run = sync(repo);
  assert.equal(run.status, 1);
  assert.match(readFileSync(marker, "utf8"), / pull failed in /);
});
