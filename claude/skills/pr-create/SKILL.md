---
name: pr-create
description: Create a GitHub PR with pre-flight verification (type check + tests + lint), commit-derived summary, and reviewer suggestions. Use when the user says "open PR", "/pr-create", or "ship this branch".
allowed-tools: Bash, Read
---

# PR Create

Create a pull request from the current branch with context from commits and code changes.

## Step 1: Pre-flight Check

```bash
BRANCH=$(git branch --show-current)
echo "Branch: $BRANCH"

# Refuse to PR from main/master
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "Cannot create PR from main/master"
  exit 1
fi

# Commits since main
git log main..$BRANCH --oneline 2>/dev/null || git log master..$BRANCH --oneline
git status --short
```

If uncommitted changes exist → ask: commit first (`/commit`) or stash?

## Step 2: Verification Guard

PRs with failing tests waste reviewer time. Catch failures locally first.

1. **Type check**: run the project's command (`pnpm exec tsc --noEmit`, `mypy .`, `cargo check`, etc.)
   - FAIL → HALT. "Fix type errors before creating PR."
2. **Tests**: run the project's test command (`pnpm test`, `pytest`, `go test ./...`, etc.)
   - FAIL → HALT. "Fix failing tests before creating PR."
3. **Lint** (advisory only): run lint (`pnpm run lint`, `ruff check`, etc.)
   - FAIL → WARN, don't block. "Lint issues exist; consider fixing."

## Step 3: Push

```bash
git push -u origin $BRANCH
```

## Step 4: Gather PR Context

```bash
git diff main..HEAD --stat
git log main..HEAD --format="%s%n%b"
git diff main..HEAD --name-only
```

Read 2-3 key changed files to understand the diff. Determine:
- Main feature/fix
- Areas affected
- Breaking changes
- New dependencies

## Step 5: Generate PR Title + Body

**Title** (≤70 chars, conventional-commit format):
```
<type>(<scope>): <imperative description>
```

**Body** template:
```markdown
## Summary
- <1-3 bullets — the WHY, not the WHAT>

## Changes
- <key change 1>
- <key change 2>

## Testing
- [x] Type check passes
- [x] Tests pass (N new, M total)
- [x] Lint clean
- [ ] Manual verification — <one-line>

## Related
Closes #<issue>
```

## Step 6: Suggest Reviewers

```bash
git diff main..HEAD --name-only | xargs -I {} git log -3 --format="%an" -- {} 2>/dev/null \
  | sort | uniq -c | sort -rn | head -3
```

## Step 7: Create PR

```bash
gh pr create \
  --title "<type>(<scope>): <description>" \
  --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>

## Changes
- <change 1>

## Testing
- [x] Type check passes
- [x] Tests pass
EOF
)"
```

## Step 8: Report

```bash
gh pr view --json url,number,state -q '"#\(.number) (\(.state)): \(.url)"'
```

Output:
```
## PR Created
**URL:** <url>
**Branch:** <branch> → main
**Commits:** N

### Next steps
- [ ] Add reviewers if not auto-assigned
- [ ] Add screenshots if UI changes
- [ ] Monitor CI checks
```

## Skip Claude attribution

Per user's global rules: do NOT add "🤖 Generated with Claude Code" or similar attribution footer to the PR body.
