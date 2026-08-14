# Execution Environment

**Machine:** macOS (personal). No corporate binary execution restrictions. All tools available at standard paths.

**Projects root:** `~/Dev/`

**Memory:** `~/.local/state/agent-memory/memory.jsonl` — read with `search_nodes`, write with `create_entities`/`add_observations`.

**Skills:** `~/.agents/skills/{name}/SKILL.md` — load with `skill(name="X")`

---

## Binary Files — ONE AT A TIME

**CRITICAL**: Never read multiple binary files in a single message or parallel tool calls. 4+ binary reads simultaneously crashes the conversation.

For screenshots, images, diagrams: one file per message turn only.

---

## Must Follow

### CLI-First Scaffolding

Use official CLIs for new configs. Never hand-write.

- `package.json` → `pnpm init` / `npm init`
- `tsconfig.json` → `tsc --init`
- `next.config.js` → `create-next-app`
- Tailwind → `npx tailwindcss init`
- shadcn/ui → `npx shadcn@latest init`

Pattern: scaffold → verify → edit → verify.

### TDD Only

RED → GREEN → REFACTOR. Tests first. No exceptions.

### Lint Is Law

Fix all lint errors before commit. No pre-existing excuses.

### AutoApprove Gate

Human-in-the-loop by default. For destructive or multi-step operations (commits, merges, deployments, multi-file refactors), pause and present a summary. Execute autonomously ONLY when the user says "AutoApprove".

Subagents inside an orchestrator return immediately — continuous-flow takes precedence.

### Test Sandwich

Run tests BEFORE and AFTER every implementation. Before = green baseline. After = no breakage.

### Ordering Rationale

When listing ordered steps, explain WHY each depends on its predecessor.

---

## Parallel Work

For tasks spanning independent files or features, spawn subagents in parallel:

1. Decompose into independent units with non-overlapping file sets
2. Assign files explicitly — each subagent owns its files
3. Spawn in parallel via multiple tool calls in a single message
4. No limit on the number of parallel subagents
5. Never let two subagents edit the same file

---

## Session Handoff

At session end (meaningful work only):
- `sync-memory --handoff "notes"` (at `~/bin/sync-memory`)
- Notes persist at `~/.copilot/instructions/handoff.instructions.md`
