
## Tools

- Batch tool calls only when each one is already needed; don't read
  ahead speculatively.

## Delegation

One scout, spawned as a child pi process through bash. Its reading stays
out of this context; only its digest comes back.

- Decide before the first tool call, not after a scoping grep. A
  "quick grep to get bearings" is the first read, and once reading
  starts it never stops. If the target is a package or directory you
  have not read this session, or a trace across more than two files,
  the first tool call is `~/.pi/agent/bin/scout "<task>"`. The digest's
  file:line citations are yours to cite; re-read a cited line range only
  when you need the exact text, never the whole file. A single targeted
  read or narrow grep in a file you already know: do it yourself. Never
  dispatch for a single named file, however unfamiliar, or for a
  directory one `ls` covers; the scout's floor is two or more files
  whose contents you would otherwise have to read.
- Pass context with `--brief FILE` (write the file first). `--fork`
  re-bills this whole conversation into the child; use it only when the
  child must see the conversation verbatim.
- Parallel: at most two, `&` then `wait`, in one bash call.
- `--rw` runs a worker that may edit files. Its brief is a spec from
  `/spec-contract` (frontmatter `files-allowed` and `tests`; the wrapper
  exits 2 without one), opening with `docs/maps/<module>-map.md` when
  that exists. Use it for bounded slices only; open-ended fixes stay in
  this session. Read the `WORKER-SENSORS:` line before the worker's own
  report, because the sensors rerun the tests and check the file list.
- One open worker per repo: dispatch the next slice only after the last
  one is merged or rejected, because unreviewed slices stack faster than
  they can be read.
- Don't delegate what you can finish in fewer steps than the dispatch
  costs.

## Memory

`~/.pi/agent/memory.md` holds what earlier sessions learned, as
`- [type] content` bullets under `## <scope>` headers. Grep it, never
read it whole: when starting on a known project, when an error appears,
and before an architecture decision. Add a bullet when a non-trivial bug
is resolved, a decision is made with its reasons, a gotcha turns up, or
the user corrects you.

## PDF Files

Never open a `.pdf` with the read tool. Amazon Bedrock rejects
`application/pdf`, and a single read poisons every later message in the
session. Use `pdftotext <file> -` for text, or load `/skill:pdf-images`
for tables, images, and OCR.
