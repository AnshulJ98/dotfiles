---
name: git-patterns
description: Complex git operations, rebasing, merge conflict strategies, branch workflows, and recovery from bad states. Use when rebasing with conflicts, cherry-picking across branches, recovering from detached HEAD, cleaning history, or choosing between merge/rebase/squash.
---

# Git Patterns

## Rebase vs Merge vs Squash

| Strategy | When to use | Result |
|----------|-------------|--------|
| Merge | Integration branches, preserving history | Merge commit, full history |
| Rebase | Feature branches before PR | Linear history, cleaner log |
| Squash | Small/messy PR commits before merge | Single clean commit |

**Rule**: rebase your own feature branch onto main. Never rebase shared branches.

## Common Workflows

### Feature branch rebase
```bash
git fetch origin
git rebase origin/main          # rebase onto latest main
# if conflicts:
git status                      # see conflicted files
git add <resolved>
git rebase --continue           # or --abort to cancel
git push --force-with-lease     # safe force push (fails if someone else pushed)
```

### Interactive rebase (clean up commits)
```bash
git rebase -i HEAD~5            # edit last 5 commits
# s = squash into previous
# r = reword commit message
# d = drop commit
# f = fixup (squash, discard message)
```

### Cherry-pick
```bash
git cherry-pick <sha>           # apply single commit
git cherry-pick <sha1>..<sha2>  # apply range (exclusive..inclusive)
git cherry-pick --no-commit <sha>  # apply changes without committing
```

## Recovery Patterns

### Undo last commit (keep changes staged)
```bash
git reset --soft HEAD~1
```

### Undo last commit (keep changes unstaged)
```bash
git reset HEAD~1
```

### Recover deleted branch
```bash
git reflog                      # find the SHA
git checkout -b <branch> <sha>
```

### Detached HEAD recovery
```bash
git branch temp-save            # save current state
git checkout main
git merge temp-save
```

### Revert a pushed commit (safe for shared branches)
```bash
git revert <sha>                # creates a new "undo" commit
```

## Commit Message Convention

```
type(scope): short description

Body: why, not what. Max 72 chars per line.

Closes #123
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

## Conflict Resolution

1. `git status` — identify conflicted files
2. Open file — look for `<<<<<<<`, `=======`, `>>>>>>>`
3. Edit to desired state, remove markers
4. `git add <file>`
5. `git rebase --continue` or `git merge --continue`

For "take theirs": `git checkout --theirs <file>`
For "take ours": `git checkout --ours <file>`
