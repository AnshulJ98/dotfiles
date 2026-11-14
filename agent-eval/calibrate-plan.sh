#!/usr/bin/env bash
# Measure a plan task's executed-check floor (ticket only) and ceiling (gold plan), with no judges.
# usage: calibrate-plan.sh <task> [--runs N]   (default 3 per arm)
# EVAL_PLAN_WORKER: <provider/model>:<thinking> (default anthropic/claude-haiku-5-5:low);
# EVAL_SCOUT overrides scout for tests. Each run gets fix^ and its own isolated HOME, as in trial.sh.
# lib/record.ts agentInfra classifies rc, usage and digest: infra is reported, not counted, and retried once.
# A second infra attempt exits 1 without writing bench.json. Each attempt gets a fresh workspace and HOME.
# Writes counts to <task>/bench.json. Keeps specs, workspaces, homes and logs below the printed
# /tmp/agent-eval-calibrate.XXXXXX directory; EVAL_TEST_TIMEOUT applies to hidden tests.
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EVAL_DIR/lib/task.sh"
usage() { echo "usage: calibrate-plan.sh <task> [--runs N]" >&2; exit 2; }
[ $# -eq 1 ] || [ $# -eq 3 ] || usage
runs=3
if [ $# -eq 3 ]; then
  [ "$2" = --runs ] || usage
  runs="$3"
fi
case "$runs" in ''|*[!0-9]*|0*) usage ;; esac
task_dir="$(resolve_task "$1")" || { echo "calibrate-plan.sh: no such task: $1" >&2; exit 2; }
[ "$(task_get "$task_dir" role)" = plan ] || { echo "calibrate-plan.sh: needs a plan task" >&2; exit 2; }
[ -s "$task_dir/gold.md" ] || { echo "calibrate-plan.sh: missing gold.md" >&2; exit 2; }
[ -s "$task_dir/ticket.md" ] || { echo "calibrate-plan.sh: missing ticket.md" >&2; exit 2; }
worker="${EVAL_PLAN_WORKER:-anthropic/claude-haiku-5-5:low}"
case "$worker" in */*:?*) ;; *) echo "calibrate-plan.sh: EVAL_PLAN_WORKER must be <provider/model>:<thinking>" >&2; exit 2 ;; esac
export EVAL_REAL_HOME="${EVAL_REAL_HOME:-$HOME}"
dir="$(mktemp -d /tmp/agent-eval-calibrate.XXXXXX)"
echo "calibrate-plan.sh: kept $dir"
node "$EVAL_DIR/lib/plan-grade.ts" floor "$task_dir" "$dir/floor.md"
node "$EVAL_DIR/lib/plan-grade.ts" assemble "$task_dir/gold.md" "$dir/gold.md" || {
  echo "calibrate-plan.sh: gold.md has no spec block" >&2; exit 2;
}
floor=0 gold=0
for arm in floor gold; do
  for ((n=1; n<=runs; n++)); do
    for attempt in 1 2; do
      run="$dir/$arm-$n-$attempt"
      ws="$run/ws" home="$run/home"
      start="$(date +%s)"
      make_workspace "$task_dir" "$ws" base
      scout="${EVAL_SCOUT:-$home/.pi/agent/bin/scout}"
      rc=0
      (cd "$ws" && "$EVAL_DIR/lib/isolate.sh" "$home" "$scout" --rw --model "${worker%:*}" --thinking "${worker##*:}" --spec - \
        < "$dir/$arm.md" > "$run/digest.txt" 2> "$run/stderr.txt") || rc=$?
      infra="$(node "$EVAL_DIR/lib/record.ts" --agent-infra --rc "$rc" \
        --sessions-dir "$home/.pi/agent/sessions" --digest-file "$run/digest.txt")"
      [ "$infra" = true ] || break
      echo "$arm $n/$runs infra $(( $(date +%s) - start ))s (attempt $attempt)"
      if [ "$attempt" -eq 2 ]; then
        echo "calibrate-plan.sh: $arm $n/$runs infra twice; kept $run" >&2
        exit 1
      fi
    done
    overlay_hidden "$task_dir" "$ws"
    result=fail
    if run_test "$task_dir" "$ws" > "$run/test.txt" 2>&1; then
      result=pass
      if [ "$arm" = floor ]; then floor=$((floor + 1)); else gold=$((gold + 1)); fi
    fi
    echo "$arm $n/$runs $result $(( $(date +%s) - start ))s"
  done
done
node -e '
  const [file, worker, runs, floor, gold] = process.argv.slice(1);
  require("node:fs").writeFileSync(file, JSON.stringify({worker, runs: +runs, floor: +floor, gold: +gold}, null, 2) + "\n");
' "$task_dir/bench.json" "$worker" "$runs" "$floor" "$gold"
echo "$(task_get "$task_dir" id): floor=$floor/$runs gold=$gold/$runs; bench=$task_dir/bench.json; kept $dir"
