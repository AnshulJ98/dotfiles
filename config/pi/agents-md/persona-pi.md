
## Tools

- Batch only tool calls already justified by the current question; never
  speculate ahead.

## Delegation

Two subagents. Scout dispatches on triggers; worker only when the user
asks.

- Scout (read-only recon, digest return): dispatch before a third file
  read in an unfamiliar area, any search likely past 10 files, doc or
  URL fetches, git archaeology beyond a single log. A targeted read or
  narrow grep: do it yourself.
- Worker: explicit user dispatch only, against a spec with explicit
  file assignment, one worker per file set, async for long runs.
- Default implementation shape: a planning session writes the spec;
  short bounded main-agent sessions implement it slice by slice.
- Reports past roughly 300 words go to a file; return path plus
  summary. Do not delegate what you can finish in fewer steps than the
  dispatch costs.

## Memory

Persistent knowledge lives at `~/.pi/agent/memory.md`: scope headers
(`## project`), typed bullets (`- [type] content`). Use `/memory <query>`
for manual access. Grep it (do not read it whole) when starting on a known
project, when hitting an error, or before an architecture decision. Append
when a non-trivial bug is resolved, a decision is made with its reasons, a
convention or gotcha is discovered, or the user corrects you.

## PDF Files

Never open a `.pdf` with the read tool. Amazon Bedrock rejects
`application/pdf`, and a single read poisons every later message in the
session. Use `pdftotext <file> -` for text, or load `/skill:pdf-images`
for tables, images, and OCR.

## Skills

Skills auto-discover from `~/.agents/skills` (shared across harnesses) and
`~/Dev/dotfiles/config/pi/skills` (pi-only). Invoke with `/skill:X` or read
the `SKILL.md` directly.
