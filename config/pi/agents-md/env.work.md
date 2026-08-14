---

# Work Environment

## Execution Binaries — /opt/homebrew/ Only

**CRITICAL**: All execution binaries MUST run from `/opt/homebrew/`. Paths under `~` and symlinks from `~` are blocked by macOS security policy.

- Playwright: `PLAYWRIGHT_BROWSERS_PATH=/opt/homebrew/var/playwright`
- Node/npm/npx, Python/uvx: resolve to `/opt/homebrew/bin/`

Never assume `~/.local/bin/` or `~/.bun/bin/` paths will work.

Exception: project virtualenvs and skill venvs are allowed — e.g. `~/.agents/skills/pdf-images/.venv/bin/python` (see PDF rule).

## Obsidian Knowledge Vault

Document-level knowledge at `~/Documents/NotesVault`. Full rules: the `vault` skill, hosted locally on the work machine (not in this repo).

- **Never touch**: `Secrets/`, `DailyLogs/`, `External-Markdown/`
- **Routing**: 1-3 sentences → `~/.pi/agent/memory.md`. Needs a document → vault under `Projects/{repo}/`
- Starting project work → check `Projects/{repo}/` and `External-Markdown/{repo}/`
