import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyFailure,
  depsChanged,
  forbiddenBash,
  isAllowed,
  nextStep,
  parseSpec,
  repoRelative,
  testWeakening,
} from "./worker-sensors.ts";

const INLINE = "---\nmodule: src/core\nfiles-allowed: [src/core/a.ts, 'src/core/*.test.ts']\ntests: node --test src/core\n---\nbody";
const BLOCK = "---\nfiles-allowed:\n  - src/a.ts\n  - \"src/b/**\"\ntests: pnpm test\nmax-lines: 120\n---\n";

test("should parse inline files-allowed, tests, and the default line cap when the spec uses flow lists", () =>
  assert.deepEqual(parseSpec(INLINE), {
    filesAllowed: ["src/core/a.ts", "src/core/*.test.ts"],
    tests: "node --test src/core",
    maxLines: 400,
  }));
test("should parse block lists and max-lines when the spec uses YAML block style", () =>
  assert.deepEqual(parseSpec(BLOCK), { filesAllowed: ["src/a.ts", "src/b/**"], tests: "pnpm test", maxLines: 120 }));
test("should reject a spec without frontmatter", () =>
  assert.match(String(parseSpec("just prose")), /no frontmatter/));
test("should reject a spec when files-allowed is missing", () =>
  assert.match(String(parseSpec("---\ntests: x\n---\n")), /files-allowed/));
test("should reject a spec when tests is missing", () =>
  assert.match(String(parseSpec("---\nfiles-allowed: [a]\n---\n")), /tests/));
test("should reject a spec when max-lines is not a positive integer", () =>
  assert.match(String(parseSpec("---\nfiles-allowed: [a]\ntests: x\nmax-lines: lots\n---\n")), /max-lines/));
test("should parse a spec when it has CRLF line endings", () =>
  assert.deepEqual(parseSpec("---\r\nfiles-allowed: [a.ts]\r\ntests: pnpm test\r\n---\r\n"), { filesAllowed: ["a.ts"], tests: "pnpm test", maxLines: 400 }));
test("should keep a brace group whole when a flow list item contains commas", () =>
  assert.deepEqual((parseSpec("---\nfiles-allowed: [src/{a,b}.ts, c.ts]\ntests: t\n---\n") as { filesAllowed: string[] }).filesAllowed, ["src/{a,b}.ts", "c.ts"]));
test("should reject a block-scalar tests value", () =>
  assert.match(String(parseSpec("---\nfiles-allowed: [a]\ntests: |\n  pnpm test\n---\n")), /block scalar/));

const globs = ["src/core/**", "README.md"];
const allowedCases: [string, string, boolean][] = [
  ["should allow a nested file under a ** glob", "src/core/x/y.ts", true],
  ["should allow an exact path", "README.md", true],
  ["should refuse a sibling directory", "src/tools/x.ts", false],
  ["should refuse a path that escapes the repo", "../outside/src/core/a.ts", false],
  ["should refuse an absolute path", "/etc/passwd", false],
  ["should refuse an empty path", "", false],
];
for (const [name, path, expected] of allowedCases) {
  test(name, () => assert.equal(isAllowed(path, globs), expected));
}

const relativeCases: [string, string, string][] = [
  ["should resolve a cwd-relative path", "src/a.ts", "src/a.ts"],
  ["should strip pi's @ prefix", "@src/a.ts", "src/a.ts"],
  ["should expand ~ the way pi does", "~/repo/src/a.ts", "src/a.ts"],
  ["should leave an escape visible", "../x.ts", "../x.ts"],
];
for (const [name, input, expected] of relativeCases) {
  test(name, () => assert.equal(repoRelative(input, "/home/u/repo", "/home/u/repo", "/home/u"), expected));
}

const bashCases: [string, string, boolean][] = [
  ["should block git push", "git push origin HEAD", true],
  ["should block git reset inside a chain", "pnpm test && git reset --hard", true],
  ["should block git clean", "git clean -fdx", true],
  ["should block git rebase", "git rebase main", true],
  ["should block git stash, which hides the worker's own changes", "git stash && node --test", true],
  ["should block git checkout -- path", "git checkout -- src/a.ts", true],
  ["should block rm -rf", "rm -rf dist", true],
  ["should block rm -fr", "rm -fr dist", true],
  ["should block a package add", "pnpm add left-pad", true],
  ["should block a package install with a flag before the name", "npm i -D left-pad", true],
  ["should allow a bare install of the lockfile", "pnpm install", false],
  ["should allow a bare install with flags", "npm install --frozen-lockfile", false],
  ["should allow git diff and status", "git diff --stat && git status", false],
  ["should allow rm of a single file", "rm src/tmp.txt", false],
  ["should allow running tests", "node --test src/core/classify.test.ts", false],
  ["should block git push behind a -C global option", "git -C . push", true],
  ["should block git push behind -c and --no-pager", "git -c core.x=y --no-pager push", true],
  ["should block git push through command", "command git push", true],
  ["should block git push through sh -c", "sh -c 'git push origin main'", true],
  ["should block git push inside eval", 'eval "git push"', true],
  ["should block git push inside a substitution", "echo $(git push)", true],
  ["should block git push by absolute path", "/usr/bin/git push", true],
  ["should block git reset after a semicolon without spaces", "true;git reset --hard", true],
  ["should block git checkout of a path", "git checkout src/a.ts", true],
  ["should block git restore", "git restore src/a.ts", true],
  ["should block git switch", "git switch main", true],
  ["should block git pull", "git pull --rebase", true],
  ["should block git commit --amend, which rewrites the operator's commit", "git commit --amend --no-edit", true],
  ["should allow git commit", "git commit -m 'feat: x'", false],
  ["should allow git log with -C", "git -C . log --oneline", false],
  ["should block rm -r without -f", "rm -r dist", true],
  ["should block rm with split flags", "rm -r -f dist", true],
  ["should block rm --recursive", "rm --recursive --force dist", true],
  ["should block find -delete", "find . -name '*.js' -delete", true],
  ["should block npx --yes, which fetches packages", "npx --yes typescript tsc", true],
  ["should block pnpm dlx", "pnpm dlx tsx a.ts", true],
  ["should block a package remove", "pnpm remove left-pad", true],
  ["should allow npx of an installed binary", "npx tsc --noEmit", false],
];
for (const [name, cmd, blocked] of bashCases) {
  test(name, () => assert.equal(forbiddenBash(cmd) !== undefined, blocked));
}

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}): string =>
  JSON.stringify({ name: "x", scripts: { test: "t" }, dependencies: deps, devDependencies: dev });
test("should report nothing when only scripts change", () =>
  assert.deepEqual(depsChanged(pkg({ a: "1" }), JSON.stringify({ name: "x", scripts: { test: "u" }, dependencies: { a: "1" }, devDependencies: {} })), []));
test("should report an added devDependency", () =>
  assert.deepEqual(depsChanged(pkg({ a: "1" }), pkg({ a: "1" }, { b: "2" })), ["devDependencies.b"]));
test("should report a version change and a removal", () =>
  assert.deepEqual(depsChanged(pkg({ a: "1", c: "1" }), pkg({ a: "2" })), ["dependencies.a", "dependencies.c"]));
test("should report a package.json that no longer parses", () =>
  assert.deepEqual(depsChanged(pkg({}), "{ broken"), ["package.json does not parse"]));
test("should treat a missing base package.json as empty", () =>
  assert.deepEqual(depsChanged(undefined, pkg({ a: "1" })), ["dependencies.a"]));

const weakeningCases: [string, string | undefined, string | undefined, boolean][] = [
  ["should flag a removed test case", "test('a', f);\ntest('b', g);", "test('a', f);", true],
  ["should flag a deleted test file", "test('a', f);", undefined, true],
  ["should flag a dropped assertion", "test('a', () => { assert.equal(1, 1); assert.ok(x); });", "test('a', () => { assert.ok(x); });", true],
  ["should flag a new skip marker", "test('a', f);", "test.skip('a', f);", true],
  ["should flag a new only marker in a new file", undefined, "it.only('a', f);", true],
  ["should flag a new skip option", "test('a', f);", "test('a', { skip: true }, f);", true],
  ["should accept an added test", "test('a', f);", "test('a', f);\ntest('b', g);", false],
  ["should accept a new test file", undefined, "test('a', () => assert.ok(1));", false],
  ["should accept a reworded assertion", "test('a', () => assert.equal(f(), 1));", "test('a', () => assert.equal(f(2), 1));", false],
];
for (const [name, before, after, flagged] of weakeningCases) {
  test(name, () => assert.equal(testWeakening(before, after) !== undefined, flagged));
}

const failureCases: [string, number | null, string, boolean, string][] = [
  ["should classify a missing binary as cannot-run", 127, "bash: vitest: command not found", false, "cannot-run"],
  ["should classify a non-executable as cannot-run", 126, "", false, "cannot-run"],
  ["should classify a refused connection as cannot-run", 1, "Error: connect ECONNREFUSED 127.0.0.1:5432", false, "cannot-run"],
  ["should classify a timeout as cannot-run", null, "", true, "cannot-run"],
  ["should classify an assertion failure as fail", 1, "AssertionError: expected 1 to equal 2", false, "fail"],
];
for (const [name, code, output, timedOut, expected] of failureCases) {
  test(name, () => assert.equal(classifyFailure(code, output, timedOut), expected));
}

const stepCases: [string, Parameters<typeof nextStep>, ReturnType<typeof nextStep>][] = [
  ["should pass when no check failed", [[], 0], "pass"],
  ["should retry once on the first failure", [[{ kind: "fail", reason: "r" }], 0], "retry"],
  ["should fail when the retry is spent", [[{ kind: "fail", reason: "r" }], 1], "fail"],
  ["should stop without retry when any check cannot run", [[{ kind: "fail", reason: "r" }, { kind: "cannot-run", reason: "c" }], 0], "cannot-run"],
];
for (const [name, args, expected] of stepCases) {
  test(name, () => assert.equal(nextStep(...args), expected));
}
