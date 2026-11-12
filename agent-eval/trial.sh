#!/usr/bin/env bash
# One worker trial: scout --rw in an isolated HOME and a fresh workspace; appends a graded record.
# A review task (role review, with "rev") runs plain pi -p --mode json on the prompt in the workspace at rev and is
# graded by judge.sh (record: pass = every defect found, plus found, of, disagreements, judgeCost).
# usage: trial.sh <task> <provider/model> <thinking> <n> <out.jsonl>   (<task>: id under tasks/ or a dir)
# Env: EVAL_SCOUT (default <home>/.pi/agent/bin/scout), EVAL_REVIEW_PI (default pi), EVAL_REAL_HOME (default $HOME);
# judge.sh reads EVAL_JUDGE_PI.
# The temp dir (home/, ws/, digest.txt, stderr.txt, test.txt; review: review.jsonl, review.txt, judge/, judge.json)
# is kept; the record's "dir" names it.
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EVAL_DIR/lib/task.sh"

usage() { echo "usage: trial.sh <task> <provider/model> <thinking> <n> <out.jsonl>" >&2; exit 2; }
[ $# -eq 5 ] || usage
model="$2" thinking="$3" n="$4" out="$5"
case "$n" in ''|*[!0-9]*) usage ;; esac
task_dir="$(resolve_task "$1")" || { echo "trial.sh: no such task: $1" >&2; exit 2; }
role="$(task_get "$task_dir" role)"
case "$role" in
  worker) ;;
  review) [ -n "$(task_get "$task_dir" rev)" ] || { echo "role not supported yet: review (task has no rev)" >&2; exit 2; } ;;
  *) echo "role not supported yet: $role" >&2; exit 2 ;;
esac
expect="$(task_get "$task_dir" expect)"

mkdir -p "$(dirname "$out")"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
dir="$(mktemp -d /tmp/agent-eval-trial.XXXXXX)"
home="$dir/home" ws="$dir/ws"
export EVAL_REAL_HOME="${EVAL_REAL_HOME:-$HOME}"
scout="${EVAL_SCOUT:-$home/.pi/agent/bin/scout}"

make_workspace "$task_dir" "$ws" base
rc=0

if [ "$role" = review ]; then
  reviewer="${EVAL_REVIEW_PI:-pi}"
  start="$(date +%s)"
  (cd "$ws" && "$EVAL_DIR/lib/isolate.sh" "$home" "$reviewer" -p --mode json --session-dir "$home/.pi/agent/sessions/review" \
    --model "$model" --thinking "$thinking" "$(cat "$task_dir/prompt.md")" < /dev/null > "$dir/review.jsonl" 2> "$dir/stderr.txt") || rc=$?
  seconds=$(( $(date +%s) - start ))
  node "$EVAL_DIR/lib/review.ts" final-reply "$dir/review.jsonl" > "$dir/review.txt"
  "$EVAL_DIR/judge.sh" "$dir" "$task_dir" > /dev/null || true
  record="$(node "$EVAL_DIR/lib/record.ts" \
    --task "$(task_get "$task_dir" id)" --role "$role" --model "$model" --thinking "$thinking" --trial "$n" \
    --rc "$rc" --seconds "$seconds" --judge-file "$dir/judge.json" \
    --sessions-dir "$home/.pi/agent/sessions" \
    --needle "$(task_get "$task_dir" repo)" --needle "$EVAL_REAL_HOME/.pi/agent/memory.md" \
    --needle "$EVAL_REAL_HOME/.pi/agent/sessions" --dir "$dir")"
  printf '%s\n' "$record" | tee -a "$out"
  exit 0
fi

start="$(date +%s)"
(cd "$ws" && "$EVAL_DIR/lib/isolate.sh" "$home" "$scout" --rw --model "$model" --thinking "$thinking" --spec - \
  < "$task_dir/prompt.md" > "$dir/digest.txt" 2> "$dir/stderr.txt") || rc=$?
seconds=$(( $(date +%s) - start ))

# Workspace facts, taken before the hidden tests are laid over it.
git -C "$ws" -c core.quotepath=off status --porcelain -uall > "$dir/porcelain.txt"
added="$(git -C "$ws" diff HEAD --numstat | awk '$1 ~ /^[0-9]+$/ { s += $1 } END { print s + 0 }')"
while IFS= read -r -d '' f; do
  [ -f "$ws/$f" ] && added=$(( added + $(grep -c '' "$ws/$f" || true) ))
done < <(git -C "$ws" ls-files --others --exclude-standard -z)
task_get "$task_dir" allowed > "$dir/allowed.txt"

test_exit=""
if [ "$expect" != blocked ]; then
  overlay_hidden "$task_dir" "$ws"
  test_exit=0
  run_test "$task_dir" "$ws" > "$dir/test.txt" 2>&1 || test_exit=$?
fi

record="$(node "$EVAL_DIR/lib/record.ts" \
  --task "$(task_get "$task_dir" id)" --role "$role" --model "$model" --thinking "$thinking" --trial "$n" \
  --rc "$rc" --seconds "$seconds" --expect "$expect" --test-exit "$test_exit" \
  --porcelain "$dir/porcelain.txt" --allowed-file "$dir/allowed.txt" --added "$added" \
  --sessions-dir "$home/.pi/agent/sessions" --digest-file "$dir/digest.txt" \
  --needle "$(task_get "$task_dir" repo)" --needle "$EVAL_REAL_HOME/.pi/agent/memory.md" \
  --needle "$EVAL_REAL_HOME/.pi/agent/sessions" --dir "$dir")"
printf '%s\n' "$record" | tee -a "$out"
