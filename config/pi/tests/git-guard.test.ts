// Run: node --test 'config/pi/tests/*.test.ts'
// Drives bin/guard/git, the git wrapper bin/scout puts first on a scout child's PATH. Real git, temp repos.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

const GUARD_DIR = resolve(import.meta.dirname, "../bin/guard");
const GUARD = join(GUARD_DIR, "git");
// Under a scout the guard is already first on PATH; skip it, or the guard would be handed itself
const REAL_GIT = (process.env.PATH ?? "")
	.split(delimiter)
	.map((dir) => join(dir, "git"))
	.find((path) => existsSync(path) && realpathSync(path) !== realpathSync(GUARD));
assert.ok(REAL_GIT, "no git on PATH besides the guard");
const MESSAGE = /scout git guard: git \S+ \.\.\. belongs to the operator/;

const baseEnv = (): NodeJS.ProcessEnv => ({
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_AUTHOR_NAME: "t",
	GIT_AUTHOR_EMAIL: "t@t",
	GIT_COMMITTER_NAME: "t",
	GIT_COMMITTER_EMAIL: "t@t",
});

function makeRepo(prefix: string): string {
	const repo = mkdtempSync(join(tmpdir(), prefix));
	const git = (...args: string[]) => execFileSync(REAL_GIT, args, { cwd: repo, env: baseEnv(), stdio: "ignore" });
	git("init", "-q");
	writeFileSync(join(repo, "a.txt"), "a\n");
	git("add", ".");
	git("commit", "-qm", "init");
	mkdirSync(join(repo, "sub"));
	return repo;
}

/** The guarded repo (the scout's own) and another one, with the env bin/scout would set. */
function world(mode: "read" | "rw") {
	const guarded = makeRepo("guard-own-");
	const other = makeRepo("guard-other-");
	// The unresolved path (/var/... on macOS), so the guard has to compare physical paths
	const env: NodeJS.ProcessEnv = {
		...baseEnv(),
		PI_SCOUT_REAL_GIT: REAL_GIT,
		PI_SCOUT_GIT_DIR: join(guarded, ".git"),
		PI_SCOUT_MODE: mode,
	};
	return { guarded, other, env };
}

type Where = "guarded" | "other" | "sub";
// [mode, where the call runs, git args (G = the guarded repo, O = the other repo), blocked in that mode]
const ROWS: Array<[mode: "read" | "rw", where: Where, args: string, blocked: boolean]> = [];
const both = (where: Where, args: string, blocked: boolean) => ROWS.push(["rw", where, args, blocked], ["read", where, args, blocked]);

for (const sub of ["push", "pull", "merge", "rebase", "reset", "clean -n", "stash", "stash push", "stash pop", "checkout -b x", "switch -c x", "restore a.txt"]) {
	both("guarded", sub, true);
}
both("sub", "reset --hard", true);
both("guarded", "commit --amend --no-edit", true);
both("guarded", "commit --am --no-edit", true);
both("guarded", "-C G reset --hard", true);
both("other", "-C G reset --hard", true);
both("other", "-C G checkout -b x", true);
both("other", "--git-dir=G/.git --work-tree=G stash", true);
both("other", "--git-dir G/.git checkout x", true);
both("guarded", "-c core.pager=cat stash", true);
both("guarded", "-c user.name=x -C . checkout -b x", true);
both("guarded", "--no-pager stash", true);
both("guarded", "-C O stash", false);
both("guarded", "-C O checkout -b x", false);
both("other", "checkout -b x", false);
both("other", "stash", false);
both("other", "reset --hard", false);
both("other", "commit --amend --no-edit", false);
both("other", "-C O reset --hard", false);
both("guarded", "status", false);
both("guarded", "diff", false);
both("guarded", "log --oneline", false);
both("sub", "status", false);
both("guarded", "stash create", true);
both("guarded", "rev-parse HEAD", false);
both("guarded", "-C G status", false);
both("guarded", "-c core.k=v status", false);
both("guarded", "--version", false);
// rw may commit and add; read may not
ROWS.push(["rw", "guarded", "add a.txt", false], ["read", "guarded", "add a.txt", true]);
ROWS.push(["rw", "guarded", "commit --allow-empty -qm x", false], ["read", "guarded", "commit --allow-empty -qm x", true]);
ROWS.push(["read", "other", "add a.txt", false], ["read", "other", "commit --allow-empty -qm x", false]);

for (const [mode, where, args, blocked] of ROWS) {
	test(`git guard (${mode}, in ${where}): git ${args} is ${blocked ? "refused" : "allowed"}`, () => {
		const { guarded, other, env } = world(mode);
		const cwd = where === "guarded" ? guarded : where === "sub" ? join(guarded, "sub") : other;
		const argv = args.split(" ").map((word) => word.replace(/^G(?=$|\/)/, guarded).replace(/(?<==)G(?=$|\/)/, guarded).replace(/^O$/, other));
		const run = spawnSync(GUARD, argv, { cwd, env, encoding: "utf8" });
		if (blocked) {
			assert.equal(run.status, 1, run.stderr);
			assert.match(run.stderr, MESSAGE);
		} else {
			assert.equal(run.status, 0, run.stderr);
			assert.doesNotMatch(run.stderr, MESSAGE);
		}
	});
}

test("git guard: refuses to run without PI_SCOUT_REAL_GIT", () => {
	const { guarded, env } = world("rw");
	delete env.PI_SCOUT_REAL_GIT;
	const run = spawnSync(GUARD, ["status"], { cwd: guarded, env, encoding: "utf8" });
	assert.equal(run.status, 1);
	assert.match(run.stderr, /PI_SCOUT_REAL_GIT/);
});

test("git guard: refuses to run itself when PI_SCOUT_REAL_GIT is the guard", () => {
	const { guarded, env } = world("rw");
	env.PI_SCOUT_REAL_GIT = GUARD;
	const run = spawnSync(GUARD, ["status"], { cwd: guarded, env, encoding: "utf8", timeout: 5_000 });
	assert.equal(run.status, 1);
	assert.match(run.stderr, /refusing to run itself/);
});

test("git guard: passes everything through when the scout is outside a repo (PI_SCOUT_GIT_DIR empty)", () => {
	const { guarded, env } = world("rw");
	env.PI_SCOUT_GIT_DIR = "";
	const run = spawnSync(GUARD, ["stash"], { cwd: guarded, env, encoding: "utf8" });
	assert.equal(run.status, 0, run.stderr);
});

test("git guard: passes arguments through intact, empty ones included", () => {
	const { guarded, env } = world("rw");
	const run = spawnSync(GUARD, ["log", "--format=%s", "-n", "1"], { cwd: guarded, env, encoding: "utf8" });
	assert.equal(run.stdout, "init\n");
});

// Spellings the sensors' token scan could not see: the guard sits on PATH, so they all land in it.
const SPELLINGS = [
	"sh -c 'git stash'",
	"g=git; $g stash",
	"$(echo git) stash",
	`python3 -c "import subprocess,sys; sys.exit(subprocess.run(['git','stash']).returncode)"`,
	"env git -C . reset --hard",
	"cd sub && git checkout -b x",
];
for (const command of SPELLINGS) {
	test(`git guard on PATH: ${command}`, () => {
		const { guarded, env } = world("rw");
		env.PATH = `${GUARD_DIR}${delimiter}${process.env.PATH}`;
		const run = spawnSync("bash", ["-c", command], { cwd: guarded, env, encoding: "utf8" });
		assert.notEqual(run.status, 0);
		assert.match(run.stderr, MESSAGE);
	});
}
