---
name: orchestrate
description: Manually trigger the orchestrator pipeline for a feature without starting the session as orchestrator-main. Reads user request, dispatches planner → coder waves with duck checkpoints, verifies. Use when the user says "/orchestrate <feature>" or asks for a multi-phase build without having launched with `claude --agent orchestrator`.
allowed-tools: Task, Read, Bash, Glob, Grep, TodoWrite, TaskCreate, TaskUpdate
---

# Orchestrate

Inline orchestrator pipeline. Same workflow as the `orchestrator` subagent (when set as main session via `claude --agent orchestrator`), but runs from a regular session.

## When to use this skill vs the subagent

- **Subagent (`claude --agent orchestrator`)**: launch the session in orchestrator mode. Every request goes through the pipeline. Best for sustained multi-feature work.
- **This skill (`/orchestrate <feature>`)**: one-shot pipeline invocation. Best for ad-hoc multi-step work in a session that started normally.

## Step 1: Plan

Dispatch the planner:

```
Task(subagent_type="planner",
     description="Plan: <feature>",
     prompt="""Create an implementation plan for: <user request>.

     Output the standard plan format (Summary, Scope, Context map, Implementation steps with file assignments, Wave plan with risk tags, Verification plan).""")
```

Read the returned plan. Validate:
- Each wave has zero intra-wave file conflicts
- Risks are tagged
- File assignments are explicit

If the plan is unclear or risky → call `challenger` before proceeding.

## Step 2: Parse Phases

Convert the plan into execution phases:

```
### Phase 1: <name>
- Task 1.1: <description> → coder
  Files: src/file1.ts, src/file1.test.ts
- Task 1.2: <description> → coder
  Files: src/file2.ts, src/file2.test.ts
(PARALLEL — no file overlap)

### Phase 2: <name> (depends on Phase 1)
- Task 2.1: <description> → coder
  Files: src/file3.ts
```

Confirm with user before executing if any HIGH-risk tasks are present.

## Step 3: Execute Each Phase

For each phase, spawn ALL Tasks in a SINGLE message (real parallelism):

```
Task(subagent_type="coder",
     description="<task>",
     prompt="""You own these files exclusively this wave:
     - src/file1.ts, src/file1.test.ts

     Task: <outcome, not implementation>

     TDD required. Test sandwich required.

     Return: { filesChanged, verificationOutput, suggestedCommit, summary }""")

Task(subagent_type="coder",
     ...)
```

Max 4 parallel Tasks per phase.

## Step 4: Verification per Phase

After each phase:
- Run `pnpm exec tsc --noEmit && pnpm run lint && pnpm test --run`
- If failures: dispatch a fix-it coder. Re-verify before moving on.

## Step 5: Final Report

```markdown
## Pipeline complete — <feature>

### Waves
| Wave | Tasks | Files | Outcome |
|------|-------|-------|---------|

### Verification
- Type check: PASS
- Lint: PASS
- Tests: PASS (N new, 0 regressions)

### Open items
[deliberate deferrals]

### Suggested commit / PR
[one-line summary]
```

## Anti-patterns (avoid)

- Skipping the planner because "I know what to do"
- Tasks running serially when files don't overlap
- Skipping per-phase verification
- More than 4 Tasks in a wave
- Telling the coder HOW instead of WHAT
