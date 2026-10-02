---

# Work Environment

## Language Runtimes and Browsers

Check the operating system before choosing runtime and browser paths.

On macOS, language runtimes and browser binaries run from `/opt/homebrew/`.
The work machine's security policy blocks them under `~` and through symlinks
from `~`.

- Playwright: `PLAYWRIGHT_BROWSERS_PATH=/opt/homebrew/var/playwright`
- Node/npm/npx, Python/uvx: resolve to `/opt/homebrew/bin/`
- Never assume `~/.local/bin/` or `~/.bun/bin/` paths will work on macOS.
- Exception: project virtualenvs and skill venvs are allowed — e.g.
  `~/.agents/skills/pdf-images/.venv/bin/python` (see PDF rule).

On Linux, resolve installed runtimes from `PATH`; the macOS `/opt/homebrew/`
restriction does not apply. Before running Node tests, check `command -v node`
and `node --version`, then use that installed Node. Resolve other runtimes the
same way. Use the project's configured Playwright browser location or its
installed default; do not set the macOS browser path on Linux.

This rule names runtimes and browsers only. Shell utilities (`ls`, `grep`,
`bash`, `find`, `sed`) resolve from `PATH` as normal. Bash scripts under `~`
such as `~/.pi/agent/bin/scout` are read by the shell and run normally.

## Obsidian Knowledge Vault

Document-level knowledge at `~/Documents/NotesVault`. Full rules: the `vault` skill, hosted locally on the work machine (not in this repo).

- **Never touch**: `Secrets/`, `DailyLogs/`, `External-Markdown/`
- **Routing**: 1-3 sentences → `~/.pi/agent/memory.md`. Needs a document → vault under `Projects/{repo}/`
- Starting project work → check `Projects/{repo}/` and `External-Markdown/{repo}/`
