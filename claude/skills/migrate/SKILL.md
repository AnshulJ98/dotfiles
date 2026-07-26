---
name: migrate
description: Pattern migration across codebase using ast-grep for structural changes or ripgrep for literal patterns. Spawns parallel worker Tasks per file batch with type-check verification after each wave. Use when the user says "migrate X to Y" or "/migrate <from> <to>".
allowed-tools: Bash, Read, Edit, Task, Grep, Glob
---

# Migrate

Find and replace patterns across the codebase with parallel execution and verification gates.

## Usage

```
/migrate <from-pattern> <to-pattern>
/migrate "console.log" "logger.debug"
/migrate "import { foo } from 'old-pkg'" "import { foo } from 'new-pkg'"
/migrate --dry-run "oldFunction" "newFunction"
```

## Step 1: Parse Arguments

Extract:
- `<from-pattern>` — literal string OR ast-grep pattern
- `<to-pattern>` — replacement
- `--dry-run` — preview only, no edits

## Step 2: Find All Occurrences

```bash
# Literal patterns
rg --files-with-matches "<from-pattern>" --type-add 'code:*.{ts,tsx,js,jsx,mjs,cjs,py}' -t code

# Structural patterns (AST)
ast-grep --pattern '<from-pattern>' --lang typescript src/
```

## Step 3: Assess Impact

```bash
rg --count "<from-pattern>" --type-add 'code:*.{ts,tsx,js,jsx,mjs,cjs,py}' -t code
rg --count "<from-pattern>" --type-add 'code:*.{ts,tsx,js,jsx,mjs,cjs,py}' -t code \
  | awk -F: '{sum+=$NF} END {print sum}'
```

Thresholds:
| Scope | Strategy |
|-------|----------|
| <5 files | Single coder Task |
| 5-20 files | Parallel worker Tasks, one per file (max 4 concurrent) |
| >20 files | Batch into waves of 4, verify after each wave |

## Step 4: Dry-Run (if --dry-run)

```bash
rg "<from-pattern>" --type-add 'code:*.{ts,tsx,js,jsx,mjs,cjs,py}' -t code -C 2
```

Show preview, stop. No edits.

## Step 5: Execute

### Literal patterns — spawn parallel coders

```
Task(subagent_type="coder",
     description="Migrate batch N",
     prompt="""Apply transformation to the listed files.

     BEFORE: <from-pattern>
     AFTER:  <to-pattern>

     Files (exclusive ownership):
     - path/to/file1.ts
     - path/to/file2.ts

     Rules:
     - Preserve formatting and indentation
     - Update imports if needed
     - Don't touch comments/strings unless they explicitly match
     - Run `pnpm exec tsc --noEmit` on the FULL project after edits — single-file tsc bypasses tsconfig and gives misleading green

     Return: { filesChanged, instancesReplaced, typeCheckPassed }""")
```

### Structural patterns — use ast-grep directly (faster than worker Tasks)

```bash
ast-grep --pattern '<from-pattern>' --rewrite '<to-pattern>' --lang typescript src/
```

Always follow with `git diff` review — AST rewrites can have unexpected reach.

## Step 6: Verify

After each wave:
```bash
pnpm exec tsc --noEmit              # full-project type check
pnpm run lint
pnpm test --run
rg "<from-pattern>" --type-add 'code:*.{ts,tsx,js,jsx,mjs,cjs,py}' -t code \
  || echo "No remaining occurrences"
```

If tsc fails → spawn a fix-it coder on the specific failing files. Never commit a broken migration.

## Step 7: Commit

```bash
git add .
git commit -m "$(cat <<'EOF'
refactor: migrate <from-pattern> to <to-pattern>

- Replaced N occurrences across M files
- Type check passed, tests green
EOF
)"
```

## Step 8: Report

```markdown
## Migration complete

### Pattern
`<from-pattern>` → `<to-pattern>`

### Impact
- Files changed: N
- Occurrences replaced: M
- Coder Tasks: K (waves: W)

### Verification
- Type check: PASS
- Lint: PASS
- Tests: PASS
- Remaining occurrences: 0

### Commit
<commit-sha>
```

## Tips

- Run `--dry-run` first for migrations >10 files
- Check `git diff` before committing — AST rewrites can reach further than expected
- For renames spanning types and values, follow up with `rg` to catch references ast-grep missed
- Commit per wave during large migrations — smaller commits = easier rollback
- Structural (ast-grep) beats textual (rg/sed) for anything beyond trivial strings
