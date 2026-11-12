// Run: node --test 'config/pi/tests/*.test.ts'
// Drives bin/scout with a fake `pi` on PATH: no model, no tokens.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { EVENT_LINE } from "../lib/events.ts";

const SCOUT = process.env.SCOUT_BIN ?? resolve(import.meta.dirname, "../bin/scout");
const SPEC = "---\nfiles-allowed: [a.txt]\ntests: true\n---\n1. Do it (a.txt) → check: true\n";

// FAKE_PI: ok (prints FAKE_BYTES of output), hang (one session line, then silent), sleep, env (prints the guard's mode and git),
// args (prints the arguments scout passed),
// blocked (a worker digest with a step left under Blocked on me),
// verdict (prints a sensors verdict line of its own, as a non -p pi would), error (a failed run, as scout-pane.ts reports it: rc 1 in SCOUT_PANE_RC, reason in the digest)
const FAKE_PI = `#!/usr/bin/env bash
# In a herdr tab, extensions/scout-pane.ts writes the digest to SCOUT_DIGEST; stand in for it
[ -n "$SCOUT_DIGEST" ] && exec >"$SCOUT_DIGEST"
args="$*"
dir=""
while [ $# -gt 0 ]; do [ "$1" = "--session-dir" ] && dir="$2"; shift; done
[ -n "$dir" ] && echo '{"type":"message","message":{"role":"user"}}' >"$dir/s.jsonl"
case "$FAKE_PI" in
ok) head -c "\${FAKE_BYTES:-20}" /dev/zero | tr '\\0' x; echo ;;
hang) exec sleep 60 ;;
sleep) [ -n "$FAKE_PIDFILE" ] && echo $$ >"$FAKE_PIDFILE"; exec sleep 30 ;;
args) echo "$args" ;;
env) echo "mode=$PI_SCOUT_MODE"; echo "git=$(command -v git)"; echo "real=$PI_SCOUT_REAL_GIT"; echo "gitdir=$PI_SCOUT_GIT_DIR" ;;
verdict) echo "WORKER-SENSORS: SHIP"; echo "report body" ;;
blocked) printf '%s\\n' '**Blocked on me**' '- step 2 needs src/b.ts, outside files-allowed' '' '**Changed**' '- a.txt' ;;
error) echo "model error 404"; echo 1 >"$SCOUT_PANE_RC" ;;
esac
`;

/** A .running meta as scout writes it; pid defaults to one that is alive for the test's lifetime. */
function runningMeta(scoutRoot: string, fields: { pid?: number; mode: "read" | "rw"; repo?: string }): void {
	const pid = fields.pid ?? process.pid;
	mkdirSync(join(scoutRoot, ".running"), { recursive: true });
	const lines = { pid, model: "m/x", thinking: "low", timeout: 300, started: Date.now(), session: "", task: "t", mode: fields.mode, repo: fields.repo ?? "" };
	writeFileSync(join(scoutRoot, ".running", `${pid}.meta`), Object.entries(lines).map(([k, v]) => `${k}=${v}\n`).join(""));
}

function gitCommonDir(cwd: string): string {
	return spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" }).stdout.trim();
}

function sandbox(): { env: NodeJS.ProcessEnv; scoutRoot: string } {
	const root = mkdtempSync(join(tmpdir(), "scout-bin-"));
	const bin = join(root, "bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "pi"), FAKE_PI);
	chmodSync(join(bin, "pi"), 0o755);
	const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PI_CODING_AGENT_DIR: root };
	delete env.PI_SCOUT_DEPTH;
	delete env.PI_SESSION_FILE;
	// Headless even when the suite runs inside a herdr pane; herdrSandbox sets it back
	delete env.HERDR_PANE_ID;
	return { env, scoutRoot: join(root, "sessions", "scout") };
}

// FAKE_HERDR: ok, or broken (tab create fails). Every call is logged; `pane run` runs the command detached, as a pane would.
// FAKE_HERDR_WORKTREE_WS names the workspace `worktree list` reports open for the repo; FAKE_HERDR_PANE_CWD is where w1's pane sits (none: pane list fails).
const FAKE_HERDR = `#!/usr/bin/env bash
echo "$*" >>"$FAKE_HERDR_LOG"
case "$1 $2" in
"tab create") [ "$FAKE_HERDR" = broken ] && exit 1; echo '{"result":{"tab":{"tab_id":"w1:t9"},"root_pane":{"pane_id":"w1:p9"}}}' ;;
"worktree list") [ -n "$FAKE_HERDR_WORKTREE_WS" ] && echo '{"result":{"worktrees":[{"path":"'"$4"'","open_workspace_id":"'"$FAKE_HERDR_WORKTREE_WS"'"}]}}' ;;
"pane list") [ "$FAKE_HERDR_PANE_CWD" = none ] && exit 1; echo '{"result":{"panes":[{"pane_id":"w1:p1","workspace_id":"w1","cwd":"'"\${FAKE_HERDR_PANE_CWD:-$PWD}"'"}]}}' ;;
"pane run") (bash -c "$4" </dev/null >/dev/null 2>&1 &) ;;
"agent rename") [ -n "$FAKE_HERDR_RENAME_OK" ] && exit 0; exit 1 ;;
esac
`;

/** sandbox() as seen from inside herdr pane w1:p1, with a fake herdr on PATH. */
function herdrSandbox(mode: "ok" | "broken"): { env: NodeJS.ProcessEnv; log: string; scoutRoot: string } {
	const { env, scoutRoot } = sandbox();
	const root = String(env.PI_CODING_AGENT_DIR);
	writeFileSync(join(root, "bin", "herdr"), FAKE_HERDR);
	chmodSync(join(root, "bin", "herdr"), 0o755);
	const log = join(root, "herdr.log");
	return { env: { ...env, HERDR_PANE_ID: "w1:p1", HERDR_WORKSPACE_ID: "w1", FAKE_HERDR: mode, FAKE_HERDR_LOG: log }, log, scoutRoot };
}

interface Run {
	code: number | null;
	stdout: string;
	stderr: string;
	ms: number;
}

function runScout(args: string[], env: NodeJS.ProcessEnv, stdin = "", onSpawn?: (pid: number) => void): Promise<Run> {
	const started = Date.now();
	return new Promise((done) => {
		const child = spawn(SCOUT, args, { env });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
		child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
		child.stdin.end(stdin);
		if (child.pid) onSpawn?.(child.pid);
		child.on("close", (code) => done({ code, stdout, stderr, ms: Date.now() - started }));
	});
}

function report(scoutRoot: string): { verdict: string; reasons: string[] } {
	const run = readdirSync(scoutRoot).find((d) => /^\d+$/.test(d));
	assert.ok(run, "no run folder");
	return JSON.parse(readFileSync(join(scoutRoot, run, "verdict.json"), "utf8"));
}

function doneMeta(scoutRoot: string): string {
	const meta = readdirSync(join(scoutRoot, ".done")).find((f) => f.endsWith(".meta"));
	assert.ok(meta, "no .done meta");
	return readFileSync(join(scoutRoot, ".done", meta), "utf8");
}

test("a refused spec leaves no run folder, running meta or spec temp file behind", async () => {
	const { env, scoutRoot } = sandbox();
	const tmp = mkdtempSync(join(tmpdir(), "scout-spec-tmp-"));
	const run = await runScout(["--spec", "-"], { ...env, TMPDIR: tmp }, "no frontmatter\n");
	assert.equal(run.code, 2);
	const runs = existsSync(scoutRoot) ? readdirSync(scoutRoot).filter((d) => /^\d+$/.test(d)) : [];
	assert.deepEqual(runs, []);
	const running = join(scoutRoot, ".running");
	assert.deepEqual(existsSync(running) ? readdirSync(running) : [], []);
	assert.deepEqual(readdirSync(tmp), []);
});

test("a spec whose body is not a plan (no numbered step, or no check: line) is refused with exit 2", async () => {
	const { env, scoutRoot } = sandbox();
	for (const body of ["Do it.", "1. Do it (a.txt)", "Do it → check: true", ""]) {
		const run = await runScout(["--spec", "-"], env, `---\nfiles-allowed: [a.txt]\ntests: true\n---\n${body}\n`);
		assert.equal(run.code, 2, body);
		assert.match(run.stderr, /scout: spec on stdin: no plan in the spec/, body);
	}
	assert.deepEqual(readdirSync(scoutRoot).filter((d) => /^\d+$/.test(d)), []);
	const events = readFileSync(join(scoutRoot, "..", "..", "logs", "events.log"), "utf8").trimEnd().split("\n");
	assert.equal(events.length, 4, "each refusal is one line in the events log");
	for (const line of events) assert.match(line, EVENT_LINE);
	assert.match(events[0], / worker \d+ scout\.refused no plan in the spec$/);
});

test("a child loads background.ts for its bash tool and gets no bg_run; only a worker gets codemode", async () => {
	const { env } = sandbox();
	for (const [args, stdin, worker] of [[["look"], "", false], [["--spec", "-"], SPEC, true]] as const) {
		const run = await runScout([...args], { ...env, FAKE_PI: "args" }, stdin);
		assert.equal(run.code, 0);
		assert.match(run.stdout, /-e \S+\/extensions\/background\.ts -e \S+\/extensions\/bash-changes\.ts /);
		assert.match(run.stdout, worker ? / -t read,grep,find,ls,bash,edit,write,codemode / : / -t read,grep,find,ls,bash /);
		assert.equal(/ -e builtin:codemode /.test(run.stdout), worker);
	}
});

/** A clean repo with two commits, so HEAD~1 is a base. */
function reviewRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), "scout-review-"));
	const git = (...args: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
	git("init", "-q");
	for (const text of ["one\n", "two\n"]) {
		writeFileSync(join(repo, "a.txt"), text);
		git("add", ".");
		git("commit", "-qm", text.trim(), "--no-verify");
	}
	return repo;
}
const reviewRecords = (repo: string): string[] => (existsSync(join(repo, ".git", "pi-review")) ? readdirSync(join(repo, ".git", "pi-review")).filter((name) => !name.endsWith(".findings")) : []);
const headOf = (repo: string): string => spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();

test("--review runs review.md over BASE...HEAD read-only, with AGENTS.md and AUTO.md, and records the reviewed tip", () => {
	const { env } = sandbox();
	const repo = reviewRepo();
	writeFileSync(join(repo, "AUTO.md"), "spec\n");
	mkdirSync(join(repo, ".git", "info"), { recursive: true });
	writeFileSync(join(repo, ".git", "info", "exclude"), "AUTO.md\n");
	const run = spawnSync(SCOUT, ["--review", "HEAD~1"], { cwd: repo, env: { ...env, FAKE_PI: "args" }, encoding: "utf8" });
	assert.equal(run.status, 0, run.stderr);
	assert.match(run.stdout, /git diff HEAD~1\.\.\.HEAD/);
	assert.match(run.stdout, /Pass 2, attack your own review/);
	assert.doesNotMatch(run.stdout, /\$@/);
	assert.match(run.stdout, /You are a read-only reviewer/);
	assert.match(run.stdout, /@\S+\/AUTO\.md/);
	assert.match(run.stdout, /--thinking high/);
	assert.doesNotMatch(run.stdout, / -nc /);
	assert.doesNotMatch(run.stdout, /,edit,write/);
	assert.deepEqual(reviewRecords(repo), [headOf(repo)]);
	assert.match(readFileSync(join(repo, ".git", "pi-review", headOf(repo)), "utf8"), /^base=HEAD~1$/m);
});

test("--review records nothing for a dirty tree, an unknown base, --rw, or a run that failed", () => {
	const { env } = sandbox();
	const repo = reviewRepo();
	const review = (args: string[], extra: NodeJS.ProcessEnv = {}) => spawnSync(SCOUT, args, { cwd: repo, env: { ...env, FAKE_PI: "ok", ...extra }, encoding: "utf8" });
	assert.equal(review(["--review", "nope"]).status, 2);
	assert.equal(review(["--rw", "--review", "HEAD~1"]).status, 2);
	assert.equal(review(["--review", "HEAD~1", "--timeout", "1"], { FAKE_PI: "hang" }).status, 124);
	writeFileSync(join(repo, "a.txt"), "dirty\n");
	const dirty = review(["--review", "HEAD~1"]);
	assert.equal(dirty.status, 2);
	assert.match(dirty.stderr, /needs a clean tree/);
	assert.deepEqual(reviewRecords(repo), []);
});

test("--review: rounds 2 and 3 read only the diff since the round before, with its findings; a fourth is refused", () => {
	const { env } = sandbox();
	const repo = reviewRepo();
	const base = spawnSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf8" }).stdout.trim();
	const review = () => spawnSync(SCOUT, ["--review", base], { cwd: repo, env: { ...env, FAKE_PI: "args" }, encoding: "utf8" });
	const fix = (text: string) => {
		writeFileSync(join(repo, "a.txt"), text);
		spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-qam", text.trim(), "--no-verify"], { cwd: repo });
	};
	const record = () => readFileSync(join(repo, ".git", "pi-review", headOf(repo)), "utf8");
	const first = headOf(repo);
	assert.match(review().stdout, new RegExp(`git diff ${base}\\.\\.\\.HEAD`));
	assert.match(record(), /^round=1$/m);
	assert.match(review().stdout, /\.\.\.HEAD/, "the same tip again is the same round");
	assert.match(record(), /^round=1$/m);

	fix("three\n");
	const second = review();
	assert.match(second.stdout, new RegExp(`git diff ${first}\\.\\.HEAD\`, the fixes made since round 1`));
	assert.match(second.stdout, /This is round 2 of 3/);
	assert.match(second.stdout, new RegExp(`@\\S+/pi-review/${first}\\.findings`));
	assert.match(record(), /^round=2$/m);

	fix("four\n");
	assert.equal(review().status, 0);
	assert.match(record(), /^round=3$/m);
	fix("five\n");
	const fourth = review();
	assert.equal(fourth.status, 2);
	assert.match(fourth.stderr, /three review rounds are done/);
	assert.equal(reviewRecords(repo).length, 3);
	assert.equal(spawnSync(SCOUT, ["--review", "HEAD~1"], { cwd: repo, env: { ...env, FAKE_PI: "args" }, encoding: "utf8" }).status, 0, "another base is another review");
});

test("scout names its run folder and cost on stderr, and a worker's Blocked on me", async () => {
	const { env, scoutRoot } = sandbox();
	const read = await runScout(["look"], { ...env, FAKE_PI: "ok" });
	assert.match(read.stderr, new RegExp(`^scout: dir=${scoutRoot}/\\d+ cost=\\$0\\.000$`, "m"));
	const blocked = await runScout(["--spec", "-"], { ...env, FAKE_PI: "blocked" }, SPEC);
	assert.match(blocked.stderr, /^scout: dir=\S+ cost=\$0\.000 blocked-on-me=yes$/m);
	assert.doesNotMatch(blocked.stdout, /^scout: dir=/m, "stdout stays the digest");
	const clear = await runScout(["--spec", "-"], { ...env, FAKE_PI: "verdict" }, SPEC);
	assert.match(clear.stderr, /blocked-on-me=no$/m);
});

test("a package.json without a type above scout does not refuse the spec", () => {
	// The work laptop has ~/package.json = {}: node warned MODULE_TYPELESS_PACKAGE_JSON while
	// loading worker-sensors.ts for the spec check, and scout read the warning as the spec error.
	const { env } = sandbox();
	const home = mkdtempSync(join(tmpdir(), "scout-typeless-"));
	writeFileSync(join(home, "package.json"), "{}\n");
	for (const dir of ["bin", "extensions", "lib"]) cpSync(resolve(import.meta.dirname, "..", dir), join(home, dir), { recursive: true });
	const run = spawnSync(join(home, "bin", "scout"), ["--spec", "-"], { env: { ...env, FAKE_PI: "env" }, input: SPEC, encoding: "utf8" });
	assert.doesNotMatch(run.stderr, /spec on stdin/);
	assert.match(run.stdout, /^mode=rw$/m);
});

test("a read scout runs with the git guard first on PATH and PI_SCOUT_MODE=read", async () => {
	const { env } = sandbox();
	const run = await runScout(["look around"], { ...env, FAKE_PI: "env" });
	assert.equal(run.code, 0);
	assert.match(run.stdout, /^mode=read$/m);
	assert.match(run.stdout, /^git=.*\/guard\/git$/m);
	assert.match(run.stdout, /^real=\/.*\/git$/m);
	assert.doesNotMatch(run.stdout, /^real=.*\/guard\/git$/m);
});

test("a worker runs with the git guard first on PATH and PI_SCOUT_MODE=rw", async () => {
	const { env } = sandbox();
	const run = await runScout(["--spec", "-"], { ...env, FAKE_PI: "env" }, SPEC);
	assert.match(run.stdout, /^mode=rw$/m);
	assert.match(run.stdout, /^git=.*\/guard\/git$/m);
});

test("scout started with the guard already on PATH still hands the guard the real git", async () => {
	const { env } = sandbox();
	const guard = resolve(import.meta.dirname, "../bin/guard");
	const run = await runScout(["look around"], { ...env, PATH: `${guard}:${env.PATH}`, FAKE_PI: "env" });
	assert.match(run.stdout, /^real=\/.*\/git$/m);
	assert.doesNotMatch(run.stdout, /^real=.*\/guard\/git$/m);
});

test("the running meta records mode and repo for the fan-out cap", async () => {
	const { env, scoutRoot } = sandbox();
	await runScout(["--spec", "-"], { ...env, FAKE_PI: "env" }, SPEC);
	const meta = doneMeta(scoutRoot);
	assert.match(meta, /^mode=rw$/m);
	assert.match(meta, new RegExp(`^repo=${gitCommonDir(process.cwd())}$`, "m"));
});

test("a third scout is refused with exit 75 while two are live; dead pids do not count", async () => {
	const { env, scoutRoot } = sandbox();
	runningMeta(scoutRoot, { pid: process.pid, mode: "read" });
	runningMeta(scoutRoot, { pid: 2 ** 22 - 1, mode: "read" }); // no such process
	let run = await runScout(["look around"], { ...env, FAKE_PI: "ok" });
	assert.equal(run.code, 0, "one live scout should not block");
	runningMeta(scoutRoot, { pid: process.ppid, mode: "rw", repo: "/elsewhere/.git" });
	run = await runScout(["look around"], { ...env, FAKE_PI: "ok" });
	assert.equal(run.code, 75);
	assert.deepEqual(readdirSync(scoutRoot).filter((d) => /^\d+$/.test(d)).length, 1, "a refused scout leaves no run folder");
});

test("admission runs under a lock: one left by a killed scout is taken over, and none is left after a run or a refusal", async () => {
	const { env, scoutRoot } = sandbox();
	mkdirSync(join(scoutRoot, ".admit"), { recursive: true });
	let run = await runScout(["look around"], { ...env, FAKE_PI: "ok", SCOUT_LOCK_TRIES: "2" });
	assert.equal(run.code, 0, run.stderr);
	assert.equal(existsSync(join(scoutRoot, ".admit")), false);
	runningMeta(scoutRoot, { pid: process.pid, mode: "read" });
	runningMeta(scoutRoot, { pid: process.ppid, mode: "read" });
	run = await runScout(["look around"], { ...env, FAKE_PI: "ok" });
	assert.equal(run.code, 75);
	assert.equal(existsSync(join(scoutRoot, ".admit")), false);
});

test("a second worker on the same repo is refused with exit 75; another repo or a read scout is not", async () => {
	const { env, scoutRoot } = sandbox();
	const repo = gitCommonDir(process.cwd());
	runningMeta(scoutRoot, { pid: process.pid, mode: "rw", repo });
	let run = await runScout(["--spec", "-"], { ...env, FAKE_PI: "ok" }, SPEC);
	assert.equal(run.code, 75);
	run = await runScout(["look around"], { ...env, FAKE_PI: "ok" });
	assert.equal(run.code, 0, "a read scout beside an open worker is fine");
	writeFileSync(join(scoutRoot, ".running", `${process.pid}.meta`), `pid=${process.pid}\nstarted=1\nmode=rw\nrepo=/elsewhere/.git\n`);
	run = await runScout(["--spec", "-"], { ...env, FAKE_PI: "ok" }, SPEC);
	assert.equal(run.code, 0, "a worker on another repo is fine");
});

test("usage errors come before the fan-out cap (verify.sh probes them from inside a worker)", async () => {
	const { env, scoutRoot } = sandbox();
	runningMeta(scoutRoot, { pid: process.pid, mode: "rw", repo: gitCommonDir(process.cwd()) });
	runningMeta(scoutRoot, { pid: process.ppid, mode: "read" });
	assert.equal((await runScout(["--rw", "x"], env)).code, 2);
	assert.equal((await runScout(["--thinking", "max", "x"], env)).code, 2);
});

test("a worker's digest carries exactly one WORKER-SENSORS line, the one from the report", async () => {
	const { env } = sandbox();
	const run = await runScout(["--spec", "-"], { ...env, FAKE_PI: "verdict" }, SPEC);
	assert.equal(run.code, 0);
	const lines = run.stdout.split("\n");
	assert.match(lines[0], /^WORKER-SENSORS: CANNOT-RUN no verdict written/);
	assert.equal(lines.filter((l) => l.startsWith("WORKER-SENSORS:")).length, 1);
	assert.ok(lines.includes("report body"));
});

test("scout refuses a bash older than 4.4 instead of dying on an empty array", { skip: !existsSync("/bin/bash") }, () => {
	const { env } = sandbox();
	const version = spawnSync("/bin/bash", ["-c", "echo ${BASH_VERSINFO[0]}.${BASH_VERSINFO[1]}"], { encoding: "utf8" }).stdout.trim();
	const run = spawnSync("/bin/bash", [SCOUT, "look around"], { env: { ...env, FAKE_PI: "env" }, encoding: "utf8" });
	if (Number.parseFloat(version) >= 4.4) {
		assert.equal(run.status, 0, run.stderr);
	} else {
		assert.equal(run.status, 2);
		assert.match(run.stderr, /needs bash 4\.4\+/);
		assert.doesNotMatch(run.stderr, /unbound variable/);
	}
});

test("a worker that writes no verdict still gets verdict.json", async () => {
	const { env, scoutRoot } = sandbox();
	const run = await runScout(["--spec", "-"], { ...env, FAKE_PI: "ok" }, SPEC);
	assert.equal(run.code, 0);
	assert.match(run.stdout.split("\n")[0], /^WORKER-SENSORS: CANNOT-RUN no verdict written \(pi exited 0\)/);
	assert.equal(report(scoutRoot).verdict, "CANNOT-RUN");
});

test("a worker terminated mid-run (143) still gets verdict.json and a finished entry", async () => {
	const { env, scoutRoot } = sandbox();
	const run = await runScout(["--spec", "-"], { ...env, FAKE_PI: "sleep" }, SPEC, (pid) => setTimeout(() => process.kill(pid, "SIGTERM"), 1500));
	assert.equal(run.code, 143);
	assert.match(report(scoutRoot).reasons[0], /pi exited 143/);
	assert.match(doneMeta(scoutRoot), /^rc=143$/m);
});

test("killing scout's process group (pi aborting its bash tool) kills the child pi too", async () => {
	const { env, scoutRoot } = sandbox();
	const pidfile = join(scoutRoot, "..", "fake.pid");
	const child = spawn(SCOUT, ["look around"], { env: { ...env, FAKE_PI: "sleep", FAKE_PIDFILE: pidfile }, detached: true, stdio: "ignore" });
	for (let i = 0; i < 50 && !existsSync(pidfile); i += 1) await new Promise((r) => setTimeout(r, 100));
	const fakePid = Number(readFileSync(pidfile, "utf8"));
	process.kill(-(child.pid ?? 0), "SIGKILL");
	await new Promise((r) => setTimeout(r, 300));
	let alive = true;
	try {
		process.kill(fakePid, 0);
	} catch {
		alive = false;
	}
	if (alive) process.kill(fakePid, "SIGKILL");
	assert.equal(alive, false, "the child pi outlived scout");
});

test("a child whose session file goes stale is killed as a stall", async () => {
	const { env, scoutRoot } = sandbox();
	const run = await runScout(["--spec", "-"], { ...env, FAKE_PI: "hang", SCOUT_STALE_SECS: "2", SCOUT_POLL_SECS: "1" }, SPEC);
	assert.equal(run.code, 124);
	assert.ok(run.ms < 20_000, `took ${run.ms}ms`);
	assert.match(run.stdout.split("\n")[0], /^WORKER-SENSORS: CANNOT-RUN model stream stalled/);
	assert.match(report(scoutRoot).reasons[0], /model stream stalled/);
});

test("inside herdr the child runs in a new herdr tab, its digest comes back, and the tab closes on rc 0", async () => {
	const { env, log } = herdrSandbox("ok");
	const run = await runScout(["look around"], { ...env, FAKE_PI: "ok" });
	assert.equal(run.code, 0);
	assert.match(run.stdout, /^x{20}$/m);
	const calls = readFileSync(log, "utf8");
	assert.match(calls, /^tab create --workspace w1 --cwd \S+ --label scout \d+ --no-focus$/m);
	assert.match(calls, /^pane run w1:p9 bash \S+\/pane\.sh$/m);
	assert.match(calls, /^tab close w1:t9$/m);
});

test("a second workspace on the same repo does not steal the tab: the caller's workspace wins when it holds the repo", async () => {
	const { env, log } = herdrSandbox("ok");
	const run = await runScout(["look around"], { ...env, FAKE_PI: "ok", FAKE_HERDR_WORKTREE_WS: "w7" });
	assert.equal(run.code, 0);
	assert.match(readFileSync(log, "utf8"), /^tab create --workspace w1 /m);
});

test("when pane list fails the tab still falls back to the worktree's workspace", async () => {
	const { env, log } = herdrSandbox("ok");
	const run = await runScout(["look around"], { ...env, FAKE_PI: "ok", FAKE_HERDR_WORKTREE_WS: "w7", FAKE_HERDR_PANE_CWD: "none" });
	assert.equal(run.code, 0);
	assert.match(readFileSync(log, "utf8"), /^tab create --workspace w7 /m);
});

test("a worker dispatched into another worktree goes to that worktree's workspace", async () => {
	const { env, log } = herdrSandbox("ok");
	const run = await runScout(["look around"], { ...env, FAKE_PI: "ok", FAKE_HERDR_WORKTREE_WS: "w7", FAKE_HERDR_PANE_CWD: "/elsewhere" });
	assert.equal(run.code, 0);
	assert.match(readFileSync(log, "utf8"), /^tab create --workspace w7 /m);
});

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The run folder's file, once scout has made it (the folder is keyed by scout's pid). */
function runFile(scoutRoot: string, name: string): string | undefined {
	if (!existsSync(scoutRoot)) return undefined;
	const dir = readdirSync(scoutRoot).find((d) => /^\d+$/.test(d) && existsSync(join(scoutRoot, d, name)));
	return dir ? join(scoutRoot, dir, name) : undefined;
}

/** Runs a herdr-mode scout whose fake pi sleeps; reads pane.sh once the pane has started, then SIGTERMs scout. */
async function capturePaneScript(env: NodeJS.ProcessEnv, scoutRoot: string): Promise<{ run: Run; text: string; mode: number; path: string }> {
	const seen = { text: "", mode: -1, path: "" };
	const run = await runScout(["look around"], { ...env, FAKE_PI: "sleep" }, "", (pid) => {
		void (async () => {
			// pane.sh is removed on exit, so an earlier run's folder never matches
			const started = (): string | undefined => {
				const sh = runFile(scoutRoot, "pane.sh");
				return sh && existsSync(join(sh, "..", "pane.pid")) ? sh : undefined;
			};
			for (let i = 0; i < 100 && !started(); i += 1) await sleepMs(100);
			const path = started();
			if (path) Object.assign(seen, { text: readFileSync(path, "utf8"), mode: statSync(path).mode & 0o777, path });
			process.kill(pid, "SIGTERM");
		})();
	});
	return { run, ...seen };
}

test("a failed model run (extension writes rc 1) returns rc 1 with the reason, and the tab stays open", async () => {
	const { env, log } = herdrSandbox("ok");
	const run = await runScout(["look around"], { ...env, FAKE_PI: "error" });
	assert.equal(run.code, 1);
	assert.match(run.stdout, /404/);
	assert.doesNotMatch(readFileSync(log, "utf8"), /^tab close/m);
});

test("pane.sh is 0600, drops the herdr socket, exports no HERDR_ var, and is gone after exit", async () => {
	const { env, scoutRoot } = herdrSandbox("ok");
	const seen = await capturePaneScript({ ...env, HERDR_SOCKET_PATH: "/tmp/herdr.sock", HERDR_ENV: "1" }, scoutRoot);
	assert.equal(seen.mode, 0o600);
	assert.match(seen.text, /^unset HERDR_SOCKET_PATH HERDR_ENV$/m);
	assert.doesNotMatch(seen.text, /^export HERDR_/m);
	assert.ok(seen.path);
	assert.equal(existsSync(seen.path), false, "pane.sh outlived scout");
});

test("a herdr child that times out returns 124 without a cat error", async () => {
	const { env } = herdrSandbox("ok");
	const run = await runScout(["--timeout", "2", "look around"], { ...env, FAKE_PI: "hang" });
	assert.equal(run.code, 124);
	assert.doesNotMatch(run.stderr, /cat:/);
});

test("SIGKILL of scout takes the pane child with it, and the pane still counts toward the cap until then", async () => {
	const { env, scoutRoot } = herdrSandbox("ok");
	const pidfile = join(scoutRoot, "..", "fake.pid");
	const first = spawn(SCOUT, ["--rw", "--spec", "-"], { env: { ...env, FAKE_PI: "sleep", FAKE_PIDFILE: pidfile }, stdio: ["pipe", "ignore", "ignore"] });
	first.stdin.end(SPEC);
	const metaPath = join(scoutRoot, ".running", `${first.pid}.meta`);
	for (let i = 0; i < 100 && !(existsSync(pidfile) && existsSync(metaPath) && /^pane=\d+$/m.test(readFileSync(metaPath, "utf8"))); i += 1) await sleepMs(100);
	const fakePid = Number(readFileSync(pidfile, "utf8"));
	process.kill(first.pid ?? 0, "SIGKILL");
	const second = await runScout(["--rw", "--spec", "-"], { ...env, FAKE_PI: "ok" }, SPEC);
	const isAlive = (pid: number): boolean => {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	};
	const wasAlive = isAlive(fakePid);
	for (let i = 0; i < 60 && isAlive(fakePid); i += 1) await sleepMs(100);
	const alive = isAlive(fakePid);
	if (alive) process.kill(fakePid, "SIGKILL");
	assert.equal(second.code, 75, second.stderr);
	assert.ok(wasAlive, "the child was already gone when the second scout ran");
	assert.equal(alive, false, "the child pi outlived scout by more than 6s");
});

test("pi gets -na unless the cwd is under a trusted path in trust.json", async () => {
	const { env, scoutRoot } = herdrSandbox("ok");
	const trustFile = join(String(env.PI_CODING_AGENT_DIR), "trust.json");
	writeFileSync(trustFile, JSON.stringify({ "/some/other/place": true }));
	assert.match((await capturePaneScript(env, scoutRoot)).text, / -na /);
	writeFileSync(trustFile, JSON.stringify({ [process.cwd()]: true, [process.env.PWD ?? process.cwd()]: true }));
	const trusted = await capturePaneScript(env, scoutRoot);
	assert.ok(trusted.text.includes("timeout --foreground"));
	assert.doesNotMatch(trusted.text, / -na /);
});

test("when herdr cannot open a tab, scout falls back to pi -p", async () => {
	const { env, log } = herdrSandbox("broken");
	const run = await runScout(["look around"], { ...env, FAKE_PI: "ok" });
	assert.equal(run.code, 0);
	assert.match(run.stdout, /^x{20}$/m);
	assert.doesNotMatch(readFileSync(log, "utf8"), /^pane run/m);
});

test("a reader that quits early (| head) does not kill the run", () => {
	const { env, scoutRoot } = sandbox();
	const result = spawnSync("bash", ["-c", `"${SCOUT}" 'look around' | head -c 10 >/dev/null`], { env: { ...env, FAKE_PI: "ok", FAKE_BYTES: "300000" } });
	assert.equal(result.status, 0);
	// The EXIT trap runs after the pipe closed; give it a moment
	for (let i = 0; i < 50 && !existsSync(join(scoutRoot, ".done")); i += 1) spawnSync("sleep", ["0.1"]);
	assert.match(doneMeta(scoutRoot), /^rc=0$/m);
	const out = readdirSync(join(scoutRoot, ".done")).find((f) => f.endsWith(".out"));
	assert.ok(out && statSync(join(scoutRoot, ".done", out)).size >= 300_000);
});
