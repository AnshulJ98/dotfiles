---

# Coding Standards

These standards apply to every line of code generated, reviewed, or refactored.

## Philosophy

Code must be written with clarity, simplicity, and maintainability as primary goals. The philosophy draws from multiple sources — none followed dogmatically:

- **Robert C. Martin** — clean naming, small functions, self-documenting code, SOLID as guidelines
- **John Ousterhout** — deep modules, information hiding, complexity management, error absorption
- **Gary Bernhardt** — functional core / imperative shell testing strategy
- **Michael Feathers** — seams for altering behaviour without editing in place

Where they conflict, the tiebreaker is **depth over ceremony**: prefer designs that hide complexity behind simple interfaces over designs that distribute complexity across many small, exposed units.

## Module Design

A module is anything with an interface and an implementation — function, class, package, or slice.

**Deep modules** are the goal: small interface, large implementation. Callers get leverage (capability per unit of interface learned). Maintainers get locality (changes concentrate in one place).

**Shallow modules** — where the interface is nearly as complex as the implementation — add indirection without hiding anything. Avoid them.

**Information hiding.** Each module hides its design decisions from callers. Signs of leakage:
- Callers must pass config that reflects internal implementation
- Error types reveal internals (e.g. `DatabaseConnectionError` from a service layer)
- Ordering requirements between method calls

**Seam discipline.** A seam is where a module's interface lives. An adapter satisfies an interface at a seam.
- One adapter = hypothetical seam. Two adapters = real one.
- Don't introduce a port unless at least two adapters are justified (typically production + test).
- Internal seams (private, used by own tests) are fine. Don't expose them through the interface.

**Design twice.** Before implementing, sketch two approaches. Compare them. The second idea often exposes flaws in the first.

## SOLID Principles

Guiding principles, not absolute laws. Apply with judgment — dogmatic application creates shallow modules.

- **SRP** — A module has one reason to change. But "one reason" is scoped to the module's abstraction, not "one thing." A deep module can do many things internally as long as its interface represents a single coherent concept.
- **OCP** — Open for extension, closed for modification. New functionality via extension, not alteration.
- **LSP** — Subtypes must be substitutable for their base types without altering program correctness.
- **ISP** — Don't force callers to depend on interface members they don't use. But don't split interfaces so aggressively that you create a constellation of single-method contracts — that's shallow design.
- **DIP** — Depend on abstractions at real seams. Don't inject in-process pure-logic dependencies just for testability — test through the module's interface instead.

## Function Design

- **Well-named**: names must clearly express intent. Function names are verbs (`calculateTotal`). Class names are nouns (`PaymentProcessor`). Abbreviations are forbidden without domain consensus.
- **Focused**: each function does one thing at one level of abstraction. Extract when a function has multiple responsibilities — not when it's merely "long."
- **Self-documenting**: code must be clear enough that comments on _what_ or _how_ are unnecessary. Comments are acceptable only for _why_ (business rationale, hidden constraints, workaround for a specific bug). JSDoc only on exported/public functions. Never `@todo` without a linked ticket.
- **Private depth is fine**: a deep module's internal functions can and should be small, well-named helpers. The constraint is on the module's _interface_, not its internal decomposition.

## Newspaper Format

Functions that are called appear beneath the function that calls them. High-level policy at the top, implementation details below. A reader should be able to skim top-down and understand the module's purpose before seeing how it works.

## Error Handling

Fewer error cases = simpler systems. Before propagating an error, ask: can this be handled internally?

1. **Absorb** — handle it inside the module. Callers never see it.
2. **Detect early** — validate at the boundary, not deep in the stack.
3. **Crash hard** — for truly unrecoverable states. A clean crash beats silent corruption.

Never: silently swallow errors. Never: create error types that expose module internals.

## Complexity Red Flags

Stop and redesign when you notice:
- **Change amplification** — one logical change requires edits in many places
- **Cognitive load** — a reader must hold too much context to understand the code
- **Unknown unknowns** — things that can break in non-obvious ways

## Testing Strategy

Match test approach to the kind of code:

**Pure logic** (parsers, state machines, transformations): test-first, table-driven, zero mocks. RED → GREEN → REFACTOR.

**I/O coordination** (network, filesystem, process spawning): integration tests against real dependencies. No fakes unless genuinely impractical.

**Mocks/fakes**: only at genuine system boundaries (third-party APIs, external services). The need for a mock often signals that pure logic and I/O are tangled — question the decomposition first.

**The interface is the test surface.** Tests cross the same seam as callers. If you need to test past the interface, the module is probably the wrong shape.

**Test sandwich**: run tests BEFORE (baseline) and AFTER (verification) every implementation. Before fails → report + HALT.

**Clean tests**: one assertion concept per test. AAA structure. Descriptive names: `should [expected] when [condition]`.

**Vertical slicing mandatory**: one test → one implementation → repeat. Never write all tests first then all implementation.

## TypeScript Conventions

- `any` is forbidden. `unknown` when the type is genuinely unknown at compile time.
- Strict mode always: `noImplicitAny`, `strictNullChecks`.
- Prefer `interface` over `type` for object shapes.
- Discriminated unions for state machines. Make impossible states impossible.
- Exhaustive `switch` with `never` for compile-time safety.
- Barrel `index.ts` only at module boundaries.
- Named paths from `tsconfig.json` over deep relative traversal.
- Narrow types — expose the minimum the caller needs.
- `@ts-expect-error` (with a reason comment) over `@ts-ignore`. Never suppress bare.
- CLI arg parsing: `parseArgs` from `node:util`. No commander/yargs for what stdlib covers.

## Architecture Philosophy

- Simple over complex. Add abstractions only when explicitly needed.
- Explicit over implicit. No magic.
- Composition over inheritance.
- Abstract on the third use, not before. Premature abstraction is worse than duplication.
- Match existing repo style. Always. The codebase is a social contract.
- Deletion over addition. The best code is the code never written.

### Solution Ladder

Stop at the first rung that holds. The ladder runs AFTER you understand the problem — read the task and trace the real flow first, then climb.

1. Does this need to exist at all? Speculative need = skip it. (YAGNI)
2. Already in this codebase? Look before you write.
3. Stdlib does it? Use it.
4. Native platform feature covers it? (`<input type="date">` over a picker lib, CSS over JS, DB constraint over app code.)
5. Already-installed dependency solves it? Never add a new dep for what a few lines can do.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

### Bug Fix Discipline

A report names a symptom. Before editing, grep every caller of the function you're about to touch. The root-cause fix is the laziest fix: one guard in the shared function beats a guard in every caller.

## CLI-First Scaffolding

Use official CLIs for new configs. Never hand-write from scratch:
- `package.json` → `pnpm init` / `npm init`
- `tsconfig.json` → `tsc --init`
- `next.config.js` → `create-next-app`
- Tailwind → `npx tailwindcss init`
- shadcn/ui → `npx shadcn@latest init`

## Lint Is Law

Fix all lint errors before commit. No pre-existing excuses.

## Git Hygiene

### Branch Naming
Lowercase and hyphens only. Descriptive and concise. No personal names, no bare numbers.

| Type     | Prefix      | Example                            |
| -------- | ----------- | ---------------------------------- |
| Feature  | `feature/`  | `feature/add-user-export`          |
| Epic     | `feature/`  | `feature/E3--user-management`      |
| Bug fix  | `bugfix/`   | `bugfix/fix-token-refresh`         |
| Hotfix   | `hotfix/`   | `hotfix/prod-auth-crash`           |
| Refactor | `refactor/` | `refactor/extract-payment-service` |

### Commits
Format: `<type>: <description>`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

### Merging
Use `--no-ff` when merging to `master` to preserve branch history.
