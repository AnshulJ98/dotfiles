// map.mjs against tests/fixture (no git; aliases, barrels, a cycle, dynamic/require, Python) and
// small temp repos for node_modules and odd paths, tsconfig comments + extends, and git mode.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAP = path.join(here, "..", "map.mjs");
const FIXTURE = path.join(here, "fixture");
const temps = [];
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function map(repo, mod, env = process.env) {
  const r = spawnSync(process.execPath, [MAP, repo, mod], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.split("\n") };
}

function tempRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "map-test-"));
  temps.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test("src/core: header, reading order leaves first, and the a <-> b cycle", () => {
  const r = map(FIXTURE, "src/core");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^# src\/core map input\n\nGenerated \d{4}-\d\d-\d\d at no-git\. 4 files in the module, 11 edges repo-wide\./);
  assert.ok(
    r.out.includes(
      "## Reading order (leaves first)\n\n1. src/core/a.ts\n2. src/core/b.ts\n3. src/core/c.tsx\n4. src/core/internal.ts\n\nCycles:\n- src/core/a.ts -> src/core/b.ts -> src/core/a.ts\n",
    ),
    r.out,
  );
});

test("src/core: fan-in follows the barrel, the alias, the .js twin, import() and require()", () => {
  const r = map(FIXTURE, "src/core");
  for (const row of [
    "| src/core/a.ts | 5 | src/core/b.ts, src/core/c.tsx, src/dyn.mjs, src/index.ts, src/app.ts (via src/index.ts) |",
    "| src/core/b.ts | 5 | src/core/a.ts, src/core/c.tsx, src/index.ts, src/legacy.cjs, src/app.ts (via src/index.ts) |",
    "| src/core/c.tsx | 0 | entry or unused |",
    "| src/core/internal.ts | 0 | entry or unused |",
  ]) {
    assert.ok(r.lines.includes(row), `missing row ${row}\n${r.out}`);
  }
  assert.ok(!r.out.includes("skip.test.ts"), "test files are not sources");
  assert.ok(!r.out.includes("node_modules"));
});

test("src/core: export headers as written, internals with call counts", () => {
  const r = map(FIXTURE, "src/core");
  assert.ok(
    r.out.includes(
      "### src/core/a.ts\n\n```ts\nexport interface Shape { w: number; h: number }\nexport function a(shape: Shape): number\nexport const area = (s: Shape): number\n```\n",
    ),
    r.out,
  );
  assert.ok(r.out.includes("### src/core/internal.ts\n\n```ts\n// no exports\n```\n"), r.out);
  const internals = r.out.slice(r.out.indexOf("## Internals"));
  assert.ok(internals.includes("| internal | file | calls | lines |\n|---|---|---|---|\n| helper | src/core/internal.ts | 2 | 3 |\n| main | src/core/internal.ts | 0 | 3 |\n"), internals);
});

test("py/pkg: __all__ limits exports; relative and package-dir imports resolve; os is dropped", () => {
  const r = map(FIXTURE, "py/pkg");
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes("### py/pkg/__init__.py\n\n```py\ndef run(n: int) -> int\n```\n"), r.out);
  assert.ok(r.lines.includes("| py/pkg/__init__.py | 1 | py/pkg/sub/mod.py |"), r.out);
  assert.ok(r.lines.includes("| py/pkg/sub/other.py | 1 | py/pkg/sub/mod.py |"), r.out);
  assert.ok(r.lines.includes("| _helper | py/pkg/__init__.py | 1 | 2 |"), r.out);
  assert.ok(r.out.includes("### py/pkg/sub/__init__.py\n\n```py\n# no exports\n```"), r.out);
});

test("Python: __all__ hides unlisted public names; src/ root; from a.b import c falls back to a/b.py", () => {
  const dir = tempRepo({
    "main.py": "from app.core import shown\n\nshown(1)\n",
    "src/app/__init__.py": "",
    "src/app/core.py": `__all__ = ["shown"]


@decorator
def shown(a: int,
          b: str = "x") -> int:  # note: not part of the header
    return hidden()


def hidden():
    pass
`,
  });
  const r = map(dir, "src/app");
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('### src/app/core.py\n\n```py\ndef shown(a: int, b: str = "x") -> int\n```\n'), r.out);
  assert.ok(r.lines.includes("| src/app/core.py | 1 | main.py |"), r.out);
  assert.ok(r.lines.includes("| hidden | src/app/core.py | 1 | 2 |"), r.out);
});

test("bad arguments exit 2 with a one-line reason", () => {
  const missing = map(FIXTURE, "src/nope");
  assert.equal(missing.code, 2);
  assert.equal(missing.err, `map: no such directory: ${path.join(FIXTURE, "src/nope")}\n`);
  const file = map(FIXTURE, "tsconfig.json");
  assert.equal(file.code, 2);
  assert.equal(file.err, `map: not a directory: ${path.join(FIXTURE, "tsconfig.json")}\n`);
  const noGrep = map(FIXTURE, "src/core", { ...process.env, PATH: tempRepo({}) });
  assert.equal(noGrep.code, 2);
  assert.equal(noGrep.err, "map: ast-grep not found on PATH (brew install ast-grep)\n");
});

test("node_modules is skipped; spaces and non-ASCII in paths are fine", () => {
  const dir = tempRepo({
    "node_modules/dep/index.ts": 'import { a } from "../../src/core/a";\n',
    "src/naïve dir/ü.ts": 'import { a } from "../core/a";\n',
  });
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const r = map(dir, "src/naïve dir");
  assert.equal(r.code, 0, r.err);
  assert.ok(r.lines.includes("1. src/naïve dir/ü.ts"), r.out);
  const core = map(dir, "src/core");
  assert.ok(core.out.includes("| src/core/a.ts | 6 | src/core/b.ts, src/core/c.tsx, src/dyn.mjs, src/index.ts, src/naïve dir/ü.ts, src/app.ts (via src/index.ts) |"), core.out);
  assert.ok(!core.out.includes("node_modules"), core.out);
});

test("tsconfig with comments, trailing commas and extends: aliases come from the base", () => {
  const dir = tempRepo({
    "tsconfig.base.json": `{
  // shared options; strings below hold "//" and "/*", which are not comments
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    /* baseUrl is relative to this file */
    "baseUrl": ".",
    "paths": {
      "@lib/*": ["lib/*"],
      "exact-alias": ["lib/exact.ts"], // trailing comment
    },
    /* end of paths */
  },
}
`,
    "app/tsconfig.json": '{\n  // child: paths come from the base\n  "extends": "../tsconfig.base",\n}\n',
    "app/main.ts": 'import { y } from "@lib/y";\nimport { x } from "exact-alias";\nimport "../lib";\nimport _ from "lodash";\nconsole.log(x, y, _);\n',
    "lib/y.ts": "export const y = 1;\n",
    "lib/exact.ts": "export const x = 2;\n",
    "lib/index.ts": "export {};\n",
  });
  const r = map(dir, "lib");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /3 files in the module, 3 edges repo-wide/);
  assert.ok(r.lines.includes("| lib/exact.ts | 1 | app/main.ts |"), r.out);
  assert.ok(r.lines.includes("| lib/y.ts | 1 | app/main.ts |"), r.out);
  assert.ok(r.lines.includes("| lib/index.ts | 1 | app/main.ts |"), r.out);
});

test("git work tree: ignored files are skipped, untracked ones count, header carries the sha", () => {
  const dir = tempRepo({
    ".gitignore": "gen/\n",
    "src/a.ts": "export const a = 1;\n",
    "src/b.ts": 'import { a } from "./a";\n',
    "gen/out.ts": 'import { a } from "../src/a";\n',
  });
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "--no-verify", "-m", "init");
  fs.writeFileSync(path.join(dir, "src/new.ts"), 'import { a } from "./a";\n');
  const sha = git("rev-parse", "--short", "HEAD").stdout.trim();
  assert.ok(sha, "temp repo has a commit");
  const r = map(dir, "src");
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes(` at ${sha}. 3 files in the module, 2 edges repo-wide.`), r.out);
  assert.ok(r.lines.includes("| src/a.ts | 2 | src/b.ts, src/new.ts |"), r.out);
  assert.ok(!r.out.includes("gen/"), r.out);
});
