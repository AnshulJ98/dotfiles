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

## MCP Tool Usage

### Step 1: Resolve the Library ID

```
mcp_context7_resolve-library-id({ libraryName: "nextjs" })
→ "/vercel/next.js"
```

### Step 2: Fetch Documentation

```
mcp_context7_get-library-docs({
  context7CompatibleLibraryID: "/vercel/next.js",
  topic: "middleware",
  tokens: 5000
})
```

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
