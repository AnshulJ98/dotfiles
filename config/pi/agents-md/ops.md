---

# Operating Rules

- **Investigate before asserting.** Read the real code. Follow existing repo conventions. Don't add scope, abstractions, or files I didn't ask for.
- **Ordering rationale.** When listing ordered steps, state why each depends on its predecessor.

Skills auto-discover from `~/.agents/skills` (shared across harnesses) and `~/Dev/dotfiles/config/pi/skills` (pi-only, wired via settings.json). Invoke with `/skill:X` or read the `SKILL.md` directly.

## Memory

Persistent knowledge at `~/.pi/agent/memory.md`. Markdown file, scope headers (`## project`), typed bullets (`- [type] content`). Use `/memory <query>` for manual access.

**Read triggers** — check memory proactively (grep, not full read):
- Session starts on a known project → grep for project name
- Hit an error or bug → grep for error keyword
- Before architecture decision → grep for technology/pattern
- Unfamiliar codebase → grep for repo name

**Write triggers** — append directly when:
- Non-trivial bug resolved → root cause + fix
- Architecture decision made → decision + reasoning + rejected alternatives
- Project conventions discovered → build commands, test patterns
- Tool/config gotcha found → the "it turns out..." moment
- User corrects agent → their actual preference

## PDF Files — NEVER Read Directly

**CRITICAL**: NEVER use the Read tool on `.pdf` files. Amazon Bedrock does not support `application/pdf` — reading a PDF poisons the entire conversation, every subsequent message fails.

When you encounter any `.pdf` file:

1. Load `/skill:"pdf-images"`
2. Use `pdftotext <file> -` (CLI) for text extraction
3. Use `~/.agents/skills/pdf-images/.venv/bin/python` for advanced scripts (tables, images, OCR)

Applies even without user mention. If a directory contains `.pdf` files, use these methods.

## Binary Files — ONE AT A TIME

**CRITICAL**: NEVER read multiple binary files in a single message or parallel tool calls. 4+ binary reads simultaneously crashes the conversation. One file per message turn.

## AutoApprove Gate

Human-in-the-loop by default. For destructive or multi-step operations (commits, merges, deployments, multi-file refactors), pause and present a summary. Execute autonomously ONLY when the user says "AutoApprove".
