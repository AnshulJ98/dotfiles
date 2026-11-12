// Run: node --test 'config/pi/tests/*.test.ts'
// Drives bin/auto-slice against real git in temp repos, with a fake scout beside it and a fake wt on PATH: no model, no tokens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

// FAKE_SCOUT: pass (changes src/a.txt), fail, blocked (a PASS with a step left under Blocked on me), refuse (exit 75 before any run).
// Every call is logged as "<cwd> <args>"; the spec on stdin is dropped.
const FAKE_SCOUT = `#!/usr/bin/env bash
echo "$PWD $*" >>"$FAKE_SCOUT_LOG"
case "$1" in --review) echo "ship"; exit 0 ;; esac
cat >/dev/null
info() { echo "scout: dir=/scout/$1 cost=\\$0.010 blocked-on-me=$2" >&2; }
case "$FAKE_SCOUT" in
pass) echo changed >>src/a.txt; echo "WORKER-SENSORS: PASS"; info 11 no ;;
fail) echo "WORKER-SENSORS: FAIL tests: exit 1"; info 12 no ;;
blocked) echo changed >>src/a.txt; echo "WORKER-SENSORS: PASS"; info 13 yes ;;
refuse) echo "scout: refusing" >&2; exit 75 ;;
esac
`;

// wt as auto-slice calls it: switch -y --no-cd -c <branch> --base <base>, and remove -y --foreground <branch>. Worktrees land beside the repo.
const FAKE_WT = `#!/usr/bin/env bash
top="$(git rev-parse --path-format=absolute --git-common-dir)"
top="\${top%/.git}"
verb="$1"
while [ $# -gt 0 ]; do
  case "$1" in -c) branch="$2"; shift ;; --base) base="$2"; shift ;; esac
  last="$1"
  shift
done
case "$verb" in
switch) git worktree add -q -b "$branch" "$top.\${branch//\\//-}" "$base" ;;
remove) git worktree remove "$top.\${last//\\//-}" ;;
esac
`;

const AUTO = "# AUTO run: e\n\n- [ ] 1. parse, branch slice/parse, decisions 1\n- [ ] 2. cache, branch slice/cache, decisions 2\n";
const spec = (tests: string): string => `---\nfiles-allowed: [src/a.txt]\ntests: ${tests}\n---\n1. Do it (src/a.txt) → check: true\n`;

interface Lab {
	repo: string;
	run: string;
	state: string;
	log: string;
	slice(args: string[], env?: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string };
	git(cwd: string, ...args: string[]): string;
	/** Writes the spec for a slice, dated after its worktree, and returns the path. */
	spec(name: string, tests?: string): string;
}

function lab(): Lab {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "auto-slice-")));
	const repo = join(root, "repo");
	for (const dir of ["bin", "fake", "repo/src"]) mkdirSync(join(root, dir), { recursive: true });
	cpSync(resolve(import.meta.dirname, "../bin/auto-slice"), join(root, "bin", "auto-slice"));
	for (const [path, text] of [["bin/scout", FAKE_SCOUT], ["fake/wt", FAKE_WT]]) {
		writeFileSync(join(root, path), text);
		chmodSync(join(root, path), 0o755);
	}
	const log = join(root, "scout.log");
	writeFileSync(log, "");
	const env: NodeJS.ProcessEnv = {
		...process.env,
		PATH: `${join(root, "fake")}:${process.env.PATH}`,
		FAKE_SCOUT_LOG: log,
		PI_SESSION_ID: "s1",
		GIT_AUTHOR_NAME: "t",
		GIT_AUTHOR_EMAIL: "t@t",
		GIT_COMMITTER_NAME: "t",
		GIT_COMMITTER_EMAIL: "t@t",
		GIT_CONFIG_COUNT: "2",
		GIT_CONFIG_KEY_0: "commit.gpgsign",
		GIT_CONFIG_VALUE_0: "false",
		GIT_CONFIG_KEY_1: "core.hooksPath",
		GIT_CONFIG_VALUE_1: "/dev/null",
	};
	delete env.AUTO_RUN;
	const git = (cwd: string, ...args: string[]): string => {
		const done = spawnSync("git", args, { cwd, env, encoding: "utf8" });
		assert.equal(done.status, 0, `git ${args.join(" ")}: ${done.stderr}`);
		return done.stdout.trim();
	};
	git(repo, "init", "-q", "-b", "feature/x");
	writeFileSync(join(repo, "src", "a.txt"), "one\n");
	git(repo, "add", ".");
	git(repo, "commit", "-qm", "init");
	const state = join(repo, ".git", "pi-auto", "e");
	return {
		repo,
		run: `${repo}.auto-e`,
		state,
		log,
		git,
		slice: (args, extra = {}) => {
			const done = spawnSync(join(root, "bin", "auto-slice"), args, { cwd: repo, env: { ...env, ...extra }, encoding: "utf8" });
			return { status: done.status, stdout: done.stdout, stderr: done.stderr };
		},
		spec: (name, tests = "test -f src/a.txt") => {
			const path = join(root, `spec-${name}.md`);
			writeFileSync(path, spec(tests));
			const later = Date.now() / 1000 + 5;
			utimesSync(path, later, later);
			return path;
		},
	};
}

/** A lab with the run started and AUTO.md written. */
function started(): Lab {
	const l = lab();
	assert.equal(l.slice(["start", "e"]).status, 0);
	writeFileSync(join(l.run, "AUTO.md"), AUTO);
	return l;
}

const calls = (l: Lab): string[] => readFileSync(l.log, "utf8").split("\n").filter(Boolean);
const autoMd = (l: Lab): string => readFileSync(join(l.run, "AUTO.md"), "utf8");

test("start: a run worktree beside the repo on auto/<effort>, AUTO.md excluded, base recorded; a dirty checkout does not stop it", () => {
	const l = lab();
	writeFileSync(join(l.repo, "scratch.txt"), "someone else's work\n");
	const base = l.git(l.repo, "rev-parse", "HEAD");
	const done = l.slice(["start", "e"]);
	assert.equal(done.status, 0, done.stderr);
	assert.match(done.stdout, new RegExp(`^run: ${l.run}\nbranch: auto/e\nbase: feature/x @ ${base}\n`));
	assert.match(done.stderr, /uncommitted changes; the run starts from feature\/x/);
	assert.equal(l.git(l.run, "branch", "--show-current"), "auto/e");
	assert.match(readFileSync(join(l.repo, ".git", "info", "exclude"), "utf8"), /^AUTO\.md$/m);
	assert.equal(readFileSync(join(l.state, "base"), "utf8").trim(), base);
	assert.equal(l.slice(["start", "e"]).status, 2, "the effort exists");
	assert.equal(l.slice(["start", "Bad Name"]).status, 2);
	assert.equal(l.slice(["new", "parse"]).status, 2, "no AUTO.md yet");
});

test("start refuses the default branch", () => {
	const l = lab();
	l.git(l.repo, "branch", "-m", "main");
	const done = l.slice(["start", "e"]);
	assert.equal(done.status, 1);
	assert.match(done.stderr, /HEAD is the default branch \(main\)/);
	assert.equal(existsSync(l.run), false);
});

test("a slice from new to merge: the list order, the session stamp, one rework, no hand edit after PASS, tick and log", () => {
	const l = started();
	const out = l.slice(["new", "cache"]);
	assert.equal(out.status, 1);
	assert.match(out.stderr, /first unticked slice in AUTO\.md is 'parse', not 'cache'/);
	assert.match(autoMd(l), /^session: s1$/m);

	const made = l.slice(["new", "parse"], { PI_SESSION_ID: "s2" });
	assert.equal(made.status, 0, made.stderr);
	const tree = `${l.repo}.slice-parse`;
	assert.match(made.stdout, new RegExp(`^slice: ${tree}\n`));
	assert.deepEqual(autoMd(l).match(/^session: .*$/gm), ["session: s2"], "the session that last ran a command owns the run");

	const stale = l.spec("parse");
	utimesSync(stale, 1, 1);
	const old = l.slice(["dispatch", "parse", stale]);
	assert.equal(old.status, 1);
	assert.match(old.stderr, /is older than slice\/parse's worktree/);
	assert.equal(l.slice(["dispatch", "parse", l.spec("parse")], { FAKE_SCOUT: "refuse" }).status, 75);
	assert.equal(existsSync(join(l.state, "parse.runs")), false, "a refusal before the worker started is not a dispatch");

	const failed = l.slice(["dispatch", "parse", l.spec("parse"), "--timeout", "540"], { FAKE_SCOUT: "fail" });
	assert.equal(failed.status, 1);
	assert.match(failed.stderr, /did not pass \(FAIL, rc 0\)\. One rework/);
	assert.match(failed.stdout, /^WORKER-SENSORS: FAIL/m, "the digest passes through");
	assert.equal(calls(l).at(-1), `${tree} --rw --timeout 540 --spec -`);
	assert.equal(l.slice(["merge", "parse", "feat: parse"]).status, 1, "nothing passed yet");

	const passed = l.slice(["dispatch", "parse", l.spec("parse")], { FAKE_SCOUT: "pass" });
	assert.equal(passed.status, 0, passed.stderr);
	assert.match(passed.stdout, /slice\/parse passed its sensors\. Next: auto-slice merge parse/);

	writeFileSync(join(tree, "src", "a.txt"), "one\nchanged\nby hand\n");
	const hand = l.slice(["merge", "parse", "feat: parse"]);
	assert.equal(hand.status, 1);
	assert.match(hand.stderr, /no passing dispatch for what is in its worktree now/);
	writeFileSync(join(tree, "src", "a.txt"), "one\nchanged\n");

	const merged = l.slice(["merge", "parse", "feat: parse"]);
	assert.equal(merged.status, 0, merged.stderr);
	assert.match(merged.stdout, /^- \[x\] 1\. parse, branch slice\/parse, decisions 1\n- \[ \] 2\. cache/);
	assert.equal(l.git(l.run, "log", "--format=%s", "-2"), "Merge branch 'slice/parse' into auto/e\nfeat: parse");
	assert.equal(l.git(l.run, "rev-list", "--parents", "-1", "HEAD").split(" ").length, 3, "a merge commit, never a fast-forward");
	assert.equal(existsSync(tree), false);
	assert.equal(l.git(l.repo, "branch", "--list", "slice/parse"), "");
	const sha = l.git(l.run, "rev-parse", "--short", "HEAD");
	assert.ok(autoMd(l).includes(`slice parse: merge ${sha}; FAIL rc=0 dir=/scout/12 cost=$0.010 blocked-on-me=no; PASS rc=0 dir=/scout/11 cost=$0.010 blocked-on-me=no\n`), autoMd(l));
	assert.equal(l.git(l.run, "status", "--porcelain"), "");
});

test("stops: a second failure, a third dispatch, a PASS with Blocked on me, tests failing on the run branch", () => {
	const l = started();
	l.slice(["new", "parse"]);
	assert.equal(l.slice(["dispatch", "parse", l.spec("parse")], { FAKE_SCOUT: "blocked" }).status, 1);
	assert.match(readFileSync(join(l.state, "parse.runs"), "utf8"), /^BLOCKED rc=0 /);
	assert.equal(l.slice(["merge", "parse", "feat: parse"]).status, 1, "a blocked PASS does not merge");
	const second = l.slice(["dispatch", "parse", l.spec("parse")], { FAKE_SCOUT: "fail" });
	assert.match(second.stderr, /did not pass its rework \(FAIL, rc 0\): a stop condition/);
	const before = calls(l).length;
	const third = l.slice(["dispatch", "parse", l.spec("parse")], { FAKE_SCOUT: "pass" });
	assert.equal(third.status, 1);
	assert.match(third.stderr, /has had its dispatch and its rework/);
	assert.equal(calls(l).length, before, "no worker was started");

	const m = started();
	m.slice(["new", "parse"]);
	assert.equal(m.slice(["dispatch", "parse", m.spec("parse", '"test -f missing.txt"')], { FAKE_SCOUT: "pass" }).status, 0);
	const red = m.slice(["merge", "parse", "feat: parse"]);
	assert.equal(red.status, 1);
	assert.match(red.stderr, /tests fail on auto\/e after merging slice\/parse: 'test -f missing\.txt' exit 1/);
	assert.match(autoMd(m), /^- \[ \] 1\. parse,/m, "merged, not ticked");
});

test("review: after the last slice, scout --review <base> from the run worktree", () => {
	const l = started();
	const early = l.slice(["review"]);
	assert.equal(early.status, 1);
	assert.match(early.stderr, /2 slices are still unticked/);
	writeFileSync(join(l.run, "AUTO.md"), AUTO.replaceAll("[ ]", "[x]"));
	const done = l.slice(["review", "the cache keys"]);
	assert.equal(done.status, 0, done.stderr);
	assert.equal(calls(l).at(-1), `${l.run} --review ${readFileSync(join(l.state, "base"), "utf8").trim()} the cache keys`);
});
