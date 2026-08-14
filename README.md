# dotfiles

Single source of truth for shell, terminal, editor, and AI-tooling config
on macOS. Live locations are **symlinks back into this repo** — edit either
side, git sees the change.

## Layout

```
home/              → ~/                                  shell rcs, .gitconfig, .p10k.zsh
config/nvim/       → ~/.config/nvim                      neovim (kickstart-based, lazy-lock committed)
config/kitty/      → ~/.config/kitty                     terminal
config/aerospace/  → ~/.config/aerospace                 tiling window manager
config/borders/    → ~/.config/borders                   window borders (JankyBorders)
config/ccstatusline/ → ~/.config/ccstatusline            Claude Code statusline
config/pi/         → ~/.pi/agent/*                       pi coding agent (see below)
claude/            → ~/.claude/*                         Claude Code settings, agents, skills
agents/skills/     → ~/.agents/skills                    skills shared across harnesses
vscode-insiders/   → ~/Library/.../Code - Insiders/User  settings, keybindings, snippets
archive/           (no symlinks)                         retired configs, kept for reference
Brewfile           full machine manifest for `brew bundle`
install.sh         idempotent bootstrap
githooks/          pre-commit: verifies generated AGENTS files match fragments
```

## Getting started (fresh machine)

```bash
xcode-select --install
git clone https://github.com/AnshulJ98/dotfiles.git ~/Dev/dotfiles
cd ~/Dev/dotfiles
./install.sh            # add --work to link the work AGENTS variant for pi
```

`install.sh` is idempotent — re-run anytime to relink anything that
drifted. It installs Homebrew and the Brewfile, creates all symlinks,
clones the zsh plugins `.zshrc` depends on (powerlevel10k,
fast-syntax-highlighting, zsh-autosuggestions), and bootstraps nvim
plugins and Mason tools headlessly. Replaced files are backed up to
`*.bak.<unix-ts>` next to the originals.

Manual steps afterwards:

| Step | Command |
|------|---------|
| GitHub auth | `gh auth login` |
| Claude Code sign-in | `claude` (browser OAuth) |
| SSH key | `ssh-keygen -t ed25519 -C "joshianshul98@gmail.com"` |

## pi: generated AGENTS files

`config/pi/agents-md/` holds instruction fragments. `build-agents.sh`
concatenates them into `AGENTS.md` (home), `AGENTS.work.md` (work), and
`CLAUDE.md` — all three are **generated; never edit them directly**. The
repo's pre-commit hook (`githooks/`, wired by install.sh via
`core.hooksPath`) runs `build-agents.sh --check` and fails the commit on
drift. To change agent instructions: edit a fragment, run
`config/pi/build-agents.sh`, commit both.

## Daily workflow

Edit a config in either location (they are the same file), then:

```bash
cd ~/Dev/dotfiles
git diff && git add -p && git commit && git push
```

## What is intentionally NOT here

- **Credentials** — Claude Code and gh keep tokens in the macOS Keychain
  or local state dirs; nothing secret is committed. `codexbar` config
  stays machine-local for the same reason.
- **Machine-local skills** — `~/.pi/agent/skills-local/` is an extra pi
  skills dir outside the repo for per-machine skills.
- **Runtime state** — session stores, logs, caches, lock files
  (`.gitignore` covers the known offenders). `lazy-lock.json` is the
  exception: committed to pin nvim plugin versions.

## Notes

- Prompt is powerlevel10k (`home/.p10k.zsh`); plugins live in
  `~/.zsh/plugins`, cloned by install.sh, not brew.
- Symlinks over GNU Stow: same effect, one fewer dependency, and
  `ls -la ~/.config` shows exactly where each link points.
- The Brewfile is a full `brew bundle dump` of the machine, casks and
  npm/go/uv globals included. Regenerate with
  `brew bundle dump --file=Brewfile --force --no-vscode` after installing
  or removing tools.
