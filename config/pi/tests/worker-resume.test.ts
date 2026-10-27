// Run: node --test 'config/pi/tests/*.test.ts'
// The two extensions a --rw worker loads together: a stalled stream is aborted, the run resumes exactly once, and the settle check still ends PASS.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import streamWatchdog from "../extensions/stream-watchdog.ts";
import workerSensors from "../extensions/worker-sensors.ts";

type Handler = (event: unknown, ctx: unknown) => unknown;

test("worker stalls, is aborted, resumes exactly once, and ends PASS", async () => {
	const repo = mkdtempSync(join(tmpdir(), "wr-repo-"));
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
	git("init", "-q");
	writeFileSync(join(repo, "tracked.md"), "a\n");
	git("add", ".");
	git("commit", "-qm", "init");
	const dir = mkdtempSync(join(tmpdir(), "wr-spec-"));
	const specFile = join(dir, "spec.md");
	const report = join(dir, "verdict.json");
	writeFileSync(specFile, '---\nfiles-allowed: ["**"]\ntests: "true"\n---\nbody\n');

	const handlers = new Map<string, Handler[]>();
	const sendUserMessage = test.mock.fn((_text: string) => {});
	const pi = {
		on: (name: string, handler: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
		getThinkingLevel: () => "high",
		sendUserMessage,
	};
	const fire = async (name: string, event: unknown, ctx: unknown = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};

	const saved = { cwd: process.cwd(), spec: process.env.PI_WORKER_SPEC, report: process.env.PI_WORKER_REPORT, stall: process.env.PI_STREAM_STALL_MS };
	process.env.PI_WORKER_SPEC = specFile;
	process.env.PI_WORKER_REPORT = report;
	process.env.PI_STREAM_STALL_MS = "20";
	process.chdir(repo);
	try {
		streamWatchdog(pi as never);
		workerSensors(pi as never);

		const abort = test.mock.fn(() => {});
		await fire("before_provider_request", {}, { hasUI: false, abort });
		await new Promise((done) => setTimeout(done, 80));
		assert.equal(abort.mock.callCount(), 1, "the silent stream was aborted once");
		assert.equal(sendUserMessage.mock.callCount(), 0, "no resume before the run settles");

		await fire("agent_settled", { aborted: true }, { hasUI: false });
		assert.equal(sendUserMessage.mock.callCount(), 1, "one resume after the abort");

		await fire("agent_before_settle", { outcome: "completed" });
		await fire("agent_settled", { aborted: false }, { hasUI: false });
		assert.equal(JSON.parse(readFileSync(report, "utf8")).verdict, "PASS");
		assert.equal(sendUserMessage.mock.callCount(), 1, "still one resume");
	} finally {
		process.chdir(saved.cwd);
		for (const [key, value] of [["PI_WORKER_SPEC", saved.spec], ["PI_WORKER_REPORT", saved.report], ["PI_STREAM_STALL_MS", saved.stall]] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});
