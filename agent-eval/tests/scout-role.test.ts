// Run: node --test 'agent-eval/tests/*.test.ts'
// Scout role: citation parsing and grading (lib/scout-grade.ts), the paths workspace (lib/task.sh), trial.sh's scout
// branch driven by stub scouts, and validate.sh for scout tasks, against a throwaway source repo: no model, no tokens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { checkEntry, citations, grade, parseExpect, type Expect } from "../lib/scout-grade.ts";
import { parseRecords, summarize } from "../lib/summary.ts";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "scout-role-test-")));
const realHome = join(scratch, "real-home");
const keep: string[] = [];
after(() => [scratch, ...keep].forEach((d) => rmSync(d, { recursive: true, force: true })));

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

// --- citations and grade (pure) ---

const cites: [string, string, { file: string; from: number; to: number }[]][] = [
	["single line", "See config/pi/bin/scout:100 for it.", [{ file: "config/pi/bin/scout", from: 100, to: 100 }]],
	["range", "`a/b.ts:10-20`", [{ file: "a/b.ts", from: 10, to: 20 }]],
	["en dash and L prefix", "a/b.ts:L10\u2013L20", [{ file: "a/b.ts", from: 10, to: 20 }]],
	["reversed range is ordered", "a/b.ts:20-10", [{ file: "a/b.ts", from: 10, to: 20 }]],
	["leading ./ dropped, column ignored", "(./a/b.ts:7:3)", [{ file: "a/b.ts", from: 7, to: 7 }]],
	["several in markdown", "- **x.ts:1**: one\n- [y.json:2-3](y): two", [{ file: "x.ts", from: 1, to: 1 }, { file: "y.json", from: 2, to: 3 }]],
	["backticks around the path are stripped", "`bin/scout:293-304` and `auto-run.ts:93`", [{ file: "bin/scout", from: 293, to: 304 }, { file: "auto-run.ts", from: 93, to: 93 }]],
	["a bare :91 continuing a cited file is skipped", "`DESIGN.md:28` and `:91`, also :92", [{ file: "DESIGN.md", from: 28, to: 28 }]],
	["no line number", "see a/b.ts and a/b.ts: the file, line 5", []],
	["empty", "", []],
];
for (const [name, digest, want] of cites) test(`citations: ${name}`, () => assert.deepEqual(citations(digest), want));

const E1: Expect = { file: "config/pi/bin/scout", lines: [100, 110], must: ["MODEL"] };
const E2: Expect = { file: "config/pi/x.ts", lines: [5, 6], must: [] };
const grades: [string, string, Expect[], { hits: number; of: number; pass: boolean }][] = [
	["citation inside the range and must matches", "The MODEL is set at config/pi/bin/scout:105.", [E1], { hits: 1, of: 1, pass: true }],
	["range citation that overlaps", "model at config/pi/bin/scout:95-101", [E1], { hits: 1, of: 1, pass: true }],
	["workspace-relative path with a longer prefix", "model at /ws/config/pi/bin/scout:100", [E1], { hits: 1, of: 1, pass: true }],
	["line outside the range", "The MODEL is at config/pi/bin/scout:111.", [E1], { hits: 0, of: 1, pass: false }],
	["range that ends before the expected one", "MODEL config/pi/bin/scout:90-99", [E1], { hits: 0, of: 1, pass: false }],
	["short cited path: the expected path ends with it", "MODEL at bin/scout:105", [E1], { hits: 1, of: 1, pass: true }],
	["short cited path: the bare file name", "MODEL at `scout:105`", [E1], { hits: 1, of: 1, pass: true }],
	["short cited path: ./ and backticks around it", "MODEL at `./bin/scout:105`", [E1], { hits: 1, of: 1, pass: true }],
	["short cited path: a partial name does not count", "MODEL at out:105", [E1], { hits: 0, of: 1, pass: false }],
	["short cited path: right file, line outside the range", "MODEL at bin/scout:111", [E1], { hits: 0, of: 1, pass: false }],
	["a path that only ends the same way does not count", "MODEL at myconfig/pi/bin/scout:105", [E1], { hits: 0, of: 1, pass: false }],
	["must regex missing from the digest", "config/pi/bin/scout:105 is where it is set", [E1], { hits: 0, of: 1, pass: false }],
	["must is case-insensitive", "the model: config/pi/bin/scout:105", [E1], { hits: 1, of: 1, pass: true }],
	["a must that is not a regex never matches", "config/pi/bin/scout:105", [{ ...E1, must: ["("] }], { hits: 0, of: 1, pass: false }],
	["one of two entries", "MODEL config/pi/bin/scout:105", [E1, E2], { hits: 1, of: 2, pass: false }],
	["both entries", "MODEL config/pi/bin/scout:105 and config/pi/x.ts:6", [E1, E2], { hits: 2, of: 2, pass: true }],
	["no citations", "The MODEL is set near the top of the scout script.", [E1], { hits: 0, of: 1, pass: false }],
	["no expect entries is not a pass", "config/pi/bin/scout:105", [], { hits: 0, of: 0, pass: false }],
];
const ALT: Expect = { at: [{ file: "config/pi/bin/scout", lines: [100, 110] }, { file: "config/pi/x.ts", lines: [5, 6] }], must: ["MODEL"] };
grades.push(
	["alternative location: a citation of the second place hits", "MODEL config/pi/x.ts:5", [ALT], { hits: 1, of: 1, pass: true }],
	["alternative location: a citation of the first place hits", "MODEL config/pi/bin/scout:100-102", [ALT], { hits: 1, of: 1, pass: true }],
	["alternative location: a line outside every place does not hit", "MODEL config/pi/bin/scout:111 and config/pi/x.ts:7", [ALT], { hits: 0, of: 1, pass: false }],
	["alternative location: a right line in the wrong file does not hit", "MODEL config/pi/y.ts:5", [ALT], { hits: 0, of: 1, pass: false }],
	["alternative location: must still has to match", "config/pi/x.ts:5", [ALT], { hits: 0, of: 1, pass: false }],
	["alternative location: a mix with the short form", "MODEL config/pi/x.ts:6 and config/pi/x.ts:5", [ALT, E2], { hits: 2, of: 2, pass: true }],
);
for (const [name, digest, expect, want] of grades) test(`grade: ${name}`, () => assert.deepEqual(grade(digest, expect), want));

test("parseExpect accepts the task.json shape and names what is wrong", () => {
	assert.deepEqual(parseExpect([{ file: "a", lines: [1, 2], must: ["x"] }]), [{ file: "a", lines: [1, 2], must: ["x"] }]);
	const at = { file: "a", lines: [1, 2] };
	assert.deepEqual(parseExpect([{ at: [at, { file: "b", lines: [3, 3] }], must: ["x"] }]), [{ at: [at, { file: "b", lines: [3, 3] }], must: ["x"] }]);
	for (const bad of [{ at: [], must: [] }, { at: [{ file: "a", lines: [2, 1] }], must: [] }, { at: [at, { file: "", lines: [1, 1] }], must: [] }, { at: [at], must: [1] }, { at: [at] }, { at: "a", must: [] }].map((e) => [e])) {
		assert.equal(typeof parseExpect(bad), "string", JSON.stringify(bad));
	}
	for (const bad of [undefined, [], "blocked", [{ file: "a", lines: [3, 2], must: [] }], [{ file: "a", lines: [0, 2], must: [] }], [{ file: "a", lines: [1], must: [] }], [{ lines: [1, 2], must: [] }], [{ file: "a", lines: [1, 2], must: [1] }]]) {
		assert.equal(typeof parseExpect(bad), "string", JSON.stringify(bad));
	}
});

test("checkEntry: the file exists, reaches the end line, and the range text matches every must", () => {
	const files: Record<string, string> = { "a.ts": "one\ntwo\nthree\nfour\n" };
	const read = (f: string) => files[f];
	assert.equal(checkEntry({ file: "a.ts", lines: [2, 3], must: ["two", "THREE"] }, read), undefined);
	assert.match(checkEntry({ file: "b.ts", lines: [1, 1], must: [] }, read) ?? "", /not in the workspace/);
	assert.match(checkEntry({ file: "a.ts", lines: [3, 5], must: [] }, read) ?? "", /has 4 lines/);
	assert.match(checkEntry({ file: "a.ts", lines: [2, 3], must: ["four"] }, read) ?? "", /does not match/);
	assert.match(checkEntry({ file: "a.ts", lines: [1, 2], must: ["("] }, read) ?? "", /not a regex/);
});

test("checkEntry: every alternative location is checked like a single one", () => {
	const files: Record<string, string> = { "a.ts": "one\ntwo\nthree\n", "b.ts": "alpha\ntwo again\n" };
	const read = (f: string) => files[f];
	const at = (...places: [string, number, number][]): Expect => ({ at: places.map(([file, a, b]) => ({ file, lines: [a, b] })), must: ["two"] });
	assert.equal(checkEntry(at(["a.ts", 1, 2], ["b.ts", 2, 2]), read), undefined);
	assert.match(checkEntry(at(["a.ts", 1, 2], ["c.ts", 1, 1]), read) ?? "", /c\.ts is not in the workspace/);
	assert.match(checkEntry(at(["a.ts", 1, 2], ["b.ts", 1, 5]), read) ?? "", /b\.ts has 2 lines/);
	assert.match(checkEntry(at(["a.ts", 1, 2], ["b.ts", 1, 1]), read) ?? "", /b\.ts:1-1 does not match/);
});

// --- trial.sh and validate.sh ---

write(join(realHome, ".pi/agent/auth.json"), "{}");
const SCOUT_TS = "// header\nconst MODEL = 'm';\nconst THINKING = 'low';\n// tail\n";
const repo = join(scratch, "source-repo");
write(join(repo, "config/pi/bin/scout"), "#!/bin/sh\n# one\nMODEL=sonnet\nTHINKING=low\n# four\n");
write(join(repo, "config/pi/x.ts"), SCOUT_TS);
write(join(repo, "agent-eval/tasks/secret/task.json"), "{}");
write(join(repo, "README.md"), "top\n");
git(repo, "init", "-q");
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "pinned");
const rev = git(repo, "rev-parse", "HEAD");
write(join(repo, "config/pi/x.ts"), "changed after the pin\n");
git(repo, "commit", "-qam", "later");

const EXPECT = [{ file: "config/pi/bin/scout", lines: [2, 4], must: ["MODEL"] }, { file: "config/pi/x.ts", lines: [2, 3], must: ["THINKING"] }];
function makeTask(id: string, over: Record<string, unknown> = {}): string {
	const dir = join(scratch, "tasks", id);
	write(join(dir, "task.json"), JSON.stringify({ id, role: "scout", repo, rev, paths: ["config/pi"], expect: EXPECT, ...over }));
	write(join(dir, "prompt.md"), "Where is the MODEL set?\n");
	return dir;
}

type Mode = "right" | "outside" | "none";
const DIGESTS: Record<Mode, string> = {
	right: "**Answer**: MODEL and THINKING are set in two files.\n**Evidence**: config/pi/bin/scout:3 (MODEL), config/pi/x.ts:2-3 (THINKING)\n",
	outside: "**Answer**: MODEL and THINKING are set in two files.\n**Evidence**: config/pi/bin/scout:3 (MODEL), config/pi/x.ts:4 (THINKING)\n",
	none: "**Answer**: MODEL and THINKING are set in the scout script and x.ts, I did not note the lines.\n",
};

/** A stub scout. It runs under env -i, so everything it needs is baked into the script. */
function makeStub(mode: Mode): { path: string; record: string } {
	const path = join(scratch, `stub-${mode}`);
	const record = `${path}.record`;
	const usage = { input: 100, output: 20, cacheRead: 50, cacheWrite: 10, cost: { total: 0.125 } };
	const line = JSON.stringify({ type: "message", message: { role: "assistant", usage, content: [{ type: "toolCall", name: "bash", arguments: { command: "ls" } }] } });
	write(`${path}.digest`, DIGESTS[mode]);
	write(path, `#!/usr/bin/env bash
{ echo "HOME=$HOME"; echo "ARGC=$#"; echo "ARGS=$1 $2 $3 $4"; echo "TASK=$5"; echo "PWD=$PWD"; echo "STDIN=$(cat)"; echo "TOP=$(ls | tr '\\n' ' ')"; echo "OUTER=$(env | grep -Ec '^(PI_|EVAL_)' || true)"; } > '${record}'
d="$HOME/.pi/agent/sessions/scout/$$"; mkdir -p "$d"
printf '%s\\n' '${line}' > "$d/s.jsonl"
cat '${path}.digest'
`, 0o755);
	return { path, record };
}

let counter = 0;
function trial(task: string, mode: Mode) {
	const stub = makeStub(mode);
	const out = join(scratch, `out-${counter++}.jsonl`);
	const r = run("trial.sh", [task, "prov/model-x", "high", "2", out], { EVAL_SCOUT: stub.path, EVAL_REAL_HOME: realHome });
	const lines = existsSync(out) ? readFileSync(out, "utf8").trim().split("\n") : [];
	const rec = lines.length ? JSON.parse(lines[lines.length - 1]) : undefined;
	if (rec) keep.push(rec.dir);
	return { r, rec, lines, stub };
}

test("a scout citing the right ranges passes: record fields, stub arguments, workspace limited to paths", () => {
	const { r, rec, lines, stub } = trial(makeTask("s-right"), "right");
	assert.equal(r.status, 0, r.stderr);
	assert.equal(lines.length, 1);
	const { dir, seconds, ...rest } = rec;
	assert.deepEqual(rest, {
		task: "s-right", role: "scout", model: "prov/model-x", thinking: "high", trial: 2, pass: true, hits: 2, of: 2, rc: 0,
		cost: 0.125, input: 100, output: 20, cacheRead: 50, cacheWrite: 10, turns: 1, leak: false, infra: false,
	});
	assert.equal(typeof seconds, "number");
	assert.equal(readFileSync(join(dir, "digest.txt"), "utf8"), DIGESTS.right);
	const seen = readFileSync(stub.record, "utf8");
	assert.match(seen, new RegExp(`^HOME=${join(dir, "home")}$`, "m"));
	assert.match(seen, /^ARGC=5$/m);
	assert.match(seen, /^ARGS=--model prov\/model-x --thinking high$/m);
	assert.match(seen, /^TASK=Where is the MODEL set\?$/m);
	assert.match(seen, /^PWD=.*\/ws$/m);
	assert.match(seen, /^STDIN=$/m);
	assert.match(seen, /^TOP=config $/m);
	assert.match(seen, /^OUTER=0$/m);
	assert.equal(git(join(dir, "ws"), "rev-list", "--count", "HEAD"), "1");
	assert.equal(readFileSync(join(dir, "ws/config/pi/x.ts"), "utf8"), SCOUT_TS);
	assert.ok(!existsSync(join(dir, "ws/agent-eval")));
	assert.ok(!existsSync(join(dir, "ws/README.md")));
});

test("a scout citing a line outside the range does not pass; one with no citations has hits 0", () => {
	const outside = trial(makeTask("s-outside"), "outside").rec;
	assert.deepEqual([outside.pass, outside.hits, outside.of, outside.infra], [false, 1, 2, false]);
	const none = trial(makeTask("s-none"), "none").rec;
	assert.deepEqual([none.pass, none.hits, none.of], [false, 0, 2]);
});

test("a malformed expect list is an infra record that does not pass", () => {
	const { rec } = trial(makeTask("s-bad", { expect: "blocked" }), "right");
	assert.deepEqual([rec.pass, rec.hits, rec.of, rec.infra], [false, 0, 0, true]);
});

test("scout records group under role scout in the summary", () => {
	const { rec } = trial(makeTask("s-sum"), "right");
	const { records, malformed } = parseRecords(JSON.stringify(rec));
	assert.equal(malformed, 0);
	const [{ role, cells: [cell] }] = summarize(records);
	assert.deepEqual([role, cell.cell, cell.trials, cell.passes], ["scout", "prov/model-x:high", 1, 1]);
});

test("trial.sh: a scout task without rev exits 2", () => {
	const r = run("trial.sh", [makeTask("s-norev", { rev: undefined }), "m", "low", "1", join(scratch, "x.jsonl")]);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /role not supported yet: scout/);
});

test("validate.sh: the pinned snapshot must hold every expect entry", () => {
	const good = run("validate.sh", [makeTask("v-good")]);
	assert.equal(good.status, 0, good.stdout + good.stderr);
	assert.equal(good.stdout.trim(), "VALID v-good");
	const cases: [string, Record<string, unknown>, RegExp][] = [
		["v-nofile", { expect: [{ file: "config/pi/none.ts", lines: [1, 1], must: [] }] }, /not in the workspace/],
		["v-short", { expect: [{ file: "config/pi/x.ts", lines: [3, 9], must: [] }] }, /has 4 lines/],
		["v-must", { expect: [{ file: "config/pi/x.ts", lines: [1, 2], must: ["THINKING"] }] }, /does not match/],
		["v-outside", { expect: [{ file: "README.md", lines: [1, 1], must: [] }] }, /not in the workspace/],
		["v-alt-nomatch", { expect: [{ at: [{ file: "config/pi/bin/scout", lines: [2, 4] }, { file: "config/pi/x.ts", lines: [3, 4] }], must: ["MODEL"] }] }, /config\/pi\/x\.ts:3-4 does not match/],
		["v-alt-nofile", { expect: [{ at: [{ file: "config/pi/bin/scout", lines: [2, 4] }, { file: "config/pi/none.ts", lines: [1, 1] }], must: ["MODEL"] }] }, /not in the workspace/],
		["v-shape", { expect: [] }, /non-empty list/],
		["v-rev", { rev: "0000000000000000000000000000000000000000" }, /cannot build the scout workspace/],
	];
	for (const [id, over, reason] of cases) {
		const r = run("validate.sh", [makeTask(id, over)]);
		assert.notEqual(r.status, 0, id);
		assert.match(r.stdout, new RegExp(`^INVALID ${id}: `, "m"), id);
		assert.match(r.stdout, reason, id);
	}
});

test("validate.sh: alternative locations that all hold are VALID", () => {
	const expect = [{ at: [{ file: "config/pi/bin/scout", lines: [2, 4] }, { file: "config/pi/x.ts", lines: [2, 3] }], must: ["MODEL|THINKING"] }];
	const r = run("validate.sh", [makeTask("v-alt", { expect })]);
	assert.equal(r.stdout.trim(), "VALID v-alt", r.stdout + r.stderr);
});

test("validate.sh: a scout task without paths archives the whole rev", () => {
	const r = run("validate.sh", [makeTask("v-all", { paths: undefined, expect: [{ file: "README.md", lines: [1, 1], must: ["top"] }] })]);
	assert.equal(r.status, 0, r.stdout + r.stderr);
});
