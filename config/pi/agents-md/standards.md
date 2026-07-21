---

# Coding Standards

Apply to every line generated, reviewed, or refactored. The philosophy blends
Martin (clean naming, small focused functions), Ousterhout (deep modules,
information hiding, error absorption), Bernhardt (functional core / imperative
shell), and Feathers (seams) — none followed dogmatically. Where they
conflict, the tiebreaker is **depth over ceremony**: hide complexity behind
simple interfaces rather than distributing it across many small, exposed
units.

## Module Design

A module is anything with an interface and an implementation — function,
class, package, or slice.

- **Deep modules** are the goal: small interface, large implementation.
  Callers get leverage; maintainers get locality. Shallow modules — interface
  nearly as complex as the implementation — add indirection without hiding
  anything.
- **Information hiding.** A module hides its design decisions. Leakage signs:
  callers passing implementation-shaped config, error types revealing
  internals (`DatabaseConnectionError` from a service layer), ordering
  requirements between calls.
- **Seam discipline.** One adapter = hypothetical seam; two adapters = real
  one. No port without two justified adapters (typically production + test).
  Internal seams private to a module's own tests are fine — don't expose them.
- **Design twice.** Sketch two approaches before implementing; the second
  often exposes the first's flaws.
- **SOLID as guidelines, not laws** — the non-obvious edges: SRP's "one
  reason to change" is scoped to the module's abstraction (a deep module may
  do many things internally); ISP without shattering interfaces into
  single-method contracts; DIP at real seams only — never inject in-process
  pure-logic dependencies for testability, test through the interface instead.

## Functions

- Names express intent: verbs for functions, nouns for classes; no
  abbreviations without domain consensus.
- One thing at one level of abstraction; extract on mixed responsibilities,
  not on length. Newspaper order: callers above callees, policy above detail.
- Comments only for WHY (rationale, hidden constraint, bug workaround) —
  never what or how. JSDoc on exported functions only.
- The depth constraint applies to the module's interface, not its internals —
  small private helpers are encouraged.

## Errors

Fewer error cases = simpler systems. In order: **absorb** (handle inside the
module, callers never see it), **detect early** (validate at the boundary,
not deep in the stack), **crash hard** (for unrecoverable states — a clean
crash beats silent corruption). Never swallow errors silently; never leak
module internals through error types.

## Complexity Red Flags

Stop and redesign on: change amplification (one logical change, many edits),
cognitive load (a reader must hold too much context), unknown unknowns
(breaks in non-obvious ways).

## Testing

- **Pure logic** (parsers, state machines, transformations): test-first,
  table-driven, zero mocks. RED → GREEN → REFACTOR.
- **I/O coordination** (network, filesystem, process spawning): integration
  tests against real dependencies. No fakes unless genuinely impractical.
- **Mocks only at genuine system boundaries.** Needing one elsewhere signals
  pure logic and I/O are tangled — question the decomposition first.
- **The interface is the test surface** — tests cross the same seam callers
  do. Needing to test past it means the module is probably the wrong shape.
- **Test sandwich**: run tests BEFORE (baseline) and AFTER (verification)
  every implementation. Baseline fails → report and halt.
- **Fixtures and spec artifacts are truth sources** — never rewrite them to
  make code pass. When code and fixture disagree, bridge at the boundary (a
  loader in the tests) or ask; editing the artifact is the user's decision,
  not yours.
- **Vertical slicing**: one test → one implementation → repeat. Never all
  tests first, then all implementation.

## TypeScript

- `any` forbidden; `unknown` when genuinely unknown. Strict mode always.
- `interface` over `type` for object shapes. Discriminated unions for state
  machines; exhaustive `switch` with `never`. Narrow types — expose the
  minimum the caller needs.
- `@ts-expect-error` with a reason comment over `@ts-ignore`; never suppress
  bare.
- Stdlib first: `parseArgs` from `node:util` over commander/yargs. Barrel
  `index.ts` only at module boundaries.

## Architecture

- Simple over complex; explicit over implicit; composition over inheritance.
- Abstract on the third use, not before. Deletion over addition — the best
  code is the code never written.
- Match existing repo style. Always. The codebase is a social contract.

## Bug Fixes

A report names a symptom. Before editing, grep every caller of the function
you're about to touch. The root-cause fix is the laziest fix: one guard in
the shared function beats a guard in every caller.

## Scaffolding, Lint, Git

- New configs come from official CLIs (`pnpm init`, `tsc --init`,
  `create-next-app`, `npx shadcn@latest init`) — never hand-written.
- Fix all lint errors before commit. No pre-existing excuses.
- Branches: lowercase-hyphen, prefixed `feature/` `bugfix/` `hotfix/`
  `refactor/`. Commits: `<type>: <description>`, conventional types. Merge to
  master with `--no-ff`.
