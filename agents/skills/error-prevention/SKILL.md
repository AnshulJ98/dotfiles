---
name: error-prevention
description: Catalog of recurring error patterns mapped to preventive measures. Use when debugging reveals a systemic issue, reviewing error-prone code for guardrails, or adding prevention after incidents. Core SKILL.md covers React/Next.js, async/concurrency, and TypeScript strict patterns.
---

# Error Prevention Patterns

## React / Next.js

- **Hydration mismatch** — never use `Date.now()`, `Math.random()`, or `window` in render; use `useEffect` + state or `suppressHydrationWarning` for intentional divergence
- **Missing `key` prop** — always key lists by stable unique ID, never array index
- **Stale closure** — use `useCallback`/`useMemo` deps arrays; if a callback reads state, it must list it
- **Infinite render loop** — objects/arrays as effect deps trigger on every render; memoize or use primitive deps
- **Server Component async pitfall** — `async` Server Components can't use hooks; split client/server boundary cleanly
- **Route handler data leaks** — never pass raw DB objects to `json()`; always serialize through a DTO/schema

## Async / Concurrency

- **Unhandled promise rejection** — every `Promise`/`async` function needs `.catch()` or `try/catch`; never fire-and-forget
- **Race condition** — if two async ops can interleave, add a cancellation token or use `AbortController`
- **Missing `await`** — TypeScript won't always catch this; enable `@typescript-eslint/no-floating-promises`
- **Sequential when parallel is safe** — use `Promise.all([a(), b()])` when operations are independent

## TypeScript Strict Patterns

- **`as` cast instead of narrowing** — `as Type` silences the compiler; use type guards or discriminated unions
- **`!` non-null assertion** — every `!` is a future `TypeError`; handle the null case explicitly
- **`any` spread** — `foo(bar as any)` poisons the call chain; fix the type instead
- **Enum pitfalls** — numeric enums have reverse mappings that cause unexpected behavior; prefer string enums or `const` objects

## Prevention Checklist

Before committing code that touches:
- **Auth** → check: Is every route protected? Are tokens validated server-side?
- **DB queries** → check: Pagination on all list queries? No N+1?
- **External calls** → check: Timeout set? Error handled? Retry with backoff?
- **User input** → check: Validated at entry point? Escaped before render?
- **File system** → check: Path traversal safe? User-supplied paths sanitized?
