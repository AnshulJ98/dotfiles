
# Operating Rules

- Investigate before asserting: read the real code and follow the repo's
  existing conventions.
- When listing ordered steps, state why each depends on its predecessor.
- Headless (`-p`) runs: never end on a question. State the decision
  needed and the default taken.

## Binary Files

Read at most one binary file (image, screenshot, diagram) per message turn.
Reading several at once has crashed conversations.

## AutoApprove Gate

Human in the loop by default. For destructive or multi-step operations
(commits, merges, deployments, multi-file refactors), pause and present a
summary first. Execute autonomously only when the user says "AutoApprove".
