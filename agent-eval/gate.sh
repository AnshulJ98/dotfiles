#!/usr/bin/env bash
# Gate a steering-config change against a committed baseline.
# usage: gate.sh <run-dir|trials.jsonl> [--update]
# Prints baseline vs this run per role and cell (only those in both) and whether the steering config changed since the baseline
# commit. Exit 1 if a cell is below baseline by more than its flaky-task count (the larger of the two); 2 if no baseline.
# --update writes baseline.json (roles.<role>.<cell>) from the run and appends one line per role and cell to history.jsonl.
# Env: EVAL_BASELINE (default agent-eval/baseline.json), EVAL_HISTORY (default agent-eval/history.jsonl).
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
usage() { echo "usage: gate.sh <run-dir|trials.jsonl> [--update]" >&2; exit 2; }

update=0 target=""
for a in "$@"; do
  case "$a" in
    --update) update=1 ;;
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
GATE_UPDATE="$update" GATE_LIB="$EVAL_DIR/lib/summary.ts" GATE_SHA="$config_sha" GATE_STEERING="$steering" \
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
for (const r of rows) {
	console.log(`${r.fail ? "FAIL" : "ok  "} ${r.role} ${r.cell}: baseline ${pct(r.baseline.passRate)} (flaky ${r.baseline.flaky}) -> now ${pct(r.current.passRate)} (flaky ${r.current.flaky}), drop ${r.drop.toFixed(2)} task(s), allowed ${r.allowed}`);
}
if (rows.length === 0) console.log("no role/cell pairs in common with the baseline");
console.log(e.GATE_STEERING);
const failed = rows.filter((r) => r.fail).length;
console.log(failed ? `gate: FAIL (${failed} role/cell pair(s) below baseline)` : "gate: pass");
process.exit(failed ? 1 : 0);
JS
