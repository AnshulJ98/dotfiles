// Run: node --test 'config/git/tests/*.test.ts'
// auto-guard through the template stubs, git-hooks-install and husky's init.sh. Real git, temp repos only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const TEMPLATE = join(ROOT, "config/git/template");
const INSTALLER = join(ROOT, "config/git/bin/git-hooks-install");
const INIT_SH = join(ROOT, "config/husky/init.sh");
const MARK = "# dotfiles-hook";
const REFUSED = /auto-guard: AUTO\.md is present \(an auto run is in progress\); \S+ refused/;

const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));
const emptyConfig = join(tmp("hooks-cfg-"), "gitconfig");
writeFileSync(emptyConfig, "");

const env = (): NodeJS.ProcessEnv => ({
	...process.env,
	GIT_CONFIG_GLOBAL: emptyConfig,
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_AUTHOR_NAME: "t",
	GIT_AUTHOR_EMAIL: "t@t",
	GIT_COMMITTER_NAME: "t",
	GIT_COMMITTER_EMAIL: "t@t",
	PATH: `${join(ROOT, "config/git/bin")}${delimiter}${process.env.PATH ?? ""}`,
});

function run(cwd: string, cmd: string, args: string[]) {
	const r = spawnSync(cmd, args, { cwd, env: env(), encoding: "utf8" });
	return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
const git = (cwd: string, ...args: string[]) => run(cwd, "git", ["-c", "init.defaultBranch=master", ...args]);
function mustGit(cwd: string, ...args: string[]) {
	const r = git(cwd, ...args);
	assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.err}`);
	return r;
}

let counter = 0;
/** A repo on master with one commit. withStubs: made from the template, so the stubs are installed. */
function makeRepo(withStubs = true): string {
	const repo = tmp("hooks-repo-");
	mustGit(repo, "init", "-q", ...(withStubs ? [`--template=${TEMPLATE}`] : []));
	writeFileSync(join(repo, "a.txt"), "a\n");
	mustGit(repo, "add", "a.txt");
	mustGit(repo, "commit", "-qm", "init");
	return repo;
}
function commit(repo: string) {
	writeFileSync(join(repo, "a.txt"), `change ${++counter}\n`);
	mustGit(repo, "add", "a.txt");
	return git(repo, "commit", "-qm", `c${counter}`);
}
const autoOn = (repo: string) => writeFileSync(join(repo, "AUTO.md"), "auto\n");
const hooksDir = (repo: string) => join(repo, ".git/hooks");
const isExec = (p: string) => (statSync(p).mode & 0o111) !== 0;

test("stubs are two lines, with the marked line second", () => {
	for (const hook of ["pre-commit", "pre-merge-commit", "pre-push"]) {
		const p = join(TEMPLATE, "hooks", hook);
		const lines = readFileSync(p, "utf8").trimEnd().split("\n");
		assert.equal(lines.length, 2);
		assert.equal(lines[0], "#!/bin/sh");
		assert.ok(lines[1].endsWith(MARK) && lines[1].includes(`auto-guard ${hook} "$@"`));
		assert.ok(isExec(p));
	}
});

test("guard through the stubs", async (t) => {
	await t.test("no AUTO.md: commit on master is allowed and silent", () => {
		const repo = makeRepo();
		const r = commit(repo);
		assert.equal(r.status, 0);
		assert.equal(r.err, "");
	});
	await t.test("AUTO.md: commit on master is refused", () => {
		const repo = makeRepo();
		autoOn(repo);
		const r = commit(repo);
		assert.equal(r.status, 1);
		assert.match(r.err, /auto-guard: AUTO\.md is present \(an auto run is in progress\); pre-commit refused on the default branch master/);
	});
	await t.test("AUTO.md: commit on slice/x is allowed", () => {
		const repo = makeRepo();
		mustGit(repo, "switch", "-q", "-c", "slice/x");
		autoOn(repo);
		const r = commit(repo);
		assert.equal(r.status, 0, r.err);
	});
	await t.test("AUTO.md: commit from a subdirectory on master is refused", () => {
		const repo = makeRepo();
		autoOn(repo);
		const sub = join(repo, "sub");
		mkdirSync(sub);
		writeFileSync(join(sub, "b.txt"), "b\n");
		mustGit(repo, "add", "sub/b.txt");
		assert.equal(git(sub, "commit", "-qm", "sub").status, 1);
	});
	await t.test("AUTO.md: merge --no-ff into master is refused, into auto/x allowed", () => {
		const repo = makeRepo();
		mustGit(repo, "switch", "-q", "-c", "slice/x");
		commit(repo);
		mustGit(repo, "switch", "-q", "master");
		autoOn(repo);
		const refused = git(repo, "merge", "--no-ff", "-m", "m", "slice/x");
		assert.equal(refused.status, 1);
		assert.match(refused.err, /pre-merge-commit refused on the default branch master/);
		mustGit(repo, "merge", "--abort");
		mustGit(repo, "switch", "-q", "-c", "auto/x");
		const allowed = git(repo, "merge", "--no-ff", "-m", "m", "slice/x");
		assert.equal(allowed.status, 0, allowed.err);
	});
	await t.test("AUTO.md: push from slice/x is refused; without AUTO.md it is allowed", () => {
		const repo = makeRepo();
		const remote = tmp("hooks-remote-");
		mustGit(remote, "init", "-q", "--bare");
		mustGit(repo, "remote", "add", "origin", remote);
		mustGit(repo, "switch", "-q", "-c", "slice/x");
		autoOn(repo);
		const refused = git(repo, "push", "-q", "origin", "slice/x");
		assert.equal(refused.status, 1);
		assert.match(refused.err, /pre-push refused on any branch/);
		run(repo, "rm", ["AUTO.md"]);
		const allowed = git(repo, "push", "-q", "origin", "slice/x");
		assert.equal(allowed.status, 0, allowed.err);
	});
	await t.test("clone of a bare repo with HEAD main: main refused, local master allowed", () => {
		const seed = makeRepo();
		mustGit(seed, "branch", "-m", "main");
		const bare = tmp("hooks-bare-");
		mustGit(bare, "clone", "-q", "--bare", seed, bare);
		mustGit(bare, "symbolic-ref", "HEAD", "refs/heads/main");
		const clone = join(tmp("hooks-clone-"), "c");
		mustGit(ROOT, "clone", "-q", `--template=${TEMPLATE}`, bare, clone);
		autoOn(clone);
		const refused = commit(clone);
		assert.equal(refused.status, 1);
		assert.match(refused.err, /refused on the default branch main/);
		mustGit(clone, "switch", "-q", "-c", "master");
		const allowed = commit(clone);
		assert.equal(allowed.status, 0, allowed.err);
	});
	await t.test("detached HEAD is allowed", () => {
		const repo = makeRepo();
		mustGit(repo, "checkout", "-q", "--detach");
		autoOn(repo);
		const r = commit(repo);
		assert.equal(r.status, 0, r.err);
	});
});

// What git-lfs writes: a sh shebang, a guard clause, the command, no exec.
const LFS = '#!/bin/sh\ncommand -v sh >/dev/null 2>&1 || { echo "missing git-lfs" >&2; exit 2; }\necho "lfs body ran"\n';

function install(repos: string[], ...flags: string[]) {
	return run(ROOT, INSTALLER, [...flags, ...repos]);
}
function writeHook(repo: string, name: string, text: string, mode = 0o755) {
	const p = join(hooksDir(repo), name);
	writeFileSync(p, text);
	chmodSync(p, mode);
	return p;
}
/** A repo without stubs, with the hooks dir emptied of git's .sample files. */
function bareHooksRepo(): string {
	const repo = makeRepo(false);
	for (const f of readdirSync(hooksDir(repo))) run(repo, "rm", [join(hooksDir(repo), f)]);
	return repo;
}

test("git-hooks-install", async (t) => {
	await t.test("no repo argument exits 2", () => {
		assert.equal(install([]).status, 2);
	});
	await t.test("a non-repo is reported and the rest continue", () => {
		const notRepo = tmp("hooks-none-");
		const repo = bareHooksRepo();
		const r = install([notRepo, repo]);
		assert.equal(r.status, 0);
		assert.match(r.out, new RegExp(`${notRepo}: not a git repo`));
		assert.match(r.out, new RegExp(`${repo}: installed pre-push`));
	});
	await t.test("an empty hooks dir gets every stub, executable", () => {
		const repo = bareHooksRepo();
		const r = install([repo]);
		assert.equal(r.status, 0, r.err);
		const stubs = readdirSync(join(TEMPLATE, "hooks"));
		assert.ok(stubs.length >= 3);
		for (const s of stubs) {
			assert.ok(isExec(join(hooksDir(repo), s)), s);
			assert.equal(readFileSync(join(hooksDir(repo), s), "utf8"), readFileSync(join(TEMPLATE, "hooks", s), "utf8"));
			assert.match(r.out, new RegExp(`${repo}: installed ${s}\\n`));
		}
	});
	await t.test("an LFS-style sh pre-push gets the line as line 2, idempotently, and its body still runs", () => {
		const repo = bareHooksRepo();
		const p = writeHook(repo, "pre-push", LFS);
		const r = install([repo]);
		assert.match(r.out, new RegExp(`${repo}: inserted into pre-push`));
		const lines = readFileSync(p, "utf8").split("\n");
		assert.equal(lines[0], "#!/bin/sh");
		assert.ok(lines[1].endsWith(MARK));
		assert.ok(isExec(p));
		const once = readFileSync(p);
		const again = install([repo]);
		assert.match(again.out, new RegExp(`${repo}: present pre-push`));
		assert.deepEqual(readFileSync(p), once);
		const body = run(repo, p, ["origin", "url"]);
		assert.equal(body.status, 0, body.err);
		assert.match(body.out, /lfs body ran/);
	});
	await t.test("a bash shebang through env gets the line", () => {
		const repo = bareHooksRepo();
		const p = writeHook(repo, "pre-commit", "#!/usr/bin/env bash\necho hi\n");
		install([repo]);
		const lines = readFileSync(p, "utf8").split("\n");
		assert.equal(lines[0], "#!/usr/bin/env bash");
		assert.ok(lines[1].endsWith(MARK));
		assert.equal(lines[2], "echo hi");
	});
	await t.test("a python hook is skipped, reported and unchanged", () => {
		const repo = bareHooksRepo();
		const text = "#!/usr/bin/env python3\nprint('x')\n";
		const p = writeHook(repo, "pre-merge-commit", text);
		const r = install([repo]);
		assert.match(r.out, new RegExp(`${repo}: skipped pre-merge-commit: not a sh/bash hook \\(#!/usr/bin/env python3\\)`));
		assert.equal(readFileSync(p, "utf8"), text);
	});
	await t.test("a core.hooksPath repo is skipped, reported, and nothing is written", () => {
		const repo = bareHooksRepo();
		mustGit(repo, "config", "core.hooksPath", ".husky/_");
		const r = install([repo]);
		assert.match(r.out, new RegExp(`${repo}: skipped: core.hooksPath=\\.husky/_; husky repos get the guard from ~/\\.config/husky/init\\.sh`));
		assert.deepEqual(readdirSync(hooksDir(repo)), []);
		assert.equal(existsSync(join(repo, ".husky")), false);
	});
	await t.test("--dry-run writes nothing and prefixes would:", () => {
		const repo = bareHooksRepo();
		const text = "#!/bin/sh\necho x\n";
		const p = writeHook(repo, "pre-push", text);
		const r = install([repo], "--dry-run");
		assert.equal(r.status, 0);
		assert.match(r.out, new RegExp(`would: ${repo}: installed pre-commit`));
		assert.match(r.out, new RegExp(`would: ${repo}: inserted into pre-push`));
		assert.deepEqual(readdirSync(hooksDir(repo)), ["pre-push"]);
		assert.equal(readFileSync(p, "utf8"), text);
	});
	await t.test("an inserted line guards a sh pre-commit: refused on master, body runs on slice/x", () => {
		const repo = bareHooksRepo();
		writeHook(repo, "pre-commit", '#!/bin/sh\necho "body ran"\n');
		install([repo]);
		autoOn(repo);
		const refused = commit(repo);
		assert.equal(refused.status, 1);
		assert.match(refused.err, REFUSED);
		assert.doesNotMatch(refused.out + refused.err, /body ran/);
		mustGit(repo, "switch", "-q", "-c", "slice/x");
		const allowed = commit(repo);
		assert.equal(allowed.status, 0, allowed.err);
		assert.match(allowed.out + allowed.err, /body ran/);
	});
});

test("husky init.sh", async (t) => {
	const source = (repo: string) => run(repo, "sh", ["-c", `n=pre-commit; . '${INIT_SH}'; echo after`]);
	await t.test("AUTO.md on master: exits 1 without reaching the rest", () => {
		const repo = makeRepo(false);
		autoOn(repo);
		const r = source(repo);
		assert.equal(r.status, 1);
		assert.doesNotMatch(r.out, /after/);
		assert.match(r.err, REFUSED);
	});
	await t.test("AUTO.md on slice/x: continues", () => {
		const repo = makeRepo(false);
		mustGit(repo, "switch", "-q", "-c", "slice/x");
		autoOn(repo);
		const r = source(repo);
		assert.equal(r.status, 0, r.err);
		assert.match(r.out, /after/);
	});
	await t.test("an unguarded hook name continues", () => {
		const repo = makeRepo(false);
		autoOn(repo);
		const r = run(repo, "sh", ["-c", `n=commit-msg; . '${INIT_SH}'; echo after`]);
		assert.equal(r.status, 0);
		assert.match(r.out, /after/);
	});
});
