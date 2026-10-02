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
# Read by the Brewfile to pick per-machine casks. brew strips env vars without the HOMEBREW_ prefix.
if [ "$PI_VARIANT" = "work" ]; then export HOMEBREW_DOTFILES_WORK=1; fi
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

# 3. ~/ files (shell rcs, gitconfig, prompt) ---------------------------------
for f in .zshrc .zprofile .zshenv .bashrc .gitconfig .gitignore_global .p10k.zsh; do
  [ -e "$DOT/home/$f" ] && link "$DOT/home/$f" "$HOME/$f"
done

# 3.5 zsh plugins (.zshrc sources these; not distributed via brew) -----------
ZSH_PLUGINS="$HOME/.zsh/plugins"
mkdir -p "$ZSH_PLUGINS"
clone_plugin() {
  local repo="$1" dir="$ZSH_PLUGINS/$2"
  if [ -d "$dir" ]; then ok "plugin present: $2"; else
    log "Cloning $2..."
    git clone --depth=1 "$repo" "$dir"
  fi
}
clone_plugin https://github.com/romkatv/powerlevel10k.git            powerlevel10k
clone_plugin https://github.com/zdharma-continuum/fast-syntax-highlighting.git fast-syntax-highlighting
clone_plugin https://github.com/zsh-users/zsh-autosuggestions.git    zsh-autosuggestions

# 4. ~/.config/* -------------------------------------------------------------
mkdir -p "$HOME/.config"
link "$DOT/config/nvim"            "$HOME/.config/nvim"
link "$DOT/config/kitty"           "$HOME/.config/kitty"
link "$DOT/config/aerospace"       "$HOME/.config/aerospace"
link "$DOT/config/ccstatusline"    "$HOME/.config/ccstatusline"
link "$DOT/config/borders"         "$HOME/.config/borders"
link "$DOT/config/tmux"            "$HOME/.config/tmux"
link "$DOT/config/yazi"            "$HOME/.config/yazi"
link "$DOT/config/imagemagick"     "$HOME/.config/ImageMagick"
# Vicinae rewrites settings.json from its GUI, so only base.json and themes are
# symlinked; settings.json is seeded once to import base.json.
link "$DOT/config/vicinae/base.json" "$HOME/.config/vicinae/base.json"
for theme in "$DOT"/config/vicinae/themes/*.toml; do
  link "$theme" "$HOME/.local/share/vicinae/themes/$(basename "$theme")"
done
VICINAE_SETTINGS="$HOME/.config/vicinae/settings.json"
if [ ! -f "$VICINAE_SETTINGS" ]; then
  printf '{\n  "imports": ["base.json"]\n}\n' > "$VICINAE_SETTINGS"
  ok "seeded: $VICINAE_SETTINGS"
elif ! grep -q '"base.json"' "$VICINAE_SETTINGS"; then
  warn "$VICINAE_SETTINGS does not import base.json — add \"imports\": [\"base.json\"]"
fi
bash "$DOT/config/vicinae/install-raycast-extensions.sh" || warn "Vicinae Raycast extensions partially installed: re-run config/vicinae/install-raycast-extensions.sh"
bash "$DOT/config/imagemagick/check.sh" || warn "ImageMagick cannot decode SVG — see config/imagemagick/delegates.xml"


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
link "$DOT/config/pi/bin"           "$HOME/.pi/agent/bin"   # scout wrapper, referenced by AGENTS.md
link "$DOT/config/pi/themes"      "$HOME/.pi/agent/themes"
mkdir -p "$HOME/.pi/agent/skills-local"   # settings.json names it; pi does not create it

# 7. VSCode Insiders (macOS-specific path) -----------------------------------
mkdir -p "$VSC_USER"
for item in settings.json keybindings.json snippets; do
  [ -e "$DOT/vscode-insiders/$item" ] && link "$DOT/vscode-insiders/$item" "$VSC_USER/$item"
done

# 8. Post-install: bootstrap nvim plugins + mason tools ----------------------
if command -v nvim >/dev/null 2>&1; then
  log "Bootstrapping nvim plugins (headless)..."
  # vim.pack.add installs whatever is missing during the first start.
  nvim --headless "+qa" || warn "Plugin install reported errors — open nvim and read :messages"
  log "Bootstrapping Mason tools (headless)..."
  # Tool list comes from mason-tool-installer in config/nvim/lua/config/lsp.lua.
  nvim --headless "+MasonToolsInstallSync" "+qa" || warn "Mason install partial — run :Mason interactively"
  ok "nvim bootstrapped"
fi

# package.toml pins each yazi plugin by rev and hash; plugins/ is gitignored.
if command -v ya >/dev/null 2>&1; then
  if ya pkg install; then ok "yazi plugins installed"; else warn "yazi plugin install failed — run: ya pkg install"; fi
fi

cat <<'EOF'

══════════════════════════════════════════════════════════════════════
✓ Bootstrap complete.

Remaining manual steps (not automatable):
  • Sign into Claude Code:    `claude` then follow OAuth flow
  • Generate SSH keys:        `ssh-keygen -t ed25519`
  • Sign into GitHub:         `gh auth login`

Backups of replaced files are in *.bak.<timestamp> next to each.
══════════════════════════════════════════════════════════════════════
EOF
