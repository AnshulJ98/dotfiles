# Skills Index

Skills are loaded on demand via `skill(name="X")`. Each skill provides specialized knowledge, patterns, or workflows.

## Always-Loaded (in CLAUDE.md / AGENTS.md)
- `clean-code` — Code principles, TypeScript conventions, testing strategy, Smart Brevity. ALL code generation tasks.
- `error-prevention` — Recurring error patterns and guards.
- `git-patterns` — Git operations, rebasing, recovery, commit conventions.
- `caveman` — Token compression mode. Triggered by "caveman", "less tokens", etc.

## Load on Demand

| Skill | Load when... |
|-------|-------------|
| `adr-patterns` | Making architectural decisions, choosing frameworks, documenting choices |
| `cli-builder` | Building TypeScript CLIs, adding subcommands, developer tooling |
| `code-review` | Reviewing PRs, auditing code quality |
| `context7` | Need current library docs, API references, version-specific behavior |
| `decision-framework` | Evaluating technical choices, comparing 3+ alternatives |
| `diagram-generation` | Creating architecture diagrams, flowcharts, SVG output, draw.io files |
| `docs-generation` | Writing JSDoc/TSDoc, READMEs, changelogs, API docs |
| `guard-checks` | Before destructive ops (commits, deployments, multi-file refactors) |
| `mission` | Planning epics, Goal→Options→Plan, story breakdowns |
| `nextjs-app-router` | Building with Next.js App Router v15+ |
| `pdf-images` | Any PDF file operation — extract, merge, split, OCR |
| `resolve-conflicts` | Resolving merge/rebase/cherry-pick conflicts |
| `security-review` | Before committing features touching auth, secrets, user input |
| `skill-creator` | Creating or updating skills |
| `system-design` | Designing modules, APIs, CLIs for reuse |
| `test-runner` | Running tests in any project (auto-detects framework) |
| `testing-patterns` | Breaking dependencies for testability, legacy code testing |
| `typescript-patterns` | Advanced generics, discriminated unions, branded types |
| `typescript-strict` | Migrating to strict TypeScript mode |
