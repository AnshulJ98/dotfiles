#!/usr/bin/env bash
# usage: validate.sh <task>|--all   (--all: every task.json under ${EVAL_TASKS_DIR:-agent-eval/tasks}; none is fine)
# Hidden tests must fail on the base and pass once the fix commit's allowed files are applied; for expect
# "blocked" the fix commit must change a non-test file outside allowed. A review task (role review) is valid when
# its workspace builds, every file named in prompt.md exists there, and defects lists id/text/hit. A scout task is
# valid when its workspace builds and each expect entry's file exists there with at least lines[1] lines, every
# must regex matching the text of lines[0]..lines[1] (the expected answer is really in the cited range). No model calls.
# Prints "VALID <id>" or "INVALID <id>: <reason>" per task; exit 1 if any is invalid.
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EVAL_DIR/lib/task.sh"
[ $# -eq 1 ] || { echo "usage: validate.sh <task>|--all" >&2; exit 2; }
tmp="$(mktemp -d /tmp/agent-eval-validate.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

# Review task: print nothing when prompt.md names only files present in <ws> and defects are complete, else the reason.
check_review() {
  node -e '
    const { existsSync, readFileSync } = require("node:fs");
    const [task, prompt, ws] = process.argv.slice(1);
    const defects = JSON.parse(readFileSync(task + "/task.json", "utf8")).defects;
    const bad = (d) => typeof d !== "object" || d === null || ["id", "text", "hit"].some((k) => typeof d[k] !== "string" || d[k].trim() === "");
    if (!Array.isArray(defects) || defects.length === 0 || defects.some(bad)) {
      console.log("defects must be a non-empty list of {id, text, hit}");
    } else if (new Set(defects.map((d) => d.id)).size !== defects.length) {
      console.log("defect ids are not unique");
    } else {
      const named = readFileSync(prompt, "utf8").match(/[A-Za-z0-9_.\/-]+[.](?:tsx?|jsx?|mjs|cjs|json|py|sh|md|txt|go|rs)(?![A-Za-z0-9_])/g) ?? [];
      const missing = named.filter((f) => !existsSync(ws + "/" + f));
      if (named.length === 0) console.log("prompt.md names no file");
      else if (missing.length) console.log("prompt.md names files missing from the workspace: " + [...new Set(missing)].join(", "));
    }
  ' "$1" "$1/prompt.md" "$2" 2>&1 | head -1
}

# Print nothing when valid, else the reason.
check() {
  local task="$1" repo fix ws path hidden allowed
  repo="$(task_get "$task" repo)"
  if [ "$(task_get "$task" role)" = review ]; then
    ws="$(mktemp -d "$tmp/ws.XXXXXX")"
    make_workspace "$task" "$ws" base > /dev/null 2>&1 || { echo "cannot build the review workspace"; return 0; }
    check_review "$task" "$ws"
    return 0
  fi
  if [ "$(task_get "$task" role)" = scout ]; then
    ws="$(mktemp -d "$tmp/ws.XXXXXX")"
    make_workspace "$task" "$ws" base > /dev/null 2>&1 || { echo "cannot build the scout workspace"; return 0; }
    [ -s "$task/prompt.md" ] || { echo "prompt.md is missing or empty"; return 0; }
    node "$EVAL_DIR/lib/scout-grade.ts" check "$task/task.json" "$ws" 2>&1 | head -1
    return 0
  fi
  fix="$(task_get "$task" fix)"
  if ! git -C "$repo" rev-parse --verify -q "$fix^" > /dev/null; then echo "cannot resolve $fix^ in $repo"; return 0; fi
  if [ "$(task_get "$task" expect)" = blocked ]; then
    hidden="$(task_get "$task" hidden)"
    allowed="$(task_get "$task" allowed)"
    while IFS= read -r path; do
      grep -Fxq -- "$path" <<< "$hidden" || grep -Fxq -- "$path" <<< "$allowed" || return 0
    done < <(git -C "$repo" diff --name-only "$fix^" "$fix")
    echo "fix commit changes no non-test file outside allowed"
    return 0
  fi
  ws="$(mktemp -d "$tmp/ws.XXXXXX")"
  make_workspace "$task" "$ws" base > /dev/null 2>&1 || { echo "cannot build the base workspace"; return 0; }
  overlay_hidden "$task" "$ws" > /dev/null 2>&1 || { echo "cannot read hidden tests from $fix"; return 0; }
  if run_test "$task" "$ws" > /dev/null 2>&1; then echo "hidden tests pass on the base"; return 0; fi
  apply_reference "$task" "$ws" > /dev/null 2>&1 || { echo "cannot apply the reference solution"; return 0; }
  run_test "$task" "$ws" > /dev/null 2>&1 || echo "hidden tests fail with the reference applied"
}

status=0
validate_one() {
  local reason
  reason="$(check "$1")"
  if [ -z "$reason" ]; then echo "VALID $(task_get "$1" id)"; else echo "INVALID $(task_get "$1" id): $reason"; status=1; fi
}

if [ "$1" = --all ]; then
  for f in "${EVAL_TASKS_DIR:-$EVAL_DIR/tasks}"/*/task.json; do
    [ -f "$f" ] && validate_one "$(dirname "$f")"
  done
else
  task_dir="$(resolve_task "$1")" || { echo "validate.sh: no such task: $1" >&2; exit 2; }
  validate_one "$task_dir"
fi
exit "$status"
