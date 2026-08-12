
# Coding Standards

These apply to every line written, reviewed, or refactored.

## Philosophy

Code must be written with clarity, simplicity, and maintainability as
primary goals. The philosophy draws from multiple sources, none followed
dogmatically:

- **Robert C. Martin** — clean naming, small functions, self-documenting
  code, SOLID as guidelines
- **John Ousterhout** — deep modules, information hiding, complexity
  management, error absorption
- **Gary Bernhardt** — functional core / imperative shell testing strategy
- **Michael Feathers** — seams for altering behaviour without editing in
  place

Where they conflict, the tiebreaker is **depth over ceremony**: prefer
designs that hide complexity behind simple interfaces over designs that
distribute complexity across many small, exposed units.

## Module Design

A module is anything with an interface and an implementation: a function, a
class, a package, or a slice.

- Aim for deep modules: a small interface over a large implementation. An
  interface nearly as complex as its implementation adds indirection
  without hiding anything.
- A module hides its design decisions. Leaks show up as callers passing
  implementation-shaped config, error types that name internals, or
  required call ordering between methods.
- One adapter is a hypothetical seam; two justified adapters (typically
  production plus test) make a real one. Do not build ports without both.
  Seams private to a module's own tests stay private.
- Sketch two approaches before implementing. The second usually exposes
  the first one's flaws.
- Names state intent: verbs for functions, nouns for classes, no
  abbreviations without domain consensus. Comments explain why, never what
  or how. Every exported function gets JSDoc; nothing else does. The why
  must be traceable to the code or the given context, never invented; a
  defect gets documented as a defect, not as accepted behavior.

## SOLID Principles

Guiding principles, not absolute laws. Apply with judgment; dogmatic
application creates shallow modules.

- **SRP** — A module has one reason to change. But "one reason" is scoped
  to the module's abstraction, not "one thing." A deep module can do many
  things internally as long as its interface represents a single coherent
  concept.
- **OCP** — Open for extension, closed for modification. New functionality
  via extension, not alteration.
- **LSP** — Subtypes must be substitutable for their base types without
  altering program correctness.
- **ISP** — Don't force callers to depend on interface members they don't
  use. But don't split interfaces so aggressively that you create a
  constellation of single-method contracts; that is shallow design.
- **DIP** — Depend on abstractions at real seams. Don't inject in-process
  pure-logic dependencies just for testability; test through the module's
  interface instead.

## Errors

Fewer error cases make simpler systems. In order of preference: absorb the
error inside the module so callers never see it; detect it early at the
boundary rather than deep in the stack; crash hard on unrecoverable states,
because a clean crash beats silent corruption. Never swallow errors
silently, and never leak module internals through error types.

## Complexity Red Flags

Stop and redesign when one logical change requires edits in many places,
when a reader must hold too much context at once, or when code breaks in
non-obvious ways.

## Testing

- Pure logic (parsers, state machines, transformations): test-first,
  table-driven, zero mocks.
- I/O coordination: integration tests against real dependencies. Mocks
  belong only at genuine system boundaries; wanting one elsewhere means
  pure logic and I/O are tangled, so question the decomposition first.
- Tests cross the same interface callers use. Needing to reach past it
  means the module is probably the wrong shape.
- Run tests before and after every implementation. If the baseline fails,
  report it and halt. Claim red only for a run you executed and watched
  fail; a test that already passes on baseline is reported as already
  green.
- Fixtures, golden files, recorded responses, and migration snapshots
  encode external contracts. They are inputs, not outputs: bridge at the
  boundary or ask. Never rewrite them to make code pass.
- Slice vertically: one test, one implementation, repeat. Never all tests
  first, then all implementation.
- One assertion concept per test, arrange-act-assert structure, names of
  the form `should <expected> when <condition>`.

## TypeScript

Strict mode always. `any` is forbidden; use `unknown` when the type is
genuinely unknown. Prefer `interface` over `type` for object shapes, and
discriminated unions with exhaustive `switch` over `never` for state
machines. `@ts-expect-error` with a reason comment, never bare
`@ts-ignore`. Prefer the standard library (`parseArgs` from `node:util`
over commander). Barrel `index.ts` only at module boundaries. Make
impossible states impossible; expose the narrowest type the caller needs.

## Architecture

Simple over complex, explicit over implicit, composition over inheritance.
Abstract on the third use, not before. Prefer deleting code to adding it.
Match the existing repo style in mechanics: naming, formatting, file
layout, idiom. A defect is not a style. Never replicate `any`, swallowed
errors, TODOs, dead code, or what-comments into new lines, however
consistently the file commits them; new lines meet these standards even
when their neighbors do not.

## Bug Fixes

A report names a symptom. Before editing, find every caller of the function
you are about to change. One guard in the shared function beats a guard in
every caller. A function you edit gets its local defects fixed in the same
change: its `var`s, `any`s, dead lines, and noise comments go with the fix.
Functions you did not edit stay untouched.

## Scaffolding, Lint, Git

- New configs come from official CLIs (`pnpm init`, `tsc --init`,
  `create-next-app`, `npx shadcn@latest init`), never written by hand.
- Fix every lint error before commit. Pre-existing errors are not an
  excuse.
- Branches are lowercase-hyphen with `feature/` `bugfix/` `hotfix/`
  `refactor/` prefixes. Commit messages are conventional
  (`<type>: <description>`). Merge to master with `--no-ff`.
- Agent instruction changes go through `config/pi/agents-md/` fragments in
  the dotfiles repo. Editing a generated `AGENTS.md` or `CLAUDE.md`
  directly is an error; `build-agents.sh --check` enforces this.
