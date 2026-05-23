---
name: nextjs-app-router
description: Next.js App Router patterns for v15+. Use when building with App Router. Covers Server vs Client Components, data fetching, caching, streaming, Suspense, parallel routes, server actions, metadata, middleware, and error handling.
---

# Next.js App Router (v15+)

## Server vs Client Components

| Needs | Use |
|-------|-----|
| DB access, secrets, server-only logic | Server Component (default) |
| onClick, useState, useEffect, browser APIs | Client Component (`"use client"`) |
| Mix of both | Server Component parent → Client Component leaf |

**Rule**: Push `"use client"` as far down the tree as possible.

## Data Fetching

```typescript
// Server Component — fetch directly, no useEffect
async function Page() {
  const data = await db.query(...);  // runs server-side
  return <Component data={data} />;
}
```

## Caching

```typescript
// Cache for 1 hour
const res = await fetch(url, { next: { revalidate: 3600 } });

// Never cache (dynamic)
const res = await fetch(url, { cache: "no-store" });

// Tag-based revalidation
const res = await fetch(url, { next: { tags: ["product"] } });
// Invalidate: revalidateTag("product")
```

## Server Actions

```typescript
// app/actions.ts
"use server";
export async function createThing(formData: FormData) {
  const name = formData.get("name") as string;
  await db.insert({ name });
  revalidatePath("/things");
}
```

## Streaming with Suspense

```typescript
// page.tsx
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SlowComponent />
    </Suspense>
  );
}
```

## Parallel Routes

```
app/
  dashboard/
    @analytics/
      page.tsx     ← rendered in @analytics slot
    @team/
      page.tsx     ← rendered in @team slot
    layout.tsx     ← receives both as props
```

## Error Handling

```typescript
// error.tsx — catches errors in segment
"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <button onClick={reset}>Try again: {error.message}</button>;
}
```

## Metadata

```typescript
// Static
export const metadata: Metadata = { title: "Page Title" };

// Dynamic
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.id);
  return { title: product.name };
}
```

## Middleware

```typescript
// middleware.ts (root)
import { NextResponse } from "next/server";
export function middleware(request: NextRequest) {
  // runs on every matched request
  if (!isAuthenticated(request)) return NextResponse.redirect("/login");
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*"] };
```
