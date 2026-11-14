// Run: node --test agent-eval/tests/calibrate-plan.test.ts
// Calibration against a throwaway repo and EVAL_SCOUT stubs: no model calls.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { assemble } from "../lib/plan-grade.ts";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "calibrate-test-")));
const realHome = join(scratch, "real-home");
const kept: string[] = [];
after(() => [scratch, ...kept].forEach((d) => rmSync(d, { recursive: true, force: true })));
const env = (extra: Record<string, string> = {}) => ({
	PATH: process.env.PATH ?? "", HOME: realHome, TERM: "xterm", LANG: "C",
	...(process.env.PI_SCOUT_REAL_GIT ? { PI_SCOUT_REAL_GIT: process.env.PI_SCOUT_REAL_GIT } : {}),
	...extra,
});
function write(path: string, text: string) {
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, text);
}
const repo = join(scratch, "repo");
function git(...args: string[]) {
	const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, env: env(), encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
}
write(join(realHome, ".pi/agent/auth.json"), "{}");
write(join(repo, "src/add.ts"), "export const add = (a, b) => a - b;\n");
write(join(repo, "package.json"), '{"type":"module"}');
git("init", "-q");
git("add", "-A");
git("commit", "-qm", "base");
const fixed = "export const add = (a, b) => a + b;\n";
write(join(repo, "src/add.ts"), fixed);
write(join(repo, "src/add.test.ts"), 'import assert from "node:assert/strict"; import { add } from "./add.ts"; assert.equal(add(2, 3), 5);\n');
git("add", "-A");
git("commit", "-qm", "fix");
const fix = git("rev-parse", "HEAD");
const command = "node --test 'src/*.test.ts'";
const ticket = "Adding 2 and 3 gives -1. Fix add in src/.";
const gold = "**Goal**: GOLD_MARKER\n1. Fix add → check: tests pass\n\n```\n---\nfiles-allowed: [src/add.ts, src/add.test.ts]\ntests: " + command + "\n---\n```\n";
let counter = 0;
function fixture(mode: "gold" | "always" | "retry" | "dead", noGold = false) {
	const dir = join(scratch, "task-" + counter++);
	write(join(dir, "task.json"), JSON.stringify({ id: "calibrate", role: "plan", repo, fix, test: command, hidden: ["src/add.test.ts"], link: [], decisions: [] }));
	write(join(dir, "ticket.md"), ticket + "\n");
	if (!noGold) write(join(dir, "gold.md"), gold);
	const log = join(dir, "calls.jsonl");
	const scout = join(dir, "scout");
	write(scout, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const spec = fs.readFileSync(0, "utf8");
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({
	spec, args: process.argv.slice(2), cwd: process.cwd(), home: process.env.HOME,
	before: fs.readFileSync("src/add.ts", "utf8"),
	hidden: fs.existsSync("src/zz-hidden-add.test.ts"),
	memory: fs.readFileSync(path.join(process.env.HOME, ".pi/agent/memory.md"), "utf8"),
	outer: Object.keys(process.env).filter(k => /^(PI_|EVAL_)/.test(k))
}) + "\\n");
const calls = fs.readFileSync(${JSON.stringify(log)}, "utf8").trim().split("\\n").length;
const dead = ${JSON.stringify(mode)} === "dead" || (${JSON.stringify(mode)} === "retry" && calls === 1);
const sessions = path.join(process.env.HOME, ".pi/agent/sessions/scout");
fs.mkdirSync(sessions, { recursive: true });
fs.writeFileSync(path.join(sessions, "s.jsonl"), JSON.stringify({
	type: "message", message: { role: "assistant", usage: { input: dead ? 0 : 10, output: dead ? 0 : 2 }, content: [] }
}) + "\\n");
if (dead) {
	console.log("WORKER-SENSORS: CANNOT-RUN run ended: error\\nscout: pi exited 1 with no digest. Last stderr lines:\\nHTTP 429");
	process.exit(1);
}
if (${JSON.stringify(mode)} !== "gold" || spec.includes("GOLD_MARKER")) fs.writeFileSync("src/add.ts", ${JSON.stringify(fixed)});
`);
	chmodSync(scout, 0o755);
	return { dir, log, scout };
}
function run(f: ReturnType<typeof fixture>, args: string[], extra: Record<string, string> = {}) {
	const r = spawnSync(join(EVAL_DIR, "calibrate-plan.sh"), [f.dir, ...args], {
		encoding: "utf8", env: env({ EVAL_SCOUT: f.scout, EVAL_REAL_HOME: realHome, ...extra }),
	});
	const match = r.stdout?.match(/\/tmp\/agent-eval-calibrate\.[A-Za-z0-9]+/);
	if (match) kept.push(match[0]);
	return r;
}

test("calibration separates ticket floor from gold, with fresh workspaces and isolated homes", () => {
	const f = fixture("gold");
	const r = run(f, ["--runs", "2"], { EVAL_PLAN_WORKER: "prov/model-x:high" });
	assert.equal(r.status, 0, r.stderr || String(r.error));
	assert.match(r.stdout, /floor 1\/2 fail \d+s/);
	assert.match(r.stdout, /gold 2\/2 pass \d+s/);
	assert.match(r.stdout, /floor=0\/2 gold=2\/2/);
	assert.match(r.stdout, /\/tmp\/agent-eval-calibrate\./);
	const bench = readFileSync(join(f.dir, "bench.json"), "utf8");
	assert.deepEqual(JSON.parse(bench), { worker: "prov/model-x:high", runs: 2, floor: 0, gold: 2 });
	assert.equal(bench, JSON.stringify(JSON.parse(bench), null, 2) + "\n");
	const calls = readFileSync(f.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
	assert.equal(calls.length, 4);
	assert.equal(new Set(calls.map((c) => c.cwd)).size, 4);
	assert.equal(new Set(calls.map((c) => c.home)).size, 4);
	for (const c of calls) {
		assert.equal(c.before, "export const add = (a, b) => a - b;\n");
		assert.equal(c.hidden, false);
		assert.equal(c.memory, "");
		assert.deepEqual(c.outer, []);
		assert.deepEqual(c.args, ["--rw", "--model", "prov/model-x", "--thinking", "high", "--spec", "-"]);
		assert.ok(existsSync(c.cwd) && existsSync(c.home));
	}
	const floor = calls[0].spec;
	assert.equal(calls[1].spec, floor);
	assert.ok(floor.includes(ticket));
	assert.ok(!floor.includes("GOLD_MARKER"));
	assert.match(floor, /^---\nfiles-allowed: /);
	const allowed = JSON.parse(floor.match(/files-allowed: (.*)/)[1]);
	assert.deepEqual(allowed.sort(), git("diff", "--name-only", fix + "^", fix).split("\n").sort());
	assert.ok(floor.includes("tests: " + command));
	assert.equal((floor.match(/^\d+\. /gm) ?? []).length, 1);
	assert.ok(floor.includes("1. Do what the ticket asks. → check: the tests command passes."));
	assert.equal(calls[2].spec, assemble(gold)?.spec);
	assert.equal(calls[3].spec, assemble(gold)?.spec);
});

test("an always-passing worker saturates the floor with the fixed default worker", () => {
	const f = fixture("always");
	const r = run(f, ["--runs", "2"]);
	assert.equal(r.status, 0, r.stderr || String(r.error));
	assert.deepEqual(JSON.parse(readFileSync(join(f.dir, "bench.json"), "utf8")), {
		worker: "anthropic/claude-haiku-5-5:low", runs: 2, floor: 2, gold: 2,
	});
	assert.equal(readFileSync(f.log, "utf8").trim().split("\n").length, 4);
});

test("default calibration runs each arm three times", () => {
	const f = fixture("gold");
	const r = run(f, []);
	assert.equal(r.status, 0, r.stderr || String(r.error));
	assert.deepEqual(JSON.parse(readFileSync(join(f.dir, "bench.json"), "utf8")), {
		worker: "anthropic/claude-haiku-5-5:low", runs: 3, floor: 0, gold: 3,
	});
	assert.equal(readFileSync(f.log, "utf8").trim().split("\n").length, 6);
});

test("infra calibration runs are reported and retried once, never counted", () => {
	const f = fixture("retry");
	const r = run(f, ["--runs", "2"]);
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /floor 1\/2 infra/);
	assert.deepEqual(JSON.parse(readFileSync(join(f.dir, "bench.json"), "utf8")), {
		worker: "anthropic/claude-haiku-5-5:low", runs: 2, floor: 2, gold: 2,
	});
	const calls = readFileSync(f.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
	assert.equal(calls.length, 5);
	assert.equal(new Set(calls.map((c) => c.home)).size, 5);
	assert.equal(new Set(calls.map((c) => c.cwd)).size, 5);
});

test("a second infra calibration attempt exits 1 naming the run and writes no bench", () => {
	const f = fixture("dead");
	const r = run(f, ["--runs", "2"]);
	assert.equal(r.status, 1, r.stderr);
	assert.match(r.stderr, /floor 1\/2.*infra/);
	assert.equal(readFileSync(f.log, "utf8").trim().split("\n").length, 2);
	assert.equal(existsSync(join(f.dir, "bench.json")), false);
});

test("missing gold and invalid arguments exit 2 before calling the worker", () => {
	const f = fixture("gold", true);
	const missing = run(f, ["--runs", "2"]);
	assert.equal(missing.status, 2, String(missing.error));
	assert.match(missing.stderr, /gold.md/);
	const good = fixture("gold");
	for (const args of [["--runs", "0"], ["--runs", "no"], ["--runs"], ["--other"]]) {
		assert.equal(run(good, args).status, 2);
	}
	assert.equal(run(good, [], { EVAL_PLAN_WORKER: "bad" }).status, 2);
	assert.equal(existsSync(f.log), false);
	assert.equal(existsSync(good.log), false);
	assert.equal(existsSync(join(good.dir, "bench.json")), false);
});
