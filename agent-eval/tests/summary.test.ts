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
	// Baseline pairs absent from the run are failing rows marked missing; run-only pairs (worker z) are not gated.
	assert.deepEqual(rows.map((r) => [r.role, r.cell, r.fail, r.missing]), [
		["review", "b", false, false], ["scout", "b", true, true], ["worker", "a", true, true], ["worker", "b", true, false],
	]);
});
test("gate: a dropped role or dropped cells fail as missing rows instead of passing", () => {
	const cell: BaselineCell = { passRate: 1, tasks: 1, flaky: 0 };
	const rows = gate({ worker: { a: cell, b: cell }, review: { a: cell } }, { worker: { a: cell } });
	assert.deepEqual(rows.map((r) => [r.role, r.cell, r.missing, r.fail]), [["review", "a", true, true], ["worker", "a", false, false], ["worker", "b", true, true]]);
	assert.equal(rows[0].current, undefined);
});
test("gate: recall on one side only fails, in either direction, naming the side", () => {
	const plain: BaselineCell = { passRate: 0, tasks: 1, flaky: 0 };
	const withRecall: BaselineCell = { ...plain, recall: 0.8, defects: 5, flakyDefects: 0 };
	const [lost] = gate({ review: { c: withRecall } }, { review: { c: plain } });
	assert.deepEqual([lost.fail, lost.oneSided, lost.missing], [true, "baseline", false]);
	const [gained] = gate({ review: { c: plain } }, { review: { c: withRecall } });
	assert.deepEqual([gained.fail, gained.oneSided], [true, "run"]);
	// Records without found/of (of 0) produce no recall, so a baseline with recall cannot be satisfied by them.
	const noRecall = baselineCells(summarize([rec("r1", "p/m", 1, false, { role: "review", found: 0, of: 0 })]));
	assert.equal("recall" in noRecall.review["p/m:low"], false);
	assert.equal(gate({ review: { "p/m:low": withRecall } }, noRecall)[0].oneSided, "baseline");
	const [both] = gate({ review: { c: withRecall } }, { review: { c: withRecall } });
	assert.deepEqual([both.fail, both.oneSided], [false, undefined]);
});
test("gate: a cell with fewer counted tasks than the baseline fails, even at a full pass rate or with no tasks at all", () => {
	const cell = (passRate: number, tasks: number, flaky = 0): BaselineCell => ({ passRate, tasks, flaky });
	const table: [string, BaselineCell, BaselineCell, boolean][] = [
		["all infra: no counted task", cell(0.8, 4), cell(0, 0), true],
		["a smaller subset at 100%", cell(0.9, 10), cell(1, 5), true],
		["a smaller subset with flaky slack", cell(0.9, 10, 3), cell(1, 9, 3), true],
		["the same tasks", cell(0.9, 10), cell(0.9, 10), false],
		["more tasks than the baseline", cell(0.9, 10), cell(0.9, 12), false],
	];
	for (const [name, baseline, current, fail] of table) {
		const [row] = gate({ worker: { c: baseline } }, { worker: { c: current } });
		assert.equal(row.fail, fail, name);
		assert.equal(row.short, current.tasks < baseline.tasks, name);
	}
	const allInfra = baselineCells(summarize([rec("a", "p/m", 1, true, { infra: true })]));
	assert.equal(allInfra.worker["p/m:low"].tasks, 0);
	assert.equal(gate({ worker: { "p/m:low": cell(1, 3) } }, allInfra)[0].fail, true);
});
test("gate: the drop is taken in the baseline's tasks, not the run's", () => {
	const cell = (passRate: number, tasks: number, flaky: number): BaselineCell => ({ passRate, tasks, flaky });
	// 1.0 -> 0.8 over a run of 8 tasks would be 1.6 tasks (fail against one flaky); over the baseline's 4 it is 0.8.
	const [row] = gate({ worker: { c: cell(1, 4, 1) } }, { worker: { c: cell(0.8, 8, 0) } });
	assert.ok(Math.abs(row.drop - 0.8) < 1e-9, String(row.drop));
	assert.equal(row.fail, false);
});
test("gate: no pairs in common gives only missing rows; role and cell names are own keys only", () => {
	const cell: BaselineCell = { passRate: 1, tasks: 1, flaky: 0 };
	const allMissing = (rows: ReturnType<typeof gate>) => rows.length > 0 && rows.every((r) => r.missing && r.fail);
	assert.ok(allMissing(gate({ worker: { a: cell } }, { review: { a: cell } })));
	assert.ok(allMissing(gate({ worker: { a: cell } }, { worker: { b: cell } })));
	// JSON.parse makes "__proto__" and "constructor" ordinary keys; `in` would match "constructor" on any object.
	const parsed = (text: string): RoleCells => JSON.parse(text);
	assert.ok(allMissing(gate(parsed('{"constructor":{"a":{"passRate":1,"tasks":1,"flaky":0}}}'), { worker: { a: cell } })));
	assert.ok(allMissing(gate(parsed('{"worker":{"constructor":{"passRate":1,"tasks":1,"flaky":0}}}'), { worker: { a: cell } })));
	const records = [rec("a", "p/m", 1, true, { role: "__proto__" }), rec("a", "p/m", 1, false, { role: "worker" })];
	const cells = baselineCells(summarize(records));
	assert.deepEqual(Object.keys(cells).sort(), ["__proto__", "worker"]);
	assert.equal(cells.worker["p/m:low"].passRate, 0);
	const viaJson = parsed(JSON.stringify(cells));
	assert.deepEqual(gate(viaJson, viaJson).map((r) => [r.role, r.fail]), [["__proto__", false], ["worker", false]]);
	const worse = parsed('{"__proto__":{"p/m:low":{"passRate":0,"tasks":1,"flaky":0}}}');
	assert.deepEqual(gate(viaJson, worse).map((r) => [r.role, r.fail]), [["__proto__", true], ["worker", true]]);
	assert.deepEqual(gate(viaJson, worse).map((r) => [r.role, r.missing]), [["__proto__", false], ["worker", true]]);
});
test("review cells carry summed found and of, and the gate compares defect recall with a flaky allowance in defects", () => {
	const review = (found: number[], over: Partial<TrialRecord> = {}): TrialRecord[] =>
		found.map((f, i) => rec("r1", "p/m", i + 1, f === 5, { role: "review", found: f, of: 5, ...over }));
	const cellOf = (records: TrialRecord[]) => summarize(records)[0].cells[0];
	const steady = cellOf([...review([5, 5, 5]), ...review([0], { leak: true }).map((r) => ({ ...r, trial: 9 }))]);
	assert.deepEqual([steady.found, steady.of, steady.flakyDefects], [15, 15, 0]);
	const wobbly = cellOf(review([5, 3, 5]));
	assert.deepEqual([wobbly.found, wobbly.of, wobbly.flakyDefects, wobbly.flaky], [13, 15, 2, ["r1"]]);
	assert.equal("found" in summarize(grid("p/m", { a: [true] }))[0].cells[0], false);
	const base = baselineCells([summarize(review([5, 5, 5]))[0]]);
	assert.deepEqual(base.review["p/m:low"], { passRate: 1, tasks: 1, flaky: 0, recall: 1, defects: 5, flakyDefects: 0 });
	// Review is one task, so its pass rate can never fall by more than the flaky allowance; recall can: 5 -> 4 defects, every trial.
	const table: [string, number[], boolean][] = [
		["same recall", [5, 5, 5], false],
		["one defect missed every trial", [4, 4, 4], true],
		["one defect missed in one trial, which makes it flaky", [5, 4, 5], false],
		["three missed every trial", [2, 2, 2], true],
	];
	for (const [name, found, fail] of table) {
		const [row] = gate(base, baselineCells([summarize(review(found))[0]]));
		assert.equal(row.unit, "defect", name);
		assert.equal(row.fail, fail, name + ": drop " + row.drop + " allowed " + row.allowed);
	}
	// A baseline without recall (written before recall) against a run with it is one-sided: it fails, whatever the pass rates say.
	const [old] = gate({ review: { "p/m:low": { passRate: 1, tasks: 1, flaky: 0 } } }, baselineCells([summarize(review([5, 5, 5]))[0]]));
	assert.deepEqual([old.unit, old.oneSided, old.fail], ["task", "run", true]);
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
test("render: only the review table has a recall column, 80.0% (8/10) with flaky defects when non-zero", () => {
	const review = (found: number[], over: Partial<TrialRecord> = {}): TrialRecord[] =>
		found.map((f, i) => rec("r1", "p/m", i + 1, f === 5, { role: "review", found: f, of: 5, ...over }));
	const text = render(summarize([...review([5, 3]), ...review([4, 4], { model: "p/n" }), ...grid("p/x", { a: [true] })]));
	assert.match(text, /\| cell \| pass rate \| any \| all \| flaky \| recall \| mean \$ \| mean s \| leak \| infra \|\n\|(---\|){10}\n/);
	assert.match(text, /\| p\/m:low \| 50\.0% \(1\/2\) \| 1\/1 \| 0\/1 \| 1 \(r1\) \| 80\.0% \(8\/10\), 2 flaky \| 0\.5000 \|/);
	assert.match(text, /\| p\/n:low \| 0\.0% \(0\/2\) \| 0\/1 \| 0\/1 \| 0 \| 80\.0% \(8\/10\) \| 0\.5000 \|/);
	// worker table unchanged, and a review cell without counts shows "-"
	assert.match(text, /\| cell \| pass rate \| any \| all \| flaky \| mean \$ \| mean s \| leak \| infra \|\n\|(---\|){9}\n\| p\/x:low \| 100\.0% \(1\/1\) \| 1\/1 \| 1\/1 \| 0 \| 0\.5000 \|/);
	assert.match(render(summarize(grid("p/z", { a: [true] }, { role: "review" }))), /\| 0 \| - \| 0\.5000 \|/);
});
