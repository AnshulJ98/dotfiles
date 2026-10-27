// Run: node --test 'config/git/tests/*.test.ts'
// worktree-setup through the template stubs and directly. Real git, temp repos only; real wt rows
// skip without it, the rest use fake npm/pnpm/yarn/wt scripts that log their call (no real install).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const TEMPLATE = join(ROOT, "config/git/template");
const INSTALLER = join(ROOT, "config/git/bin/git-hooks-install");
const WT_CONFIG = join(ROOT, "config/worktrunk/config.toml");
const MARK = "# dotfiles-hook";

const made: string[] = [];
const tmp = (prefix: string) => {
	const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	made.push(d);
	return d;
};
after(() => {
	for (const d of made) rmSync(d, { recursive: true, force: true });
});

const emptyConfig = join(tmp("wts-cfg-"), "gitconfig");
writeFileSync(emptyConfig, "");
const home = tmp("wts-home-");
const hasWt = spawnSync("wt", ["--version"]).status === 0;

/** Fake tools in a fresh dir; each appends `$0 $*` to $FAKE_LOG and exits 1 when FAKE_FAIL is set. */
function fakes(tools: string[]) {
	const dir = tmp("wts-fake-");
	const log = join(dir, "calls.log");
	writeFileSync(log, "");
	for (const t of tools) {
		const body =
			t === "wt"
				? 'case "$*" in *"--format json"*) printf "%s\\n" "${FAKE_WT_JSON:-[]}" ;; *) echo "would remove /x/y" ;; esac\nexit 0\n'
				: '[ -n "${FAKE_FAIL:-}" ] && exit 1\nexit 0\n';
		writeFileSync(join(dir, t), `#!/bin/sh\necho "$0 $*" >> "${log}"\n${body}`);
		chmodSync(join(dir, t), 0o755);
	}
	return { dir, calls: () => readFileSync(log, "utf8").split("\n").filter(Boolean) };
}
const PM = ["npm", "pnpm", "yarn", "bun"];

/** A PATH dir of wrappers for just the tools worktree-setup and git need: no npm, no wt. */
function minimalBin(): string {
	const dir = tmp("wts-bin-");
	for (const tool of ["git", "sh", "bash", "env", "cmp", "cat", "mkdir", "dirname", "grep"]) {
		const real = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
		writeFileSync(join(dir, tool), `#!/bin/sh\nexec "${real}" "$@"\n`);
		chmodSync(join(dir, tool), 0o755);
	}
	return dir;
}

function run(cwd: string, cmd: string, args: string[], opts: { path?: string; exact?: boolean; env?: Record<string, string> } = {}) {
	const r = spawnSync(cmd, args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			HOME: home,
			GIT_CONFIG_GLOBAL: emptyConfig,
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@t",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@t",
			WORKTRUNK_CONFIG_PATH: WT_CONFIG,
			...(opts.env ?? {}),
			PATH: [opts.path, join(ROOT, "config/git/bin"), opts.exact ? "" : (process.env.PATH ?? "")].filter(Boolean).join(delimiter),
		},
	});
	return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "", all: (r.stdout ?? "") + (r.stderr ?? "") };
}
type Opts = Parameters<typeof run>[3];
const git = (cwd: string, o: Opts, ...args: string[]) => run(cwd, "git", ["-c", "init.defaultBranch=master", ...args], o);
function mustGit(cwd: string, o: Opts, ...args: string[]) {
	const r = git(cwd, o, ...args);
	assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.err}`);
	return r;
}
const put = (root: string, rel: string, text: string, mode?: number) => {
	mkdirSync(dirname(join(root, rel)), { recursive: true });
	writeFileSync(join(root, rel), text);
	if (mode) chmodSync(join(root, rel), mode);
};
const isExec = (p: string) => (statSync(p).mode & 0o111) !== 0;

/** Main repo on master from the template: tracked package-lock.json, ignored .env, node_modules, dist. */
function makeMain(): string {
	const repo = join(tmp("wts-"), "main");
	mkdirSync(repo);
	mustGit(repo, {}, "init", "-q", `--template=${TEMPLATE}`);
	put(repo, ".gitignore", ".env*\n.envrc\n.npmrc\n*.pem\n*.key\nnode_modules/\ndist/\n");
	put(repo, "package-lock.json", "lock main\n");
	put(repo, "a.txt", "a\n");
	mustGit(repo, {}, "add", ".gitignore", "package-lock.json", "a.txt");
	mustGit(repo, {}, "commit", "-qm", "init");
	put(repo, ".env", "SECRET=1\n");
	put(repo, "node_modules/a/i.js", "i\n");
	put(repo, "dist/o.js", "o\n");
	return repo;
}
/** A branch that commits `file` with `text`, then back on master. */
function branchWith(repo: string, branch: string, file: string, text: string) {
	mustGit(repo, {}, "switch", "-qc", branch);
	put(repo, file, text);
	mustGit(repo, {}, "add", file);
	mustGit(repo, {}, "commit", "-qm", `${branch}: ${file}`);
	mustGit(repo, {}, "switch", "-q", "master");
}
const sibling = (repo: string, name: string) => join(dirname(repo), name);
const hasLine = (calls: string[], re: RegExp) => calls.filter((c) => re.test(c));

test("stubs are two lines, with the marked line second, and never fail the git command", () => {
	for (const hook of ["post-checkout", "post-merge"]) {
		const p = join(TEMPLATE, "hooks", hook);
		const lines = readFileSync(p, "utf8").trimEnd().split("\n");
		assert.equal(lines.length, 2);
		assert.equal(lines[0], "#!/bin/sh");
		assert.ok(lines[1].endsWith(MARK) && lines[1].includes(`worktree-setup hook ${hook} "$@"`));
		assert.ok(!lines[1].includes("exit") && isExec(p));
	}
});

test("setup of a new linked worktree", async (t) => {
	await t.test("git worktree add: ignored files reflinked in (not the excludes), npm not called, marker made", { skip: !hasWt }, () => {
		const f = fakes(PM);
		const o = { path: f.dir };
		const main = makeMain();
		const wt = sibling(main, "feat-tree");
		const r = git(main, o, "worktree", "add", "-q", "-b", "feat", wt);
		assert.equal(r.status, 0, r.err);
		assert.equal(readFileSync(join(wt, ".env"), "utf8"), "SECRET=1\n");
		assert.equal(readFileSync(join(wt, "node_modules/a/i.js"), "utf8"), "i\n");
		assert.ok(!existsSync(join(wt, "dist/o.js")));
		assert.deepEqual(f.calls(), []);
		const gd = mustGit(wt, o, "rev-parse", "--path-format=absolute", "--git-dir").out.trim();
		assert.ok(existsSync(join(gd, "worktree-setup.done")));

		// worktrunk's post-start fires too: the marker makes it silent.
		const again = run(wt, "worktree-setup", ["hook", "post-start"], o);
		assert.equal(again.status, 0);
		assert.equal(again.all, "");
		assert.deepEqual(f.calls(), []);
	});

	const locks: [string, string, string, RegExp][] = [
		["package-lock.json", "lock changed\n", "npm", /\/npm ci --prefer-offline$/],
		["pnpm-lock.yaml", "lockfileVersion: 9\n", "pnpm", /\/pnpm install --frozen-lockfile --prefer-offline$/],
	];
	for (const [file, text, tool, re] of locks) {
		await t.test(`${file} differs: ${tool} runs once`, () => {
			const f = fakes([...PM, "wt"]);
			const o = { path: f.dir };
			const main = makeMain();
			branchWith(main, "br", file, text);
			const wt = sibling(main, "br-tree");
			const r = git(main, o, "worktree", "add", "-q", wt, "br");
			assert.equal(r.status, 0, r.err);
			assert.equal(hasLine(f.calls(), re).length, 1, f.calls().join("\n"));
			assert.equal(hasLine(f.calls(), /\/(npm|pnpm|yarn|bun) /).length, 1);
			// the second trigger does not install again
			run(wt, "worktree-setup", ["hook", "post-start"], o);
			assert.equal(hasLine(f.calls(), /\/(npm|pnpm|yarn|bun) /).length, 1);
		});
	}

	const printed: [string, string][] = [
		["yarn.lock", "yarn install --frozen-lockfile"],
		["bun.lock", "bun install --frozen-lockfile"],
	];
	for (const [file, cmd] of printed) {
		await t.test(`${file} differs: no tool called, the command is printed`, () => {
			const f = fakes([...PM, "wt"]);
			const o = { path: f.dir };
			const main = makeMain();
			branchWith(main, "br", file, "x\n");
			const r = git(main, o, "worktree", "add", "-q", sibling(main, "br-tree"), "br");
			assert.equal(r.status, 0, r.err);
			assert.match(r.all, new RegExp(`worktree-setup: lockfile differs from main; run: ${cmd}\\n`));
			assert.deepEqual(hasLine(f.calls(), /\/(npm|pnpm|yarn|bun) /), []);
		});
	}

	await t.test("a failing install is reported and does not fail the checkout", () => {
		const f = fakes([...PM, "wt"]);
		const o = { path: f.dir, env: { FAKE_FAIL: "1" } };
		const main = makeMain();
		branchWith(main, "br", "package-lock.json", "lock changed\n");
		const wt = sibling(main, "br-tree");
		const r = git(main, o, "worktree", "add", "-q", wt, "br");
		assert.equal(r.status, 0, r.err);
		assert.match(r.all, new RegExp(`worktree-setup: npm ci --prefer-offline failed; run it by hand in ${wt}\\n`));
		assert.ok(existsSync(wt));
	});

	await t.test("a missing install tool is a failure line, not an error", () => {
		const f = fakes(["wt"]);
		const main = makeMain();
		branchWith(main, "br", "package-lock.json", "lock changed\n");
		const wt = sibling(main, "br-tree");
		const r = run(main, "git", ["worktree", "add", "-q", wt, "br"], { path: `${f.dir}${delimiter}${minimalBin()}`, exact: true });
		assert.equal(r.status, 0, r.err);
		assert.match(r.all, new RegExp(`worktree-setup: npm ci --prefer-offline failed; run it by hand in ${wt}\\n`));
		assert.ok(existsSync(wt));
	});

	await t.test("WT_NO_INSTALL=1 skips the install", () => {
		const f = fakes([...PM, "wt"]);
		const o = { path: f.dir, env: { WT_NO_INSTALL: "1" } };
		const main = makeMain();
		branchWith(main, "br", "package-lock.json", "lock changed\n");
		const r = git(main, o, "worktree", "add", "-q", sibling(main, "br-tree"), "br");
		assert.equal(r.status, 0, r.err);
		assert.deepEqual(hasLine(f.calls(), /\/(npm|pnpm|yarn|bun) /), []);
		assert.deepEqual(hasLine(f.calls(), /\/wt step copy-ignored/).length, 1);
	});

	await t.test("without wt the copy is skipped with a hint, the install still runs", () => {
		const f = fakes(PM);
		const main = makeMain();
		branchWith(main, "br", "package-lock.json", "lock changed\n");
		const r = run(main, "git", ["worktree", "add", "-q", sibling(main, "br-tree"), "br"], { path: `${f.dir}${delimiter}${minimalBin()}`, exact: true });
		assert.equal(r.status, 0, r.err);
		assert.match(r.all, /worktree-setup: wt not found; gitignored files not copied \(brew install worktrunk\)\n/);
		assert.equal(hasLine(f.calls(), /\/npm ci --prefer-offline$/).length, 1);
	});
});

test("no-ops are silent", async (t) => {
	await t.test("post-checkout on a branch switch in main", () => {
		const f = fakes([...PM, "wt"]);
		const main = makeMain();
		const r = git(main, { path: f.dir }, "switch", "-c", "other");
		assert.equal(r.status, 0, r.err);
		assert.equal(r.all.replace(/^Switched to a new branch 'other'\n/, ""), "");
		assert.deepEqual(f.calls().filter((c) => !/wt step prune/.test(c)), []);
	});
	await t.test("a clone: null ref, but in the main checkout", () => {
		const f = fakes([...PM, "wt"]);
		const main = makeMain();
		const dest = sibling(main, "clone");
		const r = git(main, { path: f.dir }, "clone", "-q", `--template=${TEMPLATE}`, main, dest);
		assert.equal(r.status, 0, r.err);
		assert.equal(r.all, "");
		assert.deepEqual(f.calls(), []);
	});
	await t.test("a non-null prev in a linked worktree acts on nothing", () => {
		const f = fakes([...PM, "wt"]);
		const main = makeMain();
		const wt = sibling(main, "w");
		mustGit(main, { path: f.dir }, "worktree", "add", "-q", "-b", "w", wt);
		const before = f.calls().length;
		const r = run(wt, "worktree-setup", ["hook", "post-checkout", "a".repeat(40), "b".repeat(40), "1"], { path: f.dir });
		assert.equal(r.all, "");
		assert.equal(f.calls().length, before);
	});
	await t.test("plain worktree-setup in main says so", () => {
		const f = fakes([...PM, "wt"]);
		const main = makeMain();
		const r = run(main, "worktree-setup", [], { path: f.dir });
		assert.equal(r.status, 0);
		assert.equal(r.out, "worktree-setup: not a linked worktree; nothing to do\n");
		assert.deepEqual(f.calls(), []);
	});
	await t.test("usage errors exit 2", () => {
		const main = makeMain();
		for (const args of [["bogus"], ["hook"], ["hook", "nope"], ["sync", "x"], ["hook", "post-checkout", "0"]]) {
			assert.equal(run(main, "worktree-setup", args).status, 2, args.join(" "));
		}
	});
});

test("sync", async (t) => {
	/** Main with env-type files; worktree A (stale .env) and B (all equal). */
	function setup() {
		const f = fakes([...PM, "wt"]);
		const o = { path: f.dir };
		const main = makeMain();
		put(main, ".env", "SECRET=new\n");
		put(main, ".env.local", "LOCAL=1\n");
		put(main, "sub/.envrc", "use flake\n");
		put(main, "certs/ca.pem", "PEM\n", 0o600);
		put(main, ".npmrc", "registry=x\n");
		put(main, "node_modules/x/.env", "NM=1\n");
		const a = sibling(main, "tree-a");
		const b = sibling(main, "tree-b");
		mustGit(main, o, "worktree", "add", "-q", "-b", "a", a);
		mustGit(main, o, "worktree", "add", "-q", "-b", "b", b);
		put(a, ".env", "SECRET=stale\n");
		for (const rel of [".env", ".env.local", "sub/.envrc", "certs/ca.pem", ".npmrc"]) {
			mkdirSync(dirname(join(b, rel)), { recursive: true });
			copyFileSync(join(main, rel), join(b, rel));
		}
		chmodSync(join(b, "certs/ca.pem"), 0o600);
		// a tracked-but-ignored file committed in main after A was made: A must not get it
		put(main, ".env.example", "EX=1\n");
		mustGit(main, o, "add", "-f", ".env.example");
		mustGit(main, o, "commit", "-qm", "example");
		return { o, main, a, b };
	}

	await t.test("from a worktree: main wins, replaced/added are printed, B is silent", () => {
		const { o, main, a, b } = setup();
		const r = run(a, "worktree-setup", ["sync"], o);
		assert.equal(r.status, 0, r.err);
		const lines = r.out.trim().split("\n").sort();
		const want = [".env.local", ".npmrc", "certs/ca.pem", "sub/.envrc"].map((f) => `${a}: added ${f}`);
		assert.deepEqual(lines, [...want, `${a}: replaced .env`].sort());
		assert.ok(!r.out.includes(b));
		assert.equal(readFileSync(join(a, ".env"), "utf8"), "SECRET=new\n");
		assert.equal(readFileSync(join(a, "certs/ca.pem"), "utf8"), "PEM\n");
		assert.equal(statSync(join(a, "certs/ca.pem")).mode & 0o777, 0o600);
		assert.ok(!existsSync(join(a, "node_modules/x/.env")));
		assert.ok(!existsSync(join(a, ".env.example")));
		assert.equal(readFileSync(join(main, ".env"), "utf8"), "SECRET=new\n");
	});
	await t.test("from main gives the same result, and a vanished worktree is skipped", () => {
		const { o, main, a, b } = setup();
		rmSync(b, { recursive: true, force: true });
		const r = run(main, "worktree-setup", ["sync"], o);
		assert.equal(r.status, 0, r.err);
		assert.match(r.out, new RegExp(`${a}: replaced .env\\n`));
		assert.ok(!r.out.includes(b));
		assert.ok(!existsSync(b));
	});
	await t.test("a file the target branch tracks is left alone", () => {
		const { o, main, a } = setup();
		put(a, ".npmrc", "registry=committed\n");
		mustGit(a, o, "add", "-f", ".npmrc");
		mustGit(a, o, "commit", "-qm", "track npmrc");
		put(a, ".npmrc", "registry=tracked\n");
		const r = run(main, "worktree-setup", ["sync"], o);
		assert.ok(!r.out.includes(".npmrc"));
		assert.equal(readFileSync(join(a, ".npmrc"), "utf8"), "registry=tracked\n");
	});
});

test("post-merge hint", async (t) => {
	const rows: [string, string, boolean][] = [
		["a worktree entry", '[\n  {\n    "kind": "worktree",\n    "path": "/x/y"\n  }\n]', true],
		["a compact worktree entry", '[{"kind":"worktree","path":"/x/y"}]', true],
		["only branch_only entries", '[{"kind": "branch_only", "branch": "z"}]', false],
		["nothing", "[]", false],
	];
	for (const [name, json, hint] of rows) {
		await t.test(`${name}: ${hint ? "prints the hint" : "silent"}`, () => {
			const f = fakes(["wt"]);
			const main = makeMain();
			const r = run(main, "worktree-setup", ["hook", "post-merge", "0"], { path: f.dir, env: { FAKE_WT_JSON: json } });
			assert.equal(r.status, 0);
			assert.equal(r.out, hint ? "worktree-setup: finished worktrees, remove with wt step prune:\nwould remove /x/y\n" : "");
		});
	}
	await t.test("a real merge in main fires the stub, through to wt", () => {
		const f = fakes(["wt"]);
		const o = { path: f.dir, env: { FAKE_WT_JSON: '[{"kind": "worktree", "path": "/x/y"}]' } };
		const main = makeMain();
		mustGit(main, o, "switch", "-qc", "side");
		put(main, "b.txt", "b\n");
		mustGit(main, o, "add", "b.txt");
		mustGit(main, o, "commit", "-qm", "b");
		mustGit(main, o, "switch", "-q", "master");
		const r = git(main, o, "merge", "--no-ff", "-qm", "merge side", "side");
		assert.equal(r.status, 0, r.err);
		assert.match(r.all, /worktree-setup: finished worktrees, remove with wt step prune:/);
	});
	await t.test("in a linked worktree nothing runs", () => {
		const f = fakes(["wt"]);
		const o = { path: f.dir, env: { FAKE_WT_JSON: '[{"kind": "worktree"}]' } };
		const main = makeMain();
		const wt = sibling(main, "w");
		mustGit(main, o, "worktree", "add", "-q", "-b", "w", wt);
		const before = f.calls().length;
		const r = run(wt, "worktree-setup", ["hook", "post-merge", "0"], o);
		assert.equal(r.all, "");
		assert.equal(f.calls().length, before);
	});
	await t.test("real wt: merging a just-made worktree's branch in main prints nothing (younger than 1d)", { skip: !hasWt }, () => {
		const f = fakes(PM);
		const o = { path: f.dir };
		const main = makeMain();
		const wt = sibling(main, "feat-tree");
		mustGit(main, o, "worktree", "add", "-q", "-b", "feat", wt);
		put(wt, "c.txt", "c\n");
		mustGit(wt, o, "add", "c.txt");
		mustGit(wt, o, "commit", "-qm", "c");
		const r = git(main, o, "merge", "--no-ff", "-qm", "merge feat", "feat");
		assert.equal(r.status, 0, r.err);
		assert.equal(r.all, "");
	});
});

test("git-hooks-install picks up the new stubs", () => {
	const repo = join(tmp("wts-inst-"), "repo");
	mkdirSync(repo);
	mustGit(repo, {}, "init", "-q");
	for (const f of readdirSync(join(repo, ".git/hooks"))) rmSync(join(repo, ".git/hooks", f));
	const r = run(ROOT, INSTALLER, [repo]);
	assert.equal(r.status, 0, r.err);
	for (const s of ["post-checkout", "post-merge"]) {
		assert.match(r.out, new RegExp(`${repo}: installed ${s}\\n`));
		assert.ok(isExec(join(repo, ".git/hooks", s)));
	}
});
