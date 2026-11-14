#!/usr/bin/env bash
# One worker trial: scout --rw in an isolated HOME and a fresh workspace; appends a graded record.
# Worker pass = the hidden tests exit 0 and every changed file is in the task's allowed list (an edit outside it fails
# the trial and is listed in the record's "outside"); wroteTest is true when a changed path is a test path.
# A review task (role review, with "rev") runs plain pi -p --mode json on the prompt in the workspace at rev and is
# graded by judge.sh (record: pass = every defect found, plus found, of, disagreements, judgeCost).
# A scout task (role scout, with "rev", usually "paths", and "facts") runs `scout --model M --thinking L "<prompt.md>"`
# read-only in the workspace at rev, and is graded by judge.sh --kind facts on the digest (record: pass = every fact
# stated, plus found, of, disagreements, judgeCost; an empty digest is not judged and finds nothing). The digest's
# file:line citations are also graded by lib/scout-grade.ts against the task's expect list: cited and citable, secondary.
# An orch task (role orch, with "expect" and scenario.md) renders prompts/orch.txt with fixtures/orch/rules.md and the
# scenario, runs plain `pi -p --mode json -nt` (no tools) on it in an empty directory, and passes when the final reply's
# DECISION line (merge, rework, stop or fix) equals expect (lib/orch.ts; no judge). Record: pass, decision (the word or
# null), expect; a reply without a decision is a fail, no turns or a timeout (rc 124 or 137) is infra.
# A plan task (role plan: a worker task's fields plus ticket.md and "decisions") runs plain pi -p --mode json (tools on) at fix^
# with the user's /plan prompt rendered with ticket.md: EVAL_PLAN_PROMPT, else <real home>/.pi/agent/prompts/plan.md,
# else config/pi/prompts/plan.md in the repo holding agent-eval.
# lib/plan-grade.ts assembles spec.md from the reply and grades it mechanically (mechanical.json). An accepted spec is run by a
# fixed worker (EVAL_PLAN_WORKER, default anthropic/claude-haiku-5-5:low: scout --rw --spec - in a second fresh workspace ws2,
# its own home worker-home), the hidden tests run there, and judge.sh --kind rubric grades spec.md. A spec that is not accepted
# gets no worker run and no judging. Record: pass = accepted and executed (lib/record.ts); cost is the planner's, workerCost the worker's.
# Worker/scout and fixed-worker infra: lib/record.ts agentInfra uses rc, session tokens and the digest;
# the fixed worker exit code is preserved as --worker-rc (an unaccepted plan has no worker run).
# usage: trial.sh <task> <provider/model> <thinking> <n> <out.jsonl>   (<task>: id under tasks/ or a dir)
# Env: EVAL_SCOUT (default <home>/.pi/agent/bin/scout), EVAL_REVIEW_PI, EVAL_ORCH_PI and EVAL_PLAN_PI (default pi), EVAL_REAL_HOME (default $HOME),
# EVAL_PLAN_TIMEOUT (seconds for the planner's pi call, default 900; rc 124 or 137 is recorded as infra),
# EVAL_ORCH_TIMEOUT (seconds for the orch pi call, default 300; rc 124 or 137 is recorded as infra),
# EVAL_REVIEW_TIMEOUT (seconds for the review pi call, default 900; rc 124 or 137 is recorded as infra and not judged),
# EVAL_TEST_TIMEOUT (seconds for the hidden tests, default 600; a timeout is a failing test); judge.sh reads EVAL_JUDGE_PI.
# The temp dir (home/, ws/, digest.txt, stderr.txt, test.txt; review and scout: judge/, judge.json; review: review.jsonl, review.txt; orch: prompt.txt, orch.jsonl, reply.txt;
# plan: prompt.txt, plan.jsonl, reply.txt, spec.md, mechanical.json, items.json, context.txt, ws2/, worker-home/, worker-digest.txt, judge/, judge.json)
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
  scout) [ -n "$(task_get "$task_dir" rev)" ] || { echo "role not supported yet: scout (task has no rev)" >&2; exit 2; } ;;
  orch) [ -f "$task_dir/scenario.md" ] || { echo "role not supported yet: orch (task has no scenario.md)" >&2; exit 2; } ;;
  plan) [ -s "$task_dir/ticket.md" ] || { echo "role not supported yet: plan (task has no ticket.md)" >&2; exit 2; } ;;
  *) echo "role not supported yet: $role" >&2; exit 2 ;;
esac
[ "$role" = scout ] || expect="$(task_get "$task_dir" expect)"

mkdir -p "$(dirname "$out")"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
dir="$(mktemp -d /tmp/agent-eval-trial.XXXXXX)"
home="$dir/home" ws="$dir/ws"
export EVAL_REAL_HOME="${EVAL_REAL_HOME:-$HOME}"
scout="${EVAL_SCOUT:-$home/.pi/agent/bin/scout}"

rc=0
if [ "$role" = orch ]; then mkdir -p "$ws"; else make_workspace "$task_dir" "$ws" base; fi

if [ "$role" = orch ]; then
  orch_pi="${EVAL_ORCH_PI:-pi}"
  tmo="$(timeout_bin)" || { echo "trial.sh: needs timeout (coreutils) on PATH" >&2; exit 2; }
  node "$EVAL_DIR/lib/orch.ts" render "$EVAL_DIR/prompts/orch.txt" "$EVAL_DIR/fixtures/orch/rules.md" "$task_dir/scenario.md" > "$dir/prompt.txt"
  start="$(date +%s)"
  (cd "$ws" && "$EVAL_DIR/lib/isolate.sh" "$home" "$tmo" -k 10 "${EVAL_ORCH_TIMEOUT:-300}" "$orch_pi" -p --mode json -nt --session-dir "$home/.pi/agent/sessions/orch" \
    --model "$model" --thinking "$thinking" "$(cat "$dir/prompt.txt")" < /dev/null > "$dir/orch.jsonl" 2> "$dir/stderr.txt") || rc=$?
  seconds=$(( $(date +%s) - start ))
  node "$EVAL_DIR/lib/review.ts" final-reply "$dir/orch.jsonl" > "$dir/reply.txt"
  record="$(node "$EVAL_DIR/lib/record.ts" \
    --task "$(task_get "$task_dir" id)" --role "$role" --model "$model" --thinking "$thinking" --trial "$n" \
    --rc "$rc" --seconds "$seconds" --expect "$expect" --reply-file "$dir/reply.txt" \
    --sessions-dir "$home/.pi/agent/sessions" \
    --needle "$EVAL_REAL_HOME/.pi/agent/memory.md" --needle "$EVAL_REAL_HOME/.pi/agent/sessions" --dir "$dir")"
  printf '%s\n' "$record" | tee -a "$out"
  exit 0
fi

if [ "$role" = plan ]; then
  planner="${EVAL_PLAN_PI:-pi}"
  tmo="$(timeout_bin)" || { echo "trial.sh: needs timeout (coreutils) on PATH" >&2; exit 2; }
  worker="${EVAL_PLAN_WORKER:-anthropic/claude-haiku-5-5:low}"
  case "$worker" in */*:?*) ;; *) echo "trial.sh: EVAL_PLAN_WORKER must be <provider/model>:<thinking>, got: $worker" >&2; exit 2 ;; esac
  if [ "${EVAL_PLAN_PROMPT+x}" = x ]; then
    prompt_file="$EVAL_PLAN_PROMPT"
    tried="$prompt_file"
  else
    prompt_file="$EVAL_REAL_HOME/.pi/agent/prompts/plan.md"
    root="$(git -C "$EVAL_DIR" rev-parse --show-toplevel 2>/dev/null)" || root=""
    repo_prompt="${root:+$root/}config/pi/prompts/plan.md"
    tried="$prompt_file; $repo_prompt"
    if [ ! -f "$prompt_file" ] && [ -n "$root" ]; then prompt_file="$repo_prompt"; fi
  fi
  [ -f "$prompt_file" ] || { echo "trial.sh: no plan prompt; tried: $tried" >&2; exit 2; }
  node "$EVAL_DIR/lib/plan-grade.ts" render "$prompt_file" "$task_dir/ticket.md" > "$dir/prompt.txt"
  node "$EVAL_DIR/lib/plan-grade.ts" items "$task_dir" "$dir/items.json" || { echo "trial.sh: bad decisions in $task_dir/task.json" >&2; exit 2; }
  start="$(date +%s)"
  (cd "$ws" && "$EVAL_DIR/lib/isolate.sh" "$home" "$tmo" -k 10 "${EVAL_PLAN_TIMEOUT:-900}" "$planner" -p --mode json --session-dir "$home/.pi/agent/sessions/plan" \
    --model "$model" --thinking "$thinking" "$(cat "$dir/prompt.txt")" < /dev/null > "$dir/plan.jsonl" 2> "$dir/stderr.txt") || rc=$?
  seconds=$(( $(date +%s) - start ))
  node "$EVAL_DIR/lib/review.ts" final-reply "$dir/plan.jsonl" > "$dir/reply.txt"
  git -C "$ws" -c core.quotepath=off status --porcelain -uall > "$dir/porcelain.txt"
  node "$EVAL_DIR/lib/plan-grade.ts" assemble "$dir/reply.txt" "$dir/spec.md" || true
  node "$EVAL_DIR/lib/plan-grade.ts" mechanical "$dir/reply.txt" "$ws" "$dir/porcelain.txt" "$task_dir" > "$dir/mechanical.json"
  accepted="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).accepted === true)' "$dir/mechanical.json")"
  test_exit="" worker_rc=""
  if [ "$accepted" = true ] && [ "$rc" -ne 124 ] && [ "$rc" -ne 137 ]; then
    ws2="$dir/ws2"
    make_workspace "$task_dir" "$ws2" base
    wscout="${EVAL_SCOUT:-$dir/worker-home/.pi/agent/bin/scout}"
    worker_rc=0
    (cd "$ws2" && "$EVAL_DIR/lib/isolate.sh" "$dir/worker-home" "$wscout" --rw --model "${worker%:*}" --thinking "${worker##*:}" --spec - \
      < "$dir/spec.md" > "$dir/worker-digest.txt" 2> "$dir/worker-stderr.txt") || worker_rc=$?
    overlay_hidden "$task_dir" "$ws2"
    test_exit=0
    run_test "$task_dir" "$ws2" > "$dir/test.txt" 2>&1 || test_exit=$?
    node "$EVAL_DIR/lib/plan-grade.ts" context "$task_dir" "$dir/context.txt"
    "$EVAL_DIR/judge.sh" "$dir" "$task_dir" --kind rubric --subject "$dir/spec.md" --items "$dir/items.json" --context "$dir/context.txt" > /dev/null || true
  fi
  record="$(node "$EVAL_DIR/lib/record.ts" \
    --task "$(task_get "$task_dir" id)" --role "$role" --model "$model" --thinking "$thinking" --trial "$n" \
    --rc "$rc" --seconds "$seconds" --mechanical-file "$dir/mechanical.json" --items-file "$dir/items.json" \
    --test-exit "$test_exit" --judge-file "$dir/judge.json" --worker "$worker" --worker-rc "$worker_rc" --digest-file "$dir/worker-digest.txt" \
    --sessions-dir "$home/.pi/agent/sessions" --worker-sessions-dir "$dir/worker-home/.pi/agent/sessions" \
    --needle "$(task_get "$task_dir" repo)" --needle "$EVAL_REAL_HOME/.pi/agent/memory.md" \
    --needle "$EVAL_REAL_HOME/.pi/agent/sessions" --dir "$dir")"
  printf '%s\n' "$record" | tee -a "$out"
  exit 0
fi

if [ "$role" = scout ]; then
  start="$(date +%s)"
  (cd "$ws" && "$EVAL_DIR/lib/isolate.sh" "$home" "$scout" --model "$model" --thinking "$thinking" \
    "$(cat "$task_dir/prompt.md")" < /dev/null > "$dir/digest.txt" 2> "$dir/stderr.txt") || rc=$?
  seconds=$(( $(date +%s) - start ))
  ! grep -q '[^[:space:]]' "$dir/digest.txt" || "$EVAL_DIR/judge.sh" "$dir" "$task_dir" --kind facts > /dev/null || true
  record="$(node "$EVAL_DIR/lib/record.ts" \
    --task "$(task_get "$task_dir" id)" --role "$role" --model "$model" --thinking "$thinking" --trial "$n" \
    --rc "$rc" --seconds "$seconds" --task-file "$task_dir/task.json" --digest-file "$dir/digest.txt" --judge-file "$dir/judge.json" \
    --sessions-dir "$home/.pi/agent/sessions" \
    --needle "$(task_get "$task_dir" repo)" --needle "$EVAL_REAL_HOME/.pi/agent/memory.md" \
    --needle "$EVAL_REAL_HOME/.pi/agent/sessions" --dir "$dir")"
  printf '%s\n' "$record" | tee -a "$out"
  exit 0
fi

if [ "$role" = review ]; then
  reviewer="${EVAL_REVIEW_PI:-pi}"
  tmo="$(timeout_bin)" || { echo "trial.sh: needs timeout (coreutils) on PATH" >&2; exit 2; }
  start="$(date +%s)"
  (cd "$ws" && "$EVAL_DIR/lib/isolate.sh" "$home" "$tmo" -k 10 "${EVAL_REVIEW_TIMEOUT:-900}" "$reviewer" -p --mode json --session-dir "$home/.pi/agent/sessions/review" \
    --model "$model" --thinking "$thinking" "$(cat "$task_dir/prompt.md")" < /dev/null > "$dir/review.jsonl" 2> "$dir/stderr.txt") || rc=$?
  seconds=$(( $(date +%s) - start ))
  node "$EVAL_DIR/lib/review.ts" final-reply "$dir/review.jsonl" > "$dir/review.txt"
  [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ] || "$EVAL_DIR/judge.sh" "$dir" "$task_dir" > /dev/null || true
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
