#!/usr/bin/env bash
# ~/.copilot/statusline.sh
# Bearded Monokai Black status line for Copilot CLI
# Colors from the master palette

CYAN=$'\e[38;2;68;221;255m'
MAGENTA=$'\e[38;2;255;68;255m'
YELLOW=$'\e[38;2;255;238;0m'
GREEN=$'\e[38;2;102;255;136m'
ORANGE=$'\e[38;2;255;136;68m'
FG_MUTED=$'\e[38;2;84;84;84m'
RESET=$'\e[0m'

# Git branch
branch=""
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
fi

# Memory entity count (quick grep — no MCP call)
memory_file="$HOME/.local/state/agent-memory/memory.jsonl"
memory_count=0
if [[ -f "$memory_file" ]]; then
  memory_count=$(grep -c '"type":"entity"' "$memory_file" 2>/dev/null)
  memory_count=${memory_count:-0}
fi

# Current dir (shortened)
dir=$(pwd | sed "s|$HOME|~|")
# Trim to last 2 segments if long
if [[ ${#dir} -gt 40 ]]; then
  dir="…/$(basename "$(dirname "$dir")")/$(basename "$dir")"
fi

# Build status line
parts=()

# Directory
parts+=("${YELLOW}${dir}${RESET}")

# Branch
if [[ -n "$branch" ]]; then
  parts+=("${GREEN} ${branch}${RESET}")
fi

# Memory count
if [[ "$memory_count" -gt 0 ]]; then
  parts+=("${CYAN}🧠 ${memory_count}${RESET}")
else
  parts+=("${FG_MUTED}🧠 0${RESET}")
fi

# Join with separator
sep="${FG_MUTED} │ ${RESET}"
output=""
for i in "${!parts[@]}"; do
  if [[ $i -eq 0 ]]; then
    output="${parts[$i]}"
  else
    output="${output}${sep}${parts[$i]}"
  fi
done

printf "%s\n" "$output"
