// Run: node --test 'config/pi/tests/*.test.ts'
// extensions/auto-run.ts: the pure parsers as tables, the refusals against real git in temp repos, and the handlers through a fake pi.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import autoRun, { dirtyDuringAuto, editRefusal, isStopped, nudge, openSlices, worktreeAddTarget, worktreeRefusal } from "../extensions/auto-run.ts";

const AUTO = "# spec\n- [ ] not a slice line\n\n- [x] 1. parse, branch slice/parse, decisions 1\n- [ ] 2. cache, branch slice/cache, decisions 2,3\n  * [ ] 3. ui, branch slice/ui, decisions 4\n";

function makeRepo(): string {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), "auto-run-")));
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
	git("init", "-q");
	mkdirSync(join(repo, "src"));
	mkdirSync(join(repo, ".git", "info"), { recursive: true });
	writeFileSync(join(repo, ".git", "info", "exclude"), "AUTO.md\n");
	writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
	git("add", ".");
	git("commit", "-qm", "init", "--no-verify");
	git("worktree", "add", "-q", `${repo}.slice-x`, "-b", "slice/x");
	return repo;
}

test("openSlices returns the unticked slice lines and nothing else", () => {
	assert.deepEqual(openSlices(AUTO), ["2. cache, branch slice/cache, decisions 2,3", "3. ui, branch slice/ui, decisions 4"]);
	assert.deepEqual(openSlices(AUTO.replaceAll("[ ]", "[x]")), []);
	assert.deepEqual(openSlices(""), []);
});

test("isStopped reads a stopped: line at the start of a line only", () => {
	assert.equal(isStopped(`${AUTO}stopped: tests failing on auto/x\n`), true);
	assert.equal(isStopped(AUTO), false);
	assert.equal(isStopped("the run is not stopped: carry on\n"), false);
});

const TARGETS: Array<[command: string, path: string | undefined, base?: string]> = [
	["git worktree add .worktrees/x", ".worktrees/x"],
	["git worktree add -b slice/x ../repo.x main", "../repo.x"],
	["git worktree add --detach -B y 'my path' HEAD", "my path"],
	["cd /r && git -C sub -c a.b=c worktree add wt", "wt", "sub"],
	["git worktree add --reason why --lock p", "p"],
	["git worktree list; git status", undefined],
	["git worktree remove x", undefined],
	["wt switch -c slice/x", undefined],
	["echo git worktree; echo add x", undefined],
];
for (const [command, path, base] of TARGETS) {
	test(`worktreeAddTarget: ${command}`, () => assert.deepEqual(worktreeAddTarget(command), path === undefined ? undefined : { path, base }));
}

test("a worktree inside the repo or one of its worktrees is refused; beside it, or outside any repo, is not", () => {
	const repo = makeRepo();
	const inside = (command: string, cwd = repo) => worktreeRefusal(command, cwd);
	assert.match(String(inside("git worktree add .worktrees/y")), /Blocked: \.worktrees\/y would put a worktree inside the repo.*wt switch -c <branch>/);
	assert.ok(inside("git worktree add ../src/wt", join(repo, "src")));
	assert.ok(inside(`git -C ${repo} worktree add nested`, tmpdir()));
	assert.ok(inside(`git worktree add ${repo}.slice-x/nested`));
	assert.equal(inside("git worktree add ../somewhere-else"), undefined);
	assert.equal(inside("git worktree add ../../up", join(repo, "src")), undefined);
	assert.equal(inside("git status"), undefined);
	assert.equal(worktreeRefusal("git worktree add x", realpathSync(mkdtempSync(join(tmpdir(), "no-repo-")))), undefined);
});

test("with AUTO.md, edits of repo code are refused in the checkout and its worktrees; AUTO.md and outside paths are not", () => {
	const repo = makeRepo();
	assert.equal(editRefusal("src/a.ts", repo), undefined, "no AUTO.md, no run");
	writeFileSync(join(repo, "AUTO.md"), AUTO);
	assert.match(String(editRefusal("src/a.ts", repo)), /Blocked: an auto run is in progress \(AUTO\.md\), and src\/a\.ts is repo code/);
	assert.ok(editRefusal("new/file.ts", repo));
	assert.ok(editRefusal(join(repo, "src", "a.ts"), tmpdir()) === undefined, "a session outside the repo is not this run's orchestrator");
	assert.ok(editRefusal(`${repo}.slice-x/src/a.ts`, repo), "a slice worktree is repo code too");
	assert.ok(editRefusal("../AUTO.md", join(repo, "src")) === undefined);
	assert.equal(editRefusal("AUTO.md", repo), undefined);
	assert.equal(editRefusal(join(tmpdir(), "scratch.md"), repo), undefined);
	assert.equal(editRefusal("~/.pi/agent/memory.md", repo), undefined);
});

test("dirtyDuringAuto names uncommitted changes only while a run is on", () => {
	const repo = makeRepo();
	writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
	assert.equal(dirtyDuringAuto(repo), "");
	writeFileSync(join(repo, "AUTO.md"), AUTO);
	assert.equal(dirtyDuringAuto(repo), " M src/a.ts");
});

test("nudge: unticked slices send the turn back; a stopped: line, a running scout, all ticked, or no AUTO.md do not", () => {
	const repo = makeRepo();
	assert.equal(nudge(repo, false), undefined);
	writeFileSync(join(repo, "AUTO.md"), AUTO);
	const sent = nudge(repo, false);
	assert.equal(sent?.open, 2);
	assert.match(String(sent?.content), /2 unticked slices; the next is: 2\. cache, branch slice\/cache/);
	assert.equal(nudge(repo, true), undefined);
	writeFileSync(join(repo, "AUTO.md"), `${AUTO}stopped: merge conflict\n`);
	assert.equal(nudge(repo, false), undefined);
	writeFileSync(join(repo, "AUTO.md"), AUTO.replaceAll("[ ]", "[x]"));
	assert.equal(nudge(repo, false), undefined);
});

type Handler = (event: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>;
function load(): Record<string, Handler> {
	const handlers: Record<string, Handler> = {};
	autoRun({ on: (name: string, handler: Handler) => (handlers[name] = handler) } as never);
	return handlers;
}

test("the handlers: block, report a dirty checkout once, and nudge twice per open count", async () => {
	const repo = makeRepo();
	const before = process.cwd();
	const agentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "auto-run-agent-"));
	process.chdir(repo);
	try {
		const on = load();
		const settle = () => on.agent_before_settle({ outcome: "completed" });
		const bash = () => on.tool_result({ toolName: "bash", content: [{ type: "text", text: "out" }], structuredContent: { output: "out", exit_code: 0 } });
		assert.equal(await on.tool_call({ toolName: "edit", input: { path: "src/a.ts" } }), undefined);
		assert.deepEqual(await on.tool_call({ toolName: "bash", input: { command: "git worktree add wt" } }), { block: true, reason: worktreeRefusal("git worktree add wt", repo) });
		assert.equal(await settle(), undefined);

		writeFileSync(join(repo, "AUTO.md"), AUTO);
		assert.equal((await on.tool_call({ toolName: "write", input: { path: "src/a.ts" } }))?.block, true);
		assert.equal(await on.tool_call({ toolName: "edit", input: { path: "AUTO.md" } }), undefined);
		assert.equal(await on.tool_call({ toolName: "read", input: { path: "src/a.ts" } }), undefined);

		assert.equal(await bash(), undefined, "clean checkout");
		writeFileSync(join(repo, "src", "a.ts"), "export const a = 3;\n");
		const dirty = await bash();
		assert.match(JSON.stringify(dirty?.content), /\[auto-run\] the checkout has uncommitted changes after this command:\\n M src\/a\.ts/);
		assert.match(String((dirty?.structuredContent as { output: string }).output), /^out\n\[auto-run\]/);
		assert.equal((dirty?.structuredContent as { exit_code: number }).exit_code, 0);
		assert.equal(await bash(), undefined, "the same dirt is reported once");
		assert.equal(await on.tool_result({ toolName: "read", content: [] }), undefined);

		assert.equal((await settle())?.continue, true);
		assert.equal((await settle())?.continue, true);
		assert.equal(await settle(), undefined, "two nudges without a new tick, then it may stop");
		writeFileSync(join(repo, "AUTO.md"), AUTO.replace("- [ ] 2.", "- [x] 2."));
		assert.equal((await settle())?.continue, true, "a tick is progress: the count starts again");
		assert.equal(await on.agent_before_settle({ outcome: "aborted" }), undefined);
		mkdirSync(join(String(process.env.PI_CODING_AGENT_DIR), "sessions", "scout", ".running"), { recursive: true });
		writeFileSync(join(String(process.env.PI_CODING_AGENT_DIR), "sessions", "scout", ".running", "1.meta"), "pid=1\n");
		assert.equal(await settle(), undefined, "a scout is still running");
	} finally {
		process.chdir(before);
		if (agentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = agentDir;
	}
});
