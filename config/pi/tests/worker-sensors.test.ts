// Run: node --test 'config/pi/tests/*.test.ts'
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
	ruleFailures,
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

test("parseSpec: interface-frozen is a glob list, empty by default", () => {
	const parsed = parseSpec(spec("interface-frozen: [src/api/*.ts, src/types.ts]\n"));
	assert.ok(typeof parsed !== "string");
	assert.deepEqual(parsed.interfaceFrozen, ["src/api/*.ts", "src/types.ts"]);
	const none = parseSpec(spec(""));
	assert.ok(typeof none !== "string");
	assert.deepEqual(none.interfaceFrozen, []);
	assert.equal(parseSpec(spec("interface-frozen: src/api.ts\n")), "spec interface-frozen must be a list of globs");
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

type Handler = (event: unknown) => Promise<unknown>;

/** Commit `files` in a temp repo, arm the sensors there with `frontmatter`, run `body`, restore cwd and env. */
async function withWorker(files: Record<string, string>, frontmatter: string, body: (repo: string, on: Map<string, Handler>, verdict: () => Promise<string>) => Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), "ws-repo-"));
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
	git("init", "-q");
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), text);
	}
	git("add", ".");
	git("commit", "-qm", "init");
	const dir = mkdtempSync(join(tmpdir(), "ws-spec-"));
	writeFileSync(join(dir, "spec.md"), `---\nfiles-allowed: ["**"]\ntests: "true"\n${frontmatter}---\nbody\n`);
	const handlers = new Map<string, Handler>();
	const pi = { on: (name: string, handler: Handler) => handlers.set(name, handler) };
	const verdict = async (): Promise<string> => {
		await handlers.get("agent_settled")?.({});
		return readFileSync(join(dir, "verdict.json"), "utf8");
	};
	const cwd = process.cwd();
	process.env.PI_WORKER_SPEC = join(dir, "spec.md");
	process.env.PI_WORKER_REPORT = join(dir, "verdict.json");
	process.chdir(repo);
	try {
		workerSensors(pi as unknown as Parameters<typeof workerSensors>[0]);
		await body(repo, handlers, verdict);
	} finally {
		process.chdir(cwd);
		delete process.env.PI_WORKER_SPEC;
		delete process.env.PI_WORKER_REPORT;
	}
}

const API = "export function area(w: number, h: number): number {\n  return w * h;\n}\n";
const settleContent = async (on: Map<string, Handler>): Promise<string | undefined> =>
	((await on.get("agent_before_settle")?.({ outcome: "completed" })) as { entries?: Array<{ content: string }> } | undefined)?.entries?.[0]?.content;

test("interface-frozen: a changed signature in a frozen file fails the settle check", async () => {
	await withWorker({ "src/api.ts": API }, "interface-frozen: [src/api.ts]\n", async (repo, on) => {
		writeFileSync(join(repo, "src/api.ts"), API.replace("h: number)", "h: number, d: number)"));
		const content = await settleContent(on);
		assert.match(content ?? "", /src\/api\.ts: frozen export headers changed \(\+ export function area\(w: number, h: number, d: number\): number \| - export function area\(w: number, h: number\): number\)/);
	});
});

test("interface-frozen: a body-only edit in a frozen file passes", async () => {
	await withWorker({ "src/api.ts": API }, "interface-frozen: [src/api.ts]\n", async (repo, on, verdict) => {
		writeFileSync(join(repo, "src/api.ts"), API.replace("w * h", "h * w"));
		assert.equal(await settleContent(on), undefined);
		assert.match(await verdict(), /"verdict":"PASS"/);
	});
});

test("interface-frozen: an export change in an unfrozen file passes", async () => {
	await withWorker({ "src/api.ts": API, "src/other.ts": API }, "interface-frozen: [src/api.ts]\n", async (repo, on, verdict) => {
		writeFileSync(join(repo, "src/other.ts"), API.replace("area(", "areaOf("));
		assert.equal(await settleContent(on), undefined);
		assert.match(await verdict(), /"verdict":"PASS"/);
	});
});

test("interface-frozen: a frozen file with an inferred return type blocks every edit", async () => {
	const files = { "src/api.ts": "export function area(w: number, h: number) {\n  return w * h;\n}\nexport const MAX = 3;\n" };
	await withWorker(files, "interface-frozen: [src/*.ts]\n", async (_repo, on) => {
		const blocked = (await on.get("tool_call")?.({ toolName: "edit", input: { path: "src/api.ts" } })) as { block: boolean; reason: string };
		assert.equal(blocked.block, true);
		assert.match(blocked.reason, /src\/api\.ts:1 exported function without a return type; src\/api\.ts:4 exported variable without a type annotation/);
	});
});

test("interface-frozen: a glob that matches no tracked file blocks every edit", async () => {
	await withWorker({ "src/api.ts": API }, "interface-frozen: [src/apu.ts]\n", async (_repo, on) => {
		const blocked = (await on.get("tool_call")?.({ toolName: "bash", input: { command: "true" } })) as { block: boolean; reason: string };
		assert.match(blocked.reason, /interface-frozen matches no tracked file: src\/apu\.ts/);
	});
});

test("settle check: a file the tests command leaves behind is the spec's fault, named as such, and not the worker's", async () => {
	await withWorker({ "src/a.ts": "export const a = 1;\n" }, 'files-allowed: [src/**]\ntests: "date > .last-run"\n', async (repo, on, verdict) => {
		writeFileSync(join(repo, "src/a.ts"), "export const a = 2;\n");
		await on.get("agent_before_settle")?.({ outcome: "completed" });
		const report = JSON.parse(await verdict()) as { verdict: string; reasons: string[] };
		assert.equal(report.verdict, "CANNOT-RUN");
		assert.deepEqual(report.reasons, ["tests: `date > .last-run` leaves untracked files behind (.last-run); ignore them or fix the command, then dispatch again"]);
	});
});

const hit = (ruleId: string, severity: string, file: string, line = 1) => ({ ruleId, severity, file, line, message: "" });
const RULE_CASES: Array<[string, ReturnType<typeof hit>[], string[], Record<string, number> | undefined, RegExp[]]> = [
	["error hit in a changed file", [hit("no-console", "error", "src/a.ts", 3)], ["src/a.ts"], undefined, [/error rules hit in changed files: src\/a\.ts:3 no-console$/]],
	["error hit in an untouched file", [hit("no-console", "error", "src/old.ts")], ["src/a.ts"], undefined, []],
	["warnings at the baseline", [hit("no-any", "warning", "a.ts"), hit("no-any", "warning", "b.ts")], [], { "no-any": 2 }, []],
	["warnings past the baseline", [hit("no-any", "warning", "a.ts"), hit("no-any", "warning", "b.ts")], [], { "no-any": 1 }, [/warning no-any: 2 hits, baseline 1/]],
	["a warning rule missing from the baseline counts from zero", [hit("new-rule", "warning", "a.ts")], [], {}, [/warning new-rule: 1 hits, baseline 0/]],
	["a rule named like an Object prototype key", [hit("constructor", "warning", "a.ts")], [], {}, [/warning constructor: 1 hits, baseline 0/]],
	["no baseline: warnings are advice", [hit("no-any", "warning", "a.ts")], ["a.ts"], undefined, []],
	["info and hint never fail", [hit("x", "info", "a.ts"), hit("y", "hint", "a.ts")], ["a.ts"], {}, []],
];

for (const [name, hits, changed, baseline, expected] of RULE_CASES) {
	test(`ruleFailures: ${name}`, () => {
		const reasons = ruleFailures(hits, new Set(changed), baseline);
		assert.equal(reasons.length, expected.length, reasons.join("\n"));
		expected.forEach((pattern, i) => assert.match(reasons[i], pattern));
	});
}

const RULE_REPO = {
	"sgconfig.yml": "ruleDirs: [rules]\n",
	"rules/no-console.yml": 'id: no-console\nlanguage: TypeScript\nseverity: error\nmessage: use the logger\nrule: {pattern: "console.log($$$)"}\n',
	"rules/no-any.yml": 'id: no-any\nlanguage: TypeScript\nseverity: warning\nrule: {pattern: "let $A: any = $V"}\n',
	".ast-grep-baseline.json": '{"no-any": 1}\n',
	"src/old.ts": "console.log(1);\nlet legacy: any = 1;\n",
	"src/other.ts": "export const n = 1;\n",
};

test("rules sensor: a new error-rule hit fails the settle check", async () => {
	await withWorker(RULE_REPO, "", async (repo, on) => {
		writeFileSync(join(repo, "src/new.ts"), "console.log(2);\n");
		assert.match((await settleContent(on)) ?? "", /ast-grep error rules hit in changed files: src\/new\.ts:1 no-console \(use the logger\)/);
	});
});

test("rules sensor: old violations in untouched files pass", async () => {
	await withWorker(RULE_REPO, "", async (repo, on, verdict) => {
		writeFileSync(join(repo, "src/other.ts"), "export const n = 2;\n");
		assert.equal(await settleContent(on), undefined);
		assert.match(await verdict(), /"verdict":"PASS"/);
	});
});

test("rules sensor: a warning past the snapshot's baseline fails, even when the worker raises the baseline", async () => {
	await withWorker(RULE_REPO, "", async (repo, on) => {
		writeFileSync(join(repo, "src/other.ts"), "let more: any = 2;\n");
		writeFileSync(join(repo, ".ast-grep-baseline.json"), '{"no-any": 2}\n');
		assert.match((await settleContent(on)) ?? "", /ast-grep warning no-any: 2 hits, baseline 1 in \.ast-grep-baseline\.json/);
	});
});

test("bash result: a change outside files-allowed gets a note naming it; one inside leaves the result alone", async () => {
	// A later frontmatter key wins, so this narrows withWorker's files-allowed.
	await withWorker({ "src/a.ts": "a\n", "docs/b.md": "b\n" }, "files-allowed: [\"src/**\"]\n", async (repo, handlers) => {
		const result = { toolName: "bash", toolCallId: "", content: [{ type: "text", text: "ok" }], structuredContent: { output: "ok" } };

		const inside = { toolName: "bash", toolCallId: "t1", input: { command: "sed -i" } };
		assert.equal(await handlers.get("tool_call")?.(inside), undefined);
		appendFileSync(join(repo, "src/a.ts"), "more\n");
		assert.equal(await handlers.get("tool_result")?.({ ...result, toolCallId: "t1" }), undefined);

		const outside = { toolName: "bash", toolCallId: "t2", input: { command: "python3 -" } };
		assert.equal(await handlers.get("tool_call")?.(outside), undefined);
		appendFileSync(join(repo, "docs/b.md"), "more\n");
		const noted = (await handlers.get("tool_result")?.({ ...result, toolCallId: "t2" })) as { content: Array<{ text: string }>; structuredContent: { output: string } };
		const note = "[worker-sensors] this command changed docs/b.md, outside files-allowed (src/**). Undo it now (git restore, or rm for a new file), or the run fails at settle.";
		assert.equal(noted.content.length, 2);
		assert.equal(noted.content[1].text.trim(), note);
		assert.equal(noted.structuredContent.output, `ok\n${note}\n`);

		// No matching snapshot: a no-op, not a throw.
		assert.equal(await handlers.get("tool_result")?.({ ...result, toolCallId: "unknown" }), undefined);
	});
});
