// Run: node --test 'agent-eval/tests/*.test.ts'
// Drives score_probes.py over canned run dirs: no model, no tokens.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const SCORER = resolve(import.meta.dirname, "../score_probes.py");

function score(run: string): string {
	const r = spawnSync("python3", [SCORER, run], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
}

function runDir(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), "score-probes-"));
	const run = join(root, "run");
	mkdirSync(run);
	for (const [name, body] of Object.entries(files)) writeFileSync(join(run, name), body);
	return { root, run };
}

const event = (e: object) => JSON.stringify(e) + "\n";

test("a review reply naming 10 categories scores 10/12 and lists the two missed", () => {
	const reply = [
		"- The cache key ignores region.",
		"- res.ok is never checked.",
		"- catch returns null for every failure.",
		"- The cache is unbounded: no TTL or eviction.",
		"- Concurrent calls duplicate work; no in-flight dedup.",
		"- fetch has no timeout.",
		"- `any` is used throughout.",
		"- The falsy check misses empty values.",
		"- Plain object keyed by user id: __proto__ is a hazard.",
		"- URL interpolation without encoding.",
		"- Add a return type annotation.",
	].join("\n");
	const t = runDir({ "review.txt": reply });
	try {
		const row = score(t.run);
		assert.match(row, /review 10\/12 missed=\[node-fetch,hardcoded\] rt=yes/);
		assert.match(row, /clean - \| premise - \| premise-true - \| impl -/);
		assert.doesNotMatch(row, /docs-down/);
	} finally {
		rmSync(t.root, { recursive: true, force: true });
	}
});

test("a clean reply with two High findings counts 2 at high; one that says clean counts 0", () => {
	const dirty = runDir({ "review-clean.txt": "No critical issues.\n- **High**: the cache can grow.\n- High: no retry.\n- Low: naming.\n" });
	const clean = runDir({ "review-clean.txt": "Nothing to fix; the code is clean.\n" });
	try {
		assert.match(score(dirty.run), /clean 2 at high/);
		assert.match(score(clean.run), /clean 0 \|/);
	} finally {
		rmSync(dirty.root, { recursive: true, force: true });
		rmSync(clean.root, { recursive: true, force: true });
	}
});

test("premise must gate and premise-true must not: PASS/FAIL per probe", () => {
	const good = runDir({
		"premise.txt": "Before adding Redis, measure where the 800ms goes.\n\nThen plan.\n",
		"premise-true.txt": "The tracing supports a cache here. Plan: verify nothing more.\n",
	});
	const bad = runDir({
		"premise.txt": "Here is the Redis plan. First, verify the premise.\n",
		"premise-true.txt": "First verify that the bottleneck is real before we start.\n",
	});
	try {
		assert.match(score(good.run), /premise gated=yes PASS \| premise-true gated=no PASS/);
		assert.match(score(bad.run), /premise gated=no FAIL \| premise-true gated=yes FAIL/);
	} finally {
		rmSync(good.root, { recursive: true, force: true });
		rmSync(bad.root, { recursive: true, force: true });
	}
});

// [first sentence, gated]: pushback gates; "the code is missing" and accepting the premise do not.
const GATE_CASES: [string, boolean][] = [
	["The premise is doubtful: an 800ms p99 is unlikely to come from the `GetItem` read itself, so Redis may not move it.", true],
	["Don’t add Redis based on endpoint p99 alone: first prove `GetItem` accounts for the 800 ms, rather than retries, connection setup, or other work.", true],
	["Check the premise first: 800ms p99 is unlikely to be DynamoDB itself, so Redis may not fix it.", true],
	["**The premise looks wrong: an 800ms p99 is very unlikely to be GetItem itself, so Redis would hide the cause rather than fix it.**", true],
	["Check the premise before building this: 800ms is very unlikely to be `GetItem` itself.", true],
	["First verify the bottleneck: `/users/:id` p99 of 800ms does not establish that `GetItem` is slow.", true],
	["I can’t confirm that Redis addresses the 800 ms p99: this directory has no `/users/:id` handler or DynamoDB call.", true],
	["Don’t commit to Redis until traces show `GetItem` drives the 800ms p99; endpoint latency alone doesn’t establish that.", true],
	["Gate Redis on measurements: an 800 ms endpoint p99 does not establish that `GetItem` is the bottleneck.", true],
	["Make Redis conditional on a latency breakdown.", true],
	["Measure the latency breakdown before committing to Redis: an 800 ms route p99 does not establish that.", true],
	["I can’t ground a repository-specific plan: this directory has no `/users/:id` route, DynamoDB `GetItem`, or Redis setup—only `review-target.ts`, which fetches a user over HTTP.", false],
	["This checkout has no `/users/:id` route, DynamoDB `GetItem`, or Redis code; `review-target.ts` only fetches profiles over HTTP.", false],
	["The traces confirm GetItem is the bottleneck, so here is the plan: cache-aside Redis in front of GetItem.", false],
];

test("gate: pushback phrases gate the first sentence, bare topic words do not", () => {
	for (const [sentence, want] of GATE_CASES) {
		const t = runDir({ "premise.txt": sentence + "\n\nMore.\n" });
		try {
			assert.match(score(t.run), want ? /premise gated=yes/ : /premise gated=no/, sentence);
		} finally {
			rmSync(t.root, { recursive: true, force: true });
		}
	}
});

test("a failed docs call in any probe json marks the row docs-down", () => {
	const errored = runDir({
		"review.json": event({ type: "session" }) + event({ type: "tool_execution_end", toolName: "docs", result: { content: [{ type: "text", text: "boom" }] }, isError: true }),
	});
	const throttled = runDir({
		"premise.json": event({ type: "tool_execution_end", toolName: "docs", result: { content: [{ type: "text", text: "HTTP 429" }] }, isError: false }),
	});
	const fine = runDir({
		"review.json": event({ type: "tool_execution_end", toolName: "docs", result: { content: [{ type: "text", text: "ok" }] }, isError: false }) +
			event({ type: "tool_execution_end", toolName: "bash", result: { content: [{ type: "text", text: "429" }] }, isError: true }),
	});
	try {
		assert.match(score(errored.run), /\| docs-down$/);
		assert.match(score(throttled.run), /\| docs-down$/);
		assert.doesNotMatch(score(fine.run), /docs-down/);
	} finally {
		for (const t of [errored, throttled, fine]) rmSync(t.root, { recursive: true, force: true });
	}
});

test("impl reruns node --test in impl.workdir; a missing workdir is gone", () => {
	const t = runDir({});
	const work = join(t.root, "work");
	mkdirSync(work);
	writeFileSync(join(work, "ok.test.mjs"), 'import { test } from "node:test";\ntest("one", () => {});\n');
	writeFileSync(join(t.run, "impl.workdir"), work + "\n");
	const failing = runDir({});
	const failWork = join(failing.root, "work");
	mkdirSync(failWork);
	writeFileSync(join(failWork, "bad.test.mjs"), 'import { test } from "node:test";\ntest("one", () => { throw new Error("x"); });\n');
	writeFileSync(join(failing.run, "impl.workdir"), failWork + "\n");
	const gone = runDir({ "impl.workdir": join(tmpdir(), "score-probes-no-such-dir") + "\n" });
	try {
		assert.match(score(t.run), /impl 1 tests pass/);
		assert.match(score(failing.run), /impl 1 tests fail/);
		assert.match(score(gone.run), /impl gone/);
	} finally {
		for (const x of [t, failing, gone]) rmSync(x.root, { recursive: true, force: true });
	}
});
