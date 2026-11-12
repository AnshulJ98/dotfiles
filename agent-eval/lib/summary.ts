// Pure aggregation over trial records (see trial.sh): per role and cell tables, comparisons and the gate.
// No file or process access here; summarize.ts and gate.sh read the files and call these.
export interface TrialRecord {
	task: string; role: string; model: string; thinking: string; trial: number;
	pass: boolean; seconds: number; cost: number; leak: boolean; infra: boolean;
}

export interface CellSummary {
	role: string;
	/** provider/model:thinking */
	cell: string;
	/** every record, including leak and infra ones */
	trials: number;
	/** records that are neither leak nor infra; the rest of the numbers are over these */
	counted: number;
	passes: number;
	passRate: number;
	/** tasks with at least one counted trial, then those passing any / all of their counted trials */
	tasks: number; tasksAny: number; tasksAll: number;
	/** tasks whose counted trials disagree */
	flaky: string[];
	meanCost: number; meanSeconds: number; leaks: number; infra: number;
}

export interface RoleSummary {
	role: string;
	cells: CellSummary[];
	/** tasks every cell in the role passed on every counted trial */
	saturated: string[];
}

export interface BaselineCell { passRate: number; tasks: number; flaky: number }

/** role -> cell -> numbers; one cell may appear under several roles. */
export type RoleCells = Record<string, Record<string, BaselineCell>>;

export interface GateRow {
	role: string; cell: string; baseline: BaselineCell; current: BaselineCell;
	/** pass-rate drop in tasks, and the allowed drop: the larger flaky-task count of the two sides */
	drop: number; allowed: number; fail: boolean;
}

const EPSILON = 1e-9;
export const cellOf = (r: { model: string; thinking: string }): string => `${r.model}:${r.thinking}`;

function asRecord(value: unknown): TrialRecord | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const v = value as Record<string, unknown>;
	const { task, role, model, thinking, trial, pass } = v;
	if (typeof task !== "string" || typeof role !== "string" || typeof model !== "string" || typeof thinking !== "string") return undefined;
	if (typeof trial !== "number" || typeof pass !== "boolean") return undefined;
	const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
	return { task, role, model, thinking, trial, pass, seconds: num(v.seconds), cost: num(v.cost), leak: v.leak === true, infra: v.infra === true };
}

/** Parse JSON lines; lines that are not JSON or lack the fields above are skipped and counted. */
export function parseRecords(text: string): { records: TrialRecord[]; malformed: number } {
	const parse = (line: string): TrialRecord | undefined => {
		try {
			return asRecord(JSON.parse(line));
		} catch {
			return undefined;
		}
	};
	const parsed = text.split("\n").filter((l) => l.trim() !== "").map(parse);
	const records = parsed.filter((r): r is TrialRecord => r !== undefined);
	return { records, malformed: parsed.length - records.length };
}

const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function summarizeCell(role: string, cell: string, records: TrialRecord[]): CellSummary {
	const counted = records.filter((r) => !r.leak && !r.infra);
	const byTask = new Map<string, boolean[]>();
	for (const r of counted) byTask.set(r.task, [...(byTask.get(r.task) ?? []), r.pass]);
	const outcomes = [...byTask.entries()].sort(([a], [b]) => a.localeCompare(b));
	const passes = counted.filter((r) => r.pass).length;
	return {
		role, cell, trials: records.length, counted: counted.length, passes,
		passRate: counted.length === 0 ? 0 : passes / counted.length,
		tasks: outcomes.length,
		tasksAny: outcomes.filter(([, p]) => p.some(Boolean)).length,
		tasksAll: outcomes.filter(([, p]) => p.every(Boolean)).length,
		flaky: outcomes.filter(([, p]) => p.some(Boolean) && !p.every(Boolean)).map(([task]) => task),
		meanCost: mean(counted.map((r) => r.cost)),
		meanSeconds: mean(counted.map((r) => r.seconds)),
		leaks: records.filter((r) => r.leak).length,
		infra: records.filter((r) => r.infra).length,
	};
}

/** One entry per role (sorted), each with its cells (sorted) and its saturated tasks. */
export function summarize(records: TrialRecord[]): RoleSummary[] {
	const roles = [...new Set(records.map((r) => r.role))].sort();
	return roles.map((role) => {
		const inRole = records.filter((r) => r.role === role);
		const cells = [...new Set(inRole.map(cellOf))].sort();
		const summaries = cells.map((cell) => summarizeCell(role, cell, inRole.filter((r) => cellOf(r) === cell)));
		const counted = inRole.filter((r) => !r.leak && !r.infra);
		const saturated = [...new Set(counted.map((r) => r.task))]
			.filter((task) => counted.filter((r) => r.task === task).every((r) => r.pass))
			.sort();
		return { role, cells: summaries, saturated };
	});
}

/** "no difference" when the gap, in tasks, is no larger than either cell's flaky-task count; else a.passRate - b.passRate. */
export function compare(a: CellSummary, b: CellSummary): "no difference" | number {
	const gap = a.passRate - b.passRate;
	const noise = Math.max(a.flaky.length, b.flaky.length);
	return Math.abs(gap) * Math.max(a.tasks, b.tasks) <= noise + EPSILON ? "no difference" : gap;
}

/** The gate's view of a run: role -> cell -> pass rate, tasks, flaky count. */
export function baselineCells(roles: RoleSummary[]): RoleCells {
	const out: RoleCells = {};
	for (const { role, cells } of roles) {
		out[role] = Object.fromEntries(cells.map((c) => [c.cell, { passRate: c.passRate, tasks: c.tasks, flaky: c.flaky.length }]));
	}
	return out;
}

/** Compare (role, cell) pairs present in both. One fails when its pass rate is below baseline by more than the flaky-task count (in tasks). */
export function gate(baseline: RoleCells, current: RoleCells): GateRow[] {
	return Object.keys(baseline)
		.sort()
		.filter((role) => role in current)
		.flatMap((role) =>
			Object.keys(baseline[role])
				.sort()
				.filter((cell) => cell in current[role])
				.map((cell): GateRow => {
					const [b, c] = [baseline[role][cell], current[role][cell]];
					const [drop, allowed] = [(b.passRate - c.passRate) * c.tasks, Math.max(b.flaky, c.flaky)];
					return { role, cell, baseline: b, current: c, drop, allowed, fail: drop > allowed + EPSILON };
				}),
		);
}
