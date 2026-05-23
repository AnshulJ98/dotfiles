---
name: code-review
description: Systematic code review checklist for PRs. Use when reviewing code changes or auditing quality. Covers security, performance, TypeScript, React/Next.js, accessibility, testing, and API design checks.
---

# Code Review Checklist

## Security
- [ ] No secrets, tokens, or credentials in code or comments
- [ ] User input validated at entry point (not just client-side)
- [ ] SQL/NoSQL queries use parameterized statements — no string concatenation
- [ ] Auth checks on every route that needs protection
- [ ] No path traversal via user-supplied file paths
- [ ] CORS configured correctly — not `*` in production

## Performance
- [ ] No N+1 queries — check loop bodies for DB calls
- [ ] Pagination on all list endpoints
- [ ] Expensive ops cached where appropriate
- [ ] No blocking operations in hot paths

## TypeScript
- [ ] No `any` casts without justification
- [ ] No `!` non-null assertions without comment explaining why
- [ ] Error handling: typed errors, not `catch(e: any)`
- [ ] All function parameters and return types explicit (or clearly inferred)

## React / Next.js
- [ ] Server vs Client Component boundary correct
- [ ] No `useEffect` dependency array omissions
- [ ] Keys on all lists (stable IDs, not indices)
- [ ] No hydration-unsafe code in render (no `Math.random`, `Date.now`)

## Testing
- [ ] New behavior has tests
- [ ] Edge cases covered (empty, null, large input)
- [ ] Tests test behavior, not implementation
- [ ] No tests that always pass (asserting `true === true`)

## API Design
- [ ] Consistent error response shape
- [ ] HTTP status codes semantically correct
- [ ] No over-fetching in response payloads
- [ ] Backward-compatible changes only on public APIs

## Code Quality
- [ ] Functions < 30 lines (or justified)
- [ ] No duplicate logic (DRY where duplication is the actual problem)
- [ ] Names are self-documenting
- [ ] No dead code committed
- [ ] Commits are atomic and message explains *why*

## Process
- [ ] PR description explains *what* changed and *why*
- [ ] Breaking changes called out explicitly
- [ ] Migration notes if DB schema changed
