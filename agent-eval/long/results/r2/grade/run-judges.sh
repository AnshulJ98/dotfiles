#!/usr/bin/env bash
# One line per judge job: <dir> <kind> <subject> [items] [context]. Runs 4 at a time.
set -uo pipefail
J=~/Dev/dotfiles/agent-eval/judge.sh; S=~/Dev/dotfiles/agent-eval/long/seed; G=~/Dev/dotfiles/agent-eval/long/results/r2/grade
job() { local dir=$1 kind=$2 subj=$3 items=${4:-} ctx=${5:-}; mkdir -p "$dir"
  local extra=(); [ -n "$items" ] && extra+=(--items "$items"); [ -n "$ctx" ] && extra+=(--context "$ctx")
  bash $J "$dir" $S --kind $kind --subject "$subj" "${extra[@]}" 2>"$dir/stderr.txt" | tail -1 > "$dir/result.json"
  echo "$(basename $(dirname $dir))/$(basename $dir) $(cat $dir/result.json | cut -c1-160)"; }
export -f job; export J S G
R=~/Dev/dotfiles/agent-eval/long/results/r2
{ for a in base bh-vcc bh-om; do
  echo "$G/$a/impl rubric $R/$a/diff.patch $G/impl-items.json $S/steps/2.out"
  echo "$G/$a/recall facts $R/$a/recall.out"
  for c in $R/$a/compaction*.md; do echo "$G/$a/$(basename $c .md) facts $c"; done
done; } | xargs -P 4 -L 1 bash -c 'job "$@"' _
echo JUDGES-DONE
