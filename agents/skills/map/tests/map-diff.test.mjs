// map.mjs --diff against a temp git repo built from tests/fixture: committed base, then
// uncommitted edits in the working tree.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAP = path.join(here, "..", "map.mjs");
const FIXTURE = path.join(here, "fixture");
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const temps = [];
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: ENV });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const mapDiff = (repo, base) => {
  const r = spawnSync(process.execPath, [MAP, repo, "--diff", base], { encoding: "utf8", env: ENV });
  return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.split("\n") };
};
const mapTemps = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("map-base-")).length;
const write = (repo, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};

let repo;
let run;
let leftBefore;
before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "map-test-diff-"));
  temps.push(repo);
  fs.cpSync(FIXTURE, repo, { recursive: true });
  // An unchanged importer of c.tsx, so the deleted row has base importers.
  write(repo, "src/usesc.ts", 'import { View } from "./core/c";\n\nexport const v = View;\n');
  git(repo, "init", "-q");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");

  // new cycle: a -> b -> d -> a
  write(repo, "src/core/d.ts", 'import { a } from "./a";\n\nexport const d = () => a({ w: 1, h: 1 });\n');
  write(repo, "src/core/b.ts", fs.readFileSync(path.join(repo, "src/core/b.ts"), "utf8").replace('import { a } from "./a";', 'import { a } from "./a";\nimport { d } from "./d";\n\nexport const viaD = d;'));
  // edge removed, export added
  write(repo, "src/legacy.cjs", "module.exports = {};\n");
  fs.appendFileSync(path.join(repo, "src/core/a.ts"), "\nexport function extra(n: number): string {\n  return String(n);\n}\n");
  // fan-in of a.ts reaches 10+
  for (let i = 0; i < 10; i++) write(repo, `src/many/i${i}.ts`, `import { a } from "../core/a";\n\nexport const i${i} = a;\n`);
  fs.rmSync(path.join(repo, "src/core/c.tsx"));

  leftBefore = mapTemps();
  run = mapDiff(repo, "HEAD");
});

const section = (out, title) => out.split(/^## /m).find((s) => s.startsWith(`${title}\n`)) ?? assert.fail(`no section ${title}`);

test("header and counts: untracked files count as added, the removed file as deleted", () => {
  assert.equal(run.code, 0, run.err);
  const short = git(repo, "rev-parse", "--short", "HEAD");
  assert.ok(run.out.startsWith(`# diff map: ${short}..working tree\n\n15 touched source files, 11 added, 1 deleted, 3 modified. `), run.out);
  assert.match(run.out, /Fan-in is importers in the working tree \(base for deleted files\); 10\+ is flagged\.\n/);
});

test("table: fan-in descending then path, (!) at 10+, deleted row shows base importers", () => {
  const rows = section(run.out, "Touched files by fan-in (read in this order)").split("\n").filter((l) => l.startsWith("|"));
  assert.equal(rows[0], "| file | in | change | imported by |");
  assert.equal(rows[1], "|---|---|---|---|");
  const body = rows.slice(2);
  assert.match(body[0], /^\| src\/core\/a\.ts \| 1\d \(!\) \| modified \| /);
  assert.ok(body[0].includes("src/many/i0.ts") && body[0].includes("src/core/d.ts") && body[0].includes("(via src/index.ts)"), body[0]);
  assert.ok(!body[0].includes("src/core/c.tsx"), "deleted c.tsx no longer imports a");
  assert.equal(body[1], "| src/core/b.ts | 3 | modified | src/core/a.ts, src/index.ts, src/app.ts (via src/index.ts) |");
  assert.ok(body.slice(2).every((l) => !l.includes("(!)")));
  assert.ok(body.includes("| src/core/c.tsx | 1 | deleted | src/usesc.ts |"), body.join("\n"));
  assert.ok(body.includes("| src/core/d.ts | 1 | added | src/core/b.ts |"), body.join("\n"));
  assert.ok(body.includes("| src/many/i3.ts | 0 | added | entry or unused |"));
  const keys = body.map((l) => l.split(" | ")).map((c) => [Number.parseInt(c[1], 10), c[0].slice(2)]);
  assert.deepEqual(keys, [...keys].sort((x, y) => y[0] - x[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0)));
  assert.equal(body.length, 15);
});

test("import edges: + for new, - for removed, sorted by importer then imported", () => {
  const lines = section(run.out, "Import edges").split("\n").filter((l) => /^[+-] /.test(l));
  assert.ok(lines.includes("+ src/core/b.ts -> src/core/d.ts"));
  assert.ok(lines.includes("+ src/core/d.ts -> src/core/a.ts"));
  assert.ok(lines.includes("+ src/many/i9.ts -> src/core/a.ts"));
  assert.ok(lines.includes("- src/legacy.cjs -> src/core/b.ts"));
  assert.ok(lines.includes("- src/core/c.tsx -> src/core/a.ts"));
  assert.ok(lines.includes("- src/core/c.tsx -> src/core/b.ts"));
  assert.ok(lines.includes("- src/usesc.ts -> src/core/c.tsx"));
  assert.equal(lines.length, 16);
  const keys = lines.map((l) => l.slice(2).split(" -> "));
  assert.deepEqual(keys, [...keys].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0)));
});

test("cycles: the grown a/b cycle is a new High cycle and the old one resolved", () => {
  const body = section(run.out, "Cycles");
  assert.ok(body.includes("High: new cycle src/core/a.ts -> src/core/b.ts -> src/core/d.ts -> src/core/a.ts\n"), body);
  assert.ok(body.includes("Resolved: src/core/a.ts -> src/core/b.ts -> src/core/a.ts\n"), body);
});

test("export changes: added and removed headers per touched file", () => {
  const body = section(run.out, "Export changes");
  assert.match(body, /### src\/core\/a\.ts\n\n\+ export function extra\(n: number\): string\n(?!-)/);
  assert.match(body, /### src\/core\/b\.ts\n\n\+ export const viaD\n/);
  assert.match(body, /### src\/core\/c\.tsx\n\n- export const View = /);
  assert.match(body, /### src\/core\/d\.ts\n\n\+ export const d = \(\)\n/);
  assert.match(body, /### src\/many\/i0\.ts\n\n\+ export const i0\n/);
  assert.ok(!body.includes("### src/legacy.cjs"), "unchanged exports are omitted");
  // table order: a.ts section precedes c.tsx's (fan-in 10+ vs deleted 1)
  assert.ok(body.indexOf("### src/core/a.ts") < body.indexOf("### src/core/c.tsx"));
});

test("a run leaves no map-base-* temp dir behind", () => {
  assert.equal(mapTemps(), leftBefore);
});

test("no change: (none) in edges, cycles and exports", () => {
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), "map-test-diff-"));
  temps.push(clean);
  fs.cpSync(FIXTURE, clean, { recursive: true });
  git(clean, "init", "-q");
  git(clean, "add", "-A");
  git(clean, "commit", "-q", "-m", "base");
  const r = mapDiff(clean, "HEAD");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /\n0 touched source files, 0 added, 0 deleted, 0 modified\./);
  for (const t of ["Import edges", "Cycles", "Export changes"]) assert.match(section(r.out, t), /\n\(none\)\n*$/, t);
});

test("--diff on a non-git dir exits 2", () => {
  const r = mapDiff(FIXTURE, "HEAD");
  assert.equal(r.code, 2);
  assert.match(r.err, /^map: not a git work tree root/);
});

test("a base that does not resolve exits 2 with git's message, and leaves no temp dir", () => {
  const n = mapTemps();
  const r = mapDiff(repo, "no-such-ref");
  assert.equal(r.code, 2);
  assert.match(r.err, /no-such-ref/);
  assert.match(r.err, /bad revision|unknown revision|ambiguous argument/);
  assert.equal(mapTemps(), n);
});
