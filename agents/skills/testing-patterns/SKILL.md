---
name: testing-patterns
description: Patterns for testing code effectively. Use when breaking dependencies for testability, adding tests to existing code, understanding unfamiliar code through characterization tests, or deciding how to structure tests. Covers seams, dependency injection, test doubles, and safe refactoring techniques from Michael Feathers.
---

# Testing Patterns

Based on *Working Effectively with Legacy Code* (Feathers) and *The Art of Unit Testing* (Osherove).

## Seams — Points Where Behavior Can Be Changed

A **seam** is a place where you can alter behavior without editing that code directly.

```typescript
// Hard-coded dependency (no seam)
function getUser(id: string) {
  return new DatabaseClient().findUser(id);  // no way to test without DB
}

// Seam via parameter injection
function getUser(id: string, db: DatabaseClient = new DatabaseClient()) {
  return db.findUser(id);  // can inject a fake in tests
}
```

## Test Doubles

| Type | What | When |
|------|------|------|
| **Stub** | Returns fixed data | When you need a response but don't care about calls |
| **Mock** | Verifies calls were made | When the *interaction* is what you're testing |
| **Spy** | Records actual calls | When you want to assert on call history |
| **Fake** | Working implementation | When you need realistic behavior (in-memory DB) |
| **Dummy** | Placeholder, never used | Satisfying a required parameter |

## Dependency Breaking Techniques

### Constructor Injection
```typescript
// Before
class OrderService {
  private mailer = new Mailer();
}

// After
class OrderService {
  constructor(private mailer: Mailer = new Mailer()) {}
}
```

### Method Injection (for one-off dependencies)
```typescript
function processOrder(order: Order, notifier: Notifier = defaultNotifier) {
  // ...
}
```

### Extract and Override (for untestable legacy code)
```typescript
class LegacyService {
  protected callExternalApi(data: unknown) {  // make protected
    return fetch("https://api.example.com", { body: JSON.stringify(data) });
  }
}

class TestableService extends LegacyService {
  protected callExternalApi = vi.fn();  // override in tests
}
```

## Characterization Tests

For untested code you're afraid to change:

```typescript
// Step 1: Call the code, observe what happens
test("characterize current behavior", () => {
  const result = weirdLegacyFunction(testInput);
  console.log(result);  // observe
});

// Step 2: Hard-code what you observed
test("weirdLegacyFunction with X input", () => {
  expect(weirdLegacyFunction(testInput)).toEqual(observedOutput);
  // now you have a safety net for refactoring
});
```

## Test Structure (AAA)

```typescript
test("should reject orders with invalid quantity", () => {
  // Arrange
  const order = { quantity: -1, productId: "abc" };

  // Act
  const result = validateOrder(order);

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toContain("quantity");
});
```

## What NOT to Test

- Private methods (test via public interface)
- Framework/library behavior (trust the library's tests)
- Implementation details (if you refactor and tests break without behavior changing, your tests are wrong)
