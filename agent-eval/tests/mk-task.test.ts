// Run: node --test 'agent-eval/tests/*.test.ts'
// Drives mk-task.sh against a throwaway repo, then proves the made tasks with validate.sh. No model, no tokens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "mk-task-test-")));
after(() => rmSync(scratch, { recursive: true, force: true }));

// Not the outer node --test's environment (a nested node --test would think it is a child). PI_SCOUT_REAL_GIT
// stays because a scout's PATH carries a git guard that refuses to run without it.
const env = (extra: Record<string, string> = {}) => ({
	PATH: process.env.PATH ?? "",
	...(process.env.PI_SCOUT_REAL_GIT ? { PI_SCOUT_REAL_GIT: process.env.PI_SCOUT_REAL_GIT } : {}),
	HOME: join(scratch, "home"), TERM: "xterm", LANG: "C", ...extra,
});
const tasksDir = join(scratch, "tasks");
const run = (script: string, args: string[]) => spawnSync(join(EVAL_DIR, script), args, { encoding: "utf8", env: env({ EVAL_TASKS_DIR: tasksDir }) });

function write(path: string, content: string): void {
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, content);
}

function git(cwd: string, ...args: string[]): string {
	const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: env() });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
}

function commit(repo: string, message: string): string {
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", message);
	return git(repo, "rev-parse", "HEAD");
}

const TEST_CMD = "node --test 'src/*.test.ts'";
const spec = (name: string, a: number, b: number, sum: number, file = "./add.ts") =>
	`import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { add } from "${file}";\ntest("${name}", () => assert.equal(add(${a}, ${b}), ${sum}));\n`;
const BUGGY = "export function add(a: number, b: number): number {\n\treturn a - b;\n}\n";

// Commit 1 is buggy with a passing test; commit 2 fixes it, adds a test, a docs change, and deletes a stale file;
// commit 3 changes only docs; commit 4 works in a nested package under tests/ and __tests__/ directories.
const repo = join(scratch, "source-repo");
write(join(repo, "package.json"), JSON.stringify({ type: "module", scripts: { test: TEST_CMD } }));
write(join(repo, "src/add.ts"), BUGGY);
write(join(repo, "src/add.test.ts"), spec("zero", 0, 0, 0));
write(join(repo, "src/stale.ts"), "export {};\n");
git(repo, "init", "-q");
commit(repo, "buggy");
write(join(repo, "src/add.ts"), BUGGY.replace("a - b", "a + b"));
write(join(repo, "src/add.more.test.ts"), spec("more", 2, 3, 5));
write(join(repo, "docs/notes.md"), "notes\n");
rmSync(join(repo, "src/stale.ts"));
const fixSha = commit(repo, "fix");
write(join(repo, "docs/notes.md"), "more notes\n");
const docsSha = commit(repo, "docs only");
write(join(repo, "pkg/package.json"), JSON.stringify({ type: "module", scripts: { test: TEST_CMD } }));
write(join(repo, "pkg/src/mul.ts"), "export const mul = (a: number, b: number): number => a * b;\n");
write(join(repo, "pkg/tests/mul.ts"), 'import assert from "node:assert/strict";\nimport { mul } from "../src/mul.ts";\nassert.equal(mul(2, 3), 6);\n');
write(join(repo, "pkg/src/__tests__/x.ts"), "export {};\n");
const nestedSha = commit(repo, "nested");
// A fix whose test imports a support module the same commit adds.
write(join(repo, "src/impl.ts"), "export { add } from \"./add.ts\";\nexport const ready = true;\n");
write(join(repo, "src/support.ts"), "export const three = 3;\n");
write(join(repo, "src/impl.test.ts"), `import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { ready } from "./impl.ts";\nimport { three } from "./support.ts";\ntest("impl", () => assert.ok(ready && three === 3));\n`);
const supportSha = commit(repo, "impl with support");

const taskJson = (id: string) => JSON.parse(readFileSync(join(tasksDir, id, "task.json"), "utf8"));

test("task.json: allowed is the non-test files, hidden the test files, test the package script", () => {
	const r = run("mk-task.sh", [repo, fixSha, "add-fix"]);
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.stdout.trim(), join(tasksDir, "add-fix"));
	assert.deepEqual(taskJson("add-fix"), {
		id: "add-fix", role: "worker", repo, fix: fixSha, test: "npm test",
		allowed: ["docs/notes.md", "src/add.ts", "src/stale.ts"], hidden: ["src/add.more.test.ts"], link: [],
	});
});

test("a package below the repo root runs as cd <dir> && npm test; tests/ and __tests__/ files are tests", () => {
	assert.equal(run("mk-task.sh", [repo, nestedSha, "nested"]).status, 0);
	const task = taskJson("nested");
	assert.equal(task.test, "cd pkg && npm test");
	assert.deepEqual(task.hidden, ["pkg/src/__tests__/x.ts", "pkg/tests/mul.ts"]);
	assert.deepEqual(task.allowed, ["pkg/package.json", "pkg/src/mul.ts"]);
});

test("the id defaults to <repo name>-<short sha>; a repo under HOME is written with ~", () => {
	const home = join(scratch, "home");
	const homeRepo = join(home, "dev/home-repo");
	write(join(homeRepo, "package.json"), JSON.stringify({ scripts: { test: "true" } }));
	write(join(homeRepo, "a.ts"), "1\n");
	git(homeRepo, "init", "-q");
	commit(homeRepo, "base");
	write(join(homeRepo, "a.ts"), "2\n");
	write(join(homeRepo, "a.test.ts"), "t\n");
	const sha = commit(homeRepo, "fix");
	const r = run("mk-task.sh", [homeRepo, sha]);
	assert.equal(r.status, 0, r.stderr);
	const id = `home-repo-${sha.slice(0, 7)}`;
	assert.equal(taskJson(id).id, id);
	assert.equal(taskJson(id).repo, "~/dev/home-repo");
});

test("prompt.md stub opens with the --- block carrying files-allowed and tests", () => {
	const lines = readFileSync(join(tasksDir, "add-fix/prompt.md"), "utf8").split("\n");
	assert.equal(lines[0], "---");
	assert.equal(lines[1], "files-allowed: [docs/notes.md, src/add.ts, src/stale.ts]");
	assert.equal(lines[2], "tests: npm test");
	assert.equal(lines[3], "---");
	assert.match(lines.slice(4).join("\n"), /TODO/);
});

test("a commit that changes no test file exits 1 and writes nothing", () => {
	const r = run("mk-task.sh", [repo, docsSha, "docs"]);
	assert.equal(r.status, 1);
	assert.match(r.stderr, /no test file/);
	assert.equal(existsSync(join(tasksDir, "docs")), false);
});

test("an existing id exits 1 and leaves the task alone", () => {
	const before = readFileSync(join(tasksDir, "add-fix/task.json"), "utf8");
	const r = run("mk-task.sh", [repo, fixSha, "add-fix"]);
	assert.equal(r.status, 1);
	assert.match(r.stderr, /exists/);
	assert.equal(readFileSync(join(tasksDir, "add-fix/task.json"), "utf8"), before);
});

test("bad usage and unknown commits exit 2", () => {
	assert.equal(run("mk-task.sh", [repo]).status, 2);
	assert.equal(run("mk-task.sh", [repo, "deadbeef", "x"]).status, 2);
	assert.equal(run("mk-task.sh", [join(scratch, "nowhere"), fixSha, "x"]).status, 2);
	assert.equal(run("mk-task.sh", [repo, fixSha, "../escape"]).status, 2);
});

test("a made task validates", () => {
	const r = run("validate.sh", ["add-fix"]);
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.equal(r.stdout.trim(), "VALID add-fix");
});

test("a hidden support module is laid at its own path, so the hidden tests can import it", () => {
	assert.equal(run("mk-task.sh", [repo, supportSha, "support"]).status, 0);
	const file = join(tasksDir, "support/task.json");
	const task = taskJson("support");
	assert.deepEqual(task.hidden, ["src/impl.test.ts"]);
	task.allowed = task.allowed.filter((p: string) => p !== "src/support.ts");
	task.hidden.push("src/support.ts");
	writeFileSync(file, JSON.stringify(task));
	const r = run("validate.sh", ["support"]);
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

// The committed tasks: each prompt.md carries the task's own allowed list and test command in the --- block
// (scout reads it as the spec) and a plan scout accepts: numbered steps with check: lines.
// Only worker tasks carry a spec block and plan steps; review (and later scout) tasks are skipped.
for (const id of readdirSync(join(EVAL_DIR, "tasks"))) {
	const meta = JSON.parse(readFileSync(join(EVAL_DIR, "tasks", id, "task.json"), "utf8"));
	if (meta.role !== "worker") continue;
	test(`committed task ${id}: prompt.md matches task.json and has numbered steps with check: lines`, () => {
		const dir = join(EVAL_DIR, "tasks", id);
		const task = JSON.parse(readFileSync(join(dir, "task.json"), "utf8"));
		const lines = readFileSync(join(dir, "prompt.md"), "utf8").split("\n");
		assert.equal(task.id, id);
		assert.equal(task.role, "worker");
		assert.equal(lines[0], "---");
		assert.equal(lines[1], `files-allowed: [${task.allowed.join(", ")}]`);
		assert.equal(lines[2], `tests: ${task.test}`);
		assert.equal(lines[3], "---");
		const body = lines.slice(4).join("\n");
		assert.doesNotMatch(body, /TODO/);
		assert.match(body, /^\s*[0-9]+[.)]\s/m);
		assert.match(body, /check:/);
		if (task.expect === "blocked") assert.equal(id, "booking-delete-404-scope");
	});
}
