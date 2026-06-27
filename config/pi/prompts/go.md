---
name: go
description: "Activate worker delegation — enables implementation subagent for the current task"
---

# Worker Delegation Activated

The **worker** subagent is now available for this task. Use it to delegate scoped implementation work.

Scout is always available — you don't need `/go` for research and retrieval.

## Worker

Writes code in assigned files, runs tests, verifies changes. Forks context. Default gpt-5.4-mini; escalate to sonnet for complex logic: `model: "github-copilot/claude-sonnet-4.6"`.

## When to delegate to worker

- Clear, scoped implementation with explicit file assignments.
- Parallel non-overlapping file edits (max 2 concurrent).
- Tasks where implementation noise would bloat your main context.

## Rules

- Never let two workers edit the same file.
- Assign files explicitly in every task description.
- Review worker output before reporting to the user.
- Qwen3 (MLX) is locked to scout-class mechanical lookups only — never for worker tasks.
- Default to doing the work yourself unless delegation clearly helps.
