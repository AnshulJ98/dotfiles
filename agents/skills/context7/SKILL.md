---
name: context7
description: Query up-to-date library documentation and code examples via Context7. Use when the agent needs current API docs, version-specific behavior, or code examples for any programming library.
---

# Context7 — Live Library Documentation

## When to Use

Activate when:
- Setup or configuration questions ("How do I configure Next.js middleware?")
- Code involving libraries ("Write a Prisma query for...")
- API references ("What are the Supabase auth methods?")
- Version-specific behavior ("Does React 19 still need forwardRef?")
- Any mention of a specific framework or library

## Tools

Context7 exposes two tools. The names are stable; the prefix depends on the harness — Claude Code and Copilot get them from the context7 MCP server (e.g. `mcp__context7__resolve-library-id`), pi gets bare names from the `@upstash/context7-pi` package (which also ships a `/c7-docs <library> <question>` command for manual lookups).

### Step 1: Resolve the Library ID

```
resolve-library-id  { libraryName: "nextjs" }  →  "/vercel/next.js"
```

### Step 2: Query Documentation

```
query-docs  { the resolved "/org/project" id, plus a focused topic }
```

Check the tool's parameter schema in your harness — argument names vary slightly between the MCP server and the pi package.

## Common Library IDs

| Library | ID |
|---------|-----|
| Next.js | `/vercel/next.js` |
| React | `/facebook/react` |
| Prisma | `/prisma/prisma` |
| Tailwind | `/tailwindlabs/tailwindcss` |
| shadcn/ui | `/shadcn-ui/ui` |
| Supabase | `/supabase/supabase` |
| tRPC | `/trpc/trpc` |
| Zod | `/colinhacks/zod` |
| Drizzle | `/drizzle-team/drizzle-orm` |

## Rules

- Always resolve ID first — don't guess library IDs
- Prefer specific topic queries over broad fetches
- Combine with existing codebase patterns — don't blindly copy docs examples
