---
name: commit
description: Generate a conventional-commit message from staged changes. Runs pre-commit guards (merge conflicts, detached HEAD, staged check), categorizes the diff, presents 2-3 message options, and commits on approval. Use when the user says "commit", "/commit", or asks you to commit changes.
allowed-tools: Bash, Read, Grep
---

# Commit

Smart commit with conventional-commit format. Adapted from Burke Holland's commit patterns + OpenCode's pre-commit guards.

## Step 0: Pre-Commit Guard

Verify preconditions before gathering context. Bad-state commits are harder to fix after than before.

1. **Merge conflicts**: `git status` — if "both modified" or "Unmerged paths" present, HALT. Tell user to resolve conflicts first (`/resolve-conflicts` skill if available).
2. **Detached HEAD**: `git symbolic-ref HEAD` — if it fails, HALT. Tell user to checkout a branch.
3. **Staged changes**: `git diff --cached --quiet` — if exit code 0 (nothing staged), warn but don't halt. User may want to stage interactively.

All guards passed → continue.

## Step 1: Gather Context

Run in parallel:
```bash
git diff --cached --stat
git diff --cached --name-only
git branch --show-current
git log --oneline -5
```

## Step 2: Analyze Changes

```bash
git diff --cached
```

Categorize:
| Type | Use when |
|------|----------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Restructure without behavior change |
| `docs` | Documentation only |
| `test` | Adding/fixing tests |
| `chore` | Maintenance, deps, config |
| `perf` | Performance improvement |
| `style` | Formatting, whitespace |
| `ci` | CI/CD config |
| `build` | Build system, packaging |

## Step 3: Identify Scope

- Single component/module → use that name
- Multiple related files → use parent feature name
- Broad changes → omit scope

## Step 4: Generate

Format:
```
<type>(<scope>): <imperative present tense, ≤72 chars, no trailing period>

<body — WHY, not WHAT. Wrap at 72.>
```

Rules:
- Imperative mood ("add", not "added")
- No period at end of subject
- Body explains motivation

## Step 5: Present Options

Offer 2-3 messages, recommended first:

```
### Option 1 (recommended)
feat(auth): add automatic token refresh

Refreshes JWT 5 minutes before expiry to prevent session
interruption during long operations.

### Option 2 (minimal)
feat(auth): add token refresh

### Option 3 (detailed)
feat(auth): implement proactive JWT refresh mechanism

- Add refresh check to auth middleware
- Background scheduler for refresh
- Graceful failure handling
```

Ask: "Which one? Or provide your own."

## Step 6: Execute (on confirmation)

```bash
git commit -m "$(cat <<'EOF'
<chosen message>
EOF
)"
```

Use HEREDOC to preserve multi-line bodies. Confirm result with `git status` after.

## Anti-Patterns (reject these)

```
fix: fixed bug                    ← vague, past tense
feat: added new feature           ← past tense, no specificity
update stuff                      ← no type, meaningless
fix: correct calculation error.   ← trailing period
chore: misc changes               ← "misc" = no information
```

## Good Examples

```
fix(auth): prevent session timeout during token refresh
feat(api): add pagination to user list endpoint
refactor(db): extract query builder from repository
test(auth): add integration tests for OAuth flow
docs(api): document rate limiting headers
```

## Skip Claude attribution

Per user's global rules: do NOT add "Co-Authored-By: Claude" or "Generated with Claude" lines. The user's commits are the user's commits.
