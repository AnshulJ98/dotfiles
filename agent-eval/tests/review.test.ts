// Run: node --test 'agent-eval/tests/*.test.ts'
// Pure review-grading helpers (lib/review.ts, lib/record.ts) and judge.sh / check-judges.sh / the review branch of
// trial.sh / validate.sh driven by stub pi binaries: no model, no tokens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { gradeReview, parseJudged } from "../lib/record.ts";
import { combine, finalReply, numberDefects, parseFindings, parseVerdicts, render } from "../lib/review.ts";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "review-test-")));
const realHome = join(scratch, "real-home");
const shimHome = join(scratch, "shim-home");
const keep: string[] = [];
after(() => [scratch, ...keep].forEach((d) => rmSync(d, { recursive: true, force: true })));

// Not the outer node --test's environment (a nested node --test would think it is a child). PI_SCOUT_REAL_GIT
// stays because a scout's PATH carries a git guard that refuses to run without it.
const env = (extra: Record<string, string> = {}) => ({
	PATH: process.env.PATH ?? "", ...(process.env.PI_SCOUT_REAL_GIT ? { PI_SCOUT_REAL_GIT: process.env.PI_SCOUT_REAL_GIT } : {}), HOME: realHome, TERM: "xterm", LANG: "C", ...extra });
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

// ---- pure helpers ----

const FENCE = "```";
const finding = { file: "a.ts", line: 3, severity: "high", claim: "x" };
const FINDINGS: [string, string, unknown][] = [
	["a bare array", JSON.stringify([finding]), [finding]],
	["a code fence around it", FENCE + "json\n" + JSON.stringify([finding]) + "\n" + FENCE, [finding]],
	["an empty array is a review with no findings", "[]", []],
	["severity lower-cased or medium, missing file, non-numeric or null line", '[{"file":"a","line":null,"severity":"HIGH","claim":"c"},{"line":"x","severity":"urgent","claim":"c"}]',
		[{ file: "a", line: null, severity: "high", claim: "c" }, { file: "", line: null, severity: "medium", claim: "c" }]],
	["no claim", '[{"file":"a","line":1,"severity":"low"}]', undefined],
	["an item that is not an object", '["c"]', undefined],
	["a stray bracket after the array", JSON.stringify([finding]) + " Done [really].", undefined],
	["no array, broken JSON, an object", "no findings", undefined],
	["", "[{", undefined],
	["", '{"claim":"c"}', undefined],
];
for (const [name, text, want] of FINDINGS) test("parseFindings: " + name, () => assert.deepEqual(parseFindings(text), want));

const VERDICTS: [string, string, number, boolean[] | undefined][] = [
	["case and spaces", '["yes"," NO ","Yes"]', 3, [true, false, true]],
	["a fence with prose before it", "Answer:\n" + FENCE + '\n["no","no"]\n' + FENCE, 2, [false, false]],
	["too short", '["yes"]', 2, undefined],
	["too long", '["yes","no","no"]', 2, undefined],
	["booleans are not answers", "[true,false]", 2, undefined],
	["another word", '["yes","maybe"]', 2, undefined],
	["no array", "yes, no", 2, undefined],
];
for (const [name, text, n, want] of VERDICTS) test("parseVerdicts: " + name, () => assert.deepEqual(parseVerdicts(text, n), want));

test("combine: found needs both yes, a split is listed, agreeing no is not a disagreement, lengths must match", () => {
	const ids = ["d1", "d2", "d3"];
	assert.deepEqual(combine([true, true, true], [true, true, true], ids), { found: 3, disagreements: [] });
	assert.deepEqual(combine([true, true, false], [true, false, true], ids), { found: 1, disagreements: ["d2", "d3"] });
	assert.deepEqual(combine([true, false, false], [true, false, false], ids), { found: 1, disagreements: [] });
	assert.throws(() => combine([true], [true, false], ["d1", "d2"]), RangeError);
});

test("render replaces each placeholder once, leaves placeholders inside values alone; defects are numbered from 1", () => {
	assert.equal(render("a {{X}} b {{Y}} {{X}} {{Z}}", { X: "{{Y}}", Y: "y" }), "a {{Y}} b y {{Y}} {{Z}}");
	assert.equal(numberDefects([{ id: "d1", text: "one", hit: "h1" }, { id: "d2", text: "two", hit: "h2" }]), "1. one\n2. two");
});

test("finalReply is the text of the last assistant message that has any", () => {
	const msg = (role: string, content: object[]) => JSON.stringify({ type: "message_end", message: { role, content } });
	const text = (t: string) => ({ type: "text", text: t });
	const stream = [msg("user", [text("prompt")]), msg("assistant", [text("first")]), "not json", msg("assistant", [text("one"), { type: "toolCall" }, text("two")]), msg("assistant", [{ type: "toolCall" }])];
	assert.equal(finalReply(stream), "one\ntwo");
	assert.equal(finalReply([]), "");
});

test("parseJudged reads judge.sh's line, anything else is infra; a review passes only when everything is found", () => {
	const line = '{"found":3,"of":3,"disagreements":["d2"],"judgeCost":0.5,"infra":false}\n';
	assert.deepEqual(parseJudged(line), { found: 3, of: 3, disagreements: ["d2"], judgeCost: 0.5, infra: false });
	for (const bad of ["", "nope", '{"found":1}']) assert.deepEqual(parseJudged(bad), { found: 0, of: 0, disagreements: [], judgeCost: 0, infra: true });
	const j = { found: 3, of: 3, disagreements: [], judgeCost: 0, infra: false };
	assert.deepEqual([gradeReview(j), gradeReview({ ...j, found: 2 }), gradeReview({ ...j, infra: true }), gradeReview({ ...j, found: 0, of: 0 })], [true, false, false, false]);
});

// ---- stubs and fixtures ----
// A role with no reply configured fails (exit 1, no output, no session).

write(join(realHome, ".pi/agent/auth.json"), "{}");
write(join(shimHome, ".pi/agent/auth.json"), "{}");
const SHIM = join(shimHome, ".pi/agent/npm/node_modules/@gotgenes/pi-anthropic-auth/src/index.ts");
write(SHIM, "export default () => {};\n");

const source = join(scratch, "source-repo");
write(join(source, "booking/src/a.ts"), "export const a = 1;\n");
write(join(source, "booking/src/b.ts"), "export const b = 2;\n");
write(join(source, "README.md"), "tickets\n");
write(join(source, "log.md"), "log\n");
git(source, "init", "-q");
git(source, "add", "-A");
git(source, "commit", "-q", "-m", "one");
const revSha = git(source, "rev-parse", "HEAD");
write(join(source, "booking/src/late.ts"), "export const late = 3;\n");
git(source, "add", "-A");
git(source, "commit", "-q", "-m", "two");

const DEFECTS = [1, 2, 3].map((k) => ({ id: "d" + k, text: "defect text " + k, hit: "HITMARK-" + k + " finding that states defect " + k }));
const PROMPT = "Review booking/src/a.ts and booking/src/b.ts\n";
function makeTask(id: string, over: Record<string, unknown> = {}, prompt = PROMPT): string {
	const dir = join(scratch, "tasks", id);
	write(join(dir, "task.json"), JSON.stringify({ id, role: "review", repo: source, rev: revSha, exclude: ["README.md", "log.md"], defects: DEFECTS, ...over }));
	write(join(dir, "prompt.md"), prompt);
	return dir;
}

type Role = "reviewer" | "extract" | "a" | "b";
/** What a stub answers for a role: the text to print, YES (all yes), or SMART (yes for a defect whose hit marker is in the prompt). */
const YES = "@yes";
const SMART = "@smart";
const ROLES: Role[] = ["extract", "a", "b", "reviewer"];
const MODEL_GLOB: Record<Role, string> = { extract: "*haiku*", a: "*opus*", b: "*gpt*", reviewer: "*" };
const COST: Record<Role, number> = { reviewer: 0.5, extract: 0.01, a: 0.1, b: 0.2 };
const FOUND_ONE = JSON.stringify([{ file: "booking/src/a.ts", line: 1, severity: "high", claim: "claim one" }]);

let counter = 0;
/** A stub pi, one script per behaviour (it runs under env -i, so everything is baked in). Each role's arguments go to <stub>.<role>. */
function makePi(replies: Partial<Record<Role, string>>): { path: string; seen: (role: Role) => string[] | undefined } {
	const path = join(scratch, "pi-" + counter++);
	const arms = ROLES.map((role) => {
		const reply = replies[role];
		const session = JSON.stringify({ type: "message", message: { role: "assistant", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: COST[role] } }, content: [] } });
		let body: string;
		if (reply === undefined) body = "echo no reply configured >&2; exit 1";
		else if (reply === YES) body = 'echo \'["yes","yes","yes"]\'';
		else if (reply === SMART) body = 'out=; sep=; for k in 1 2 3; do case "$prompt" in *HITMARK-$k*) v=yes ;; *) v=no ;; esac; out="$out$sep$(printf \'"%s"\' "$v")"; sep=,; done; echo "[$out]"';
		else {
			const file = path + "." + role + ".reply";
			write(file, role === "reviewer" ? JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: reply }] } }) + "\n" : reply);
			body = "cat '" + file + "'";
		}
		const log = reply === undefined ? "" : "; mkdir -p \"$sdir\"; echo '" + session + "' > \"$sdir/s.jsonl\"";
		return "  " + MODEL_GLOB[role] + ") role=" + role + "\n    " + record(path, role) + log + "\n    " + body + " ;;";
	});
	write(path, [
		"#!/usr/bin/env bash",
		'model=; sdir=; prev=; prompt=',
		'for a in "$@"; do case "$prev" in --model) model=$a ;; --session-dir) sdir=$a ;; esac; prev=$a; prompt=$a; done',
		'case "$model" in',
		...arms,
		"esac",
		"",
	].join("\n"), 0o755);
	return {
		path,
		seen: (role) => (existsSync(path + "." + role) ? readFileSync(path + "." + role, "utf8").split("\0").slice(0, -1) : undefined),
	};
}
const record = (path: string, role: Role): string => "{ printf 'HOME=%s\\0' \"$HOME\"; printf '%s\\0' \"$@\"; } > '" + path + "." + role + "'";

function judge(replies: Partial<Record<Role, string>>, opts: { review?: string; args?: string[]; home?: string; task?: string } = {}) {
	const pi = makePi(replies);
	const trial = join(scratch, "trial-" + counter++);
	mkdirSync(trial, { recursive: true });
	if (!("review" in opts) || opts.review !== undefined) write(join(trial, "review.txt"), opts.review ?? "The review text.\n");
	const task = opts.task ?? makeTask("jt-" + counter);
	const r = run("judge.sh", [trial, task, ...(opts.args ?? [])], { EVAL_JUDGE_PI: pi.path, EVAL_REAL_HOME: opts.home ?? realHome });
	const line = r.stdout.trim().split("\n").pop() ?? "";
	return { r, pi, trial, out: line === "" ? undefined : JSON.parse(line) };
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, a + " is not " + b);
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

// ---- judge.sh ----

test("judge.sh: both judges yes on everything passes; bare flags, blinded prompts, costs, own session dirs", () => {
	const { r, pi, trial, out } = judge({ extract: FOUND_ONE, a: YES, b: YES });
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual([out.found, out.of, out.disagreements, out.infra], [3, 3, [], false]);
	near(out.judgeCost, 0.31);
	assert.equal(readFileSync(join(trial, "judge.json"), "utf8").trim(), JSON.stringify(out));
	const bare = ["-p", "-nt", "-ne", "-ns", "-np", "-nc", "--no-mcp", "--thinking", "medium"];
	const models = { extract: "anthropic/claude-haiku-5-5", a: "anthropic/claude-opus-5-5", b: "openai-codex/gpt-6.1-sol" };
	for (const role of ["extract", "a", "b"] as const) {
		const args = pi.seen(role)!;
		assert.ok(args, role + " was not called");
		for (const f of bare) assert.ok(args.includes(f), role + " lacks " + f);
		assert.ok(!args.includes("--no-session") && !args.includes("-e"), role + " has --no-session or -e");
		assert.equal(flag(args, "--model"), models[role]);
		assert.equal(flag(args, "--session-dir"), join(trial, "judge", role, "sessions"));
		assert.equal(args[0], "HOME=" + join(trial, "judge/home"));
	}
	const extract = pi.seen("extract")!.at(-1)!;
	assert.match(extract, /The review text\./);
	assert.doesNotMatch(extract, /\{\{/);
	const a = pi.seen("a")!.at(-1)!;
	assert.equal(a, pi.seen("b")!.at(-1)!);
	assert.match(a, /claim one/);
	assert.match(a, /^1\. defect text 1$/m);
	assert.match(a, /^3\. defect text 3$/m);
	assert.doesNotMatch(a, /HITMARK|\{\{/);
});

test("judge.sh: the Anthropic auth shim is passed to every judge when it is installed", () => {
	const { pi, out } = judge({ extract: FOUND_ONE, a: YES, b: YES }, { home: shimHome });
	assert.equal(out.infra, false);
	for (const role of ["extract", "a", "b"] as const) {
		const args = pi.seen(role)!;
		assert.deepEqual(args.slice(args.indexOf("-ne"), args.indexOf("-ne") + 4), ["-ne", "-e", SHIM, "-ns"]);
	}
});

test("judge.sh: judges split on d2 -> found 2 of 3, disagreement d2; both no on d2 is not a disagreement", () => {
	const split = judge({ extract: FOUND_ONE, a: YES, b: '["yes","no","yes"]' }).out;
	assert.deepEqual([split.found, split.of, split.disagreements, split.infra], [2, 3, ["d2"], false]);
	const agree = judge({ extract: FOUND_ONE, a: '["yes","no","yes"]', b: '["yes","no","yes"]' }).out;
	assert.deepEqual([agree.found, agree.disagreements, agree.infra], [2, [], false]);
});

test("judge.sh: an unparseable, short or missing judge reply, or a bad extraction, is infra", () => {
	const cases: [string, Partial<Record<Role, string>>][] = [
		["prose reply", { extract: FOUND_ONE, a: YES, b: "I cannot decide." }],
		["wrong length", { extract: FOUND_ONE, a: '["yes","yes"]', b: YES }],
		["a judge that fails", { extract: FOUND_ONE, a: YES }],
		["unparseable extraction", { extract: "no findings", a: YES, b: YES }],
	];
	for (const [name, replies] of cases) {
		const { r, out } = judge(replies);
		assert.equal(r.status, 0, name + ": " + r.stderr);
		assert.deepEqual([out.found, out.of, out.disagreements, out.infra], [0, 3, [], true], name);
	}
	assert.equal(judge({ extract: "no findings", a: YES, b: YES }).pi.seen("a"), undefined, "judges run on a bad extraction");
});

test("judge.sh: an empty or missing review is infra without any model call", () => {
	for (const review of ["  \n", undefined]) {
		const { r, pi, out } = judge({ extract: FOUND_ONE, a: YES, b: YES }, { review });
		assert.equal(r.status, 0, r.stderr);
		assert.deepEqual([out.found, out.of, out.infra, out.judgeCost], [0, 3, true, 0]);
		assert.equal(pi.seen("extract"), undefined);
	}
});

test("judge.sh --findings skips the extraction; invalid findings are infra; usage errors exit 2", () => {
	const findings = join(scratch, "findings-" + counter++ + ".json");
	write(findings, FOUND_ONE);
	const ok = judge({ a: YES, b: YES }, { args: ["--findings", findings], review: undefined });
	assert.deepEqual([ok.out.found, ok.out.infra, ok.pi.seen("extract")], [3, false, undefined]);
	near(ok.out.judgeCost, 0.3);
	assert.match(ok.pi.seen("a")!.at(-1)!, /claim one/);
	write(findings, "nothing");
	assert.equal(judge({ a: YES, b: YES }, { args: ["--findings", findings], review: undefined }).out.infra, true);
	assert.equal(run("judge.sh", []).status, 2);
	assert.equal(run("judge.sh", [scratch, join(scratch, "no-task")]).status, 2);
	assert.equal(run("judge.sh", [scratch, makeTask("jt-usage"), "--findings"]).status, 2);
});

// ---- trial.sh, review branch ----

function trial(replies: Partial<Record<Role, string>>, task = makeTask("rt-" + counter)) {
	const pi = makePi(replies);
	const out = join(scratch, "out-" + counter++ + ".jsonl");
	const r = run("trial.sh", [task, "prov/model-x", "high", "2", out], { EVAL_REVIEW_PI: pi.path, EVAL_JUDGE_PI: pi.path, EVAL_REAL_HOME: realHome });
	const rec = existsSync(out) ? JSON.parse(readFileSync(out, "utf8").trim().split("\n").pop()!) : undefined;
	if (rec) keep.push(rec.dir);
	return { r, rec, pi, out };
}

test("trial.sh review: a review that finds everything passes; the record, the workspace at rev, the reviewer's flags", () => {
	const { r, rec, pi, out } = trial({ reviewer: "REVIEW BODY", extract: FOUND_ONE, a: YES, b: YES });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(readFileSync(out, "utf8").trim().split("\n").length, 1);
	const { dir, seconds, judgeCost, ...rest } = rec;
	assert.deepEqual(rest, {
		task: rec.task, role: "review", model: "prov/model-x", thinking: "high", trial: 2, pass: true, found: 3, of: 3, disagreements: [], rc: 0,
		cost: 0.5, input: 1, output: 1, cacheRead: 0, cacheWrite: 0, turns: 1, leak: false, infra: false,
	});
	assert.equal(typeof seconds, "number");
	near(judgeCost, 0.31);
	assert.equal(readFileSync(join(dir, "review.txt"), "utf8"), "REVIEW BODY");
	const ws = join(dir, "ws");
	assert.equal(readFileSync(join(ws, "booking/src/a.ts"), "utf8"), "export const a = 1;\n");
	for (const gone of ["README.md", "log.md", "booking/src/late.ts"]) assert.ok(!existsSync(join(ws, gone)), gone + " is in the workspace");
	assert.equal(git(ws, "rev-list", "--count", "HEAD"), "1");
	const args = pi.seen("reviewer")!;
	assert.equal(args[0], "HOME=" + join(dir, "home"));
	assert.deepEqual(args.slice(1), ["-p", "--mode", "json", "--session-dir", join(dir, "home/.pi/agent/sessions/review"), "--model", "prov/model-x", "--thinking", "high", PROMPT.trim()]);
	assert.match(pi.seen("extract")!.at(-1)!, /REVIEW BODY/);
});

test("trial.sh review: a split judge fails the trial and names the disagreement; no review is infra, not a fail", () => {
	const split = trial({ reviewer: "REVIEW BODY", extract: FOUND_ONE, a: YES, b: '["yes","no","yes"]' }).rec;
	assert.deepEqual([split.pass, split.found, split.of, split.disagreements, split.infra], [false, 2, 3, ["d2"], false]);
	const quiet = trial({ extract: FOUND_ONE, a: YES, b: YES });
	assert.equal(quiet.r.status, 0, quiet.r.stderr);
	assert.deepEqual([quiet.rec.pass, quiet.rec.infra, quiet.rec.turns, quiet.rec.rc, quiet.rec.found], [false, true, 0, 1, 0]);
	const judgeDown = trial({ reviewer: "REVIEW BODY", extract: FOUND_ONE, a: "no" , b: YES }).rec;
	assert.deepEqual([judgeDown.pass, judgeDown.infra, judgeDown.turns], [false, true, 1]);
});

test("trial.sh: a review task without rev is still unsupported", () => {
	const r = run("trial.sh", [makeTask("rt-norev", { rev: undefined }), "m", "low", "1", join(scratch, "x.jsonl")]);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /role not supported yet/);
});

// ---- validate.sh, review tasks ----

test("validate.sh: a review task is VALID when the workspace builds, the prompt's files exist and defects are complete", () => {
	const good = run("validate.sh", [makeTask("vr-good")]);
	assert.equal(good.status, 0, good.stdout + good.stderr);
	assert.equal(good.stdout.trim(), "VALID vr-good");
	const bad: [string, Record<string, unknown>, string | undefined, RegExp][] = [
		["a file the prompt names is missing", {}, "Review booking/src/missing.ts\n", /missing from the workspace: booking\/src\/missing.ts/],
		["a file the prompt names was excluded", {}, "Review README.md\n", /missing from the workspace: README.md/],
		["the prompt names no file", {}, "Review the code\n", /names no file/],
		["no defects", { defects: [] }, undefined, /non-empty list/],
		["a defect without a hit", { defects: [{ id: "d1", text: "t" }] }, undefined, /non-empty list/],
		["duplicate ids", { defects: [DEFECTS[0], DEFECTS[0]] }, undefined, /not unique/],
		["a rev that does not exist", { rev: "0".repeat(40) }, undefined, /cannot build/],
		["an exclude path outside the workspace", { exclude: ["../x"] }, undefined, /cannot build/],
	];
	for (const [name, over, prompt, reason] of bad) {
		const r = run("validate.sh", [makeTask("vr-bad", over, prompt)]);
		assert.notEqual(r.status, 0, name);
		assert.match(r.stdout, new RegExp("^INVALID vr-bad: .*"), name);
		assert.match(r.stdout, reason, name);
	}
});

// ---- check-judges.sh ----

test("check-judges.sh: judges that agree with the known answers exit 0, one line per defect", () => {
	const pi = makePi({ a: SMART, b: SMART });
	const r = run("check-judges.sh", [makeTask("cj-good")], { EVAL_JUDGE_PI: pi.path, EVAL_REAL_HOME: realHome });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	const lines = r.stdout.trim().split("\n");
	assert.equal(lines.length, 3);
	lines.forEach((line, i) => assert.equal(line, "d" + (i + 1) + " hit: a=yes b=yes; decoys only: a=no b=no; ok"));
	assert.equal(pi.seen("extract"), undefined);
});

test("check-judges.sh: a judge that always says yes, or one that cannot answer, exits 1 and names the defects it missed", () => {
	const yes = run("check-judges.sh", [makeTask("cj-yes")], { EVAL_JUDGE_PI: makePi({ a: SMART, b: YES }).path, EVAL_REAL_HOME: realHome });
	assert.equal(yes.status, 1, yes.stdout + yes.stderr);
	assert.equal(yes.stdout.trim().split("\n").filter((l) => l.endsWith("; MISS")).length, 3);
	assert.match(yes.stdout, /^d1 hit: a=yes b=yes; decoys only: a=no b=yes; MISS$/m);
	const mute = run("check-judges.sh", [makeTask("cj-mute")], { EVAL_JUDGE_PI: makePi({ a: SMART }).path, EVAL_REAL_HOME: realHome });
	assert.equal(mute.status, 1);
	assert.match(mute.stdout, /^d1 hit: a=yes b=none; decoys only: a=no b=none; MISS$/m);
	assert.equal(run("check-judges.sh", []).status, 2);
	assert.equal(run("check-judges.sh", ["no-such-task"]).status, 2);
});
