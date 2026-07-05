---
name: testing-patterns
description: THE testing skill. Built on Gary Bernhardt's functional core / imperative shell, with Michael Feathers' seams and dependency-breaking as the practical toolkit. Use when deciding how to test any code, adding tests to existing/legacy code, breaking dependencies for testability, or understanding unfamiliar code through characterization tests.
---

# Testing Patterns

One rule above all: **match the test approach to the KIND of code.** Get this
right and mocks mostly disappear. Get it wrong and you drown in test doubles.

## Functional Core / Imperative Shell (Bernhardt)

Split code into two layers with different testing strategies:

| Layer | What it is | How you test it |
|-------|-----------|-----------------|
| **Functional core** | Pure logic — parsers, state machines, validators, transformations, business rules. No I/O. Same input -> same output. | Test-first. Table-driven. **Zero mocks.** Red-green-refactor. Many fast tests. |
| **Imperative shell** | I/O coordination — network, filesystem, process spawning, DB, stdout. Thin. No branching logic worth speaking of. | Integration tests against **real** dependencies. Few tests. |

The shell calls the core; the core never calls the shell. Push decisions inward
(pure), push effects outward (thin). A fat core and a skinny shell is the goal.

**Mocks/fakes belong ONLY at genuine system boundaries** — third-party APIs,
external services you don't own. If you reach for a mock anywhere else, stop:
the need for a mock almost always means pure logic and I/O are tangled together.
Fix the decomposition first — extract the pure part, test it directly, leave a
trivial shell. Question the design before you reach for the double.

```typescript
// TANGLED — logic married to I/O. Only testable with a mock.
async function chargeOverdue(userId: string, db: Db, gateway: Gateway) {
  const user = await db.getUser(userId);
  const owed = user.invoices                       // <- logic buried in I/O
    .filter(i => i.dueDate < Date.now() && !i.paid)
    .reduce((s, i) => s + i.amount, 0);
  if (owed > 0) await gateway.charge(user.cardId, owed);
}

// SPLIT — core is pure and mock-free; shell is a trivial 3-liner.
function overdueTotal(invoices: Invoice[], now: number): number {   // CORE
  return invoices
    .filter(i => i.dueDate < now && !i.paid)
    .reduce((s, i) => s + i.amount, 0);
}
async function chargeOverdue(userId: string, db: Db, gateway: Gateway) { // SHELL
  const user = await db.getUser(userId);
  const owed = overdueTotal(user.invoices, Date.now());
  if (owed > 0) await gateway.charge(user.cardId, owed);
}
```

`overdueTotal` gets a table of cases and zero doubles. `chargeOverdue` gets one
integration test against a real (or fake-at-boundary) gateway.

## Core Discipline

- **Vertical slicing, mandatory.** One test -> one implementation -> repeat.
  Never write all tests then all implementation.
- **The interface is the test surface.** Tests cross the same seam callers do.
  Don't reach past the public interface to test internals.
- **Prefer fakes over mocks (GOOS style).** A working in-memory fake exercises
  real behavior; a mock hard-codes an interaction and rots when the design moves.
- **Test sandwich.** Run tests BEFORE (baseline) and AFTER every change. Baseline
  fails -> HALT and report; you don't build on a red bar. After fails -> you
  broke something; fix before continuing.

## Clean Tests

- One assertion *concept* per test (multiple `expect`s on one concept is fine).
- AAA structure: Arrange, Act, Assert.
- Descriptive name: `should [expected] when [condition]`.

```typescript
test("should reject orders when quantity is negative", () => {
  const order = { quantity: -1, productId: "abc" };      // Arrange
  const result = validateOrder(order);                    // Act
  expect(result.ok).toBe(false);                          // Assert
  expect(result.error).toContain("quantity");
});
```

## What NOT to Test

- Private methods — test through the public interface.
- Framework/library behavior — trust their tests.
- Implementation details — if a behavior-preserving refactor breaks a test, the
  test is wrong.

---

# Toolkit: Breaking Dependencies (Feathers)

When existing code won't split cleanly — a dependency is nailed in place and you
can't get the core under test — use seams. This is the *repair* toolkit for code
that wasn't written core/shell in the first place.

## Seams

A **seam** is a place where you can alter behavior without editing that code.
Every hard dependency you want to replace in a test needs a seam.

```typescript
// No seam — DatabaseClient is nailed in; untestable without a real DB.
function getUser(id: string) {
  return new DatabaseClient().findUser(id);
}

// Seam via parameter — inject a fake in tests, default in production.
function getUser(id: string, db: DataSource = new DatabaseClient()) {
  return db.findUser(id);
}
```

## Sensing vs. Separation

Two reasons to break a dependency — know which you need:

- **Sensing** — you can't *see* an effect the code produces (it writes to a
  socket, a log, a queue). Break the dependency to capture and assert on it.
- **Separation** — you can't *run* the code at all because a dependency won't
  survive the test environment (network, clock, filesystem). Break it to run.

Sensing wants a spy/fake you can inspect. Separation wants any stand-in that
lets execution proceed.

## Sprout and Wrap

Add behavior to scary untested code without editing it in place:

- **Sprout method/class** — write the new logic as a *new*, fully tested unit,
  then call it from the old code in one line. New code is born tested.
- **Wrap method** — rename the old method, create a new one with the old name
  that calls the original plus your addition. The new behavior is testable; the
  old code is untouched.

## Characterization Tests

For untested code you're afraid to change: pin down what it *actually* does
(not what it should) to build a refactoring safety net.

```typescript
// 1. Run it, observe the real output.
test("characterize", () => { console.log(legacyFn(input)); });

// 2. Assert exactly what you observed. Now refactors that change behavior fail.
test("should return observed shape for known input", () => {
  expect(legacyFn(input)).toEqual(observedOutput);
});
```

## Decision Tree — What's Blocking Testability?

1. **Can't construct the object?** -> constructor is doing work / demanding
   heavy collaborators -> Parameterize Constructor, Extract Interface.
2. **Can't sense an effect?** -> hidden output -> inject a fake/spy at the seam;
   Extract and Override Call.
3. **Can't run — a call reaches out to the world?** -> Extract and Override
   Call/Factory, Subclass and Override Method, Parameterize Method.
4. **Global / singleton in the way?** -> Introduce Static Setter, Encapsulate
   Global References, Replace Global with Getter.
5. **Adding behavior, terrified to touch it?** -> don't edit — Sprout or Wrap.
6. **No idea what it does?** -> Characterization tests first, then the above.

## Test Doubles

| Type | What | When |
|------|------|------|
| **Fake** | Working impl (in-memory DB) | Default choice — realistic behavior |
| **Stub** | Returns fixed data | Need a response, don't care about calls |
| **Spy** | Records calls | Assert on call history (sensing) |
| **Mock** | Pre-verifies interactions | Only when the *interaction itself* is the contract |
| **Dummy** | Placeholder, unused | Fill a required parameter |

Full 24-technique catalog with before/after examples:
[references/dependency-breaking-catalog.md](references/dependency-breaking-catalog.md).
