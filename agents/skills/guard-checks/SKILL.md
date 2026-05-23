---
name: guard-checks
description: Reusable precondition check patterns that HALT execution on violation. Use when performing destructive or multi-step operations like commits, merges, deployments, or multi-file refactors.
---

# Guard Checks

Precondition patterns that stop execution immediately if violated.

## Core Guards

### Clean Working Tree
```bash
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree is dirty. Commit or stash changes first." >&2
  exit 1
fi
```

### Correct Branch
```bash
EXPECTED_BRANCH="main"
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "ERROR: Expected branch '$EXPECTED_BRANCH', got '$CURRENT_BRANCH'" >&2
  exit 1
fi
```

### No Merge Conflicts
```bash
if git diff --check 2>&1 | grep -q "conflict"; then
  echo "ERROR: Unresolved merge conflicts detected." >&2
  exit 1
fi
```

### Tests Pass
```bash
if ! npm test --silent; then
  echo "ERROR: Tests failing. Fix before proceeding." >&2
  exit 1
fi
```

### File Exists
```bash
check_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Required file '$file' not found." >&2
    exit 1
  fi
}
```

### Environment Variable Set
```bash
check_env() {
  local var="$1"
  if [[ -z "${!var}" ]]; then
    echo "ERROR: Required env var '$var' is not set." >&2
    exit 1
  fi
}
# Usage: check_env "DATABASE_URL"
```

## Composing Guards

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "→ Running pre-deploy checks..."
check_clean_tree
check_branch "main"
check_env "DATABASE_URL"
check_env "API_KEY"
run_tests

echo "✓ All checks passed. Proceeding."
```

## Usage in Agent Workflows

Before destructive multi-step operations, invoke guard-checks:
1. Identify what can go wrong
2. Write a guard for each failure mode
3. Run all guards before any write operations
4. HALT immediately on first violation
