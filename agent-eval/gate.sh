#!/usr/bin/env bash
# Gate a steering-config change against a committed baseline.
# usage: gate.sh <run-dir|trials.jsonl> [--update] [--partial]
# Prints baseline vs this run per baseline role and cell and whether the steering config changed since the baseline
# commit. Exit 1 if a cell counted fewer tasks than the baseline, or is below baseline by more than its flaky count (the
# larger of the two; drop in baseline tasks, and for review cells defect recall, in defects), or has recall on only one
# side, or if a role/cell pair the baseline measured is absent from the run (MISSING); 2 if no baseline or no
# role/cell pair in common with it. --partial is for a deliberate subset run: MISSING pairs are printed as
# informational lines and do not fail the gate (one-sided recall still does). --update exits 2 while the steering paths have uncommitted changes (the recorded
# commit would not describe them).
# --update writes baseline.json (roles.<role>.<cell>) from the run and appends one line per role and cell to history.jsonl.
# Env: EVAL_BASELINE (default agent-eval/baseline.json), EVAL_HISTORY (default agent-eval/history.jsonl).
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
usage() { echo "usage: gate.sh <run-dir|trials.jsonl> [--update] [--partial]" >&2; exit 2; }

update=0 partial=0 target=""
for a in "$@"; do
  case "$a" in
    --update) update=1 ;;
    --partial) partial=1 ;;
    -*) usage ;;
    *) [ -z "$target" ] || usage; target="$a" ;;
  esac
done
[ -n "$target" ] || usage
if [ -d "$target" ]; then run_dir="$target"; trials="$target/trials.jsonl"; else run_dir="$(dirname "$target")"; trials="$target"; fi
[ -f "$trials" ] || { echo "gate.sh: no such file: $trials" >&2; exit 2; }

baseline="${EVAL_BASELINE:-$EVAL_DIR/baseline.json}"
history="${EVAL_HISTORY:-$EVAL_DIR/history.jsonl}"
if [ "$update" -eq 0 ] && [ ! -f "$baseline" ]; then
  echo "gate.sh: no baseline at $baseline; to record this run as the baseline: gate.sh $target --update" >&2
  exit 2
fi

STEERING=(config/pi/agents-md config/pi/extensions config/pi/prompts config/pi/settings.json agents/skills)
root="$(git -C "$EVAL_DIR" rev-parse --show-toplevel)"
config_sha="$(git -C "$root" log -1 --format=%H -- "${STEERING[@]}")"
if [ "$update" -eq 1 ] && [ -n "$(git -C "$root" status --porcelain -- "${STEERING[@]}")" ]; then
  echo "gate.sh: uncommitted changes under the steering paths; commit them before --update so the baseline commit describes them" >&2
  exit 2
fi

steering="unknown (no baseline)"
if [ -f "$baseline" ]; then
  base_sha="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).configSha ?? "")' "$baseline")"
  rc=0
  # The working tree against the baseline commit, so uncommitted edits count too.
  [ -n "$base_sha" ] && { git -C "$root" diff --quiet "$base_sha" -- "${STEERING[@]}" 2> /dev/null || rc=$?; } || rc=128
  case "$rc" in
    0) steering="steering config unchanged since baseline commit ${base_sha:0:12}" ;;
    1) steering="steering config changed since baseline commit ${base_sha:0:12}" ;;
    *) steering="steering config: baseline commit ${base_sha:-<none>} not found in this repo, cannot tell if it changed" ;;
  esac
fi

GATE_TRIALS="$trials" GATE_RUN="$(basename "$(cd "$run_dir" && pwd)")" GATE_BASELINE="$baseline" GATE_HISTORY="$history" \
GATE_UPDATE="$update" GATE_PARTIAL="$partial" GATE_LIB="$EVAL_DIR/lib/summary.ts" GATE_SHA="$config_sha" GATE_STEERING="$steering" \
  node --input-type=module - << 'JS'
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const lib = await import(pathToFileURL(process.env.GATE_LIB).href);
const e = process.env;
const { records } = lib.parseRecords(readFileSync(e.GATE_TRIALS, "utf8"));
const roles = lib.summarize(records);
const current = lib.baselineCells(roles);
if (e.GATE_UPDATE === "1") {
	const date = new Date().toISOString();
	writeFileSync(e.GATE_BASELINE, JSON.stringify({ configSha: e.GATE_SHA, date, roles: current }, null, "\t") + "\n");
	const lines = roles.flatMap((r) => r.cells.map((c) => JSON.stringify({ date, configSha: e.GATE_SHA, run: e.GATE_RUN, role: r.role, cell: c.cell, ...current[r.role][c.cell] }) + "\n"));
	appendFileSync(e.GATE_HISTORY, lines.join(""));
	console.log(`baseline updated: ${roles.reduce((n, r) => n + r.cells.length, 0)} role/cell pair(s) at config ${e.GATE_SHA.slice(0, 12) || "<none>"}`);
	process.exit(0);
}
const baseline = JSON.parse(readFileSync(e.GATE_BASELINE, "utf8"));
const rows = lib.gate(baseline.roles ?? {}, current);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const partial = e.GATE_PARTIAL === "1";
for (const r of rows) {
	if (r.missing) {
		// A pair missing from a --partial run is informational, not a failure.
		if (partial) r.fail = false;
		console.log(`${partial ? "skip" : "FAIL"} ${r.role} ${r.cell}: MISSING from this run, baseline measured it${partial ? " (--partial: not failing)" : ""}`);
		continue;
	}
	const [b, c] = [r.baseline, r.current];
	const side = r.oneSided ? `; recall in ${r.oneSided === "baseline" ? "the baseline only, not in this run" : "this run only, not in the baseline"}` : "";
	const shown = r.oneSided ? `${pct(b.passRate)} (flaky ${b.flaky}) -> now ${pct(c.passRate)} (flaky ${c.flaky})`
		: r.unit === "defect"
		? `recall ${pct(b.recall)} (flaky ${b.flakyDefects ?? 0}) -> now ${pct(c.recall)} (flaky ${c.flakyDefects ?? 0})`
		: `${pct(b.passRate)} (flaky ${b.flaky}) -> now ${pct(c.passRate)} (flaky ${c.flaky})`;
	const fewer = r.short ? `; counted ${c.tasks} task(s), baseline ${b.tasks}` : "";
	console.log(`${r.fail ? "FAIL" : "ok  "} ${r.role} ${r.cell}: baseline ${shown}, drop ${r.drop.toFixed(2)} ${r.unit}(s), allowed ${r.allowed}${fewer}${side}`);
}
if (rows.every((r) => r.missing)) {
	console.error("gate.sh: no role/cell pairs in common with the baseline; nothing was compared");
	process.exit(2);
}
console.log(e.GATE_STEERING);
const failed = rows.filter((r) => r.fail).length;
console.log(failed ? `gate: FAIL (${failed} role/cell pair(s) below baseline or missing)` : "gate: pass");
process.exit(failed ? 1 : 0);
JS
