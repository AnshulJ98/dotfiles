#!/usr/bin/env bash
# Check the judges against known answers, once per judge/prompt change.
# usage: check-judges.sh <task>   (<task>: id under tasks/ or a dir)
# The task has "defects" (kind review) or "facts" (kind facts), and "decoys": an array of at least two strings, accurate
# claims that are not among the items (exit 2 with a message when a review or facts task has none).
# For each item: a subject made of its hit sample plus the decoys must get "yes" for that item from both judges, and the
# decoys alone must get "no" from both. Review: the subject is the findings (hit and each decoy as a claim); facts: the
# answer text (the hit text, then the decoys, one per line). Prints one line per item, exits 1 on any miss (an unparseable
# reply is a miss). Makes real model calls through judge.sh (EVAL_JUDGE_PI is its test seam); the extraction step is skipped.
# A plan task (role plan) has samples.json instead, [{file, yes: [ids], no: [ids]}] with files relative to the task dir: each
# sample is judged with judge.sh --kind rubric (the rubric and the task's decisions as items, the ticket and the reference diff
# as context, as in trial.sh), and every listed id prints "<file> <id> want=yes|no: a=.. b=..; ok|MISS". A yes id needs yes from
# both judges, a no id needs no from both.
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EVAL_DIR/lib/task.sh"
[ $# -eq 1 ] || { echo "usage: check-judges.sh <task>" >&2; exit 2; }
task_dir="$(resolve_task "$1")" || { echo "check-judges.sh: no such task: $1" >&2; exit 2; }
tmp="$(mktemp -d /tmp/agent-eval-judges.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

if [ "$(task_get "$task_dir" role)" = plan ]; then
  [ -f "$task_dir/samples.json" ] || { echo "check-judges.sh: the plan task has no samples.json" >&2; exit 2; }
  node "$EVAL_DIR/lib/plan-grade.ts" items "$task_dir" "$tmp/items.json" || exit 2
  node "$EVAL_DIR/lib/plan-grade.ts" context "$task_dir" "$tmp/context.txt"
  status=0
  i=0
  while IFS= read -r file; do
    mkdir -p "$tmp/sample-$i"
    "$EVAL_DIR/judge.sh" "$tmp/sample-$i" "$task_dir" --kind rubric --subject "$task_dir/$file" --items "$tmp/items.json" --context "$tmp/context.txt" > /dev/null < /dev/null || true
    node "$EVAL_DIR/lib/plan-grade.ts" report "$task_dir" "$file" "$tmp/sample-$i" || status=1
    i=$(( i + 1 ))
  done < <(node "$EVAL_DIR/lib/plan-grade.ts" sample-files "$task_dir")
  exit "$status"
fi

# The kind of the task: review (defects) or facts (facts); the decoys go to $tmp/decoys.json.
kind="$(node -e '
  const { readFileSync, writeFileSync } = require("node:fs");
  const t = JSON.parse(readFileSync(process.argv[1] + "/task.json", "utf8"));
  const kind = Array.isArray(t.defects) ? "review" : Array.isArray(t.facts) ? "facts" : "";
  if (kind === "") { console.error("check-judges.sh: the task has neither defects nor facts"); process.exit(2); }
  if (!Array.isArray(t.decoys) || t.decoys.length < 2 || t.decoys.some((d) => typeof d !== "string" || d.trim() === "")) {
    console.error("check-judges.sh: the task needs \"decoys\": an array of at least two non-empty strings"); process.exit(2);
  }
  writeFileSync(process.argv[2], JSON.stringify(t.decoys));
  console.log(kind);
' "$task_dir" "$tmp/decoys.json")" || exit 2

# Print "a=yes|no b=yes|no" for item index $1 (0-based) from the verdict files of the judge run in $2.
answers() {
  node -e '
    const { readFileSync } = require("node:fs");
    const read = (f) => { try { const v = JSON.parse(readFileSync(process.argv[2] + "/judge/verdicts-" + f + ".json", "utf8")); return v[Number(process.argv[1])]; } catch { return undefined; } };
    const show = (v) => (v === true ? "yes" : v === false ? "no" : "none");
    console.log("a=" + show(read("a")) + " b=" + show(read("b")));
  ' "$1" "$2"
}

# subject <out> <hit>: the findings JSON (review) or the answer text (facts); an empty <hit> gives the decoys alone.
subject() {
  node -e '
    const { readFileSync, writeFileSync } = require("node:fs");
    const [kind, out, hit, decoysFile] = process.argv.slice(1);
    const decoys = JSON.parse(readFileSync(decoysFile, "utf8"));
    const claims = hit === "" ? decoys : [hit, ...decoys];
    writeFileSync(out, kind === "review"
      ? JSON.stringify(claims.map((claim, i) => ({ file: "", line: null, severity: i === 0 && hit !== "" ? "medium" : "low", claim })))
      : claims.join("\n") + "\n");
  ' "$kind" "$@" "$tmp/decoys.json"
}

status=0
i=0
while IFS=$'\t' read -r id hit; do
  mkdir -p "$tmp/$id.hit" "$tmp/$id.decoys"
  if [ "$kind" = review ]; then
    subject "$tmp/$id.hit.json" "$hit"
    subject "$tmp/$id.decoys.json" ""
    "$EVAL_DIR/judge.sh" "$tmp/$id.hit" "$task_dir" --findings "$tmp/$id.hit.json" > /dev/null < /dev/null
    "$EVAL_DIR/judge.sh" "$tmp/$id.decoys" "$task_dir" --findings "$tmp/$id.decoys.json" > /dev/null < /dev/null
  else
    subject "$tmp/$id.hit/digest.txt" "$hit"
    subject "$tmp/$id.decoys/digest.txt" ""
    "$EVAL_DIR/judge.sh" "$tmp/$id.hit" "$task_dir" --kind facts > /dev/null < /dev/null
    "$EVAL_DIR/judge.sh" "$tmp/$id.decoys" "$task_dir" --kind facts > /dev/null < /dev/null
  fi
  with="$(answers "$i" "$tmp/$id.hit")"
  without="$(answers "$i" "$tmp/$id.decoys")"
  if [ "$with" = "a=yes b=yes" ] && [ "$without" = "a=no b=no" ]; then verdict=ok; else verdict=MISS; status=1; fi
  echo "$id hit: $with; decoys only: $without; $verdict"
  i=$(( i + 1 ))
done < <(node -e '
  const t = JSON.parse(require("node:fs").readFileSync(process.argv[1] + "/task.json", "utf8"));
  for (const d of t.defects ?? t.facts) console.log(d.id + "\t" + d.hit.replace(/\s+/g, " "));
' "$task_dir")
exit "$status"
