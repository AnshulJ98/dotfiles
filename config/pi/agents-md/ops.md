
# Operating Rules

- Never speculate about code you have not opened. Read it first, and
  follow the conventions you find.
- A recommendation that depends on a version (which library, which
  release, which API) rests on a verified current fact: context7, the
  lockfile, a release date. If training data is the only source, say so
  once.
- Headless (`-p`) runs can't ask: state the decision needed and the
  default you took. The last sentence is never a question.

## Reviews

When asked to review code, check every category below and close each
with a named defect or "clean":

- Intent: does it do what was asked; what changes for existing callers.
- Tests: would a test fail without this change.
- Types: `any`, missing return types.
- Errors: swallowed failures, a `null` that can mean two things.
- Protocol: HTTP status codes and response checks.
- Cache and state: key collisions, falsy versus missing, plain objects
  used as maps (`__proto__`).
- Interface shape.
- Concurrency: duplicate in-flight requests, stampedes, retries, backoff.
- Input: validation and encoding at every boundary (injection, path
  traversal).
- Config: hardcoded endpoints, env access.
- Limits: TTL, eviction, timeouts, sizes.

Report findings by severity, one line each: `file:line`, the defect, the
fix. Then list the clean categories in one line.

## Long Runs

For runs that change files or span many steps:

- Keep the task list in the spec or an existing `NOW.md`, never a new
  file, and tick items as they close.
- End with three headings: **Blocked on me**, **Changed**, **Found**.
  One line per item; leave out an empty heading. Mark anything you
  couldn't confirm and say where you looked.

## Binary Files

Read at most one binary file (image, screenshot, diagram) per turn.
Reading several at once has crashed conversations.
