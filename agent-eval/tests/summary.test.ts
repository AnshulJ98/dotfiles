// Run: node --test 'agent-eval/tests/*.test.ts'
// Pure aggregation: no files, no processes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../summarize.ts";
import { baselineCells, type BaselineCell, type RoleCells, type CellSummary, compare, gate, parseRecords, summarize, type TrialRecord } from "../lib/summary.ts";

const rec = (task: string, model: string, trial: number, pass: boolean, over: Partial<TrialRecord> = {}): TrialRecord => ({
	task, role: "worker", model, thinking: "low", trial, pass, seconds: 10, cost: 0.5, leak: false, infra: false, ...over,
});
/** Records for one cell: tasks -> pass flags per trial. */
const grid = (model: string, tasks: Record<string, boolean[]>, over: Partial<TrialRecord> = {}): TrialRecord[] =>
	Object.entries(tasks).flatMap(([task, passes]) => passes.map((p, i) => rec(task, model, i + 1, p, over)));
test("parseRecords: skips and counts malformed lines, keeps unknown extra fields out", () => {
	const good = JSON.stringify({ task: "a", role: "worker", model: "p/m", thinking: "low", trial: 1, pass: true, cost: 0.1, seconds: 3, extra: 1 });
	const text = [good, "", "not json", "[1]", JSON.stringify({ task: "a" }), JSON.stringify({ task: "a", role: "r", model: "m", thinking: "t", trial: "1", pass: true }), good].join("\n");
	const { records, malformed } = parseRecords(text);
	assert.equal(records.length, 2);
	assert.equal(malformed, 4);
	assert.deepEqual(records[0], { task: "a", role: "worker", model: "p/m", thinking: "low", trial: 1, pass: true, seconds: 3, cost: 0.1, leak: false, infra: false });
});
test("summarize: pass rate, any/all, flaky, means, leak and infra counts", () => {
	const records = [
		...grid("p/m", { a: [true, true, true], b: [true, false, true], c: [false, false, false] }),
		rec("a", "p/m", 4, true, { leak: true, cost: 9, seconds: 99 }),
		rec("c", "p/m", 4, false, { infra: true }),
	];
	const [{ cells: [c] }] = summarize(records);
	assert.ok(Math.abs(c.passRate - 5 / 9) < 1e-12);
	const { passRate, ...rest } = c;
	assert.deepEqual(rest, { role: "worker", cell: "p/m:low", trials: 11, counted: 9, passes: 5, tasks: 3, tasksAny: 2, tasksAll: 1, flaky: ["b"], meanCost: 0.5, meanSeconds: 10, leaks: 1, infra: 1 });
});
test("summarize: groups by role and cell, saturated = every cell passes every counted trial", () => {
	const records = [
		...grid("p/x", { a: [true, true], b: [true, false], c: [true, true] }),
		...grid("p/y", { a: [true, true], b: [true, true], c: [false, true] }),
		...grid("p/x", { r1: [true], r2: [false] }, { role: "review" }),
		rec("a", "p/x", 3, false, { infra: true }),
	];
	const roles = summarize(records);
	assert.deepEqual(roles.map((r) => r.role), ["review", "worker"]);
	assert.deepEqual(roles[0].saturated, ["r1"]);
	assert.deepEqual(roles[1].saturated, ["a"]);
	assert.deepEqual(roles[1].cells.map((c) => c.cell), ["p/x:low", "p/y:low"]);
	assert.equal(roles[1].cells[0].infra, 1);
	const [{ cells: [idle], saturated }] = summarize([rec("a", "p/m", 1, false, { infra: true })]);
	assert.deepEqual([idle.counted, idle.passRate, idle.tasks, idle.meanCost, saturated, summarize([])], [0, 0, 0, 0, [], []]);
});
test("compare: table", () => {
	const ten = (fails: number, flaky: number): CellSummary => {
		const tasks: Record<string, boolean[]> = {};
		for (let i = 0; i < 10; i++) tasks[`t${i}`] = i < flaky ? [true, false] : i < flaky + fails ? [false, false] : [true, true];
		return summarize(grid("p/m", tasks))[0].cells[0];
	};
	const table: [string, CellSummary, CellSummary, "no difference" | number][] = [
		["identical", ten(0, 0), ten(0, 0), "no difference"],
		["one task apart, no flaky", ten(0, 0), ten(1, 0), 0.1],
		["one task apart, one flaky", ten(0, 1), ten(1, 1), "no difference"],
		["gap within the larger flaky count", ten(0, 2), ten(2, 0), "no difference"],
		["gap beyond flaky count, signed", ten(3, 0), ten(0, 1), -0.25],
	];
	for (const [name, a, b, want] of table) {
		const got = compare(a, b);
		if (typeof want === "number") assert.ok(typeof got === "number" && Math.abs(got - want) < 1e-9, `${name}: ${got}`);
		else assert.equal(got, want, name);
	}
});
test("gate: table", () => {
	const cell = (passRate: number, flaky: number, tasks = 10): BaselineCell => ({ passRate, tasks, flaky });
	const table: [string, BaselineCell, BaselineCell, boolean][] = [
		["same", cell(0.8, 0), cell(0.8, 0), false],
		["better", cell(0.8, 0), cell(0.9, 0), false],
		["one task lower, no flaky", cell(0.8, 0), cell(0.7, 0), true],
		["one task lower, one flaky", cell(0.8, 1), cell(0.7, 0), false],
		["flaky on the run's side counts", cell(0.8, 0), cell(0.7, 1), false],
		["two tasks lower, one flaky", cell(0.8, 1), cell(0.6, 1), true],
	];
	for (const [name, baseline, current, fail] of table) {
		const [row] = gate({ worker: { c: baseline } }, { worker: { c: current } });
		assert.equal(row.fail, fail, name);
	}
	const rows = gate(
		{ worker: { a: cell(1, 0), b: cell(1, 0) }, review: { b: cell(1, 0) }, scout: { b: cell(1, 0) } },
		{ worker: { b: cell(0, 0), z: cell(0, 0) }, review: { b: cell(1, 0) } },
	);
	assert.deepEqual(rows.map((r) => [r.role, r.cell, r.fail]), [["review", "b", false], ["worker", "b", true]]);
});
test("baselineCells keys by role then cell; one cell under two roles keeps both", () => {
	const ok = baselineCells(summarize(grid("p/m", { a: [true, false], b: [true, true] })));
	assert.deepEqual(ok, { worker: { "p/m:low": { passRate: 0.75, tasks: 2, flaky: 1 } } });
	const both: RoleCells = baselineCells(summarize([...grid("p/m", { a: [true, true] }), ...grid("p/m", { a: [true, false], b: [false] }, { role: "review" })]));
	assert.deepEqual(Object.keys(both), ["worker", "review"].sort());
	assert.equal(both.review["p/m:low"].flaky, 1);
	assert.equal(both.worker["p/m:low"].passRate, 1);
	assert.deepEqual(gate(both, both).map((r) => [r.role, r.fail]), [["review", false], ["worker", false]]);
});
test("render: tables per role, saturated, comparisons, malformed note", () => {
	const text = render(summarize([...grid("p/x", { a: [true, true], b: [true, false] }), ...grid("p/y", { a: [true, true], b: [false, false] }), ...grid("p/z", { a: [true] }, { role: "review" })]), 2);
	assert.match(text, /^## review$/m);
	assert.match(text, /^## worker$/m);
	assert.match(text, /\| p\/x:low \| 75\.0% \(3\/4\) \| 2\/2 \| 1\/2 \| 1 \(b\) \| 0\.5000 \| 10 \| 0 \| 0 \|/);
	assert.match(text, /Saturated \(1\): a/);
	assert.match(text, /- p\/x:low vs p\/y:low: no difference/);
	assert.match(text, /skipped 2 malformed line/);
	assert.equal(render([]).trim(), "no records");
});
