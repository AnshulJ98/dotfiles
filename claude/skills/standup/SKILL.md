---
name: standup
description: Generate a daily standup summary from git activity across all projects in ~/Dev. Use when the user says "standup", "what did I do yesterday", or "daily summary". Reads commits + PR activity + branch state — outputs a tight 3-section markdown (done / in-progress / blockers).
allowed-tools: Bash, Read
---

# Standup

Daily summary across all projects.

## Step 1: Gather

```bash
SINCE="${1:-yesterday}"  # or "2 days ago", "Monday", etc.

# Commits across all ~/Dev projects (you)
find ~/Dev -maxdepth 2 -name ".git" -type d 2>/dev/null \
  | while read gitdir; do
      repo=$(dirname "$gitdir")
      log=$(GIT_OPTIONAL_LOCKS=0 git -C "$repo" log \
        --author="$(git config user.email)" \
        --since="$SINCE" \
        --pretty=format:"%h %s" 2>/dev/null)
      [ -n "$log" ] && echo "═══ $(basename "$repo") ═══" && echo "$log" && echo
    done

# Open PRs
gh pr list --author "@me" --state open --json number,title,headRefName,updatedAt,repository \
  --jq '.[] | "  #\(.number): \(.title) (\(.headRefName)) [\(.repository.name)]"' 2>/dev/null

# Recently merged PRs
gh search prs --author "@me" --merged-at ">=$(date -v-1d +%Y-%m-%d)" \
  --json number,title,repository -L 10 \
  --jq '.[] | "  ✓ #\(.number): \(.title) [\(.repository.name)]"' 2>/dev/null
```

## Step 2: Identify In-Progress

For each repo with recent commits:
```bash
git -C "$repo" status --short
git -C "$repo" log --oneline -3
git -C "$repo" branch --show-current
```

Branches != main with uncommitted state = in progress.

## Step 3: Identify Blockers

Look for:
- PRs awaiting review (request-changes or no review activity >2 days)
- Stale branches (>5 days no commits, not merged)
- Failed CI runs on user's open PRs

```bash
gh pr list --author "@me" --state open --json number,title,reviewDecision \
  --jq '.[] | select(.reviewDecision == "CHANGES_REQUESTED" or .reviewDecision == null) | "  ⚠ #\(.number): \(.title) — \(.reviewDecision // "no review")"'
```

## Step 4: Output

```markdown
## Standup — <DATE>

### Done <since-window>
- <repo>: <commit summary 1>
- <repo>: <commit summary 2>
- ✓ merged #<pr>: <title>

### In Progress
- <repo>:<branch> — <current state>
- Open PR #<num>: <title> (status: <ci-state>)

### Blockers / Asks
- <PR awaiting review> — needs <reviewer>
- <Stale branch> — decide: continue or close?
- <CI failure> — investigate
```

Keep it tight. Bullets only. No filler.
