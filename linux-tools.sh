#!/usr/bin/env bash
# linux-tools.sh — the Linux (Ubuntu, WSL) counterpart of the Brewfile, without brew.
# Called by install.sh; safe to re-run. apt needs sudo: without a terminal or cached
# sudo it is skipped with a warning, and everything else still installs per user.
set -euo pipefail

warn() { printf "⚠ %s\n" "$*" >&2; }
ok() { printf "✓ %s\n" "$*"; }
log() { printf "→ %s\n" "$*"; }
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
  # office skills: headless render and recalc, .docx reading
  libreoffice-nogui pandoc
  golang-go rustup btop just hyperfine glow eza direnv xh git-filter-repo pipx 7zip
  # the rest of the Brewfile that apt carries
  ffmpeg luarocks ruby-full mpv ranger postgresql-client fastfetch resvg
)
if sudo -n true 2>/dev/null || [ -t 0 ]; then
  # Ubuntu's git and gh lag the Mac's; take both from upstream's apt sources.
  compgen -G '/etc/apt/sources.list.d/git-core-*' >/dev/null || sudo add-apt-repository -y -n ppa:git-core/ppa
  if [ ! -f /etc/apt/sources.list.d/github-cli.list ]; then
    sudo install -d -m 755 /etc/apt/keyrings
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg |
      sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" |
      sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  fi
  log "apt: installing ${#APT_PKGS[@]} packages..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${APT_PKGS[@]}"
  ok "apt packages"
else
  warn "apt skipped (needs sudo): run install.sh from a terminal, e.g. ssh -t host 'cd ~/Dev/dotfiles && ./install.sh'"
fi
# `rustup default` fails when none is set; `toolchain list` prints a line either way.
have rustup && ! rustup default >/dev/null 2>&1 && rustup default stable
# apt's copies lag the Mac's; cargo builds current ones into $BIN, and a re-run upgrades them.
if have cargo; then
  log "cargo: ripgrep bat fd-find git-delta zoxide slumber rainfrog (first build takes minutes)..."
  cargo install --locked --quiet --root "$HOME/.local" ripgrep bat fd-find git-delta zoxide slumber rainfrog
fi
# Ubuntu names these fdfind and batcat; only needed when cargo did not build them.
have fdfind && ! have fd && ln -s "$(command -v fdfind)" "$BIN/fd"
have batcat && ! have bat && ln -s "$(command -v batcat)" "$BIN/bat"

# Pinned to match the Mac; bump both together.
ZMX_VERSION=1.0.1
if ! "$BIN/zmx" version 2>/dev/null | grep -q "$ZMX_VERSION"; then
  log "zmx $ZMX_VERSION..."
  curl -fsSL "https://zmx.sh/a/zmx-$ZMX_VERSION-linux-$(uname -m).tar.gz" | tar -xz -C "$BIN" zmx
fi
ok "zmx $("$BIN/zmx" version | head -1)"

# apt's fzf lags too; the pickers (zpick, zmx-pick) are built against this one.
FZF_VERSION=0.75.0
if ! "$BIN/fzf" --version 2>/dev/null | grep -q "^$FZF_VERSION "; then
  log "fzf $FZF_VERSION..."
  case $(uname -m) in aarch64 | arm64) fzf_arch=arm64 ;; *) fzf_arch=amd64 ;; esac
  curl -fsSL "https://github.com/junegunn/fzf/releases/download/v$FZF_VERSION/fzf-$FZF_VERSION-linux_$fzf_arch.tar.gz" | tar -xz -C "$BIN" fzf
fi
ok "fzf $("$BIN/fzf" --version)"

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
set +u
. "$NVM_DIR/nvm.sh"
# Follow the current LTS, carrying npm globals across a major bump.
lts=$(nvm version-remote --lts 2>/dev/null || true)
if [ -n "$lts" ] && [ "$(nvm version default)" != "$lts" ]; then
  old=$(nvm version default)
  if [ "$old" = N/A ]; then nvm install --lts; else nvm install --lts --reinstall-packages-from="$old"; fi
  # A major such as v26, not lts/*: .zshrc globs versions/node/<default>* to skip loading nvm.
  nvm alias default "${lts%%.*}"
fi
nvm use default >/dev/null
# bin/pi puts pi-node/current/bin first on PATH; keep it on the default node.
pi_node="$HOME/.local/share/pi-node/current"
[ -L "$pi_node" ] && ln -sfn "$(dirname "$(dirname "$(nvm which default)")")" "$pi_node"
set -u
ok "node $(node --version) (nvm)"

NPM_PKGS=(tree-sitter-cli hunkdiff @ast-grep/cli markdownlint-cli2 @steipete/summarize
  pptxgenjs docx react-icons react react-dom sharp) # second line: office skills
log "npm: ${NPM_PKGS[*]}"
npm install -g --silent "${NPM_PKGS[@]}"
ok "npm globals"
# Link hunk's prebuilt binary: the npm shim needs node, which a non-interactive ssh (kitty's zrun) lacks.
case "$(uname -m)" in aarch64 | arm64) HUNK_ARCH=arm64 ;; *) HUNK_ARCH=x64 ;; esac
for h in "$(npm root -g)"/hunkdiff/node_modules/hunkdiff-linux-$HUNK_ARCH/bin/hunk "$(npm root -g)"/hunkdiff-linux-$HUNK_ARCH/bin/hunk; do
  [ -x "$h" ] && {
    ln -sf "$h" "$BIN/hunk"
    break
  }
done

[ -d "$HOME/.pyenv" ] || {
  log "pyenv..."
  curl -fsSL https://pyenv.run | bash >/dev/null
}
ln -sf "$HOME/.pyenv/bin/pyenv" "$BIN/pyenv"
have harlequin || {
  log "harlequin..."
  pipx install harlequin
}

have bun || {
  log "bun..."
  curl -fsSL https://bun.sh/install | bash >/dev/null
}
[ -x "$HOME/.bun/bin/bun" ] && ln -sf "$HOME/.bun/bin/bun" "$BIN/bun"
have d2 || {
  log "d2..."
  curl -fsSL https://d2lang.com/install.sh | sh -s -- --prefix="$HOME/.local"
}
if ! have duckdb; then
  log "duckdb..."
  curl -fsSL https://install.duckdb.org | sh
  ln -sf "$HOME/.duckdb/cli/latest/duckdb" "$BIN/duckdb"
fi

if have pi; then pi update || warn "pi update failed — run: pi update"; fi
ok "linux tools"
