#!/usr/bin/env bash
# install.sh — bootstrap a fresh macOS machine from this dotfiles repo.
# Idempotent: safe to re-run. Existing files are backed up to *.bak.<timestamp>.
#
# Usage:
#   git clone <remote> ~/Dev/dotfiles
#   cd ~/Dev/dotfiles && ./install.sh [--work]
#
# --work links the work AGENTS variant for pi (default: home).

set -euo pipefail

DOT="${DOT:-$HOME/Dev/dotfiles}"
PI_VARIANT="home"
for arg in "$@"; do
  if [ "$arg" = "--work" ]; then PI_VARIANT="work"; fi
done
TS="$(date +%s)"
VSC_USER="$HOME/Library/Application Support/Code - Insiders/User"

if [ ! -d "$DOT" ]; then
  echo "ERROR: $DOT does not exist. Clone the repo there first." >&2
  exit 1
fi

log()  { printf "→ %s\n" "$*"; }
warn() { printf "⚠ %s\n" "$*" >&2; }
ok()   { printf "✓ %s\n" "$*"; }

# 1. Homebrew + Brewfile -----------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  log "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

if [ -f "$DOT/Brewfile" ]; then
  log "Installing from Brewfile..."
  brew bundle --file="$DOT/Brewfile"
  ok "Brewfile applied"
fi

# 2. Symlink helper ----------------------------------------------------------
link() {
  local src="$1" dst="$2"
  if [ ! -e "$src" ] && [ ! -L "$src" ]; then
    warn "skip: source missing $src"
    return
  fi
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    ok "already linked: $dst"
    return
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    warn "backing up: $dst → $dst.bak.$TS"
    mv "$dst" "$dst.bak.$TS"
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  ok "linked: $dst"
}

# 3. ~/ files (shell rcs, gitconfig, wezterm) --------------------------------
for f in .zshrc .zprofile .zshenv .bashrc .gitconfig .wezterm.lua; do
  [ -e "$DOT/home/$f" ] && link "$DOT/home/$f" "$HOME/$f"
done

# 4. ~/.config/* -------------------------------------------------------------
mkdir -p "$HOME/.config"
link "$DOT/config/nvim"            "$HOME/.config/nvim"
link "$DOT/config/kitty"           "$HOME/.config/kitty"
link "$DOT/config/starship.toml"   "$HOME/.config/starship.toml"


# 5. ~/.claude/* -------------------------------------------------------------
mkdir -p "$HOME/.claude"
link "$DOT/config/pi/CLAUDE.md"        "$HOME/.claude/CLAUDE.md"   # GENERATED — edit agents-md/ fragments
link "$DOT/claude/settings.json"       "$HOME/.claude/settings.json"
[ -f "$DOT/claude/settings.local.json" ] && link "$DOT/claude/settings.local.json" "$HOME/.claude/settings.local.json"
link "$DOT/claude/agents"              "$HOME/.claude/agents"
link "$DOT/claude/skills"              "$HOME/.claude/skills"

# 6. ~/.agents/* -------------------------------------------------------------
mkdir -p "$HOME/.agents"
link "$DOT/agents/skills" "$HOME/.agents/skills"

# 6.5 ~/.pi/agent (pi coding agent) -------------------------------------------
git -C "$DOT" config core.hooksPath githooks
bash "$DOT/config/pi/build-agents.sh" --check || warn "pi AGENTS files drifted from fragments — run config/pi/build-agents.sh"
mkdir -p "$HOME/.pi/agent"
if [ "$PI_VARIANT" = "work" ]; then
  link "$DOT/config/pi/AGENTS.work.md" "$HOME/.pi/agent/AGENTS.md"
else
  link "$DOT/config/pi/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
fi
link "$DOT/config/pi/settings.json" "$HOME/.pi/agent/settings.json"
link "$DOT/config/pi/agents"        "$HOME/.pi/agent/agents"
link "$DOT/config/pi/subagent-config.json" "$HOME/.pi/agent/extensions/subagent/config.json"
link "$DOT/config/pi/themes/bearded-arc.json" "$HOME/.pi/agent/themes/bearded-arc.json"

# 7. ~/.copilot/* ------------------------------------------------------------
mkdir -p "$HOME/.copilot"
for item in config.json mcp-config.json settings.json statusline.sh instructions knowledge agents command; do
  [ -e "$DOT/copilot/$item" ] && link "$DOT/copilot/$item" "$HOME/.copilot/$item"
done

# 8. VSCode Insiders (macOS-specific path) -----------------------------------
mkdir -p "$VSC_USER"
for item in settings.json keybindings.json snippets; do
  [ -e "$DOT/vscode-insiders/$item" ] && link "$DOT/vscode-insiders/$item" "$VSC_USER/$item"
done

# 9. Post-install: bootstrap nvim plugins + mason tools ----------------------
if command -v nvim >/dev/null 2>&1; then
  log "Bootstrapping Lazy plugins (headless)..."
  nvim --headless "+Lazy! install" "+qa" || warn "Lazy install reported errors — open nvim and run :Lazy"
  log "Bootstrapping Mason tools (headless)..."
  nvim --headless "+MasonInstall stylua shfmt shellcheck prettierd ruff" "+qa" || warn "Mason install partial — run :Mason interactively"
  ok "nvim bootstrapped"
fi

cat <<'EOF'

══════════════════════════════════════════════════════════════════════
✓ Bootstrap complete.

Remaining manual steps (not automatable):
  • Sign into Claude Code:    `claude` then follow OAuth flow
  • Sign into Copilot CLI:    `gh auth login` then `copilot auth`
  • Set up MCP server creds:  edit ~/.copilot/mcp-config.json tokens
  • Generate SSH keys:        `ssh-keygen -t ed25519`
  • Sign into GitHub:         `gh auth login`

Backups of replaced files are in *.bak.<timestamp> next to each.
══════════════════════════════════════════════════════════════════════
EOF
