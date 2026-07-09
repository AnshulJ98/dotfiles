#!/usr/bin/env bash
# d2sift - test harness for fast D2 diagram iteration.
#
# Source this file, then try each function against your real .d2 set.
# Keep the one that matches how you actually move between diagrams.
# The point is to decide by using, not by reading.
#
#   d2w    pick a .d2, watch in a SINGLE reusable browser tab (foreground)
#   d2wp   pick a .d2, watch on its OWN port, one tab per diagram (background)
#   d2wl   list running watchers
#   d2wk   kill all running watchers
#
# Requires: d2, fzf. Uses fd if present, else find.
# Portable across macOS (BSD) and Linux.
# Layout defaults to elk. Override: D2_LAYOUT=dagre source d2sift.sh

: "${D2_LAYOUT:=elk}"
: "${D2_PORT_BASE:=8080}"

# Newest-first .d2 listing scoped to the current tree.
_d2_list() {
  if command -v fd >/dev/null 2>&1; then
    fd --extension d2 --type f
  else
    find . -type f -name '*.d2' -not -path '*/.*'
  fi
}

# fzf picker with a source peek so you pick the right file blind.
_d2_pick() {
  _d2_list | fzf --prompt 'd2> ' --preview 'sed -n "1,40p" {}'
}

# Live watcher count (portable: no pgrep -c), so parallel mode assigns ports.
_d2_count() { pgrep -f 'd2 --watch' 2>/dev/null | wc -l | tr -d ' '; }

# Approach A: one watcher, one tab. Ctrl-C to stop, re-run to switch.
# Simplest mental model. Best when you look at one diagram at a time.
d2w() {
  local f
  f=$(_d2_pick) || return
  pkill -f 'd2 --watch' 2>/dev/null
  d2 --watch --layout "$D2_LAYOUT" "$f" "${f%.d2}.svg"
}

# Approach B: parallel watchers, one tab each, distinct ports.
# Best when you cross-reference several diagrams at once (tab per port).
d2wp() {
  local f
  f=$(_d2_pick) || return
  local port=$((D2_PORT_BASE + $(_d2_count)))
  d2 --watch --port "$port" --layout "$D2_LAYOUT" "$f" "${f%.d2}.svg" &
  echo "watching $f -> http://localhost:$port"
}

# Portable listing via ps; the [d] trick keeps grep from matching itself.
d2wl() { ps aux | grep '[d]2 --watch' || echo 'no watchers running'; }
d2wk() { pkill -f 'd2 --watch' 2>/dev/null && echo 'stopped all watchers' || echo 'no watchers running'; }
