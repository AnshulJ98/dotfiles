---
name: typescript-strict
description: Step-by-step guide for enabling strict TypeScript checks. Use when migrating a project to stricter types. Covers noImplicitAny, strictNullChecks, noUncheckedIndexedAccess, exactOptionalPropertyTypes, and common fix patterns.
---

# TypeScript Strict Migration

## Step 1: Enable One Flag at a Time

Never enable all strict flags at once on an existing codebase.

Recommended order:
1. `"noImplicitAny": true`
2. `"strictNullChecks": true`
3. `"strictFunctionTypes": true`
4. `"strict": true` (enables all of the above + more)
5. `"noUncheckedIndexedAccess": true`
6. `"exactOptionalPropertyTypes": true`

## Step 2: Fix noImplicitAny

```typescript
// Error: Parameter 'x' implicitly has an 'any' type
function double(x) { return x * 2; }

// Fix:
function double(x: number): number { return x * 2; }
```

## Step 3: Fix strictNullChecks

```typescript
// Error: Object is possibly null
const el = document.getElementById("app");
el.innerHTML = "hello";

// Fix options:
// 1. Non-null assertion (only when certain)
el!.innerHTML = "hello";

// 2. Type guard (preferred)
if (el) { el.innerHTML = "hello"; }

// 3. Optional chaining
el?.setAttribute("class", "loaded");
```

## Step 4: Fix noUncheckedIndexedAccess

```typescript
// Error: Type is 'string | undefined', not 'string'
const first = arr[0].toUpperCase();

// Fix:
const first = arr[0]?.toUpperCase();
// or
if (arr[0]) { arr[0].toUpperCase(); }
```

## Step 5: Fix exactOptionalPropertyTypes

```typescript
// With exactOptionalPropertyTypes: true
// { a?: string } means a is `string` or *absent* — not `string | undefined`

// Error: cannot assign undefined to optional property
obj.a = undefined;

// Fix: use delete or omit the assignment
delete obj.a;
```

## Common Patterns After Migration

```typescript
// Safe array access
function getFirst<T>(arr: T[]): T | undefined { return arr[0]; }

// Type-safe Object.keys
function keys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

// Type guard helper
function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

// Filter null/undefined from array
const strings: string[] = mixed.filter(isNonNull);
```
