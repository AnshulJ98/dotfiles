---

# Work Environment

## Language Runtimes and Browsers — /opt/homebrew/ Only

**CRITICAL**: Language runtimes and browser binaries MUST run from `/opt/homebrew/`. Paths under `~` and symlinks from `~` are blocked by macOS security policy for those.

- Playwright: `PLAYWRIGHT_BROWSERS_PATH=/opt/homebrew/var/playwright`
- Node/npm/npx, Python/uvx: resolve to `/opt/homebrew/bin/`

This rule names runtimes and browsers only. Shell utilities (`ls`, `grep`, `bash`, `find`, `sed`) resolve from `PATH` as normal; there is no `/opt/homebrew/bin/ls`, and `/opt/homebrew/bin/bash` is never required. Bash scripts under `~` such as `~/.pi/agent/bin/scout` are read by the shell, not executed as binaries, and run fine.

Never assume `~/.local/bin/` or `~/.bun/bin/` paths will work.

Exception: project virtualenvs and skill venvs are allowed — e.g. `~/.agents/skills/pdf-images/.venv/bin/python` (see PDF rule).

## Obsidian Knowledge Vault

Document-level knowledge at `~/Documents/NotesVault`. Full rules: the `vault` skill, hosted locally on the work machine (not in this repo).

- **Never touch**: `Secrets/`, `DailyLogs/`, `External-Markdown/`
- **Routing**: 1-3 sentences → `~/.pi/agent/memory.md`. Needs a document → vault under `Projects/{repo}/`
- Starting project work → check `Projects/{repo}/` and `External-Markdown/{repo}/`
