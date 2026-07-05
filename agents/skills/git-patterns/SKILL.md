---
name: git-patterns
description: Non-obvious git operations — bisect, worktrees, autosquash fixups, reflog recovery, and merge-conflict strategy. Use when hunting a regression, running parallel branches, cleaning history before a PR, recovering lost commits, or resolving conflicts during a rebase.
---

# Git Patterns

Basic rebase/merge/cherry-pick/reset are assumed known. This covers only the sharp edges.

## Golden Rule

Never rebase (or otherwise rewrite) a branch anyone else has pulled. History rewrites invalidate every downstream clone. Rebase only your own un-pushed feature branch onto `main`.

When you must overwrite a remote branch you own, use `--force-with-lease`, never `--force`. `--force-with-lease` aborts if the remote moved since your last fetch (someone else pushed); `--force` clobbers their work silently.

## Bisect — find the commit that introduced a bug

```bash
git bisect start
git bisect bad                 # current commit is broken
git bisect good <known-good-sha>
# git checks out the midpoint; test, then mark good/bad; repeat ~log2(n) times
git bisect reset               # return to original HEAD
```

Automate it — this is the high-value form. `git bisect run` drives the whole search with a script whose exit code decides the verdict (0 = good, 1–124/126/127 = bad, 125 = skip/untestable):

```bash
git bisect start HEAD <known-good-sha>
git bisect run ./test.sh       # or: npm test, pytest -x, cargo test, etc.
git bisect reset
```

The script must be executable and self-contained (rebuild if needed). Use `exit 125` for commits that can't be tested (e.g. won't compile) so bisect skips rather than mismarks them.

## Worktrees — multiple branches checked out at once

One repo, many working directories sharing the same object store. Beats stash-juggling or a second clone: review a PR, run a long build, or hotfix `main` without disturbing your in-progress branch.

```bash
git worktree add ../proj-hotfix main        # existing branch in a new dir
git worktree add -b feature/x ../proj-x     # create branch + worktree
git worktree list
git worktree remove ../proj-hotfix          # when done
git worktree prune                          # clean stale admin files
```

A branch can only be checked out in one worktree at a time. Deleting a worktree's directory by hand leaves dangling metadata — use `git worktree remove` (or `prune`).

## Fixup + autosquash — amend earlier commits cleanly

Instead of a messy `git rebase -i` reorder, tag the fix to its target commit and let git slot it in:

```bash
git commit --fixup <target-sha>       # stages a "fixup! <subject>" commit
git commit --squash <target-sha>      # same, but lets you edit the combined message
git rebase -i --autosquash <base>     # reorders + marks fixups automatically; just save
```

Set `git config --global rebase.autosquash true` to make `-i` autosquash by default.

## Recovery

### Reflog — the undo log for HEAD

Almost nothing is truly lost for ~90 days. Reflog records every HEAD move (commits, resets, rebases, checkouts), even on "deleted" branches or after a bad `reset --hard`.

```bash
git reflog                          # find the SHA of the state you want back
git reset --hard HEAD@{2}           # jump HEAD back to a prior position
git branch recovered <sha>          # resurrect a deleted branch / detached commit
```

After a botched rebase, `git reflog` shows the pre-rebase HEAD — reset to it to bail out entirely.

### Stash to a branch

When a stash won't apply cleanly onto the current branch (it has moved on), `git stash branch` recreates the exact commit state the stash was made against, then applies it — no conflicts:

```bash
git stash branch <new-branch> [stash@{n}]
```

## Conflict Resolution

Strategy per file, not per merge. Don't blanket `git checkout --theirs .` — inspect each conflict and choose:

| File type | Usual choice |
|-----------|--------------|
| Two real feature changes | Manual merge, keep both behaviors |
| Lock file (package-lock, bun.lock, poetry.lock) | Take one side, then re-run install to regenerate |
| Generated / build output | Regenerate from source after resolving the source conflict |
| Added on one side, deleted on other | Decide intent explicitly — git can't |

`git checkout --ours <file>` / `--theirs <file>` resolve a single file; `git add` marks it done; `--continue` proceeds.

### Marker orientation is inverted during a rebase

During a **rebase**, `<<<<<<< HEAD` is the branch you are rebasing *onto* (e.g. `main`), and `>>>>>>>` is *your* commit being replayed — the opposite of a merge, where `HEAD` is your current branch. `--ours` means the branch you're landing on; `--theirs` means your own changes. Read the SHAs, not your instinct, or you'll discard the wrong side.

### Before completing a merge, grep for stray markers

A missed marker compiles as garbage or silently corrupts config. Confirm none survive:

```bash
grep -rn '<<<<<<<' . --exclude-dir=node_modules --exclude-dir=.git
```

Then `git add` + `--continue`. To bail out of any conflicted state entirely: `git rebase --abort` / `git merge --abort` / `git cherry-pick --abort`.
