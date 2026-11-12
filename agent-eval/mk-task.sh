#!/usr/bin/env bash
# usage: mk-task.sh <repo> <fix-sha> [id]
# Turn a fix commit into a worker task: writes tasks/<id>/task.json and a prompt.md stub (the prompt is then
# written by hand from the ticket). Tasks go to ${EVAL_TASKS_DIR:-agent-eval/tasks}.
#   allowed = the files the commit changes (deleted ones too) except deleted test files, so the agent may edit the
#             test files it touches (in path order), hidden = test files it adds or changes,
#   test    = the package's test script, run as "npm test" from the nearest package.json above the first
#             hidden test file ("cd <dir> && npm test" when that is not the repo root).
# Test files: see is_test_path in lib/task.sh. Exit 1 when the commit changes no test file, has no package.json
# with a test script above its tests, or the id already exists; 2 on bad usage.
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EVAL_DIR/lib/task.sh"

[ $# -ge 2 ] && [ $# -le 3 ] || { echo "usage: mk-task.sh <repo> <fix-sha> [id]" >&2; exit 2; }
repo="$(git -C "${1/#\~/$HOME}" rev-parse --show-toplevel 2>/dev/null)" || { echo "mk-task.sh: not a git repo: $1" >&2; exit 2; }
fix="$(git -C "$repo" rev-parse --verify -q "$2^{commit}")" || { echo "mk-task.sh: no such commit: $2" >&2; exit 2; }
git -C "$repo" rev-parse --verify -q "$fix^" > /dev/null || { echo "mk-task.sh: $2 has no parent commit" >&2; exit 1; }
id="${3:-$(basename "$repo")-$(git -C "$repo" rev-parse --short "$fix")}"
case "$id" in ''|*[!A-Za-z0-9._-]*|.*) echo "mk-task.sh: bad id: $id" >&2; exit 2 ;; esac
dir="${EVAL_TASKS_DIR:-$EVAL_DIR/tasks}/$id"
[ ! -e "$dir" ] || { echo "mk-task.sh: task exists: $dir" >&2; exit 1; }

allowed=() hidden=()
while IFS=$'\t' read -r status path; do
  [ -n "$path" ] || continue
  if is_test_path "$path"; then
    [ "$status" = D ] || { hidden+=("$path"); allowed+=("$path"); }
  else
    allowed+=("$path")
  fi
done < <(git -c core.quotePath=false -C "$repo" diff --no-renames --name-status "$fix^" "$fix")
[ ${#hidden[@]} -gt 0 ] || { echo "mk-task.sh: $2 changes no test file" >&2; exit 1; }

pkg="$(dirname "${hidden[0]}")"
while :; do
  if [ "$pkg" = . ]; then pkg_json="$fix:package.json"; else pkg_json="$fix:$pkg/package.json"; fi
  git -C "$repo" cat-file -e "$pkg_json" 2>/dev/null && break
  [ "$pkg" != . ] || { echo "mk-task.sh: no package.json above ${hidden[0]}" >&2; exit 1; }
  pkg="$(dirname "$pkg")"
done
git -C "$repo" show "$pkg_json" | node -e 'process.exit(typeof JSON.parse(require("node:fs").readFileSync(0, "utf8")).scripts?.test === "string" ? 0 : 1)' \
  || { echo "mk-task.sh: $pkg_json has no test script" >&2; exit 1; }
if [ "$pkg" = . ]; then test_cmd="npm test"; else test_cmd="cd $pkg && npm test"; fi

mkdir -p "$dir"
node -e '
  const [id, repo, fix, test, allowed, hidden] = process.argv.slice(1);
  const home = process.env.HOME ?? "";
  const lines = (s) => (s === "" ? [] : s.split("\n"));
  const task = { id, role: "worker", repo: home && repo.startsWith(home + "/") ? "~" + repo.slice(home.length) : repo, fix, test, allowed: lines(allowed), hidden: lines(hidden), link: [] };
  require("node:fs").writeFileSync(process.argv[7] + "/task.json", JSON.stringify(task, null, 2) + "\n");
' "$id" "$repo" "$fix" "$test_cmd" "$(printf '%s\n' ${allowed[@]+"${allowed[@]}"})" "$(printf '%s\n' "${hidden[@]}")" "$dir"
list="$(printf '%s, ' ${allowed[@]+"${allowed[@]}"})"
cat > "$dir/prompt.md" <<EOF
---
files-allowed: [${list%, }]
tests: $test_cmd
---
TODO: the ticket, in the words of the issue or spec; the behaviour the hidden tests assert as requirements,
with exact formats, messages and the names and signatures they import. Never the fix itself.

1. TODO: one step. check: $test_cmd
EOF
echo "$dir"
