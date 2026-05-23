---
name: pre-pr-review
description: Multi-perspective code review on the current diff (security + performance + architecture + correctness). Dispatches a single reviewer subagent OR multiple parallel reviewers for large diffs. Use when the user says "review this", "review my diff", "/review", or before opening a PR.
allowed-tools: Task, Bash, Read, Grep
---

# Review

Pre-PR self-review across 4 dimensions: security, performance, architecture, correctness.

## Step 1: Identify Scope

```bash
git branch --show-current
git diff main --stat
git diff main --name-only
git log main..HEAD --oneline
```

Size thresholds:
| Files changed | Reviewers |
|---------------|-----------|
| 1-10 | Single `challenger` subagent (one perspective) |
| 11-30 | Parallel: security + architecture (2 subagents) |
| 31+ | Parallel: security + architecture + performance + correctness (4 subagents) |

## Step 2: Run the Gauntlet

In parallel (Bash):
```bash
pnpm exec tsc --noEmit
pnpm run lint || true
pnpm test --run || true
pnpm run build 2>&1 | tail -20 || true
```

## Step 3: Diff Heuristic Sweep

Quick scan for common smells (zero subagent cost):

```bash
git diff main --unified=0 | rg "^\+" | rg "console\.(log|debug|info)" || echo "✓ No console.logs"
git diff main --unified=0 | rg "^\+" | rg ": any" || echo "✓ No 'any' casts"
git diff main --unified=0 | rg "^\+" | rg "TODO|FIXME" || echo "✓ No new TODOs"
git diff main --unified=0 | rg "^\+.*//.*[a-zA-Z]+\(" | head -10 || echo "✓ No commented-out code"
git diff main --name-only | rg "\.env|secret|password|token|key" || echo "✓ No secrets files"
git diff main --stat | rg "[5-9][0-9]{3,} \+" || echo "✓ No huge file additions"
```

## Step 4: Dispatch Reviewer(s)

For small diffs — single challenger:
```
Task(subagent_type="challenger",
     description="Pre-PR review",
     prompt="""Review the current diff (main..HEAD). Files: <list>.

     Focus on:
     - Unexamined premises in the design
     - Hidden complexity / failure modes
     - Assumptions that haven't been verified

     Return your standard one-question-at-a-time challenge format.""")
```

For larger diffs — parallel specialized reviewers (all in ONE message):
```
Task(subagent_type="challenger",
     description="Security review",
     prompt="Review for: auth bypass, injection, secrets, unsafe deserialization, OWASP Top 10. Files: <list>")

Task(subagent_type="challenger",
     description="Architecture review",
     prompt="Review for: layering violations, coupling, circular deps, contract changes, blast radius of changes. Files: <list>")

Task(subagent_type="challenger",
     description="Performance review",
     prompt="Review for: N+1 queries, missing pagination, unbounded loops, sync ops in hot paths, missing indexes. Files: <list>")

Task(subagent_type="challenger",
     description="Correctness review",
     prompt="Review for: edge cases (empty, null, error paths), race conditions, missing await, off-by-one, integer overflow, timezone bugs. Files: <list>")
```

## Step 5: Aggregate

Combine challenger concerns by file. Sort by severity:
- CRITICAL: must fix before PR
- ISSUE: fix or justify in PR description
- CONCERN: informational

## Step 6: Report

```markdown
## Self-Review — <branch>

### Verification
- Type check: PASS / FAIL
- Lint: PASS / FAIL
- Tests: PASS / FAIL
- Build: PASS / FAIL

### Smell scan
✓ No console.logs   ✓ No `any`   ✓ No new TODOs   ✗ secrets file detected

### Reviewer concerns
| Severity | File:Line | Concern |
|----------|-----------|---------|
| CRITICAL | src/auth.ts:42 | <one-line> |
| ISSUE | src/api.ts:108 | <one-line> |

### Recommended action
- [ ] Fix CRITICAL items
- [ ] Address or justify ISSUE items in PR description
- [ ] Consider CONCERN items

### Ready for PR?
YES / NO + reason
```

## When to skip review

- Pure docs / README changes
- Lockfile-only changes
- Dependency-bump PRs (use `dependabot review` style elsewhere)
- Single-line typo fixes
