---
name: context7
description: Query up-to-date library documentation and code examples via the Context7 HTTP API (no MCP). Use when the agent needs current API docs, version-specific behavior, or code examples for any programming library.
---

# Context7 — Live Library Documentation (HTTP API)

Direct HTTP calls, same backend the pi `@upstash/context7-pi` package uses.
No MCP server, no resident tool schemas. Use WebFetch or `curl` via Bash.

## When to Use

- Setup or configuration questions ("How do I configure Next.js middleware?")
- Code involving libraries ("Write a Prisma query for...")
- API references, version-specific behavior ("Does React 19 still need forwardRef?")
- Any time training-data knowledge of a library may be stale

## Step 1: Resolve the library

```
GET https://context7.com/api/v1/search?query=<library name>
```

Returns JSON `results[]` with `id` (e.g. `/vercel/next.js`), `title`,
`description`, `trustScore`, `benchmarkScore`, `totalSnippets`,
`lastUpdateDate`. Pick by trustScore and recency when several match; do not
guess ids.

## Step 2: Fetch focused docs

```
GET https://context7.com/api/v1/<id>?type=txt&topic=<focus>&tokens=<n>
```

- `<id>` is the resolved id including the leading slash, e.g.
  `https://context7.com/api/v1/vercel/next.js?type=txt&topic=middleware&tokens=2500`
- `topic` narrows to the relevant sections; always set it.
- `tokens` caps the response size. Default to 2000-3000; raise only when the
  first fetch was insufficient. Never fetch unbounded docs into context.

## Rules

- Anonymous access works with rate limits. If `CONTEXT7_API_KEY` is set,
  send `Authorization: Bearer $CONTEXT7_API_KEY` for higher limits.
- Responses are pre-chunked snippets with source URLs; cite the source URL,
  not context7, in user-facing output.
- Combine with existing codebase patterns — don't blindly copy docs examples.
- pi parity: pi's `resolve-library-id` / `query-docs` tools call these same
  two endpoints; this skill is the Claude Code port of that setup.
