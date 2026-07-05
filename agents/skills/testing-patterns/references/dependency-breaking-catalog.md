# Dependency-Breaking Catalog

The 24 dependency-breaking techniques from Michael Feathers, *Working
Effectively with Legacy Code*. Lookup reference — reach here only after the
SKILL.md decision tree points you at a named technique. Each entry: when to
reach for it, and a terse TypeScript sketch.

Ranked roughly by how often they earn their keep in a TypeScript/backend/CLI
codebase.

---

## Parameterize Constructor

Constructor builds its own collaborators -> pass them in, default to the real one.

```typescript
// Before
class OrderService { private mailer = new Mailer(); }
// After
class OrderService { constructor(private mailer: Mailer = new Mailer()) {} }
```

## Parameterize Method

A method builds a one-off collaborator -> take it as an argument with a default.

```typescript
function processOrder(order: Order, notify: Notifier = defaultNotifier) { /* ... */ }
```

## Extract Interface

Depend on a shape, not a concrete class, so tests supply a fake.

```typescript
interface DataSource { findUser(id: string): User | null; }
class DatabaseClient implements DataSource { /* ... */ }
function getUser(id: string, db: DataSource) { return db.findUser(id); }
```

## Extract Implementer

The inverse of Extract Interface when you can't rename the original: promote the
concrete class to an interface and rename the existing class to `XImpl`.

## Extract and Override Call

Wrap a hard-to-run call in a `protected` method; a test subclass overrides it.

```typescript
class Service {
  protected send(data: unknown) { return fetch("https://api", { body: JSON.stringify(data) }); }
  run(d: unknown) { /* ... */ return this.send(d); }
}
class TestService extends Service { protected send = vi.fn(); }
```

## Extract and Override Factory Method

Object creation is buried in a method -> move `new X()` into an overridable
factory method, override it to return a fake.

```typescript
class Report {
  protected makeClient(): Client { return new HttpClient(); }
  generate() { return this.makeClient().fetch(); }
}
```

## Extract and Override Getter

A field holds a collaborator created eagerly -> replace direct field access with
a lazy getter you can override.

## Subclass and Override Method

The workhorse for legacy code: subclass the unit under test purely for the test
and override the method that reaches out to the world.

```typescript
class Payroll { protected rate() { return externalRateService(); } compute(h: number) { return h * this.rate(); } }
class TestPayroll extends Payroll { protected rate() { return 10; } }
```

## Introduce Static Setter

A singleton is fetched via `Instance()` -> add a setter so a test can swap the
instance, and reset it in teardown.

```typescript
class Registry {
  private static inst = new Registry();
  static instance() { return Registry.inst; }
  static setForTest(r: Registry) { Registry.inst = r; }
}
```

## Encapsulate Global References

Wrap a global (env var, module-level singleton, `process`, `Date`) behind an
object so the reference becomes an injectable seam.

```typescript
class Clock { now() { return Date.now(); } }
function isExpired(t: number, clock: Clock = new Clock()) { return t < clock.now(); }
```

## Replace Global Reference with Getter

Lighter than encapsulation: route a global through an overridable getter method
so a subclass can substitute it.

## Introduce Instance Delegator

A static method blocks testing -> add an instance method that forwards to it, so
callers depend on an instance (which can be faked).

## Expose Static Method

Logic trapped in an untestable instance method, but it uses no instance state ->
lift it to a `static` method you can test in isolation, no object needed.

## Adapt Parameter

A method takes an awkward/untestable parameter type (a framework request, a raw
socket) -> introduce a narrow interface you control and adapt at the boundary.

```typescript
interface IncomingParams { get(key: string): string | null; }
// production adapter wraps the framework object; test passes a plain fake.
```

## Primitivize Parameter

Can't easily construct the real argument -> add a free function that operates on
primitives, and have the method delegate to it. Test the free function directly.

## Break Out Method Object

A long method with tangled locals -> move it into its own class whose fields are
the former locals. The method object is constructed and tested in isolation.

## Supersede Instance Variable

No constructor seam available (or construction is fixed) -> add a setter that
replaces an instance variable with a test double after construction. Use
sparingly; prefer Parameterize Constructor.

## Pull Up Feature

The method you want to test is entangled with untestable siblings -> pull it (and
only what it needs) up into an abstract superclass, then test via a concrete
subclass free of the entanglements.

## Push Down Dependency

The inverse: a problematic dependency is shared across the class -> push it down
into a new subclass, leaving the parent abstract and testable.

## Replace Function with Function Pointer

A free function is called directly and can't be swapped -> hold it in a variable
(function-typed field or module binding) that tests can reassign.

```typescript
let readFile = fs.readFileSync;      // swap in tests
export function __setReadFile(f: typeof readFile) { readFile = f; }
```

## Definition Completion

Language-specific: declare a symbol in one place, provide a test-only definition
in another. In TS this shows up as module mocking (`vi.mock`) that supplies an
alternate implementation for a declared dependency.

## Link Substitution

Swap a whole module/dependency at the resolution layer rather than in code — the
build/loader links a test implementation. In TS: `vi.mock('./module')`, path
aliases, or bundler-level module replacement.

## Template Redefinition

Generic/type-parameter seam: parameterize a class over a type so tests supply a
lightweight stand-in type for a heavy collaborator.

```typescript
class Cache<Store = RedisStore> { constructor(private store: Store) {} }
new Cache<InMemoryStore>(new InMemoryStore());
```

## Text Redefinition

Interpreted-language trick: redefine a method's body at load time. In JS/TS the
analog is runtime monkey-patching of a module export or prototype method for a
test. Last resort — brittle and easy to leak across tests.

---

## Choosing Among Them

- Own the code and it compiles cleanly? Prefer **Parameterize Constructor /
  Method** and **Extract Interface** — real seams, no subclassing tricks.
- Legacy code you can't restructure yet? **Subclass and Override Method** and the
  **Extract and Override** family get it under test with minimal edits.
- Global/singleton/module state? **Encapsulate Global References** or
  **Introduce Static Setter**.
- Adding behavior, not testing existing? Don't use these at all — Sprout or Wrap
  (see SKILL.md) and be born tested.

Every technique here is a stopgap to get untestable code into a harness. Once
green, refactor toward functional core / imperative shell so the seam is no
longer needed.
