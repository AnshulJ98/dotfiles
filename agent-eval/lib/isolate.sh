#!/usr/bin/env bash
# Run a command under a throwaway HOME that carries the live pi config.
#
# usage: isolate.sh <home-dir> <command> [args...]
#
# Builds <home-dir> when it has no .pi/agent yet, then execs the command with
# a reduced environment (PATH, HOME, TERM, LANG).
#   .pi/agent  links every entry of the real ~/.pi/agent except memory.md*,
#              sessions, tmp, run-history.jsonl and crashes.json; memory.md is
#              an empty file and sessions an empty directory.
#   .agents, .config, .gitconfig are linked (skipped when missing).
# ISOLATE_DROP_PACKAGE=<jq regex> (opt-in): settings.json becomes a copy whose
#   packages matching the regex are removed, and pi-blackhole/ an empty
#   directory, so an arm that loads its own pinned build with -e neither loads
#   the live package twice (pi aborts: Tool "recall" conflicts) nor reads the
#   live user-level pi-blackhole config and state.
# The real home is ${EVAL_REAL_HOME:-$HOME}. Links are absolute symlinks.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: isolate.sh <home-dir> <command> [args...]" >&2
  exit 2
fi

home="$1"
shift
real="${EVAL_REAL_HOME:-$HOME}"

if [ ! -e "$home/.pi/agent" ]; then
  mkdir -p "$home/.pi/agent"
  shopt -s dotglob nullglob
  for entry in "$real/.pi/agent"/*; do
    case "$(basename "$entry")" in
    memory.md* | sessions | tmp | run-history.jsonl | crashes.json) continue ;;
    settings.json | pi-blackhole) [ -n "${ISOLATE_DROP_PACKAGE:-}" ] && continue ;;
    esac
    ln -s "$entry" "$home/.pi/agent/$(basename "$entry")"
  done
  shopt -u dotglob nullglob
  if [ -n "${ISOLATE_DROP_PACKAGE:-}" ]; then
    jq --arg re "$ISOLATE_DROP_PACKAGE" \
      '.packages |= map(select(((if type == "string" then . else .source end) | test($re)) | not))' \
      "$real/.pi/agent/settings.json" >"$home/.pi/agent/settings.json"
    mkdir "$home/.pi/agent/pi-blackhole"
  fi
  : >"$home/.pi/agent/memory.md"
  mkdir "$home/.pi/agent/sessions"
  for name in .agents .config .gitconfig; do
    if [ -e "$real/$name" ]; then
      ln -s "$real/$name" "$home/$name"
    fi
  done
fi

exec env -i \
  PATH="$PATH" \
  HOME="$home" \
  TERM="${TERM:-dumb}" \
  LANG="${LANG:-en_US.UTF-8}" \
  "$@"
