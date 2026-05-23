---
name: typescript-patterns
description: Advanced TypeScript type design — generics, discriminated unions, conditional types, template literals, branded types, type inference. Use when designing a type-safe API, modeling domain state that should make illegal states unrepresentable, or debugging type errors in complex inference chains.
---

# TypeScript Advanced Patterns

## Discriminated Unions (Make Illegal States Unrepresentable)

```typescript
// Bad: optional fields — all combinations valid, most nonsensical
type Result = { data?: Data; error?: Error; loading?: boolean };

// Good: discriminated union — only valid states exist
type Result<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

// Exhaustive handling
function render<T>(result: Result<T>) {
  switch (result.status) {
    case "loading": return <Spinner />;
    case "success": return <Data data={result.data} />;
    case "error": return <Error error={result.error} />;
    // TypeScript error if you add a new status and forget this
  }
}
```

## Branded Types (Prevent Primitive Confusion)

```typescript
type UserId = string & { readonly __brand: "UserId" };
type ProductId = string & { readonly __brand: "ProductId" };

function brandUserId(id: string): UserId { return id as UserId; }

function getUser(id: UserId) { /* ... */ }

// Now: getUser(productId) → TypeScript error
// getUser(rawString) → TypeScript error
```

## Generic Constraints

```typescript
// Constrain T to objects with an id field
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}

// Infer return type from input
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return keys.reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {} as Pick<T, K>);
}
```

## Conditional Types

```typescript
type NonNullable<T> = T extends null | undefined ? never : T;

type Flatten<T> = T extends Array<infer Item> ? Item : T;
// Flatten<string[]> → string
// Flatten<string> → string

type Awaited<T> = T extends Promise<infer R> ? Awaited<R> : T;
// Awaited<Promise<string>> → string
```

## Template Literal Types

```typescript
type EventName = "click" | "focus" | "blur";
type Handler = `on${Capitalize<EventName>}`;
// Handler = "onClick" | "onFocus" | "onBlur"

type CSSProperty = `${string}-${string}`;  // matches "background-color" etc.
```

## `satisfies` Operator (TS 4.9+)

```typescript
// Validates against type without widening
const palette = {
  red: [255, 0, 0],
  green: "#00ff00",
} satisfies Record<string, string | number[]>;

// palette.red is still number[], not string | number[]
```

## Utility Types Cheatsheet

| Type | Description |
|------|-------------|
| `Partial<T>` | All properties optional |
| `Required<T>` | All properties required |
| `Readonly<T>` | All properties readonly |
| `Pick<T, K>` | Keep only keys K |
| `Omit<T, K>` | Remove keys K |
| `Record<K, V>` | Object with keys K, values V |
| `ReturnType<F>` | Return type of function F |
| `Parameters<F>` | Parameter tuple of function F |
| `Awaited<T>` | Unwrapped Promise type |
