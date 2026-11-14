#!/usr/bin/env bash
# linux-tools.sh — the Linux (Ubuntu, WSL) counterpart of the Brewfile, without brew.
# Called by install.sh; safe to re-run. apt needs sudo: without a terminal or cached
# sudo it is skipped with a warning, and everything else still installs per user.
set -euo pipefail

warn() { printf "⚠ %s\n" "$*" >&2; }
ok()   { printf "✓ %s\n" "$*"; }
log()  { printf "→ %s\n" "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

BIN="$HOME/.local/bin"
mkdir -p "$BIN"
# ~/bin holds pi on a pi-node install; non-interactive ssh has neither on PATH.
export PATH="$BIN:$HOME/bin:$PATH"

APT_PKGS=(
  # build libraries
  build-essential autoconf autoconf-archive automake libtool pkgconf
  libssl-dev libreadline-dev libncurses-dev zlib1g-dev libffi-dev libbz2-dev
  libsqlite3-dev liblzma-dev libapr1-dev libaprutil1-dev libfftw3-dev
  libiniparser-dev tcl-dev tk-dev
  # tools
  zsh git curl unzip fzf ripgrep fd-find bat git-delta jq gh zoxide yazi
  imagemagick librsvg2-bin poppler-utils
  golang-go rustup btop just hyperfine glow eza direnv xh git-filter-repo pipx 7zip
)
if sudo -n true 2>/dev/null || [ -t 0 ]; then
  log "apt: installing ${#APT_PKGS[@]} packages..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${APT_PKGS[@]}"
  ok "apt packages"
else
  warn "apt skipped (needs sudo): run install.sh from a terminal, e.g. ssh -t host 'cd ~/Dev/dotfiles && ./install.sh'"
fi
# Ubuntu names these fdfind and batcat.
have fdfind && ! have fd && ln -s "$(command -v fdfind)" "$BIN/fd"
have batcat && ! have bat && ln -s "$(command -v batcat)" "$BIN/bat"
have rustup && ! rustup toolchain list 2>/dev/null | grep -q . && rustup default stable

# Pinned to match the Mac; bump both together.
ZMX_VERSION=1.0.1
if ! "$BIN/zmx" version 2>/dev/null | grep -q "$ZMX_VERSION"; then
  log "zmx $ZMX_VERSION..."
  curl -fsSL "https://zmx.sh/a/zmx-$ZMX_VERSION-linux-$(uname -m).tar.gz" | tar -xz -C "$BIN" zmx
fi
ok "zmx $("$BIN/zmx" version | head -1)"

# kitty from upstream (apt lags); the remote end needs its shell integration and kitten.
if ! "$HOME/.local/kitty.app/bin/kitty" --version >/dev/null 2>&1; then
  log "kitty..."
  curl -fsSL https://sw.kovidgoyal.net/kitty/installer.sh | sh /dev/stdin launch=n
fi
ln -sf "$HOME/.local/kitty.app/bin/kitty" "$HOME/.local/kitty.app/bin/kitten" "$BIN/"
ok "$(kitty --version)"

export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  log "nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | PROFILE=/dev/null bash
fi
set +u; . "$NVM_DIR/nvm.sh"
nvm ls default >/dev/null 2>&1 || { nvm install --lts && nvm alias default 'lts/*'; }
nvm use default >/dev/null; set -u
ok "node $(node --version) (nvm)"

NPM_PKGS=(tree-sitter-cli hunkdiff @ast-grep/cli markdownlint-cli2 @steipete/summarize)
log "npm: ${NPM_PKGS[*]}"
npm install -g --silent "${NPM_PKGS[@]}"
ok "npm globals"

have bun || { log "bun..."; curl -fsSL https://bun.sh/install | bash >/dev/null; }
[ -x "$HOME/.bun/bin/bun" ] && ln -sf "$HOME/.bun/bin/bun" "$BIN/bun"
have d2 || { log "d2..."; curl -fsSL https://d2lang.com/install.sh | sh -s -- --prefix="$HOME/.local"; }
if ! have duckdb; then
  log "duckdb..."
  curl -fsSL https://install.duckdb.org | sh
  ln -sf "$HOME/.duckdb/cli/latest/duckdb" "$BIN/duckdb"
fi

if have pi; then pi update || warn "pi update failed — run: pi update"; fi
ok "linux tools"
