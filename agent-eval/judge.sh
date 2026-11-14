#!/usr/bin/env bash
# Score a list of items against a text with blinded judges: two judges from different providers say yes/no per item.
# An item is met when both say yes.
# usage: judge.sh <trial-dir> <task-dir> [--kind review|facts|rubric] [--findings <file>] [--subject <file>]
#                 [--items <file>] [--context <file>] [--extract-only]
#   --extract-only --subject <file>: only the review extractor; prints {findings, high, judgeCost, infra}.
#     No item list is needed. Missing --subject exits 2; an empty subject or bad extraction is infra.
#   --kind review (default): subject <trial-dir>/review.txt, items task.defects; a haiku extractor first turns the review
#     into findings (or take the findings JSON given with --findings, which skips the extraction).
#   --kind facts: subject <trial-dir>/digest.txt (an answer), items task.facts; no extractor.
#   --kind rubric: --subject (a document) and --items are required (exit 2 without them); --context is the background.
#   --subject overrides the subject file, --items (a JSON list of {id, text[, minor]}) the task's list, for any kind.
#   An item marked "minor": true is still judged but does not decide pass.
#   Keeps everything under <trial-dir>/judge/, prints one JSON line {found, of, met, pass, disagreements, judgeCost, infra}:
#   met = ids both judges said yes to, pass = judged, at least one item, every non-minor item met.
# infra is true when the subject is empty, the item list is missing or empty, or a reply cannot be parsed (the trial is
# then not a fail, just unusable). An unknown kind or flag exits 2.
# Judges run bare: no tools, extensions (except the Anthropic auth shim), skills, prompts or context files,
# each under isolate.sh with its own session dir (cost comes from there).
# Env: EVAL_JUDGE_PI (default pi; the test seam), EVAL_REAL_HOME (default $HOME).
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVIEW_TS="$EVAL_DIR/lib/review.ts"
EXTRACT_MODEL="anthropic/claude-haiku-5-5"
JUDGE_A="anthropic/claude-opus-5-5"
JUDGE_B="openai-codex/gpt-6.1-sol"

usage() {
  echo "usage: judge.sh <trial-dir> <task-dir> [--kind review|facts|rubric] [--findings <file>] [--subject <file>] [--items <file>] [--context <file>] [--extract-only]" >&2
  exit 2
}
[ $# -ge 2 ] || usage
trial="$1" task="$2"
shift 2
kind=review given="" subject="" items="" context="" extract_only=false
while [ $# -gt 0 ]; do
  if [ "$1" = --extract-only ]; then extract_only=true; shift; continue; fi
  [ $# -ge 2 ] || usage
  case "$1" in
    --kind) kind="$2" ;;
    --findings) given="$2" ;;
    --subject) subject="$2" ;;
    --items) items="$2" ;;
    --context) context="$2" ;;
    *) usage ;;
  esac
  shift 2
done
case "$kind" in review | facts | rubric) ;; *) usage ;; esac
[ "$extract_only" = false ] || { [ -n "$subject" ] && [ "$kind" = review ] && [ -z "$given" ]; } || usage
[ "$kind" = review ] || [ -z "$given" ] || usage
[ "$kind" != rubric ] || { [ -n "$subject" ] && [ -n "$items" ]; } || usage
[ -d "$trial" ] && [ -f "$task/task.json" ] || usage
trial="$(cd "$trial" && pwd)"
task="$(cd "$task" && pwd)"
pi="${EVAL_JUDGE_PI:-pi}"
real="${EVAL_REAL_HOME:-$HOME}"
export EVAL_REAL_HOME="$real"
jdir="$trial/judge"
rm -rf "$jdir"
mkdir -p "$jdir"

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

finish() {
  if [ "$extract_only" = true ]; then
    node "$REVIEW_TS" extract-result "$jdir"
  else
    node "$REVIEW_TS" result "$jdir/items.json" "$jdir"
  fi | tee "$trial/judge.json"
  exit 0
}
nonblank() { [ -s "$1" ] && grep -q '[^[:space:]]' "$1"; }

# The item list, normalised once to [{id, text, minor}]; n is its length. A missing or invalid list is infra (of 0).
if [ "$extract_only" = true ]; then
  : # Extraction does not grade items.
elif [ -n "$items" ]; then
  n="$(node "$REVIEW_TS" items "$items" - "$jdir/items.json" 2> "$jdir/items.stderr.txt")" || finish
else
  case "$kind" in review) key=defects ;; *) key=facts ;; esac
  n="$(node "$REVIEW_TS" items "$task/task.json" "$key" "$jdir/items.json" 2> "$jdir/items.stderr.txt")" || finish
fi

match_args=()
case "$kind" in
  review)
    subject="${subject:-$trial/review.txt}"
    template="$EVAL_DIR/prompts/judge-match.txt"
    if [ -n "$given" ]; then
      cp "$given" "$jdir/extract.reply.txt"
    else
      nonblank "$subject" || finish
      node "$REVIEW_TS" render-extract "$EVAL_DIR/prompts/judge-extract.txt" "$subject" > "$jdir/extract.prompt.txt"
      "$EVAL_DIR/lib/isolate.sh" "$jdir/home" true
      call_pi extract "$EXTRACT_MODEL" "$jdir/extract.prompt.txt"
    fi
    node "$REVIEW_TS" findings "$jdir/extract.reply.txt" "$jdir/findings.json" || finish
    [ "$extract_only" = false ] || finish
    match_args=(FINDINGS="$jdir/findings.json")
    ;;
  facts)
    subject="${subject:-$trial/digest.txt}"
    template="$EVAL_DIR/prompts/judge-facts.txt"
    nonblank "$subject" || finish
    match_args=(SUBJECT="$subject")
    ;;
  rubric)
    template="$EVAL_DIR/prompts/judge-rubric.txt"
    nonblank "$subject" || finish
    match_args=(SUBJECT="$subject")
    ;;
esac
[ -z "$context" ] || match_args+=(CONTEXT="$context")

node "$REVIEW_TS" render-match "$template" "$jdir/items.json" "${match_args[@]}" > "$jdir/match.prompt.txt" || finish
"$EVAL_DIR/lib/isolate.sh" "$jdir/home" true
call_pi a "$JUDGE_A" "$jdir/match.prompt.txt" &
call_pi b "$JUDGE_B" "$jdir/match.prompt.txt" &
wait
node "$REVIEW_TS" verdicts "$jdir/a.reply.txt" "$n" "$jdir/verdicts-a.json" || true
node "$REVIEW_TS" verdicts "$jdir/b.reply.txt" "$n" "$jdir/verdicts-b.json" || true
finish
