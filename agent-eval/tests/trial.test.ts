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

type Mode = "fix" | "noop" | "leak" | "silent" | "blocked" | "fixplus" | "fixtest" | "dead" | "refused" | "frozen";
const VERDICT = { fix: "PASS", fixplus: "PASS", fixtest: "PASS", leak: "PASS", noop: "FAIL", blocked: "CANNOT-RUN", silent: "", dead: "CANNOT-RUN", refused: "CANNOT-RUN", frozen: "CANNOT-RUN" };

/** A stub scout. It runs under env -i, so everything it needs is baked into the script. */
function makeStub(mode: Mode, sensors = false): { path: string; record: string } {
	const path = join(scratch, `stub-${mode}`);
	const record = `${path}.record`;
	const usage = mode === "dead" ? { input: 0, output: 0, cost: { total: 0 } } : { input: 100, output: 20, cacheRead: 50, cacheWrite: 10, cost: { total: 0.125 } };
	const command = mode === "leak" ? `cat ${repo}/src/add.ts` : "ls";
	const line = JSON.stringify({ type: "message", message: { role: "assistant", usage, content: [{ type: "toolCall", name: "bash", arguments: { command } }] } });
	write(path, `#!/usr/bin/env bash
{ echo "HOME=$HOME"; echo "ARGS=$*"; echo "PWD=$PWD"; echo "STDIN=$(cat)"; echo "OUTER=$(env | grep -Ec '^(PI_|EVAL_)' || true)"; } > '${record}'
d="$HOME/.pi/agent/sessions/scout/$$"; mkdir -p "$d"
if [ ${mode} = refused ]; then exit 75; fi
if [ ${mode} = silent ]; then : > "$d/s.jsonl"; exit 1; fi
printf '%s\\n' '${line}' > "$d/s.jsonl"
if [ ${mode} = dead ]; then
  printf '%s\\n' 'WORKER-SENSORS: CANNOT-RUN run ended: error' 'scout: pi exited 1 with no digest. Last stderr lines:' 'HTTP 429'
  exit 1
fi
if [ ${mode} = frozen ]; then
  echo 'WORKER-SENSORS: CANNOT-RUN interface-frozen files must spell out their interface before a freeze'
  exit 1
fi
printf '%s' '{"verdict":"${VERDICT[mode]}","reasons":[],"retriesUsed":0}' > "$d/verdict.json"
case ${mode} in fix|fixplus|fixtest|leak) printf 'export function add(a: number, b: number): number {\\n\\treturn a + b;\\n}\\n' > src/add.ts ;; esac
if [ ${mode} = fixplus ]; then echo extra > NOTES.md; fi
if [ ${mode} = fixtest ]; then echo '// own test' > src/own.test.ts; fi
if [ '${sensors}' = true ]; then printf 'WORKER-SENSORS: ${VERDICT[mode]} stub verdict\n'; fi
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
		outside: [], wroteTest: false, added: 1, cost: 0.125, input: 100, output: 20, cacheRead: 50, cacheWrite: 10, turns: 1, leak: false, infra: false,
	});
	assert.equal(typeof seconds, "number");
	assert.ok(existsSync(join(dir, "ws/src/zz-hidden-add.more.test.ts")));
	const seen = readFileSync(stub.record, "utf8");
	assert.match(seen, new RegExp(`^HOME=${join(dir, "home")}$`, "m"));
	assert.match(seen, /^ARGS=--rw --model prov\/model-x --thinking high --spec -$/m);
	assert.match(seen, /^PWD=.*\/ws$/m);
	assert.match(seen, /^STDIN=files-allowed: \[src\/add.ts\]$/m);
	assert.match(seen, /^OUTER=0$/m);
});

test("dead worker and scout runs with counted turns are infra", () => {
	for (const role of ["worker", "scout"]) {
		const judge = makeJudgeStub("dead-" + role, [{ reply: '["no"]' }]);
		const task = makeTask("dead-" + role, {
			role, ...(role === "scout" ? { rev: fixSha } : {}), facts: [{ id: "f", text: "add sums", hit: "add sums" }],
			expect: role === "scout" ? [{ file: "src/add.ts", lines: [1, 2], must: [] }] : "pass",
		});
		const { r, rec } = trial(task, "dead", { EVAL_JUDGE_PI: judge.path });
		assert.equal(r.status, 0, r.stderr);
		assert.deepEqual([rec.infra, rec.pass, rec.rc, rec.input, rec.output, rec.turns], [true, false, 1, 0, 0, 1]);
	}
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

test("a scout that passes the hidden tests but edits a file outside allowed fails, with that file in outside", () => {
	const { rec } = trial(makeTask("plus"), "fixplus");
	assert.ok(existsSync(join(rec.dir, "ws/src/zz-hidden-add.more.test.ts")));
	assert.equal(readFileSync(join(rec.dir, "test.txt"), "utf8").includes("fail 0"), true);
	assert.deepEqual([rec.pass, rec.outside, rec.wroteTest, rec.added], [false, ["NOTES.md"], false, 2]);
});

test("wroteTest is true when a changed path is a test path, and an allowed test file does not fail the trial", () => {
	const { rec } = trial(makeTask("owntest", { allowed: ["src/add.ts", "src/own.test.ts"] }), "fixtest");
	assert.deepEqual([rec.pass, rec.outside, rec.wroteTest], [true, [], true]);
	const outside = trial(makeTask("owntest-out"), "fixtest").rec;
	assert.deepEqual([outside.pass, outside.outside, outside.wroteTest], [false, ["src/own.test.ts"], true]);
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

/** A stub orch pi. It runs under env -i, so everything it needs is baked into the script. */
function makeOrchStub(name: string, reply: string, mode: "reply" | "silent" | "slow" = "reply"): { path: string; record: string } {
	const path = join(scratch, `stub-orch-${name}`);
	const record = `${path}.record`;
	const usage = { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } };
	const turn = JSON.stringify({ type: "message", message: { role: "assistant", usage, content: [] } });
	const end = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: reply }] } });
	write(path, `#!/usr/bin/env bash
{ echo "HOME=$HOME"; echo "PWD=$PWD"; echo "FILES=$(ls -A | wc -l | tr -d ' ')"; printf 'ARGC=%s\\n' "$#"; for a in "$@"; do printf 'ARG=%s\\n' "$a" | head -1; last="$a"; done; } > '${record}'
printf '%s' "$last" > '${record}.prompt'
d="$HOME/.pi/agent/sessions/orch/$$"; mkdir -p "$d"
if [ ${mode} = silent ]; then : > "$d/s.jsonl"; exit 1; fi
printf '%s\\n' '${turn}' > "$d/s.jsonl"
if [ ${mode} = slow ]; then exec sleep 60; fi
printf '%s\\n' '${end}'
`, 0o755);
	return { path, record };
}

function makeOrchTask(id: string, expect: string, scenario = "Slice 3 failed its first dispatch.\n"): string {
	const dir = join(scratch, "tasks", id);
	write(join(dir, "task.json"), JSON.stringify({ id, role: "orch", expect, rule: { lines: [86, 88], must: "a slice that does not pass its rework" } }));
	write(join(dir, "scenario.md"), scenario);
	return dir;
}

function orchTrial(id: string, expect: string, reply: string, mode: "reply" | "silent" | "slow" = "reply", extra: Record<string, string> = {}) {
	const stub = makeOrchStub(id, reply, mode);
	const out = join(scratch, `out-${counter++}.jsonl`);
	const r = run("trial.sh", [makeOrchTask(id, expect, "Unique scenario text for " + id + ".\n"), "prov/model-x", "high", "2", out], { EVAL_ORCH_PI: stub.path, EVAL_REAL_HOME: realHome, ...extra });
	const rec = existsSync(out) ? JSON.parse(readFileSync(out, "utf8").trim().split("\n").pop() ?? "null") : undefined;
	if (rec) keep.push(rec.dir);
	return { r, rec, stub };
}

test("trial.sh orch: a reply whose decision equals expect passes; record fields, empty workspace, -nt, isolated HOME", () => {
	const { r, rec, stub } = orchTrial("o-stop", "stop", "DECISION: stop\nA slice that does not pass its rework stops the run.");
	assert.equal(r.status, 0, r.stderr);
	const { dir, seconds, ...rest } = rec;
	assert.deepEqual(rest, {
		task: "o-stop", role: "orch", model: "prov/model-x", thinking: "high", trial: 2, pass: true, decision: "stop", expect: "stop", rc: 0,
		cost: 0.01, input: 100, output: 20, cacheRead: 0, cacheWrite: 0, turns: 1, leak: false, infra: false,
	});
	assert.equal(typeof seconds, "number");
	const seen = readFileSync(stub.record, "utf8");
	assert.match(seen, new RegExp(`^HOME=${join(dir, "home")}$`, "m"));
	assert.match(seen, /^PWD=.*\/ws$/m);
	assert.match(seen, /^FILES=0$/m);
	const args = seen.split("\n").filter((l) => l.startsWith("ARG=")).map((l) => l.slice(4));
	assert.ok(args.includes("-nt"), args.join(" "));
	assert.deepEqual(args.slice(0, 3), ["-p", "--mode", "json"]);
	assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 4), ["--model", "prov/model-x", "--thinking", "high"]);
	const prompt = readFileSync(`${stub.record}.prompt`, "utf8");
	assert.match(prompt, /^You are the orchestrator of coding work/);
	assert.ok(prompt.includes("Unique scenario text for o-stop."));
	assert.ok(prompt.includes(readFileSync(join(EVAL_DIR, "fixtures/orch/rules.md"), "utf8").split("\n")[0]));
	assert.equal(readFileSync(join(dir, "prompt.txt"), "utf8").replace(/\n+$/, ""), prompt); // the argument comes from $(cat), which drops final newlines
	assert.match(readFileSync(join(dir, "reply.txt"), "utf8"), /^DECISION: stop/);
	assert.ok(existsSync(join(dir, "orch.jsonl")));
});

test("trial.sh orch: another decision fails and is recorded; a reply without a decision fails with decision null, not infra", () => {
	const wrong = orchTrial("o-wrong", "stop", "DECISION: merge\nThe sensors passed.").rec;
	assert.deepEqual([wrong.pass, wrong.decision, wrong.expect, wrong.infra], [false, "merge", "stop", false]);
	const none = orchTrial("o-none", "stop", "I would stop here, because the rework failed.").rec;
	assert.deepEqual([none.pass, none.decision, none.infra, none.turns], [false, null, false, 1]);
	const loose = orchTrial("o-loose", "rework", "**DECISION: Rework** - append the reasons").rec;
	assert.deepEqual([loose.pass, loose.decision], [true, "rework"]);
});

test("trial.sh orch: no turns is infra; a call that outlives EVAL_ORCH_TIMEOUT is infra with rc 124", () => {
	const quiet = orchTrial("o-quiet", "stop", "", "silent");
	assert.equal(quiet.r.status, 0, quiet.r.stderr);
	assert.deepEqual([quiet.rec.infra, quiet.rec.turns, quiet.rec.rc, quiet.rec.pass, quiet.rec.decision], [true, 0, 1, false, null]);
	const started = Date.now();
	const slow = orchTrial("o-slow", "stop", "DECISION: stop", "slow", { EVAL_ORCH_TIMEOUT: "2" });
	assert.equal(slow.r.status, 0, slow.r.stderr);
	assert.ok(Date.now() - started < 40000, "the trial waited for pi");
	assert.deepEqual([slow.rec.rc, slow.rec.infra, slow.rec.pass, slow.rec.turns], [124, true, false, 1]);
});

test("trial.sh orch: a task without scenario.md exits 2", () => {
	const dir = makeOrchTask("o-noscn", "stop");
	rmSync(join(dir, "scenario.md"));
	const r = run("trial.sh", [dir, "m", "low", "1", join(scratch, "x.jsonl")]);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /role not supported yet/);
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

// ---- plan role: trial.sh, check-judges.sh, validate.sh ----
const PLAN_PROMPT = join(scratch, "plan-prompt.md");
write(PLAN_PROMPT, "---\ndescription: plan\nargument-hint: x\n---\nPlan the following. No edits: $@\n\nEnd with the spec block.\n");
const TICKET = "Adding 2 and 3 gives -1. Fix add in src/.";
const FENCE = "```";
const GOOD_PLAN = [
	"**Goal**: add sums its arguments. mechanism: src/add.ts:2 subtracts instead of adding.", "",
	"1. Add a failing test in src/add.more.test.ts → check: node --test 'src/*.test.ts' fails on the new test",
	"2. Change the operator in src/add.ts → check: node --test 'src/*.test.ts' passes", "",
	FENCE, "---", "files-allowed: [src/add.ts, src/add.more.test.ts]", "tests: node --test 'src/*.test.ts'", "---", FENCE, "",
].join("\n");
const DECISIONS = [{ id: "d1", text: "The plan keeps add synchronous." }];
const RUBRIC_IDS = ["mechanism", "checks", "test-first", "scope"];

// The plan tasks' source repo: like the one above, but its fix commit changes only src/add.ts and adds the new test.
const planRepo = join(scratch, "plan-repo");
write(join(planRepo, "package.json"), JSON.stringify({ type: "module", scripts: { test: TEST_CMD } }));
write(join(planRepo, "src/add.ts"), BUGGY);
write(join(planRepo, "src/add.test.ts"), spec("zero", 0, 0, 0));
git(planRepo, "init", "-q");
git(planRepo, "add", "-A");
git(planRepo, "commit", "-q", "-m", "buggy");
write(join(planRepo, "src/add.ts"), FIXED);
write(join(planRepo, "src/add.more.test.ts"), spec("more", 2, 3, 5));
git(planRepo, "add", "-A");
git(planRepo, "commit", "-q", "-m", "fix");
const planFix = git(planRepo, "rev-parse", "HEAD");

function makePlanTask(id: string, over: Record<string, unknown> = {}): string {
	const dir = join(scratch, "tasks", id);
	const task = { id, role: "plan", repo: planRepo, fix: planFix, test: TEST_CMD, hidden: ["src/add.more.test.ts"], link: [], decisions: DECISIONS, ...over };
	write(join(dir, "task.json"), JSON.stringify(task));
	write(join(dir, "ticket.md"), TICKET + "\n");
	return dir;
}

/** A stub planner pi (baked in, as it runs under env -i): prints the reply as its final message, records home, cwd and arguments (NUL-separated). */
function makePlanStub(name: string, reply: string, mode: "reply" | "edit" | "silent" | "slow" = "reply"): { path: string; record: string } {
	const path = join(scratch, "stub-plan-" + name);
	const record = path + ".record";
	const usage = { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } };
	write(path + ".turn", JSON.stringify({ type: "message", message: { role: "assistant", usage, content: [] } }) + "\n");
	write(path + ".end", JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: reply }] } }) + "\n");
	write(path, `#!/usr/bin/env bash
{ printf 'HOME=%s\\0PWD=%s\\0' "$HOME" "$PWD"; printf '%s\\0' "$@"; } > '${record}'
sdir=; prev=; for a in "$@"; do case "$prev" in --session-dir) sdir=$a ;; esac; prev=$a; done
mkdir -p "$sdir"
if [ ${mode} = silent ]; then : > "$sdir/s.jsonl"; exit 1; fi
cp '${path}.turn' "$sdir/s.jsonl"
if [ ${mode} = slow ]; then exec sleep 60; fi
if [ ${mode} = edit ]; then echo changed > NOTES.md; fi
cat '${path}.end'
`, 0o755);
	return { path, record };
}

/** A stub judge pi: the first arm whose model glob and prompt marker match gives the reply, else garbage. Calls go to <stub>.calls, the prompt to <stub>.prompt. */
function makeJudgeStub(name: string, arms: { when?: string; model?: string; reply: string }[]): { path: string; calls: string; prompt: string } {
	const path = join(scratch, "stub-judge-" + name);
	const body = arms.map((a) => "if " + [a.model ? '[[ "$model" == ' + a.model + " ]]" : "true", a.when ? "grep -q '" + a.when + "' <<< \"$prompt\"" : "true"].join(" && ") + "; then echo '" + a.reply + "'; exit 0; fi").join("\n");
	write(path, `#!/usr/bin/env bash
model=; sdir=; prev=; prompt=
for a in "$@"; do case "$prev" in --model) model=$a ;; --session-dir) sdir=$a ;; esac; prev=$a; prompt=$a; done
echo call >> '${path}.calls'
printf '%s' "$prompt" > '${path}.prompt'
mkdir -p "$sdir"
echo '{"type":"message","message":{"role":"assistant","usage":{"input":1,"output":1,"cost":{"total":0.1}},"content":[]}}' > "$sdir/s.jsonl"
${body}
echo garbage
`, 0o755);
	return { path, calls: path + ".calls", prompt: path + ".prompt" };
}
const YES5 = '["yes","yes","yes","yes","yes"]';

let planCounter = 0;
function planTrial(reply: string, opts: { mode?: "reply" | "edit" | "silent" | "slow"; worker?: Mode; sensors?: boolean; defaultPrompt?: boolean; judge?: string; extra?: Record<string, string> } = {}) {
	const n = planCounter++;
	const planner = makePlanStub("p" + n, reply, opts.mode);
	const worker = makeStub(opts.worker ?? "fix", opts.sensors);
	const judge = makeJudgeStub("p" + n, [{ reply: opts.judge ?? YES5 }]);
	rmSync(worker.record, { force: true });
	const out = join(scratch, "out-plan-" + n + ".jsonl");
	const r = run("trial.sh", [makePlanTask("plan-" + n), "prov/model-x", "high", "3", out], {
		EVAL_PLAN_PI: planner.path, EVAL_SCOUT: worker.path, EVAL_JUDGE_PI: judge.path, ...(opts.defaultPrompt ? {} : { EVAL_PLAN_PROMPT: PLAN_PROMPT }), EVAL_REAL_HOME: realHome,
		EVAL_PLAN_WORKER: "prov/worker-m:low", ...opts.extra,
	});
	const rec = existsSync(out) ? JSON.parse(readFileSync(out, "utf8").trim().split("\n").pop() ?? "null") : undefined;
	if (rec) keep.push(rec.dir);
	return { r, rec, planner, worker, judge };
}

const MECH_OK = { covers: true, tight: true, grounded: true, readonly: true, short: true };

test("trial.sh plan: a good plan, a worker that fixes it and judges that say yes pass with found = of; record fields, homes, arguments", () => {
	const { r, rec, planner, worker, judge } = planTrial(GOOD_PLAN);
	assert.equal(r.status, 0, r.stderr);
	const { dir, seconds, ...rest } = rec;
	assert.deepEqual(rest, {
		task: rec.task, role: "plan", model: "prov/model-x", thinking: "high", trial: 3, pass: true, accepted: true, executed: true, checks: MECH_OK,
		met: [...RUBRIC_IDS, "d1"], found: 11, of: 11, disagreements: [], judgeCost: 0.2, workerCost: 0.125, worker: "prov/worker-m:low", workerSensors: null, rc: 0,
		cost: 0.01, input: 100, output: 20, cacheRead: 0, cacheWrite: 0, turns: 1, leak: false, infra: false,
	});
	assert.equal(typeof seconds, "number");
	// the planner: plain pi -p --mode json in the base workspace, its own home, the rendered prompt as the last argument
	const seen = readFileSync(planner.record, "utf8").split("\0");
	assert.equal(seen[0], "HOME=" + join(dir, "home"));
	assert.equal(seen[1], "PWD=" + join(realpathSync(dir), "ws"));
	const args = seen.slice(2, -1);
	assert.deepEqual(args.slice(0, 3), ["-p", "--mode", "json"]);
	assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 4), ["--model", "prov/model-x", "--thinking", "high"]);
	assert.equal(args[args.indexOf("--session-dir") + 1], join(dir, "home/.pi/agent/sessions/plan"));
	assert.equal(args.at(-1), "Plan the following. No edits: " + TICKET + "\n\nEnd with the spec block.");
	assert.equal(readFileSync(join(dir, "reply.txt"), "utf8"), GOOD_PLAN);
	// the spec, the mechanical grade, the base workspace untouched
	const spec = readFileSync(join(dir, "spec.md"), "utf8");
	assert.match(spec, /^---\nfiles-allowed: \[src\/add.ts, src\/add.more.test.ts\]\ntests: node --test 'src\/\*.test.ts'\n---\n\n\*\*Goal\*\*/);
	assert.equal(spec.includes(FENCE), false);
	assert.deepEqual(JSON.parse(readFileSync(join(dir, "mechanical.json"), "utf8")), { accepted: true, ...MECH_OK });
	assert.equal(readFileSync(join(dir, "ws/src/add.ts"), "utf8"), BUGGY);
	// the worker: a second workspace and its own home, the spec on stdin, the model and thinking from EVAL_PLAN_WORKER
	const w = readFileSync(worker.record, "utf8");
	assert.match(w, new RegExp("^HOME=" + join(dir, "worker-home") + "$", "m"));
	assert.match(w, new RegExp("^PWD=" + join(realpathSync(dir), "ws2") + "$", "m"));
	assert.match(w, /^ARGS=--rw --model prov\/worker-m --thinking low --spec -$/m);
	assert.match(w, /^STDIN=---$/m);
	assert.equal(readFileSync(join(dir, "ws2/src/add.ts"), "utf8"), FIXED);
	assert.match(readFileSync(join(dir, "test.txt"), "utf8"), /fail 0/);
	// the judges: rubric on the spec, with the ticket and the reference diff as background, once per judge
	assert.equal(readFileSync(judge.calls, "utf8").trim().split("\n").length, 2);
	const prompt = readFileSync(judge.prompt, "utf8");
	assert.ok(prompt.includes(TICKET) && prompt.includes("Reference diff:") && prompt.includes("+\treturn a + b;"));
	assert.ok(prompt.includes("files-allowed: [src/add.ts, src/add.more.test.ts]"));
	assert.ok(prompt.includes("5. The plan keeps add synchronous.") && prompt.includes("1. The plan states the cause"));
});

test("trial.sh plan: a reply without a spec block fails, is not infra, and runs neither the worker nor the judges", () => {
	const { r, rec, worker, judge } = planTrial("I would change the operator in src/add.ts and run the tests.");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual([rec.pass, rec.accepted, rec.executed, rec.infra, rec.turns, rec.rc], [false, false, false, false, 1, 0]);
	assert.deepEqual(rec.checks, { covers: false, tight: false, grounded: false, readonly: true, short: false });
	assert.deepEqual([rec.met, rec.found, rec.of, rec.judgeCost, rec.workerCost], [[], 1, 11, 0, 0]);
	assert.equal(existsSync(worker.record), false);
	assert.equal(existsSync(judge.calls), false);
	assert.equal(existsSync(join(rec.dir, "ws2")), false);
	assert.equal(rec.workerSensors, null);
});

test("trial.sh plan: a plan the worker cannot make pass is accepted, not executed, a fail; the judges still rate it", () => {
	const { rec, judge } = planTrial(GOOD_PLAN, { worker: "noop" });
	assert.deepEqual([rec.pass, rec.accepted, rec.executed, rec.infra, rec.found, rec.of], [false, true, false, false, 11, 11]);
	assert.equal(readFileSync(judge.calls, "utf8").trim().split("\n").length, 2);
	assert.match(readFileSync(join(rec.dir, "test.txt"), "utf8"), /fail [1-9]/);
});

test("trial.sh plan: a refused fixed worker is infra, but a plan blocker is a real failure", () => {
	for (const [worker, infra] of [["refused", true], ["dead", true], ["frozen", false]] as const) {
		const { r, rec } = planTrial(GOOD_PLAN, { worker });
		assert.equal(r.status, 0, r.stderr);
		assert.deepEqual([rec.infra, rec.executed, rec.pass], [infra, false, false], worker);
	}
});

test("trial.sh plan: default prompt falls back to the repo when the real home has no prompts", () => {
	assert.equal(existsSync(join(realHome, ".pi/agent/prompts")), false);
	const { r, rec, planner } = planTrial(GOOD_PLAN, { defaultPrompt: true });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(rec.pass, true);
	const prompt = readFileSync(planner.record, "utf8").split("\0").at(-2) ?? "";
	assert.ok(prompt.includes(TICKET));
	assert.ok(prompt.includes("files-allowed"));
});

test("trial.sh plan: workerSensors reports the worker digest verdict", () => {
	for (const [worker, want] of [["blocked", "CANNOT-RUN"], ["fix", "PASS"], ["noop", "FAIL"]] as const) {
		const { r, rec } = planTrial(GOOD_PLAN, { worker, sensors: true });
		assert.equal(r.status, 0, r.stderr);
		assert.equal(rec.workerSensors, want);
		assert.equal(rec.executed, worker === "fix");
	}
});

test("trial.sh plan: a planner that edits a file fails the readonly check", () => {
	const { rec } = planTrial(GOOD_PLAN, { mode: "edit" });
	assert.deepEqual(rec.checks, { ...MECH_OK, readonly: false });
	assert.deepEqual([rec.accepted, rec.found, rec.of], [true, 10, 11]);
	assert.match(readFileSync(join(rec.dir, "porcelain.txt"), "utf8"), /NOTES\.md/);
});

test("trial.sh plan: judges that split: met follows judge.sh; an unusable judge reply is infra", () => {
	const split = planTrial(GOOD_PLAN, { judge: '["yes","no","yes","yes","yes"]' }).rec;
	assert.deepEqual([split.pass, split.met, split.found, split.infra], [true, ["mechanism", "test-first", "scope", "d1"], 10, false]);
	const garbage = planTrial(GOOD_PLAN, { judge: "garbage" }).rec;
	assert.deepEqual([garbage.pass, garbage.infra, garbage.met, garbage.found], [true, true, [], 6]);
});

test("trial.sh plan: no planner turns is infra; a planner that outlives EVAL_PLAN_TIMEOUT is infra with rc 124 and starts no worker", () => {
	const quiet = planTrial("", { mode: "silent" });
	assert.equal(quiet.r.status, 0, quiet.r.stderr);
	assert.deepEqual([quiet.rec.infra, quiet.rec.turns, quiet.rec.pass, quiet.rec.accepted], [true, 0, false, false]);
	const started = Date.now();
	const slow = planTrial(GOOD_PLAN, { mode: "slow", extra: { EVAL_PLAN_TIMEOUT: "2" } });
	assert.ok(Date.now() - started < 40000, "the trial waited for the planner");
	assert.deepEqual([slow.rec.rc, slow.rec.infra, slow.rec.pass, slow.rec.turns], [124, true, false, 1]);
	assert.equal(existsSync(slow.worker.record), false);
});

test("trial.sh plan: a bad EVAL_PLAN_WORKER, a missing prompt or bad decisions exit 2 before any planner call", () => {
	const out = join(scratch, "out-plan-usage.jsonl");
	const planner = makePlanStub("usage", GOOD_PLAN);
	const base = { EVAL_PLAN_PI: planner.path, EVAL_PLAN_PROMPT: PLAN_PROMPT, EVAL_REAL_HOME: realHome };
	const task = makePlanTask("plan-usage");
	for (const extra of [{ EVAL_PLAN_WORKER: "no-colon" }, { EVAL_PLAN_PROMPT: join(scratch, "missing.md") }]) {
		assert.equal(run("trial.sh", [task, "m", "low", "1", out], { ...base, ...extra }).status, 2);
	}
	assert.equal(run("trial.sh", [makePlanTask("plan-baddec", { decisions: [{ id: "x" }] }), "m", "low", "1", out], base).status, 2);
	assert.equal(existsSync(planner.record), false);
});

/** A plan task with gold.md, bad.md and samples.json, for check-judges.sh and validate.sh. */
const GOLD = ["**Goal**: GOLDMARK add sums. See src/add.ts:2.", "", "1. Add a failing test in src/add.more.test.ts → check: node --test fails", "2. Fix src/add.ts → check: node --test passes", "",
	FENCE, "---", "files-allowed: [src/add.ts, src/add.more.test.ts]", "tests: node --test 'src/*.test.ts'", "---", FENCE, ""].join("\n");
const BAD = "Fix the bug.\n\n1. Fix src/add.ts → check: verify it works\n\n---\nfiles-allowed: [src/add.ts]\ntests: node --test 'src/*.test.ts'\n---\n";
function makeSampleTask(id: string, over: Record<string, unknown> = {}, samples: unknown = [
	{ file: "gold.md", yes: RUBRIC_IDS, no: [] }, { file: "bad.md", yes: [], no: RUBRIC_IDS },
], gold = GOLD): string {
	const dir = makePlanTask(id, { decisions: [], ...over });
	write(join(dir, "gold.md"), gold);
	write(join(dir, "bad.md"), BAD);
	write(join(dir, "samples.json"), JSON.stringify(samples));
	return dir;
}

test("check-judges.sh plan: judges that answer per the table print one ok line per listed id and exit 0", () => {
	const judge = makeJudgeStub("cj-good", [{ when: "GOLDMARK", reply: '["yes","yes","yes","yes"]' }, { reply: '["no","no","no","no"]' }]);
	const r = run("check-judges.sh", [makeSampleTask("cj-plan")], { EVAL_JUDGE_PI: judge.path, EVAL_REAL_HOME: realHome });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	const lines = r.stdout.trim().split("\n");
	assert.equal(lines.length, 8);
	assert.equal(lines[0], "gold.md mechanism want=yes: a=yes b=yes; ok");
	assert.equal(lines[7], "bad.md scope want=no: a=no b=no; ok");
	assert.equal(lines.every((l) => l.endsWith("; ok")), true);
	assert.equal(readFileSync(judge.calls, "utf8").trim().split("\n").length, 4);
	assert.ok(readFileSync(judge.prompt, "utf8").includes("Reference diff:"));
});

test("check-judges.sh plan: one judge that deviates is a MISS and exits 1; a plan task without samples.json exits 2", () => {
	const gpt = makeJudgeStub("cj-gpt", [{ model: "*gpt*", reply: '["yes","yes","yes","yes"]' }, { when: "GOLDMARK", reply: '["yes","yes","yes","yes"]' }, { reply: '["no","no","no","no"]' }]);
	const r = run("check-judges.sh", [makeSampleTask("cj-plan-dev")], { EVAL_JUDGE_PI: gpt.path, EVAL_REAL_HOME: realHome });
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.equal(r.stdout.includes("bad.md mechanism want=no: a=no b=yes; MISS"), true);
	assert.equal(r.stdout.includes("gold.md mechanism want=yes: a=yes b=yes; ok"), true);
	assert.equal(run("check-judges.sh", [makePlanTask("cj-plan-nosamples")], { EVAL_JUDGE_PI: gpt.path }).status, 2);
});

test("validate.sh plan: a sound task is VALID; an empty ticket, an unknown sample id and the other unsound tasks are INVALID with the reason", () => {
	const good = run("validate.sh", [makeSampleTask("vp-good")]);
	assert.equal(good.status, 0, good.stdout + good.stderr);
	assert.equal(good.stdout.trim(), "VALID vp-good");
	assert.equal(run("validate.sh", [makePlanTask("vp-nosamples")]).stdout.trim(), "VALID vp-nosamples");
	const table: [string, string, Record<string, unknown>, unknown, string][] = [
		["vp-ticket", "ticket.md is missing or empty", {}, undefined, GOLD],
		["vp-id", "samples.json names an unknown item id: bogus", {}, [{ file: "gold.md", yes: ["bogus"], no: [] }], GOLD],
		["vp-file", "samples.json names a file that does not exist: nope.md", {}, [{ file: "nope.md", yes: [], no: ["scope"] }], GOLD],
		["vp-dup", "a decision id collides with a rubric id", { decisions: [{ id: "scope", text: "x" }] }, undefined, GOLD],
		["vp-shape", "decisions must be a list of {id, text}", { decisions: [{ id: "d1" }] }, undefined, GOLD],
		["vp-gold", "gold.md fails the mechanical check: accepted, covers, tight, grounded, short", {}, undefined, "Just words, no spec block."],
		["vp-pass", "hidden tests pass on the base", { hidden: ["src/add.test.ts"] }, undefined, GOLD],
	];
	for (const [id, reason, over, samples, gold] of table) {
		const dir = makeSampleTask(id, over, samples, gold);
		if (id === "vp-ticket") write(join(dir, "ticket.md"), "  \n");
		const r = run("validate.sh", [dir]);
		assert.equal(r.status, 1, id + ": " + r.stdout);
		assert.equal(r.stdout.trim(), "INVALID " + id + ": " + reason);
	}
});
