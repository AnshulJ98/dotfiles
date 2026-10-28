// Run: node --test 'config/pi/tests/*.test.ts'
// Cases are the ask_user calls github-copilot/gpt-6-luna sent on 2026-10-28.
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeAskArgs } from "../extensions/ask-user-args.ts";

const redis = { title: "Redis" };
const memory = { title: "In-memory" };
const backend = { question: "Which cache backend?", options: [redis, memory] };
const ttl = { question: "Which TTL?", options: [{ title: "60s" }, { title: "5min" }] };

const cases: { name: string; input: Record<string, unknown>; want: Record<string, unknown> }[] = [
	{
		name: "batch: empty top-level fields and booleans are dropped",
		input: { question: "Cache settings", context: "", options: [], allowMultiple: false, allowFreeform: false, displayMode: "overlay", questions: [backend, ttl] },
		want: { question: "Cache settings", displayMode: "overlay", questions: [backend, ttl] },
	},
	{
		name: "batch: a real top-level context stays so pi-ask-user can reject it",
		input: { context: "No config found.", questions: [backend, ttl] },
		want: { context: "No config found.", questions: [backend, ttl] },
	},
	{
		name: "one question padded with a blank entry becomes a single question",
		input: { question: "Redis or in-memory cache?", context: "", options: [], questions: [{ ...backend, context: "Pick one." }, { question: "", options: [] }] },
		want: { question: "Which cache backend?", context: "Pick one.", options: [redis, memory] },
	},
	{
		name: "one question repeated (case and spacing aside) becomes a single question",
		input: { question: "Redis or in-memory cache?", questions: [backend, { ...backend, question: " which cache BACKEND? " }] },
		want: { question: "Which cache backend?", options: [redis, memory] },
	},
	{
		name: "single question without questions is untouched",
		input: { question: "Redis?", options: [redis], allowFreeform: false },
		want: { question: "Redis?", options: [redis], allowFreeform: false },
	},
];

for (const { name, input, want } of cases) {
	test(name, () => {
		normalizeAskArgs(input);
		assert.deepEqual(input, want);
	});
}
