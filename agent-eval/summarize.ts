// usage: node summarize.ts <run-dir|trials.jsonl>
// Prints, per role, a markdown table of cells, the saturated tasks, and pairwise comparisons of the cells.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type CellSummary, compare, parseRecords, type RoleSummary, summarize } from "./lib/summary.ts";

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

const gapText = (a: CellSummary, b: CellSummary): string => {
	const gap = compare(a, b);
	return gap === "no difference" ? gap : `${gap > 0 ? "+" : "-"}${(Math.abs(gap) * 100).toFixed(1)} pts`;
};

export function render(roles: RoleSummary[], malformed = 0): string {
	const out: string[] = [];
	if (roles.length === 0) out.push("no records");
	for (const { role, cells, saturated } of roles) {
		out.push(`## ${role}`, "", "| cell | pass rate | any | all | flaky | mean $ | mean s | leak | infra |", "|---|---|---|---|---|---|---|---|---|");
		for (const c of cells) {
			out.push(`| ${c.cell} | ${pct(c.passRate)} (${c.passes}/${c.counted}) | ${c.tasksAny}/${c.tasks} | ${c.tasksAll}/${c.tasks} | ${c.flaky.length}${c.flaky.length ? ` (${c.flaky.join(", ")})` : ""} | ${c.meanCost.toFixed(4)} | ${c.meanSeconds.toFixed(0)} | ${c.leaks} | ${c.infra} |`);
		}
		out.push("", `Saturated (${saturated.length}): ${saturated.join(", ") || "none"}`);
		if (cells.length > 1) {
			out.push("", "Comparisons:");
			cells.forEach((a, i) => cells.slice(i + 1).forEach((c) => out.push(`- ${a.cell} vs ${c.cell}: ${gapText(a, c)}`)));
		}
		out.push("");
	}
	if (malformed > 0) out.push(`skipped ${malformed} malformed line(s)`, "");
	return out.join("\n");
}

function main(): number {
	const arg = process.argv[2];
	if (process.argv.length !== 3 || !arg) return (console.error("usage: summarize.ts <run-dir|trials.jsonl>"), 2);
	const file = existsSync(arg) && statSync(arg).isDirectory() ? join(arg, "trials.jsonl") : arg;
	if (!existsSync(file)) return (console.error(`summarize.ts: no such file: ${file}`), 2);
	const { records, malformed } = parseRecords(readFileSync(file, "utf8"));
	process.stdout.write(render(summarize(records), malformed));
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
