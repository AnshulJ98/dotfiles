// Run: node --test 'config/pi/tests/*.test.ts'
// Drives bin/scout with a fake `pi` on PATH: no model, no tokens.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const SCOUT = process.env.SCOUT_BIN ?? resolve(import.meta.dirname, "../bin/scout");
const SPEC = "---\nfiles-allowed: [a.txt]\ntests: true\n---\nDo it.\n";

// FAKE_PI: ok (prints FAKE_BYTES of output), hang (one session line, then silent), sleep, env (prints the guard's mode and git),
// verdict (prints a sensors verdict line of its own, as a non -p pi would)
const FAKE_PI = `#!/usr/bin/env bash
dir=""
while [ $# -gt 0 ]; do [ "$1" = "--session-dir" ] && dir="$2"; shift; done
[ -n "$dir" ] && echo '{"type":"message","message":{"role":"user"}}' >"$dir/s.jsonl"
case "$FAKE_PI" in
ok) head -c "\${FAKE_BYTES:-20}" /dev/zero | tr '\\0' x; echo ;;
hang) exec sleep 60 ;;
sleep) [ -n "$FAKE_PIDFILE" ] && echo $$ >"$FAKE_PIDFILE"; exec sleep 30 ;;
env) echo "mode=$PI_SCOUT_MODE"; echo "git=$(command -v git)"; echo "real=$PI_SCOUT_REAL_GIT"; echo "gitdir=$PI_SCOUT_GIT_DIR" ;;
verdict) echo "WORKER-SENSORS: SHIP"; echo "report body" ;;
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
	return { env, scoutRoot: join(root, "sessions", "scout") };
}

interface Run {
	code: number | null;
	stdout: string;
	ms: number;
}

function runScout(args: string[], env: NodeJS.ProcessEnv, stdin = "", onSpawn?: (pid: number) => void): Promise<Run> {
	const started = Date.now();
	return new Promise((done) => {
		const child = spawn(SCOUT, args, { env });
		let stdout = "";
		child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
		child.stdin.end(stdin);
		if (child.pid) onSpawn?.(child.pid);
		child.on("close", (code) => done({ code, stdout, ms: Date.now() - started }));
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

test("a package.json without a type above scout does not refuse the spec", () => {
	// The work laptop has ~/package.json = {}: node warned MODULE_TYPELESS_PACKAGE_JSON while
	// loading worker-sensors.ts for the spec check, and scout read the warning as the spec error.
	const { env } = sandbox();
	const home = mkdtempSync(join(tmpdir(), "scout-typeless-"));
	writeFileSync(join(home, "package.json"), "{}\n");
	for (const dir of ["bin", "extensions"]) cpSync(resolve(import.meta.dirname, "..", dir), join(home, dir), { recursive: true });
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
