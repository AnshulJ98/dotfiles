#!/usr/bin/env bash
# Write an editor-state snapshot to $1 (default: /tmp/nvim-snapshot.txt) and a
# startup profile next to it. Diff two snapshots to prove a config refactor
# changed nothing it was not meant to. See scripts/snapshot.lua.
set -euo pipefail

out="${1:-/tmp/nvim-snapshot.txt}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
probe="$here/../init.lua"

NVIM_SNAPSHOT="$out" nvim --headless \
  --startuptime "${out%.txt}.startuptime" \
  --cmd "luafile $here/snapshot.lua" \
  -c 'lua vim.wait(15000, function() return #vim.lsp.get_clients({ bufnr = 0 }) > 0 and vim.b.gitsigns_head ~= nil end, 50)' \
  -c "luafile $here/snapshot.lua" \
  -c 'qa!' \
  "$probe"

printf '%s\n' "$out"
