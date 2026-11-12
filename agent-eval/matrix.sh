#!/usr/bin/env bash
# Run a task x cell x trial grid with trial.sh, appending to results/<run-name>/trials.jsonl; resumable.
# usage: matrix.sh <run-name> --cells "<provider/model:thinking> ..." [--tasks "<id> ..."] [--trials 3] [--jobs 1]
# --tasks defaults to every dir under tasks/. A (task, cell, trial) already recorded with infra false is skipped.
# Env: EVAL_TRIAL (default trial.sh), EVAL_RESULTS_DIR (default results/), EVAL_TASKS_DIR (default tasks/),
# EVAL_TICK (seconds between progress lines, default 30).
# Exit: 2 usage / unknown task / malformed cell; 1 if any trial.sh call failed; else 0.
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EVAL_DIR/lib/task.sh"

die() { echo "matrix.sh: $*" >&2; exit 2; }
usage() { die 'usage: matrix.sh <run-name> --cells "<provider/model:thinking> ..." [--tasks "<id> ..."] [--trials 3] [--jobs 1]'; }

[ $# -ge 1 ] || usage
run="$1"; shift
case "$run" in ''|-*|*/*) usage ;; esac
cells="" tasks="" trials=3 jobs=1
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || usage
  case "$1" in
    --cells) cells="$2" ;;
    --tasks) tasks="$2" ;;
    --trials) trials="$2" ;;
    --jobs) jobs="$2" ;;
    *) usage ;;
  esac
  shift 2
done
cells="${cells//,/ }" tasks="${tasks//,/ }"
[ -n "$cells" ] || usage
case "$trials$jobs" in ''|*[!0-9]*) die "--trials and --jobs must be positive integers" ;; esac
[ "$trials" -gt 0 ] && [ "$jobs" -gt 0 ] || die "--trials and --jobs must be positive integers"

# Cell: provider/model:thinking, split on the last colon.
for cell in $cells; do
  [[ "$cell" =~ ^[^[:space:]/:]+/[^[:space:]]+:[^[:space:]:]+$ ]] || die "malformed cell (want provider/model:thinking): $cell"
done

tasks_root="${EVAL_TASKS_DIR:-$EVAL_DIR/tasks}"
if [ -z "$tasks" ]; then
  tasks="$(for d in "$tasks_root"/*/; do [ -f "$d/task.json" ] && basename "$d"; done | tr '\n' ' ')"
fi
[ -n "${tasks// /}" ] || die "no tasks under $tasks_root"
for t in $tasks; do resolve_task "$t" > /dev/null || die "no such task: $t"; done

trial_cmd="${EVAL_TRIAL:-$EVAL_DIR/trial.sh}"
out_dir="${EVAL_RESULTS_DIR:-$EVAL_DIR/results}/$run"
mkdir -p "$out_dir"
out="$(cd "$out_dir" && pwd)/trials.jsonl"
touch "$out"
state="$(mktemp -d "${TMPDIR:-/tmp}/matrix.XXXXXX")"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$state"' EXIT
trap 'exit 130' INT TERM

# Keys (task, model, thinking, trial) already recorded and not infra.
node -e '
  for (const line of require("node:fs").readFileSync(process.argv[1], "utf8").split("\n")) {
    try {
      const r = JSON.parse(line);
      if (r && r.infra !== true) console.log([r.task, r.model, r.thinking, r.trial].join("\t"));
    } catch {}
  }
' "$out" > "$state/recorded"

# Task-major, so parallel jobs land on different tasks.
: > "$state/pending"
skipped=0
tab=$'\t'
for t in $tasks; do
  for n in $(seq 1 "$trials"); do
    for cell in $cells; do
      if grep -Fxq -- "$t$tab${cell%:*}$tab${cell##*:}$tab$n" "$state/recorded"; then skipped=$((skipped + 1))
      else printf '%s\t%s\t%s\n' "$t" "$cell" "$n" >> "$state/pending"; fi
    done
  done
done
total="$(grep -c '' "$state/pending" || true)"
echo "matrix: $run: $total to run, $skipped already recorded"

# The trial's last record in the output file, as "pass=<bool> cost=<n> s=<n>"; empty if none.
result_of() {
  node -e '
    const [file, task, model, thinking, n] = process.argv.slice(1);
    let last;
    for (const line of require("node:fs").readFileSync(file, "utf8").split("\n")) {
      try {
        const r = JSON.parse(line);
        if (r.task === task && r.model === model && r.thinking === thinking && String(r.trial) === n) last = r;
      } catch {}
    }
    if (last) console.log("pass=" + last.pass + " cost=" + (last.cost ?? 0) + " s=" + (last.seconds ?? 0) + (last.leak ? " leak" : "") + (last.infra ? " infra" : ""));
  ' "$out" "$@"
}

run_one() {
  local id="$1" t="$2" cell="$3" n="$4" model thinking rc=0
  model="${cell%:*}" thinking="${cell##*:}"
  echo "start $t $cell #$n"
  "$trial_cmd" "$t" "$model" "$thinking" "$n" "$out" > /dev/null || rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAILED $t $cell #$n rc=$rc"; : > "$state/fail.$id"
  else echo "end $t $cell #$n $(result_of "$t" "$model" "$thinking" "$n")"; fi
  : > "$state/done.$id"
}

last_tick=$SECONDS
running() { jobs -r | grep -c . || true; }
tick() {
  if [ $((SECONDS - last_tick)) -ge "${EVAL_TICK:-30}" ]; then
    echo "matrix: $(find "$state" -name 'done.*' | grep -c . || true)/$total running $(running) elapsed ${SECONDS}s"
    last_tick=$SECONDS
  fi
}

id=0
while IFS=$'\t' read -r t cell n; do
  while [ "$(running)" -ge "$jobs" ]; do sleep 0.1; tick; done
  id=$((id + 1))
  run_one "$id" "$t" "$cell" "$n" &
done < "$state/pending"
while [ "$(running)" -gt 0 ]; do sleep 0.1; tick; done
wait || true

echo
node "$EVAL_DIR/summarize.ts" "$out"
failed="$(find "$state" -name 'fail.*' | grep -c . || true)"
[ "$failed" -eq 0 ] || { echo "matrix: $failed trial call(s) failed; rerun to retry them" >&2; exit 1; }
