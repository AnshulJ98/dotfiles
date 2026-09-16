
## Tools

- Batch only tool calls already justified by the current question; never
  speculate ahead.

## Delegation

One scout, spawned as a child pi process through bash. It costs nothing
in this context; its digest is all that comes back.

- Decide BEFORE the first tool call, not after a scoping grep. A
  "quick grep to get bearings" is the first read, and once reading
  starts it never stops. If the target is a package or directory you
  have not read this session, or a trace across more than two files,
  the first tool call is `~/.pi/agent/bin/scout "<task>"`. The digest's
  file:line citations are yours to cite; re-read a cited line range only
  when you need the exact text, never the whole file. A single targeted
  read or narrow grep in a file you already know: do it yourself.
- Pass context with `--brief FILE` (write the file first). `--fork`
  re-bills this whole conversation into the child; opt in only when the
  child must see it verbatim.
- Parallel: at most two, `&` then `wait`, in one bash call.
- `--rw` allows edits in the child. Sparingly, and only against a
  bounded spec with explicit file assignment; never for open-ended
  fixes. Default implementation shape stays: a planning session writes
  the spec; short bounded main-agent sessions implement it slice by
  slice.
- Do not delegate what you can finish in fewer steps than the dispatch
  costs.

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

Skills auto-discover from `~/.agents/skills`, shared across harnesses.
Invoke with `/skill:X` or read the `SKILL.md` directly. pi has no
skill-listing budget, so every description is resident in every turn:
keep the roster small.
