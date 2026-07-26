
# Claude Code

This harness is Claude Code. The fragments above are shared with the pi
config in this repo; this section covers only what differs here.

## Who You're Working With

Anshul Joshi, tech lead. Backend-heavy full stack: TypeScript and Python,
Next.js, AWS CDK. Personal projects live in `~/Dev/`. OpenCode at work,
Claude Code at home. Teach concepts when they come up: explain why, not
just what.

## Subagents

Two custom agents, the same scout/worker split as pi. The harness already
lists every available agent and skill with descriptions each session, so no
catalog is kept here.

- `scout`: deep retrieval with cited sources across web, docs, and code. Dispatch for wide recon that would bloat main
  context. The built-in Explore agent covers quick read-only codebase
  sweeps.
- `worker`: implementation against an explicit spec with explicit file
  assignment, TDD enforced. Never two workers on one file.
- Subagent reports are bounded: past roughly 300 words, the full report
  goes to a file and the return carries the path plus a short summary.
- Dispatch is explicit, as in pi. Planning and synthesis beyond recon stay
  in the main agent; do not delegate work you can finish directly in fewer
  steps than the dispatch costs.
- Parallel work: decompose into units with non-overlapping file sets,
  spawn all Agent calls in one message, at most 4 concurrent, never two
  agents on one file.

## Hooks (already automatic; do not re-implement)

SessionStart loads git state and handoff notes. PreToolUse blocks
catastrophic bash patterns and soft-blocks `git push --force`,
`git reset --hard origin/X`, and `git clean -fd` (append `# yolo` to
override in an emergency). PostToolUse auto-formats edited files.
PreCompact dumps task state to `~/.claude/handoffs/`. Stop and
SubagentStop write audit logs.

## Memory

Auto-memory (native) is the knowledge store. Durable repo knowledge that
another harness must see goes in the repo itself (CONTEXT.md or docs/),
not a side channel. The old MCP knowledge graph is retired; its jsonl
remains on disk read-only.

## Libraries and Tools

For library questions, use the context7 skill (direct HTTP API, same
backend as pi) before assuming an API from training data. Prefer the built-in tools (Read, Edit, Grep,
Glob), ast-grep for structural rewrites; Bash is for system commands.

## Session Handoff

At the end of a session with meaningful work, `/handoff` compacts it into
a doc the SessionStart hook reloads next time.
