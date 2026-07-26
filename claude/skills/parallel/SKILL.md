---
name: parallel
description: Dispatch multiple independent tasks to subagents in parallel with explicit file ownership. Use when the user lists 2+ independent units of work (e.g. "do X, Y, and Z") or says "/parallel <tasks>". Spawns up to 4 concurrent Task calls in a single message — that's the only way Claude Code achieves real parallelism.
allowed-tools: Task, Read, Bash, TodoWrite
---

# Parallel

Explicit parallel execution. Given a list of independent tasks, spawn subagents in one message with file-level ownership boundaries.

## Usage

The user provides tasks as:
- A list ("do X, then Y, then Z")
- An explicit `/parallel "task 1" "task 2" "task 3"` invocation
- A file: `/parallel --file tasks.txt`

## Step 1: Parse Tasks

Extract each task. Each becomes a separate Task call to the `worker` subagent.

## Step 2: Branch Strategy

Default: feature branch + PR. Unless user explicitly says "to main".

```bash
git checkout -b parallel/<short-description>
git push -u origin HEAD
```

## Step 3: Conflict Analysis

Before spawning, identify likely files per task. If two tasks target the same files:

```
⚠️ Conflict detected:
- Task 1 and Task 3 may both touch `src/auth/*`

Options:
1. Proceed — agents will use explicit file ownership
2. Merge conflicting tasks
3. Run sequentially across waves
```

The only safe parallelization boundary is **one file per agent** for the duration of the wave.

## Step 4: Spawn Agents (all in ONE message)

This is the critical step — all Task calls must be in a single assistant message for real parallelism.

```
Task(subagent_type="coder",
     description="Parallel #1: <brief>",
     prompt="""You are parallel worker #1.

     Owned files (no other agent touches these):
     - src/path/to/file1.ts
     - src/path/to/file1.test.ts

     Task: <what to do — outcome, not implementation>

     On complete:
     - Run TDD: failing test → minimum code → green
     - Run full verification (type check + lint + tests)
     - Commit and push to parallel branch
     - Return: { filesChanged, commitSha, summary, errors }""")

Task(subagent_type="coder",
     description="Parallel #2: <brief>",
     prompt="...")

# ... up to 4 in this wave
```

**Cap: 4 concurrent Tasks per wave.** Exceeding this creates API contention and unclear failure modes.

## Step 5: Wait for All

Claude Code returns all Task results automatically. Wait for the wave to fully complete before starting the next.

## Step 6: Report Results

```markdown
## Parallel wave complete

### Results
| # | Task | Status | Files | Commit |
|---|------|--------|-------|--------|
| 1 | <task> | ✓ | <count> | <sha> |
| 2 | <task> | ✓ | <count> | <sha> |
| 3 | <task> | ✗ | — | — |

### Failed tasks
[detail on any failures + remediation plan]
```

## Step 7: PR Creation

If all tasks succeeded and user wanted a PR:
```bash
gh pr create --title "feat: <parallel batch summary>" --body "$(cat <<'EOF'
## Summary
<what the parallel tasks accomplished>

## Tasks
| # | Task | Status |
| 1 | <task> | ✓ |
| 2 | <task> | ✓ |
EOF
)"
```

## Examples

```bash
# Cross-file fixes
/parallel "fix type errors in auth.ts" "add tests for user.service.ts" "update README"

# Pattern migration across modules
/parallel "migrate Dashboard to useQuery" "migrate Settings to useQuery" "migrate Profile to useQuery"
```

## When NOT to use parallel

- Tasks have data dependencies (B needs A's output)
- Tasks touch overlapping files
- Single-file change (overhead exceeds benefit)
- Tasks require shared state coordination

For dependent work, run the phases sequentially in the main session instead.
