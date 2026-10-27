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

// FAKE_PI: ok (prints FAKE_BYTES of output), hang (one session line, then silent), sleep, env (prints the guard's mode and git)
const FAKE_PI = `#!/usr/bin/env bash
dir=""
while [ $# -gt 0 ]; do [ "$1" = "--session-dir" ] && dir="$2"; shift; done
[ -n "$dir" ] && echo '{"type":"message","message":{"role":"user"}}' >"$dir/s.jsonl"
case "$FAKE_PI" in
ok) head -c "\${FAKE_BYTES:-20}" /dev/zero | tr '\\0' x; echo ;;
hang) exec sleep 60 ;;
sleep) [ -n "$FAKE_PIDFILE" ] && echo $$ >"$FAKE_PIDFILE"; exec sleep 30 ;;
env) echo "mode=$PI_SCOUT_MODE"; echo "git=$(command -v git)"; echo "real=$PI_SCOUT_REAL_GIT"; echo "gitdir=$PI_SCOUT_GIT_DIR" ;;
esac
`;

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

test("a refused spec leaves no run folder behind", async () => {
	const { env, scoutRoot } = sandbox();
	const run = await runScout(["--spec", "-"], env, "no frontmatter\n");
	assert.equal(run.code, 2);
	const runs = existsSync(scoutRoot) ? readdirSync(scoutRoot).filter((d) => /^\d+$/.test(d)) : [];
	assert.deepEqual(runs, []);
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
