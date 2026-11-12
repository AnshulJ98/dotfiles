#!/usr/bin/env bash
# Check the judges against known answers, once per judge/prompt change.
# usage: check-judges.sh <task>   (<task>: id under tasks/ or a dir)
# For each defect: findings made of its hit sample plus two decoys must get "yes" for that defect from both judges, and
# the two decoys alone must get "no" from both. Prints one line per defect, exits 1 on any miss (an unparseable reply
# is a miss). Makes real model calls through judge.sh (EVAL_JUDGE_PI is its test seam); the extraction step is skipped.
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EVAL_DIR/lib/task.sh"
[ $# -eq 1 ] || { echo "usage: check-judges.sh <task>" >&2; exit 2; }
task_dir="$(resolve_task "$1")" || { echo "check-judges.sh: no such task: $1" >&2; exit 2; }
tmp="$(mktemp -d /tmp/agent-eval-judges.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

# The decoys are accurate observations about booking-style code that are not defects of the task.
DECOY1='{"file":"booking/src/booking.ts","line":null,"severity":"low","claim":"listRoom returns bookings in insertion order"}'
DECOY2='{"file":"booking/src/http.ts","line":null,"severity":"low","claim":"send() sets content-type to application/json"}'

# Print "a=yes|no b=yes|no" for defect index $1 (0-based) from the verdict files of the judge run in $2.
answers() {
  node -e '
    const { readFileSync } = require("node:fs");
    const read = (f) => { try { const v = JSON.parse(readFileSync(process.argv[2] + "/judge/verdicts-" + f + ".json", "utf8")); return v[Number(process.argv[1])]; } catch { return undefined; } };
    const show = (v) => (v === true ? "yes" : v === false ? "no" : "none");
    console.log("a=" + show(read("a")) + " b=" + show(read("b")));
  ' "$1" "$2"
}

status=0
i=0
while IFS=$'\t' read -r id hit; do
  node -e 'console.log(JSON.stringify([{ file: "", line: null, severity: "medium", claim: process.argv[1] }, JSON.parse(process.argv[2]), JSON.parse(process.argv[3])]))' \
    "$hit" "$DECOY1" "$DECOY2" > "$tmp/$id.hit.json"
  printf '[%s,%s]\n' "$DECOY1" "$DECOY2" > "$tmp/$id.decoys.json"
  mkdir -p "$tmp/$id.hit" "$tmp/$id.decoys"
  "$EVAL_DIR/judge.sh" "$tmp/$id.hit" "$task_dir" --findings "$tmp/$id.hit.json" > /dev/null < /dev/null
  "$EVAL_DIR/judge.sh" "$tmp/$id.decoys" "$task_dir" --findings "$tmp/$id.decoys.json" > /dev/null < /dev/null
  with="$(answers "$i" "$tmp/$id.hit")"
  without="$(answers "$i" "$tmp/$id.decoys")"
  if [ "$with" = "a=yes b=yes" ] && [ "$without" = "a=no b=no" ]; then verdict=ok; else verdict=MISS; status=1; fi
  echo "$id hit: $with; decoys only: $without; $verdict"
  i=$(( i + 1 ))
done < <(node -e '
  for (const d of JSON.parse(require("node:fs").readFileSync(process.argv[1] + "/task.json", "utf8")).defects) console.log(d.id + "\t" + d.hit.replace(/\s+/g, " "));
' "$task_dir")
exit "$status"
