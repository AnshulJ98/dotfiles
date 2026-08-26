#!/usr/bin/env bash
# Run the config-regression probe battery against pi and print telemetry.
#
# usage: ./run.sh [provider/model] [thinking-level] [probe ...]
#   ./run.sh                                   # default model+thinking, all probes
#   ./run.sh anthropic/claude-fable-5 xhigh review
#   ./run.sh "" high premise impl              # default model, thinking high
#
# Results land in results/<timestamp>/. Scoring recall against the rubric
# in README.md is a judgment step — run the outputs past a reviewer.
set -euo pipefail

cd "$(dirname "$0")"

MODEL="${1:-}"
THINKING="${2:-}"
shift $(( $# > 2 ? 2 : $# )) || true
PROBES=("${@:-review premise impl}")
[ ${#PROBES[@]} -eq 1 ] && read -r -a PROBES <<< "${PROBES[0]}"

RUN_DIR="results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN_DIR"

PI_ARGS=(-p --no-session --mode json -xt ask_user)
[ -n "$MODEL" ] && PI_ARGS+=(--model "$MODEL")
[ -n "$THINKING" ] && PI_ARGS+=(--thinking "$THINKING")

for probe in "${PROBES[@]}"; do
  prompt="$(cat "prompts/$probe.txt")"
  out="$PWD/$RUN_DIR/$probe.json"
  case "$probe" in
    impl)
      # Implementation probe needs an empty writable directory.
      workdir="$(mktemp -d "/tmp/agent-eval-impl.XXXXXX")"
      ( cd "$workdir" && timeout 300 pi "${PI_ARGS[@]}" "$prompt" > "$out" 2> "$out.err" )
      echo "impl workdir: $workdir (verify: cd there && node --test)"
      ;;
    *)
      ( cd fixtures && timeout 300 pi "${PI_ARGS[@]}" "$prompt" > "$out" 2> "$out.err" )
      ;;
  esac
done

python3 parse_probes.py "$RUN_DIR"/*.json
echo "outputs: $RUN_DIR"
