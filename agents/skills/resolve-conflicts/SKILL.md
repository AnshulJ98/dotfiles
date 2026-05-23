---
name: resolve-conflicts
description: Systematic merge conflict resolution with strategy selection. Use when resolving merge conflicts, handling failed rebases, or recovering from cherry-pick conflicts. Covers manual, ours, theirs strategies with scenario-based resolution and abort/recovery.
---

# Merge Conflict Resolution

## Identify Conflicts

```bash
git status                    # list conflicted files
git diff                      # show conflict markers
```

## Conflict Marker Anatomy

```
<<<<<<< HEAD (or ours)
  current branch version
=======
  incoming branch version
>>>>>>> feature/branch (or theirs)
```

## Resolution Strategies

### Manual (default — when both sides have valid changes)
1. Open conflicted file
2. Edit to desired final state
3. Remove all `<<<<<<<`, `=======`, `>>>>>>>` markers
4. Save

### Take Ours (current branch wins)
```bash
git checkout --ours <file>
git add <file>
```

### Take Theirs (incoming branch wins)
```bash
git checkout --theirs <file>
git add <file>
```

### Tool-assisted
```bash
git mergetool          # opens configured merge tool (vimdiff, VSCode, etc.)
```

## Workflows

### Rebase conflict
```bash
git rebase origin/main
# conflict occurs
git status
# resolve each conflicted file
git add <resolved-files>
git rebase --continue
# repeat until done
# or abort:
git rebase --abort
```

### Merge conflict
```bash
git merge feature/branch
# conflict occurs
# resolve files
git add <resolved-files>
git merge --continue
# or abort:
git merge --abort
```

### Cherry-pick conflict
```bash
git cherry-pick <sha>
# conflict occurs
# resolve files
git add <resolved-files>
git cherry-pick --continue
# or abort:
git cherry-pick --abort
```

## Scenario Guide

| Scenario | Strategy |
|----------|----------|
| Different features in same file | Manual merge |
| Both modified same function | Manual merge, keep both behaviors |
| One branch added, other deleted | Decide: keep or delete |
| Config file conflicts | Keep incoming (usually newer) |
| Lock files (package-lock, bun.lock) | Take theirs, re-run install |
| Generated files | Regenerate after resolving source conflicts |

## Prevention

- Keep PRs small and focused — reduces conflict surface
- Rebase feature branches onto main frequently
- Communicate about files you're editing in shared branches
