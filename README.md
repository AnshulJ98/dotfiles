# dotfiles

Single source of truth for shell, terminal, editor, and AI-tooling config on macOS.

`~/.config/*`, `~/.claude/*`, `~/.agents/*`, `~/.copilot/*`, and the macOS VSCode Insiders user dir
are **symlinks back into this repo**. Edit either location, git sees the change.

## Layout

```
home/                  → ~/                                   (shell rcs, .gitconfig, .wezterm.lua)
config/                → ~/.config/                           (nvim, kitty, starship, opencode)
claude/                → ~/.claude/                           (CLAUDE.md, settings, agents, skills)
agents/                → ~/.agents/                           (skills shared across Claude/OpenCode/Copilot)
copilot/               → ~/.copilot/                          (config, mcp-config, instructions, etc.)
vscode-insiders/       → ~/Library/.../Code - Insiders/User/  (settings, keybindings, snippets)
archive/               → legacy KDE/Linux + old Mac configs (no symlinks; kept for reference)
Brewfile               → host dependencies for `brew bundle`
install.sh             → idempotent bootstrap (brew + symlinks + nvim plugins)
```

## Fresh-machine bootstrap

```bash
# Prereqs: Xcode CLI tools — `xcode-select --install`
git clone <this-remote> ~/Dev/dotfiles
cd ~/Dev/dotfiles
./install.sh
```

`install.sh` is idempotent — re-run anytime to relink anything that drifted.
Replaced files get backed up to `*.bak.<unix-ts>` next to the originals.

## Daily workflow

Edit a config file in either `~/.config/foo` or `~/Dev/dotfiles/config/foo` — they're the same file.

```bash
cd ~/Dev/dotfiles
git diff               # see local edits
git add -p             # selective stage
git commit -m "..."
git push
```

## What's NOT in here (intentional)

- **API keys / OAuth tokens** — Claude Code / Copilot CLI / OpenCode store these in macOS
  Keychain or local SQLite, not in plaintext config. `mcp-needs-auth-cache.json` and
  `session-store.db*` are `.gitignore`d.
- **`node_modules/`, lock files** — OpenCode regenerates these per-machine.
- **`lazy-lock.json`** is committed (pinning plugin versions for reproducibility).
  Run `:Lazy update` then commit the new lock to advance.
- **Project-local `.env`, credentials, keys** — global `.gitignore` blocks them.

## Manual post-install steps

| Tool | Step |
|------|------|
| Claude Code | `claude` (triggers OAuth in browser) |
| Copilot CLI | `gh auth login` then `copilot auth` |
| OpenCode | install from <https://opencode.ai/docs/install> |
| MCP servers | edit `~/.copilot/mcp-config.json` to add auth tokens |
| SSH | `ssh-keygen -t ed25519 -C "joshianshul98@gmail.com"` |
| Default shell | `chsh -s /bin/zsh` (usually already default on macOS) |

## Architecture notes

- **Why symlinks, not Stow?** Same effect, one fewer dependency, more transparent — `ls -la ~/.config`
  shows exactly where each link points.
- **Why a `home/` dir instead of putting `.zshrc` etc. at the repo root?** Avoids accidentally
  treating the dotfiles repo itself as `$HOME` (e.g., older `git --git-dir=$HOME/.dotfiles.git`
  bare-repo patterns). Makes the install script's symlink mapping explicit.
- **Why archive `.config/`, KDE files, etc.?** Old KDE/Linux configs from a previous machine.
  Kept in `archive/` for reference, no longer wired up.
