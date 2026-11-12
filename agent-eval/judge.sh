#!/usr/bin/env bash
# Grade a review with blinded judges: extract findings (haiku), then two judges from different providers say yes/no
# per known defect. A defect counts as found when both say yes.
# usage: judge.sh <trial-dir> <task-dir> [--findings <file>]
#   reads <trial-dir>/review.txt (or the findings JSON given with --findings, which skips the extraction),
#   keeps everything under <trial-dir>/judge/, prints one JSON line {found, of, disagreements, judgeCost, infra}.
# infra is true when the review is empty or a reply cannot be parsed (the trial is then not a fail, just unusable).
# Judges run bare: no tools, extensions (except the Anthropic auth shim), skills, prompts or context files,
# each under isolate.sh with its own session dir (cost comes from there).
# Env: EVAL_JUDGE_PI (default pi; the test seam), EVAL_REAL_HOME (default $HOME).
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVIEW_TS="$EVAL_DIR/lib/review.ts"
EXTRACT_MODEL="anthropic/claude-haiku-5-5"
JUDGE_A="anthropic/claude-opus-5-5"
JUDGE_B="openai-codex/gpt-6.1-sol"

usage() { echo "usage: judge.sh <trial-dir> <task-dir> [--findings <file>]" >&2; exit 2; }
[ $# -eq 2 ] || { [ $# -eq 4 ] && [ "$3" = --findings ]; } || usage
trial="$1" task="$2" given=""
[ $# -eq 4 ] && given="$4"
[ -d "$trial" ] && [ -f "$task/task.json" ] || usage
trial="$(cd "$trial" && pwd)"
task="$(cd "$task" && pwd)"
pi="${EVAL_JUDGE_PI:-pi}"
real="${EVAL_REAL_HOME:-$HOME}"
export EVAL_REAL_HOME="$real"
jdir="$trial/judge"
rm -rf "$jdir"
mkdir -p "$jdir"
n="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).defects.length)' "$task/task.json")"

shim=()
[ -f "$real/.pi/agent/npm/node_modules/@gotgenes/pi-anthropic-auth/src/index.ts" ] &&
  shim=(-e "$real/.pi/agent/npm/node_modules/@gotgenes/pi-anthropic-auth/src/index.ts")

# call_pi <name> <model> <prompt-file>: one bare call; the reply goes to <jdir>/<name>.reply.txt. A failing call leaves
# a reply that does not parse, which the caller counts as infra.
call_pi() {
  local name="$1" model="$2" prompt="$3"
  mkdir -p "$jdir/$name/cwd"
  (cd "$jdir/$name/cwd" && "$EVAL_DIR/lib/isolate.sh" "$jdir/home" "$pi" -p --session-dir "$jdir/$name/sessions" \
    -nt -ne ${shim[@]+"${shim[@]}"} -ns -np -nc --no-mcp --model "$model" --thinking medium "$(cat "$prompt")" \
    < /dev/null > "$jdir/$name.reply.txt" 2> "$jdir/$name.stderr.txt") || true
}

finish() { node "$REVIEW_TS" result "$task/task.json" "$jdir" | tee "$trial/judge.json"; exit 0; }

if [ -n "$given" ]; then
  cp "$given" "$jdir/extract.reply.txt"
else
  [ -s "$trial/review.txt" ] && grep -q '[^[:space:]]' "$trial/review.txt" || finish
  node "$REVIEW_TS" render-extract "$EVAL_DIR/prompts/judge-extract.txt" "$trial/review.txt" > "$jdir/extract.prompt.txt"
  "$EVAL_DIR/lib/isolate.sh" "$jdir/home" true
  call_pi extract "$EXTRACT_MODEL" "$jdir/extract.prompt.txt"
fi
node "$REVIEW_TS" findings "$jdir/extract.reply.txt" "$jdir/findings.json" || finish

node "$REVIEW_TS" render-match "$EVAL_DIR/prompts/judge-match.txt" "$jdir/findings.json" "$task/task.json" > "$jdir/match.prompt.txt"
"$EVAL_DIR/lib/isolate.sh" "$jdir/home" true
call_pi a "$JUDGE_A" "$jdir/match.prompt.txt" &
call_pi b "$JUDGE_B" "$jdir/match.prompt.txt" &
wait
node "$REVIEW_TS" verdicts "$jdir/a.reply.txt" "$n" "$jdir/verdicts-a.json" || true
node "$REVIEW_TS" verdicts "$jdir/b.reply.txt" "$n" "$jdir/verdicts-b.json" || true
finish
