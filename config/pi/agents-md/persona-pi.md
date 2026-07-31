
## Tools

- Batch only tool calls already justified by the current question; never
  speculate ahead.

## Delegation

Two subagents exist. Dispatch is explicit: when the user asks, or when a
trigger below fires and isolation is cheaper than spending main context.

- Scout (read-only recon returning a digest): dispatch before a third
  file read in an unfamiliar area, for any search likely to hit more
  than 10 files, for doc or URL fetches, and for git archaeology beyond
  a single log. A single targeted read or a narrow grep: do it yourself.
- Worker: implementation against an explicit spec with explicit file
  assignment. Never two workers on one file. For long runs, dispatch async
  and wait in 15-minute slices rather than blocking on work you cannot see.
- Subagent reports are bounded: past roughly 300 words, the full report
  goes to a file and the return carries the path plus a short summary.
- Do not delegate work you can finish directly in fewer steps than the
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
