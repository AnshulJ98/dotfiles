// Run: node --test 'agent-eval/tests/*.test.ts'
// Drives matrix.sh, summarize.ts and gate.sh with a stub trial script: no model, no tokens.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "matrix-test-")));
after(() => rmSync(scratch, { recursive: true, force: true }));

const tasksDir = join(scratch, "tasks");
for (const id of ["t-a", "t-b"]) {
	mkdirSync(join(tasksDir, id), { recursive: true });
	writeFileSync(join(tasksDir, id, "task.json"), JSON.stringify({ id, role: "worker" }));
}

// Canned records. t-a always passes; t-b passes for a model named *good* unless STUB_FAIL=1. STUB_INFRA names a task
// whose trials come out as infra, STUB_REVIEW one whose records carry role review. STUB_LOG gets one line per call.
const stub = join(scratch, "trial-stub");
writeFileSync(stub, `#!/usr/bin/env bash
set -euo pipefail
task="$1" model="$2" thinking="$3" n="$4" out="$5"
echo "$task $model $thinking $n" >> "\${STUB_LOG:-/dev/null}"
pass=false
[ "$task" = t-a ] && pass=true
[ "$task" = t-b ] && [[ "$model" == *good* ]] && pass=true
[ "\${STUB_FAIL:-0}" = 1 ] && pass=false
role=worker
[ "\${STUB_REVIEW:-}" = "$task" ] && role=review
infra=false
[ "\${STUB_INFRA:-}" = "$task" ] && { infra=true; pass=false; }
printf '{"task":"%s","role":"%s","model":"%s","thinking":"%s","trial":%s,"pass":%s,"rc":0,"seconds":2,"cost":0.25,"leak":false,"infra":%s}\\n' \\
  "$task" "$role" "$model" "$thinking" "$n" "$pass" "$infra" >> "$out"
sleep "\${STUB_SLEEP:-0}"
[ "\${STUB_RC:-0}" = 0 ] || exit "$STUB_RC"
`);
chmodSync(stub, 0o755);

const CELLS = "x/good:low x/bad:high";
const baseEnv = (extra: Record<string, string> = {}): Record<string, string> => ({
	PATH: process.env.PATH ?? "", HOME: scratch,
	// A scout's PATH carries a git guard that refuses to run without this.
	...(process.env.PI_SCOUT_REAL_GIT ? { PI_SCOUT_REAL_GIT: process.env.PI_SCOUT_REAL_GIT } : {}), TERM: "xterm", LANG: "C",
	EVAL_TRIAL: stub, EVAL_TASKS_DIR: tasksDir, EVAL_RESULTS_DIR: join(scratch, "results"),
	EVAL_BASELINE: join(scratch, "baseline.json"), EVAL_HISTORY: join(scratch, "history.jsonl"), ...extra,
});
const run = (script: string, args: string[], extra: Record<string, string> = {}) =>
	spawnSync(join(EVAL_DIR, script), args, { encoding: "utf8", env: baseEnv(extra) });
const summarize = (args: string[]) => spawnSync("node", [join(EVAL_DIR, "summarize.ts"), ...args], { encoding: "utf8", env: baseEnv() });
const trialsOf = (name: string): string[] => {
	const file = join(scratch, "results", name, "trials.jsonl");
	return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
};
const matrix = (name: string, extra: string[] = [], env: Record<string, string> = {}) =>
	run("matrix.sh", [name, "--cells", CELLS, "--trials", "2", ...extra], env);
test("2 tasks x 2 cells x 2 trials writes 8 lines; a rerun runs nothing; output has progress and a summary", () => {
	const log = join(scratch, "calls-1.log");
	const r = matrix("grid", [], { STUB_LOG: log });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(trialsOf("grid").length, 8);
	assert.match(r.stdout, /8 to run, 0 already recorded/);
	assert.match(r.stdout, /^start t-a x\/good:low #1$/m);
	assert.match(r.stdout, /^end t-b x\/bad:high #2 pass=false cost=0.25 s=2$/m);
	assert.match(r.stdout, /\| x\/good:low \| 100\.0% \(4\/4\)/);
	assert.match(r.stdout, /\| x\/bad:high \| 50\.0% \(2\/4\)/);
	// task-major: both cells and trials of t-a before any t-b
	const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
	assert.deepEqual(calls.map((c) => c.split(" ")[0]), ["t-a", "t-a", "t-a", "t-a", "t-b", "t-b", "t-b", "t-b"]);
	assert.match(matrix("grid").stdout, /0 to run, 8 already recorded/);
	assert.equal(trialsOf("grid").length, 8);
});
test("an infra record is retried on the next run, and only that one", () => {
	assert.match(matrix("retry", [], { STUB_INFRA: "t-b" }).stdout, /infra/);
	assert.equal(trialsOf("retry").length, 8);
	const log = join(scratch, "calls-2.log");
	const again = matrix("retry", [], { STUB_LOG: log });
	assert.match(again.stdout, /4 to run, 4 already recorded/);
	assert.equal(trialsOf("retry").length, 12);
	assert.deepEqual(readFileSync(log, "utf8").split("\n").filter(Boolean).map((c) => c.split(" ")[0]), ["t-b", "t-b", "t-b", "t-b"]);
});
test("--jobs 2 writes the same 8 lines", () => {
	matrix("serial");
	const r = matrix("parallel", ["--jobs", "2"]);
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(trialsOf("parallel").sort(), trialsOf("serial").sort());
	assert.equal(trialsOf("serial").length, 8);
});
test("--tasks restricts the grid (commas allowed); usage, unknown task and malformed cell exit 2", () => {
	const r = run("matrix.sh", ["subset", "--cells", CELLS, "--tasks", "t-a", "--trials", "1"]);
	assert.equal(r.status, 0, r.stderr);
	assert.equal(trialsOf("subset").length, 2);
	assert.equal(run("matrix.sh", []).status, 2);
	assert.equal(run("matrix.sh", ["u", "--tasks", "t-a"]).status, 2);
	const unknown = run("matrix.sh", ["u", "--cells", CELLS, "--tasks", "t-a,nope"]);
	assert.equal(unknown.status, 2);
	assert.match(unknown.stderr, /no such task: nope/);
	for (const cell of ["nomodel:low", "p/m", "p/m:", "p/m:low:", "a b"]) {
		assert.equal(run("matrix.sh", ["u", "--cells", cell]).status, 2, cell);
	}
	assert.equal(run("matrix.sh", ["u", "--cells", CELLS, "--trials", "0"]).status, 2);
	assert.equal(trialsOf("u").length, 0);
	// a model name with a colon splits on the last colon
	assert.equal(run("matrix.sh", ["colon", "--cells", "ollama/qwen:7b:medium", "--tasks", "t-a", "--trials", "1"]).status, 0);
	assert.match(trialsOf("colon")[0], /"model":"ollama\/qwen:7b","thinking":"medium"/);
});
test("a progress line appears while trials run (EVAL_TICK seconds apart)", () => {
	const r = run("matrix.sh", ["tick", "--cells", "x/good:low", "--tasks", "t-a", "--trials", "3", "--jobs", "2"], { STUB_SLEEP: "2", EVAL_TICK: "1" });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /^matrix: [0-9]\/3 running [12] elapsed [0-9]+s$/m);
});
test("a failing trial call is reported, matrix exits 1, and the rest still ran", () => {
	const r = matrix("failing", [], { STUB_RC: "3" });
	assert.equal(r.status, 1);
	assert.match(r.stdout, /FAILED t-a x\/good:low #1 rc=3/);
	assert.equal(trialsOf("failing").length, 8);
});
// A stub trial that leaves a long sleep behind it: HANG_PID gets the sleep's pid. With HANG_MODE=timeout the sleep runs
// under timeout, which puts it in a process group of its own, as trial.sh's isolated calls are.
const hang = join(scratch, "trial-hang");
writeFileSync(hang, `#!/usr/bin/env bash
if [ "\${HANG_MODE:-}" = timeout ]; then
  timeout 300 sh -c 'echo $$ > "$HANG_PID"; exec sleep 300'
else
  sleep 300 & echo $! > "$HANG_PID"; wait
fi
`);
chmodSync(hang, 0o755);
const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
async function until(ok: () => boolean, ms: number): Promise<boolean> {
	for (let waited = 0; waited < ms; waited += 50) {
		if (ok()) return true;
		await new Promise((r) => setTimeout(r, 50));
	}
	return ok();
}
for (const mode of ["plain", "timeout"]) {
	test(`SIGINT to matrix.sh stops the running trial's children (${mode})`, async () => {
		const pidFile = join(scratch, `hang-${mode}.pid`);
		const m = spawn(join(EVAL_DIR, "matrix.sh"), ["hang-" + mode, "--cells", "x/good:low", "--tasks", "t-a", "--trials", "1"], {
			stdio: "ignore", env: baseEnv({ EVAL_TRIAL: hang, HANG_PID: pidFile, HANG_MODE: mode }),
		});
		const exited = new Promise<number | null>((resolve) => m.on("exit", resolve));
		let sleeper = 0;
		try {
			assert.ok(await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "", 10000), "the stub trial never started");
			sleeper = Number(readFileSync(pidFile, "utf8").trim());
			assert.ok(alive(sleeper));
			m.kill("SIGINT");
			assert.equal(await Promise.race([exited, new Promise((r) => setTimeout(() => r("timeout"), 10000))]), 130);
			assert.ok(await until(() => !alive(sleeper), 5000), "the trial's child is still running after SIGINT");
		} finally {
			if (sleeper && alive(sleeper)) process.kill(sleeper, "SIGKILL");
			m.kill("SIGKILL");
		}
	});
}
test("summarize.ts prints both cells for a run dir or a file; usage and missing file exit 2", () => {
	matrix("sum");
	const dir = join(scratch, "results", "sum");
	const [a, b] = [summarize([dir]), summarize([join(dir, "trials.jsonl")])];
	assert.equal(a.status, 0, a.stderr);
	assert.equal(a.stdout, b.stdout);
	assert.match(a.stdout, /Saturated \(1\): t-a[^]*^- x\/bad:high vs x\/good:low: -50\.0 pts$/m);
	assert.equal(summarize([]).status, 2);
	assert.equal(summarize([join(scratch, "nowhere")]).status, 2);
});
test("gate: no baseline exits 2; --update then gate exits 0; a lower pass rate exits 1; --update writes baseline and history", () => {
	matrix("gate-base");
	const dir = join(scratch, "results", "gate-base");
	const missing = run("gate.sh", [dir]);
	assert.equal(missing.status, 2);
	assert.match(missing.stderr, /--update/);
	assert.equal(existsSync(join(scratch, "baseline.json")), false);
	const upd = run("gate.sh", [dir, "--update"]);
	assert.equal(upd.status, 0, upd.stderr);
	const baseline = JSON.parse(readFileSync(join(scratch, "baseline.json"), "utf8"));
	assert.match(baseline.configSha, /^[0-9a-f]{40}$/);
	assert.ok(!Number.isNaN(Date.parse(baseline.date)));
	assert.deepEqual(baseline.roles, {
		worker: {
			"x/good:low": { passRate: 1, tasks: 2, flaky: 0 },
			"x/bad:high": { passRate: 0.5, tasks: 2, flaky: 0 },
		},
	});
	const history = readFileSync(join(scratch, "history.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
	assert.deepEqual(history.map((h) => [h.role, h.cell]).sort(), [["worker", "x/bad:high"], ["worker", "x/good:low"]]);
	assert.equal(history[0].configSha, baseline.configSha);
	const same = run("gate.sh", [dir]);
	assert.equal(same.status, 0, same.stdout + same.stderr);
	assert.match(same.stdout, /ok   worker x\/good:low: baseline 100\.0%/);
	assert.match(same.stdout, /steering config (unchanged|changed) since baseline commit/);
	assert.match(same.stdout, /gate: pass/);
	matrix("gate-worse", [], { STUB_FAIL: "1" });
	const worse = run("gate.sh", [join(scratch, "results", "gate-worse")]);
	assert.equal(worse.status, 1, worse.stdout);
	assert.match(worse.stdout, /FAIL worker x\/good:low/);
	assert.match(worse.stdout, /gate: FAIL/);
	assert.equal(readFileSync(join(scratch, "history.jsonl"), "utf8").split("\n").filter(Boolean).length, 2);
});
test("gate: steering change is detected against an older commit, and an unknown commit is said so; only shared cells compare", () => {
	const dir = join(scratch, "results", "gate-base");
	const first = spawnSync("git", ["rev-list", "--max-parents=0", "HEAD"], { cwd: EVAL_DIR, encoding: "utf8", env: baseEnv() }).stdout.trim().split("\n")[0];
	const baseline = JSON.parse(readFileSync(join(scratch, "baseline.json"), "utf8"));
	const write = (configSha: string, roles = baseline.roles) => writeFileSync(join(scratch, "baseline.json"), JSON.stringify({ ...baseline, configSha, roles }));
	write(first);
	assert.match(run("gate.sh", [dir]).stdout, /steering config changed since baseline commit/);
	write("0".repeat(40));
	assert.match(run("gate.sh", [dir]).stdout, /not found in this repo/);
	write(first, { worker: { "other/cell:low": { passRate: 1, tasks: 2, flaky: 0 } }, review: baseline.roles.worker });
	const none = run("gate.sh", [dir]);
	assert.equal(none.status, 2);
	assert.match(none.stderr, /no role\/cell pairs in common/);
	assert.doesNotMatch(none.stdout, /gate: pass/);
});
test("gate: one cell under two roles is keyed by role and cell; the same run gates 0, a worse one 1", () => {
	const review = { STUB_REVIEW: "t-b" };
	assert.equal(matrix("roles-base", [], review).status, 0);
	const dir = join(scratch, "results", "roles-base");
	assert.equal(run("gate.sh", [dir, "--update"]).status, 0);
	const roles = JSON.parse(readFileSync(join(scratch, "baseline.json"), "utf8")).roles;
	assert.deepEqual(Object.keys(roles).sort(), ["review", "worker"]);
	assert.deepEqual([roles.review["x/bad:high"].passRate, roles.worker["x/bad:high"].passRate], [0, 1]);
	const same = run("gate.sh", [dir]);
	assert.equal(same.status, 0, same.stdout + same.stderr);
	assert.match(same.stdout, /ok   review x\/bad:high[^]*ok   worker x\/bad:high/);
	matrix("roles-worse", [], { ...review, STUB_FAIL: "1" });
	const worse = run("gate.sh", [join(scratch, "results", "roles-worse")]);
	assert.equal(worse.status, 1, worse.stdout);
	assert.match(worse.stdout, /FAIL review x\/good:low[^]*FAIL worker x\/good:low/);
});
test("gate: a smaller task set than the baseline's fails even when every pass rate is 100%", () => {
	const dir = join(scratch, "results", "subset-gate");
	mkdirSync(dir, { recursive: true });
	const line = (task: string) => JSON.stringify({ task, role: "worker", model: "m/m", thinking: "low", trial: 1, pass: true, seconds: 1, cost: 0, leak: false, infra: false });
	writeFileSync(join(dir, "trials.jsonl"), line("t0") + "\n");
	writeFileSync(join(scratch, "baseline.json"), JSON.stringify({ configSha: "x", date: "d", roles: { worker: { "m/m:low": { passRate: 1, tasks: 3, flaky: 0 } } } }));
	const r = run("gate.sh", [dir]);
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /FAIL worker m\/m:low[^\n]*counted 1 task\(s\), baseline 3/);
});
test("gate: a dropped role fails as MISSING; --partial lets the subset pass but never one-sided recall", () => {
	const dir = join(scratch, "results", "dropped-role");
	mkdirSync(dir, { recursive: true });
	const line = JSON.stringify({ task: "t0", role: "worker", model: "m/m", thinking: "low", trial: 1, pass: true, seconds: 1, cost: 0, leak: false, infra: false });
	writeFileSync(join(dir, "trials.jsonl"), line + "\n");
	const worker = { passRate: 1, tasks: 1, flaky: 0 };
	const baseline = (roles: object) => writeFileSync(join(scratch, "baseline.json"), JSON.stringify({ configSha: "x", date: "d", roles }));
	baseline({ worker: { "m/m:low": worker }, review: { "m/m:low": { passRate: 0, tasks: 1, flaky: 0, recall: 0.8, defects: 5, flakyDefects: 0 } } });
	const full = run("gate.sh", [dir]);
	assert.equal(full.status, 1, full.stdout + full.stderr);
	assert.match(full.stdout, /FAIL review m\/m:low: MISSING/);
	assert.match(full.stdout, /ok   worker m\/m:low/);
	assert.match(full.stdout, /gate: FAIL/);
	const partial = run("gate.sh", [dir, "--partial"]);
	assert.equal(partial.status, 0, partial.stdout + partial.stderr);
	assert.match(partial.stdout, /skip review m\/m:low: MISSING[^\n]*--partial/);
	assert.match(partial.stdout, /gate: pass/);
	// Nothing in common is still exit 2 under --partial.
	baseline({ review: { "m/m:low": worker } });
	assert.equal(run("gate.sh", [dir, "--partial"]).status, 2);
	// Recall in the baseline only: fails even with --partial.
	baseline({ worker: { "m/m:low": { ...worker, recall: 1, defects: 5, flakyDefects: 0 } } });
	const one = run("gate.sh", [dir, "--partial"]);
	assert.equal(one.status, 1, one.stdout + one.stderr);
	assert.match(one.stdout, /FAIL worker m\/m:low[^\n]*recall in the baseline only/);
});
test("gate: review cells are gated on defect recall", () => {
	const dir = join(scratch, "results", "review-gate");
	mkdirSync(dir, { recursive: true });
	const line = (trial: number, found: number) =>
		JSON.stringify({ task: "r", role: "review", model: "m/m", thinking: "low", trial, pass: found === 5, found, of: 5, seconds: 1, cost: 0, leak: false, infra: false });
	writeFileSync(join(dir, "trials.jsonl"), [1, 2, 3].map((n) => line(n, 4)).join("\n") + "\n");
	const baseline = (recall: number) => writeFileSync(join(scratch, "baseline.json"),
		JSON.stringify({ configSha: "x", date: "d", roles: { review: { "m/m:low": { passRate: recall === 1 ? 1 : 0, tasks: 1, flaky: 0, recall, defects: 5, flakyDefects: 0 } } } }));
	baseline(1);
	const worse = run("gate.sh", [dir]);
	assert.equal(worse.status, 1, worse.stdout + worse.stderr);
	assert.match(worse.stdout, /FAIL review m\/m:low: baseline recall 100\.0% \(flaky 0\) -> now 80\.0% \(flaky 0\), drop 1\.00 defect\(s\), allowed 0/);
	baseline(0.8);
	assert.equal(run("gate.sh", [dir]).status, 0);
});
test("gate --update exits 2 while the steering paths have uncommitted changes, and works once they are committed", () => {
	const repo = join(scratch, "steer-repo");
	mkdirSync(join(repo, "agent-eval/lib"), { recursive: true });
	copyFileSync(join(EVAL_DIR, "gate.sh"), join(repo, "agent-eval/gate.sh"));
	chmodSync(join(repo, "agent-eval/gate.sh"), 0o755);
	copyFileSync(join(EVAL_DIR, "lib/summary.ts"), join(repo, "agent-eval/lib/summary.ts"));
	mkdirSync(join(repo, "config/pi/prompts"), { recursive: true });
	writeFileSync(join(repo, "config/pi/prompts/p.md"), "one\n");
	const git = (...args: string[]) => {
		const g = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8", env: baseEnv() });
		assert.equal(g.status, 0, g.stderr);
		return g.stdout.trim();
	};
	git("init", "-q");
	git("add", "-A");
	git("commit", "-q", "-m", "one");
	const dir = join(scratch, "results", "gate-base");
	const gate = (...args: string[]) => spawnSync(join(repo, "agent-eval/gate.sh"), [dir, ...args], { encoding: "utf8", env: baseEnv({ EVAL_BASELINE: join(scratch, "steer-baseline.json"), EVAL_HISTORY: join(scratch, "steer-history.jsonl") }) });
	for (const dirty of [() => writeFileSync(join(repo, "config/pi/prompts/p.md"), "two\n"), () => writeFileSync(join(repo, "config/pi/prompts/new.md"), "new\n")]) {
		dirty();
		const r = gate("--update");
		assert.equal(r.status, 2, r.stdout + r.stderr);
		assert.match(r.stderr, /uncommitted changes under the steering paths/);
		assert.equal(existsSync(join(scratch, "steer-baseline.json")), false);
		git("add", "-A");
		assert.equal(gate("--update").status, 2, "staged but uncommitted");
		git("commit", "-q", "-m", "steer");
	}
	const ok = gate("--update");
	assert.equal(ok.status, 0, ok.stderr);
	assert.equal(JSON.parse(readFileSync(join(scratch, "steer-baseline.json"), "utf8")).configSha, git("rev-parse", "HEAD"));
});
test("gate: a flaky task widens the allowed drop", () => {
	const dir = join(scratch, "results", "flaky");
	mkdirSync(dir, { recursive: true });
	const line = (task: string, trial: number, pass: boolean) =>
		JSON.stringify({ task, role: "worker", model: "m/m", thinking: "low", trial, pass, seconds: 1, cost: 0, leak: false, infra: false });
	// 4 tasks x 2 trials; t0 flaky; rate 5/8 against a baseline of 6/8 with one flaky task: one task of slack.
	const rows = [line("t0", 1, true), line("t0", 2, false), ...["t1", "t2", "t3"].flatMap((t) => [line(t, 1, t !== "t3"), line(t, 2, t !== "t3")])];
	writeFileSync(join(dir, "trials.jsonl"), rows.join("\n") + "\n");
	const baseline = (passRate: number, flaky: number) => writeFileSync(join(scratch, "baseline.json"), JSON.stringify({ configSha: "x", date: "d", roles: { worker: { "m/m:low": { passRate, tasks: 4, flaky } } } }));
	baseline(0.75, 1);
	assert.equal(run("gate.sh", [dir]).status, 0);
	baseline(1, 1);
	assert.equal(run("gate.sh", [dir]).status, 1);
});
