#!/usr/bin/env bash
# Task helpers for trial.sh and validate.sh (source it; it runs nothing).
#   resolve_task <id|dir>   print the task dir, else return 1
#   task_get <dir> <field>  a task.json field, arrays one item per line, leading ~ of repo expanded
#   make_workspace <dir> <dest> <base|fix>   git archive of fix^ / fix, fresh one-commit repo, links symlinked
#   overlay_hidden / apply_reference / run_test <dir> <ws>
#   is_test_path <path>     true for .test. / .spec. / _test. names and files under tests/ or __tests__/
# overlay_hidden copies a hidden test file beside the original as zz-hidden-<name>; a hidden file that is not a
# test (a support module the hidden tests import) goes to its own path.

TASK_EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_task() {
  local root="${EVAL_TASKS_DIR:-$TASK_EVAL_DIR/tasks}"
  if [ -f "$1/task.json" ]; then (cd "$1" && pwd)
  elif [ -f "$root/$1/task.json" ]; then (cd "$root/$1" && pwd)
  else return 1; fi
}

task_get() {
  node -e '
    let v = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    if (v === undefined || v === null) process.exit(0);
    if (process.argv[2] === "repo") v = String(v).replace(/^~(?=\/|$)/, process.env.HOME ?? "~");
    console.log(Array.isArray(v) ? v.join("\n") : String(v));
  ' "$1/task.json" "$2" | sed '/^$/d'
}

make_workspace() {
  local task="$1" dest="$2" rev path repo fix
  repo="$(task_get "$task" repo)"
  fix="$(task_get "$task" fix)"
  case "$3" in base) rev="$fix^" ;; fix) rev="$fix" ;; *) echo "make_workspace: bad kind: $3" >&2; return 2 ;; esac
  mkdir -p "$dest"
  git -C "$repo" archive "$rev" | tar -x -C "$dest" || return 1
  git -C "$dest" init -q
  git -C "$dest" add -A
  git -C "$dest" -c user.name=agent-eval -c user.email=agent-eval@example.invalid -c commit.gpgsign=false \
    commit -q --allow-empty -m "base $rev"
  while IFS= read -r path; do
    if [ -e "$dest/$path" ] || [ -L "$dest/$path" ]; then continue; fi
    mkdir -p "$(dirname "$dest/$path")"
    ln -s "$repo/$path" "$dest/$path"
    mkdir -p "$dest/.git/info"
    printf '/%s\n' "$path" >> "$dest/.git/info/exclude"
  done < <(task_get "$task" link)
}

is_test_path() {
  case "$1" in tests/*|*/tests/*|__tests__/*|*/__tests__/*) return 0 ;; esac
  case "${1##*/}" in *.test.*|*.spec.*|*_test.*) return 0 ;; esac
  return 1
}

overlay_hidden() {
  local path target
  while IFS= read -r path; do
    if is_test_path "$path"; then target="$2/$(dirname "$path")/zz-hidden-$(basename "$path")"; else target="$2/$path"; fi
    mkdir -p "$(dirname "$target")"
    git -C "$(task_get "$1" repo)" show "$(task_get "$1" fix):$path" > "$target" || return 1
  done < <(task_get "$1" hidden)
}

apply_reference() {
  local path repo fix
  repo="$(task_get "$1" repo)"
  fix="$(task_get "$1" fix)"
  while IFS= read -r path; do
    if git -C "$repo" cat-file -e "$fix:$path" 2>/dev/null; then
      mkdir -p "$2/$(dirname "$path")"
      git -C "$repo" show "$fix:$path" > "$2/$path" || return 1
    else
      rm -f "$2/$path"
    fi
  done < <(task_get "$1" allowed)
}

run_test() {
  (cd "$2" && bash -c "$(task_get "$1" test)")
}
