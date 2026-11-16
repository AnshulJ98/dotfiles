#!/bin/sh
# Uses installed Neovim plugins without starting servers or making network calls.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/../.."
nvim --headless -u NONE -l config/nvim/tests/lsp.lua
nvim --headless -u NONE -l config/nvim/tests/files.lua
nvim --headless -u NONE -l config/nvim/tests/outline.lua
nvim --headless -u NONE -l config/nvim/tests/themes.lua
nvim --headless -u NONE -l config/nvim/tests/markdown.lua
nvim --headless -u NONE -l config/nvim/tests/markdown_reading.lua
state=$(mktemp -d)
XDG_STATE_HOME=$state nvim --headless -u NONE -l config/nvim/tests/markdown_blank.lua
rm -rf "$state"
nvim --headless -u NONE -l config/nvim/tests/syntax.lua
# bin/nvfmt, against the installed config.
node --test config/nvim/tests/nvfmt.test.ts
