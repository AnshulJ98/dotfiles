
# Operating Rules

- Investigate before asserting: read the real code and follow the repo's
  existing conventions.
- When listing ordered steps, state why each depends on its predecessor.
- Headless (`-p`) runs: never end on a question. State the decision
  needed and the default taken.

## Long and Headless Runs

These apply to runs that change files or span many steps, not to
simple answers.

- Keep the task list in the spec or an existing `NOW.md`, never a new
  file, and tick items as they close.
- End with three headings: **Blocked on me**, **Changed**, **Found**.
  Mark anything you couldn't confirm, and say where you looked.

## Binary Files

Read at most one binary file (image, screenshot, diagram) per message turn.
Reading several at once has crashed conversations.

## AutoApprove Gate

Human in the loop by default. For destructive or multi-step operations
(commits, merges, deployments, multi-file refactors), pause and present a
summary first. Execute autonomously only when the user says "AutoApprove".
