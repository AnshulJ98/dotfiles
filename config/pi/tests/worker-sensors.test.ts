// Run: node --test 'config/pi/tests/*.test.ts'
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import workerSensors, {
	addedLines,
	classifyFailure,
	depsChanged,
	forbiddenBash,
	isAllowed,
	nextStep,
	parseSpec,
	repoRelative,
	testWeakening,
} from "../extensions/worker-sensors.ts";

const spec = (extra: string, tests = "npm test") => `---\nfiles-allowed: [src/**]\ntests: ${tests}\n${extra}---\nbody\n`;

const CLOUD: Array<[string, string[], boolean]> = [
	["npx cdk deploy MyStack", [], true],
	["cdk --profile dev destroy MyStack --force", [], true],
	["cd infra && pnpm cdk bootstrap", [], true],
	["cdk synth", [], false],
	["cdk diff MyStack", [], false],
	["aws lambda invoke --function-name f out.json", [], true],
	["aws --region us-east-1 s3api put-object --bucket b --key k", [], true],
	["aws ecs update-service --cluster c --service s", [], true],
	["aws ec2 terminate-instances --instance-ids i-1", [], true],
	["aws cloudformation deploy --template-file t.yml", [], true],
	["aws sts get-caller-identity", [], false],
	["aws logs describe-log-groups", [], false],
	["cdk deploy MyStack-dev --require-approval never", ["cdk deploy MyStack-dev"], false],
	["npx cdk deploy MyStack-dev", ["cdk deploy MyStack-dev"], false],
	["cdk deploy MyStack-prod", ["cdk deploy MyStack-dev"], true],
	["cdk deploy MyStack-dev2", ["cdk deploy MyStack-dev"], true],
	["cdk deploy MyStack-dev && aws lambda invoke --function-name f o", ["cdk deploy MyStack-dev"], true],
	["git push", ["git push"], false], // git is guarded by bin/guard/git; see tests/git-guard.test.ts
];

// The git rows below are not blocked here: bin/guard/git owns them (tests/git-guard.test.ts).
const LOCAL: Array<[string, boolean]> = [
	["git status", false],
	["git diff --stat", false],
	["git -C repo reset --hard", false],
	["git -c core.pager=cat stash", false],
	["git commit -m wip", false],
	["git commit --amend --no-edit", false],
	["/usr/bin/git checkout main", false],
	["sh -c 'git push origin main'", false],
	["rm file.txt", false],
	["rm -rf build", true],
	["rm --recursive dist", true],
	["find . -name '*.tmp' -delete", true],
	["find . -name '*.ts'", false],
	["npm install", false],
	["npm ci", false],
	["npm install lodash", true],
	["pnpm add -D vitest", true],
	["yarn upgrade", true],
	["npx tsc --noEmit", false],
	["npx -y cowsay hi", true],
	["bunx something", true],
	["npm test && npm run lint", false],
];
for (const [command, blocked] of LOCAL) {
	test(`forbiddenBash: ${command}`, () => assert.equal(forbiddenBash(command) !== undefined, blocked));
}

for (const [command, allowed, blocked] of CLOUD) {
	test(`forbiddenBash: ${command}${allowed.length ? ` (allowed: ${allowed.join(", ")})` : ""}`, () => {
		assert.equal(forbiddenBash(command, allowed) !== undefined, blocked);
	});
}

test("parseSpec: allowed-commands as a block list", () => {
	const parsed = parseSpec(spec("allowed-commands:\n  - cdk deploy MyStack-dev\n  - aws lambda invoke --function-name smoke\n"));
	assert.notEqual(typeof parsed, "string");
	if (typeof parsed !== "string") assert.deepEqual(parsed.allowedCommands, ["cdk deploy MyStack-dev", "aws lambda invoke --function-name smoke"]);
});

test("parseSpec: allowed-commands defaults to none", () => {
	const parsed = parseSpec(spec(""));
	assert.notEqual(typeof parsed, "string");
	if (typeof parsed !== "string") assert.deepEqual(parsed.allowedCommands, []);
});

const TEMP_TESTS: Array<[string, boolean]> = [
	["bash /tmp/check.sh", false],
	["node /private/tmp/x/run.mjs", false],
	["sh $TMPDIR/t.sh", false],
	["/var/folders/vj/T/run.sh", false],
	["npm test", true],
	["bash scripts/check.sh", true],
	["node --test 'config/pi/tests/*.test.ts'", true],
];
const ADDED: Array<[string, string, string, number]> = [
	["unchanged", "a\nb\n", "a\nb\n", 0],
	["appended", "a\n", "a\nb\nc\n", 2],
	["one line changed", "a\nb\nc\n", "a\nB\nc\n", 1],
	["lines deleted", "a\nb\nc\n", "a\n", 0],
	["repeated line added again", "x\n", "x\nx\n", 1],
	["emptied then rewritten", "", "a\nb\n", 2],
	["binary", "a\n", "a\n\0\n", 0],
];
for (const [name, before, after, want] of ADDED) {
	test(`addedLines: ${name}`, () => assert.equal(addedLines(before, after), want));
}

const ALLOWED: Array<[string, string[], boolean]> = [
	["src/a.ts", ["src/**"], true],
	["src/deep/b.ts", ["src/**"], true],
	["test/a.ts", ["src/**"], false],
	["README.md", ["README.md"], true],
	["./README.md", ["README.md"], true],
	["../outside.ts", ["**"], false],
	["/etc/passwd", ["**"], false],
	["", ["**"], false],
];
for (const [path, globs, want] of ALLOWED) {
	test(`isAllowed: '${path}' in ${globs.join(",")}`, () => assert.equal(isAllowed(path, globs), want));
}

const RELATIVE: Array<[string, string]> = [
	["src/a.ts", "pkg/src/a.ts"],
	["@src/a.ts", "pkg/src/a.ts"],
	["/repo/top.md", "top.md"],
	["~/notes.md", "../home/notes.md"],
	["../../elsewhere", "../elsewhere"],
];
for (const [input, want] of RELATIVE) {
	test(`repoRelative: ${input}`, () => assert.equal(repoRelative(input, "/repo/pkg", "/repo", "/home"), want));
}

const WEAKENED: Array<[string, string | undefined, string | undefined, boolean]> = [
	["test added", "test('a', () => {})", "test('a', () => {})\ntest('b', () => {})", false],
	["test removed", "test('a', () => {})\ntest('b', () => {})", "test('a', () => {})", true],
	["assertion removed", "test('a', () => { assert.ok(x); assert.ok(y) })", "test('a', () => { assert.ok(x) })", true],
	["skip added", "test('a', () => {})", "test.skip('a', () => {})", true],
	["only added", "it('a', () => {})", "it.only('a', () => {})", true],
	["new test file", undefined, "test('a', () => {})", false],
	["test file deleted", "test('a', () => {})", undefined, true],
];
for (const [name, before, after, weakened] of WEAKENED) {
	test(`testWeakening: ${name}`, () => assert.equal(testWeakening(before, after) !== undefined, weakened));
}

test("depsChanged: added, removed and re-versioned dependencies, sorted", () => {
	const before = JSON.stringify({ dependencies: { a: "1", b: "1" }, devDependencies: { c: "1" } });
	const after = JSON.stringify({ dependencies: { a: "2" }, devDependencies: { c: "1", d: "1" }, scripts: { x: "y" } });
	assert.deepEqual(depsChanged(before, after), ["dependencies.a", "dependencies.b", "devDependencies.d"]);
});

test("depsChanged: scripts-only edits and unparsable files", () => {
	const deps = JSON.stringify({ dependencies: { a: "1" } });
	assert.deepEqual(depsChanged(deps, JSON.stringify({ dependencies: { a: "1" }, scripts: { t: "x" } })), []);
	assert.deepEqual(depsChanged(deps, "{"), ["package.json does not parse"]);
	assert.deepEqual(depsChanged(undefined, deps), ["dependencies.a"]);
});

const FAILURES: Array<[string, number | null, string, boolean, "fail" | "cannot-run"]> = [
	["assertion failure", 1, "AssertionError", false, "fail"],
	["timeout", null, "", true, "cannot-run"],
	["not executable", 126, "", false, "cannot-run"],
	["command not found", 127, "", false, "cannot-run"],
	["skipped (77)", 77, "", false, "cannot-run"],
	["network down", 1, "Error: connect ECONNREFUSED 127.0.0.1:5432", false, "cannot-run"],
];
for (const [name, code, output, timedOut, want] of FAILURES) {
	test(`classifyFailure: ${name}`, () => assert.equal(classifyFailure(code, output, timedOut), want));
}

test("nextStep: pass, one retry, then fail; cannot-run never retries", () => {
	const fail = { kind: "fail" as const, reason: "x" };
	const cannot = { kind: "cannot-run" as const, reason: "y" };
	assert.equal(nextStep([], 0), "pass");
	assert.equal(nextStep([fail], 0), "retry");
	assert.equal(nextStep([fail], 1), "fail");
	assert.equal(nextStep([fail, cannot], 0), "cannot-run");
});

for (const [tests, ok] of TEMP_TESTS) {
	test(`parseSpec: tests '${tests}' ${ok ? "accepted" : "refused"}`, () => {
		assert.equal(typeof parseSpec(spec("", tests)) !== "string", ok);
	});
}

test("sensors arm in a repo with intent-to-add entries, and the entry's existing lines are not blamed", async () => {
	const repo = mkdtempSync(join(tmpdir(), "ws-repo-"));
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
	git("init", "-q");
	writeFileSync(join(repo, "tracked.md"), "a\n");
	git("add", ".");
	git("commit", "-qm", "init");
	writeFileSync(join(repo, "new.md"), "one\n");
	git("add", "-N", "new.md");
	const specFile = join(mkdtempSync(join(tmpdir(), "ws-spec-")), "spec.md");
	writeFileSync(specFile, "---\nfiles-allowed: [\"**\"]\ntests: \"true\"\nmax-lines: 1\n---\nbody\n");

	const handlers = new Map<string, (event: unknown) => Promise<unknown>>();
	const pi = { on: (name: string, handler: (event: unknown) => Promise<unknown>) => handlers.set(name, handler) };
	const cwd = process.cwd();
	process.env.PI_WORKER_SPEC = specFile;
	process.chdir(repo);
	try {
		workerSensors(pi as unknown as Parameters<typeof workerSensors>[0]);
		assert.equal(await handlers.get("tool_call")?.({ toolName: "bash", input: { command: "true" } }), undefined);
		appendFileSync(join(repo, "new.md"), "two\n");
		assert.equal(await handlers.get("agent_before_settle")?.({ outcome: "completed" }), undefined);
		assert.match(execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }), /^ A new\.md$/m);
	} finally {
		process.chdir(cwd);
		delete process.env.PI_WORKER_SPEC;
	}
});

test("settle check: lines added to a file that was already untracked count toward max-lines", async () => {
	const repo = mkdtempSync(join(tmpdir(), "ws-repo-"));
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
	git("init", "-q");
	writeFileSync(join(repo, "tracked.md"), "a\n");
	git("add", ".");
	git("commit", "-qm", "init");
	writeFileSync(join(repo, "notes.md"), "one\ntwo\n");
	const specFile = join(mkdtempSync(join(tmpdir(), "ws-spec-")), "spec.md");
	writeFileSync(specFile, "---\nfiles-allowed: [\"**\"]\ntests: \"true\"\nmax-lines: 2\n---\nbody\n");

	const handlers = new Map<string, (event: unknown) => Promise<unknown>>();
	const pi = { on: (name: string, handler: (event: unknown) => Promise<unknown>) => handlers.set(name, handler) };
	const cwd = process.cwd();
	process.env.PI_WORKER_SPEC = specFile;
	process.chdir(repo);
	try {
		workerSensors(pi as unknown as Parameters<typeof workerSensors>[0]);
		appendFileSync(join(repo, "notes.md"), "three\nfour\nfive\n");
		const settle = handlers.get("agent_before_settle");
		assert.ok(settle);
		const result = (await settle({ outcome: "completed" })) as { entries?: Array<{ content: string }> } | undefined;
		assert.match(result?.entries?.[0]?.content ?? "", /3 lines added, cap 2/);
	} finally {
		process.chdir(cwd);
		delete process.env.PI_WORKER_SPEC;
	}
});
