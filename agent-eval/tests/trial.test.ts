// Run: node --test 'agent-eval/tests/*.test.ts'
// Drives trial.sh and validate.sh against a throwaway source repo and stub scouts: no model, no tokens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "trial-test-")));
const realHome = join(scratch, "real-home");
const keep: string[] = [];
after(() => [scratch, ...keep].forEach((d) => rmSync(d, { recursive: true, force: true })));

// Not the outer node --test's environment (a nested node --test would think it is a child). PI_SCOUT_REAL_GIT
// stays because a scout's PATH carries a git guard that refuses to run without it.
const env = (extra: Record<string, string> = {}) => ({
	PATH: process.env.PATH ?? "",
	...(process.env.PI_SCOUT_REAL_GIT ? { PI_SCOUT_REAL_GIT: process.env.PI_SCOUT_REAL_GIT } : {}),
	HOME: realHome, TERM: "xterm", LANG: "C", ...extra,
});
const run = (script: string, args: string[], extra: Record<string, string> = {}) =>
	spawnSync(join(EVAL_DIR, script), args, { encoding: "utf8", env: env(extra) });

function write(path: string, content: string, mode?: number): void {
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, content);
	if (mode) chmodSync(path, mode);
}

function git(cwd: string, ...args: string[]): string {
	const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: env() });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
}

write(join(realHome, ".pi/agent/auth.json"), "{}");
const BUGGY = "export function add(a: number, b: number): number {\n\treturn a - b;\n}\n";
const FIXED = BUGGY.replace("a - b", "a + b");
const TEST_CMD = "node --test 'src/*.test.ts'";
const spec = (name: string, a: number, b: number, sum: number) =>
	`import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { add } from "./add.ts";\ntest("${name}", () => assert.equal(add(${a}, ${b}), ${sum}));\n`;

// Source repo: commit 1 is buggy with a passing test, commit 2 is the fix plus a new test.
const repo = join(scratch, "source-repo");
write(join(repo, "package.json"), JSON.stringify({ type: "module", scripts: { test: TEST_CMD } }));
write(join(repo, "src/add.ts"), BUGGY);
write(join(repo, "src/add.test.ts"), spec("zero", 0, 0, 0));
git(repo, "init", "-q");
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "buggy");
write(join(repo, "src/add.ts"), FIXED);
write(join(repo, "src/add.more.test.ts"), spec("more", 2, 3, 5));
write(join(repo, "linked/x.txt"), "x\n");
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "fix");
const fixSha = git(repo, "rev-parse", "HEAD");

function makeTask(id: string, over: Record<string, unknown> = {}): string {
	const dir = join(scratch, "tasks", id);
	const task = { id, role: "worker", repo, fix: fixSha, test: TEST_CMD, allowed: ["src/add.ts"], hidden: ["src/add.more.test.ts"], link: [], ...over };
	write(join(dir, "task.json"), JSON.stringify(task));
	write(join(dir, "prompt.md"), `files-allowed: [src/add.ts]\ntests: ${TEST_CMD}\n\nFix add.\n`);
	return dir;
}

type Mode = "fix" | "noop" | "leak" | "silent" | "blocked" | "fixplus";
const VERDICT = { fix: "PASS", fixplus: "PASS", leak: "PASS", noop: "FAIL", blocked: "CANNOT-RUN", silent: "" };

/** A stub scout. It runs under env -i, so everything it needs is baked into the script. */
function makeStub(mode: Mode): { path: string; record: string } {
	const path = join(scratch, `stub-${mode}`);
	const record = `${path}.record`;
	const usage = { input: 100, output: 20, cacheRead: 50, cacheWrite: 10, cost: { total: 0.125 } };
	const command = mode === "leak" ? `cat ${repo}/src/add.ts` : "ls";
	const line = JSON.stringify({ type: "message", message: { role: "assistant", usage, content: [{ type: "toolCall", name: "bash", arguments: { command } }] } });
	write(path, `#!/usr/bin/env bash
{ echo "HOME=$HOME"; echo "ARGS=$*"; echo "PWD=$PWD"; echo "STDIN=$(cat)"; echo "OUTER=$(env | grep -Ec '^(PI_|EVAL_)' || true)"; echo "HERDR=$SCOUT_HERDR"; } > '${record}'
d="$HOME/.pi/agent/sessions/scout/$$"; mkdir -p "$d"
if [ ${mode} = silent ]; then : > "$d/s.jsonl"; exit 1; fi
printf '%s\\n' '${line}' > "$d/s.jsonl"
printf '%s' '{"verdict":"${VERDICT[mode]}","reasons":[],"retriesUsed":0}' > "$d/verdict.json"
case ${mode} in fix|fixplus|leak) printf 'export function add(a: number, b: number): number {\\n\\treturn a + b;\\n}\\n' > src/add.ts ;; esac
if [ ${mode} = fixplus ]; then echo extra > NOTES.md; fi
if [ ${mode} = blocked ]; then printf '**Blocked on me**\\n- needs a credential\\n'; else printf '**Blocked on me**\\nnothing.\\n'; fi
`, 0o755);
	return { path, record };
}

let counter = 0;
function trial(task: string, mode: Mode, extra: Record<string, string> = {}) {
	const stub = makeStub(mode);
	const out = join(scratch, `out-${counter++}.jsonl`);
	const r = run("trial.sh", [task, "prov/model-x", "high", "3", out], { EVAL_SCOUT: stub.path, EVAL_REAL_HOME: realHome, ...extra });
	const records = existsSync(out) ? readFileSync(out, "utf8").trim().split("\n") : [];
	const rec = records.length ? JSON.parse(records[records.length - 1]) : undefined;
	if (rec) keep.push(rec.dir);
	return { r, rec, records, stub };
}

test("a fixing scout passes: record fields, summed usage, isolated HOME, stub arguments", () => {
	const { r, rec, records, stub } = trial(makeTask("good"), "fix");
	assert.equal(r.status, 0, r.stderr);
	assert.equal(records.length, 1);
	const { dir, seconds, ...rest } = rec;
	assert.deepEqual(rest, {
		task: "good", role: "worker", model: "prov/model-x", thinking: "high", trial: 3, pass: true, sensors: "PASS", rc: 0,
		outside: [], added: 1, cost: 0.125, input: 100, output: 20, cacheRead: 50, cacheWrite: 10, turns: 1, leak: false, infra: false,
	});
	assert.equal(typeof seconds, "number");
	assert.ok(existsSync(join(dir, "ws/src/zz-hidden-add.more.test.ts")));
	const seen = readFileSync(stub.record, "utf8");
	assert.match(seen, new RegExp(`^HOME=${join(dir, "home")}$`, "m"));
	assert.match(seen, /^ARGS=--rw --model prov\/model-x --thinking high --spec -$/m);
	assert.match(seen, /^PWD=.*\/ws$/m);
	assert.match(seen, /^STDIN=files-allowed: \[src\/add.ts\]$/m);
	assert.match(seen, /^OUTER=0$/m);
	assert.match(seen, /^HERDR=0$/m);
});

test("the workspace is the base in a fresh one-commit repo", () => {
	const { rec } = trial(makeTask("hist"), "noop");
	const ws = join(rec.dir, "ws");
	assert.equal(git(ws, "rev-list", "--count", "HEAD"), "1");
	assert.equal(readFileSync(join(ws, "src/add.ts"), "utf8"), BUGGY);
	assert.ok(!existsSync(join(ws, "src/add.more.test.ts")));
});

test("a scout that does nothing fails; one naming the source repo leaks; one with no turns is infra", () => {
	const noop = trial(makeTask("noop"), "noop").rec;
	assert.deepEqual([noop.pass, noop.sensors, noop.leak, noop.infra, noop.added], [false, "FAIL", false, false, 0]);
	const leak = trial(makeTask("leaky"), "leak").rec;
	assert.deepEqual([leak.leak, leak.infra], [true, false]);
	const quiet = trial(makeTask("quiet"), "silent");
	assert.equal(quiet.r.status, 0, quiet.r.stderr);
	assert.deepEqual([quiet.rec.infra, quiet.rec.turns, quiet.rec.rc, quiet.rec.pass, quiet.rec.sensors], [true, 0, 1, false, null]);
});

test("a file edited outside allowed is listed in outside", () => {
	const { rec } = trial(makeTask("plus"), "fixplus");
	assert.deepEqual([rec.pass, rec.outside, rec.added], [true, ["NOTES.md"], 2]);
});

test("link entries are symlinked from the source repo and are not counted as changes", () => {
	const { rec } = trial(makeTask("linked", { link: ["linked"] }), "fix");
	assert.deepEqual(rec.outside, []);
	assert.equal(readFileSync(join(rec.dir, "ws/linked/x.txt"), "utf8"), "x\n");
});

test("an expect-blocked task passes only when nothing changed and the digest names a blocker", () => {
	const task = makeTask("blk", { expect: "blocked", allowed: ["src/other.ts"] });
	const pass = trial(task, "blocked").rec;
	assert.equal(pass.pass, true);
	assert.ok(!existsSync(join(pass.dir, "test.txt")));
	assert.equal(trial(task, "noop").rec.pass, false);
	assert.equal(trial(task, "fix").rec.pass, false);
});

test("run_test: a test command that outlives EVAL_TEST_TIMEOUT is a failing test, not a hang", () => {
	const started = Date.now();
	const { r, rec } = trial(makeTask("slow", { test: "sleep 60" }), "fix", { EVAL_TEST_TIMEOUT: "2" });
	assert.equal(r.status, 0, r.stderr);
	assert.ok(Date.now() - started < 40000, "the trial waited for the test command");
	assert.deepEqual([rec.pass, rec.infra], [false, false]);
	assert.match(readFileSync(join(rec.dir, "test.txt"), "utf8"), /timed out after 2s/);
});

test("run_test: the test command runs under a scratch HOME and a reduced environment", () => {
	const { rec } = trial(makeTask("homey", { test: 'echo "HOME=$HOME"; echo "EVAL=$(env | grep -c ^EVAL_ || true)"; exit 1' }), "fix");
	const out = readFileSync(join(rec.dir, "test.txt"), "utf8");
	const home = /^HOME=(.*)$/m.exec(out)?.[1] ?? "";
	assert.match(home, /\/agent-eval-test\.[A-Za-z0-9]+\/home$/);
	assert.notEqual(home, realHome);
	assert.notEqual(home, join(rec.dir, "home"));
	assert.match(out, /^EVAL=0$/m);
	assert.ok(!existsSync(resolve(home, "..")), "the scratch home is removed after the run");
});

test("validate.sh: a hanging test command is INVALID after EVAL_TEST_TIMEOUT, not a hang", () => {
	const started = Date.now();
	const r = run("validate.sh", [makeTask("vslow", { test: "sleep 60" })], { EVAL_TEST_TIMEOUT: "1" });
	assert.ok(Date.now() - started < 40000, "validate waited for the test command");
	assert.notEqual(r.status, 0);
	assert.match(r.stdout, /^INVALID vslow: hidden tests fail with the reference applied$/m);
});

test("trial.sh review: a reviewer that outlives EVAL_REVIEW_TIMEOUT is recorded as infra with rc 124 and is not judged", () => {
	const turn = JSON.stringify({ type: "message", message: { role: "assistant", usage: { input: 1, output: 1, cost: { total: 0.1 } }, content: [] } });
	const marker = join(scratch, "judge-called");
	const reviewer = join(scratch, "stub-slow-reviewer");
	write(reviewer, `#!/usr/bin/env bash
mkdir -p "$HOME/.pi/agent/sessions/review"
printf '%s\\n' '${turn}' > "$HOME/.pi/agent/sessions/review/s.jsonl"
exec sleep 60
`, 0o755);
	const judge = join(scratch, "stub-judge");
	write(judge, `#!/usr/bin/env bash\ntouch ${marker}\n`, 0o755);
	const task = makeTask("rslow", { role: "review", rev: fixSha, defects: [{ id: "d1", text: "t", hit: "h" }] });
	const out = join(scratch, `out-${counter++}.jsonl`);
	const started = Date.now();
	const r = run("trial.sh", [task, "prov/model-x", "high", "1", out], { EVAL_REVIEW_PI: reviewer, EVAL_JUDGE_PI: judge, EVAL_REAL_HOME: realHome, EVAL_REVIEW_TIMEOUT: "2" });
	assert.equal(r.status, 0, r.stderr);
	assert.ok(Date.now() - started < 40000, "the trial waited for the reviewer");
	const rec = JSON.parse(readFileSync(out, "utf8").trim());
	keep.push(rec.dir);
	assert.deepEqual([rec.rc, rec.infra, rec.pass, rec.turns], [124, true, false, 1]);
	assert.equal(existsSync(marker), false);
});

test("usage errors and unsupported roles exit 2", () => {
	assert.equal(run("trial.sh", []).status, 2);
	assert.equal(run("trial.sh", ["no-such-task", "m", "low", "1", join(scratch, "x.jsonl")]).status, 2);
	assert.equal(run("trial.sh", [makeTask("badn"), "m", "low", "x", join(scratch, "x.jsonl")]).status, 2);
	const review = run("trial.sh", [makeTask("rev", { role: "review" }), "m", "low", "1", join(scratch, "x.jsonl")]);
	assert.equal(review.status, 2);
	assert.match(review.stderr, /role not supported yet/);
});

test("validate.sh: good is VALID; a hidden test passing on the base, or allowed files that do not fix it, are INVALID", () => {
	const good = run("validate.sh", [makeTask("vgood")]);
	assert.equal(good.status, 0, good.stdout + good.stderr);
	assert.equal(good.stdout.trim(), "VALID vgood");
	const bad = run("validate.sh", [makeTask("vbad", { hidden: ["src/add.test.ts"] })]);
	assert.notEqual(bad.status, 0);
	assert.match(bad.stdout, /^INVALID vbad: hidden tests pass on the base$/m);
	const nofix = run("validate.sh", [makeTask("vnofix", { allowed: ["src/add.test.ts"] })]);
	assert.notEqual(nofix.status, 0);
	assert.match(nofix.stdout, /^INVALID vnofix: hidden tests fail with the reference applied$/m);
});

test("a git template dir without info/ does not break workspaces that have link entries", () => {
	const template = join(scratch, "empty-template");
	mkdirSync(template, { recursive: true });
	const r = run("validate.sh", [makeTask("vlink", { link: ["linked"] })], { GIT_TEMPLATE_DIR: template });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.equal(r.stdout.trim(), "VALID vlink");
});

test("validate.sh: expect blocked needs a non-test change outside allowed", () => {
	const good = run("validate.sh", [makeTask("vblk", { expect: "blocked", allowed: ["src/other.ts"] })]);
	assert.equal(good.status, 0, good.stdout);
	assert.match(good.stdout, /^VALID vblk$/m);
	const bad = run("validate.sh", [makeTask("vblk2", { expect: "blocked", allowed: ["src/add.ts", "linked/x.txt"] })]);
	assert.notEqual(bad.status, 0);
	assert.match(bad.stdout, /^INVALID vblk2: /m);
});

test("validate.sh --all covers every task; zero tasks and unknown tasks behave", () => {
	const tasks = join(scratch, "all-tasks");
	for (const [id, over] of [["a-ok", {}], ["b-bad", { hidden: ["src/add.test.ts"] }]] as const) {
		write(join(tasks, id, "task.json"), readFileSync(join(makeTask(id, over), "task.json"), "utf8"));
	}
	assert.equal(run("validate.sh", ["--all"], { EVAL_TASKS_DIR: join(scratch, "empty-tasks") }).status, 0);
	const r = run("validate.sh", ["--all"], { EVAL_TASKS_DIR: tasks });
	assert.notEqual(r.status, 0);
	assert.match(r.stdout, /^VALID a-ok$/m);
	assert.match(r.stdout, /^INVALID b-bad: /m);
	assert.equal(run("validate.sh", ["nope"]).status, 2);
	assert.equal(run("validate.sh", []).status, 2);
});
