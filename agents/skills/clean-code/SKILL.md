---
name: clean-code
description: Clean Code principles, TypeScript conventions, Smart Brevity communication, and testing philosophy. Load when generating code, writing documentation, or reviewing PRs. Applies to ALL code generation tasks.
---

# Clean Code

Robert C. Martin's Clean Code. No exceptions. Every code generation task follows these rules.

## Code Principles

- **Names**: meaningful, informative, purposeful. No abbreviations without domain consensus.
- **Functions**: small, single-responsibility, descriptive verbs. One level of abstraction per function.
- **Architecture**: simple over complex. Explicit over implicit. Composition over inheritance.
- **State**: make impossible states impossible. Discriminated unions for state machines.
- **Abstraction**: don't abstract until the third use. Premature abstraction is worse than duplication.
- **Comments**: last resort. If code needs a comment, simplify the code first. JSDoc/TSDoc for public APIs only.
- **Patterns**: match existing repository style. Always. Never introduce a new pattern when one exists.

## TypeScript Conventions

- Strict mode always: `noImplicitAny`, `strictNullChecks`.
- Never use `any` type. Prefer specific types, interfaces, or generics.
- Prefer `interface` over `type` for object shapes.
- Use discriminated unions for state machines.
- Exhaustive switch with `never` for compile-time safety.
- Barrel exports (`index.ts`) only at module boundaries.

## Testing Philosophy

- Test behavior, not implementation. The unit is the module, not the class.
- Match strategy to code type (Bernhardt's functional core / imperative shell):
  - Pure logic (parsers, state machines, transformations): test-first, table-driven, zero mocks.
  - I/O coordination (network, filesystem, process management): integration tests against real deps.
- Mocks/fakes only at genuine system boundaries. If you need a mock, question the decomposition first.
- One assertion per test when practical.
- Descriptive test names: `should [expected] when [condition]`.
- Test sandwich: baseline before, verify after. Never claim a fix without the check that proves it.

## Communication — Smart Brevity

For generated artifacts (docs, README, PR descriptions, commit messages, changelogs):

- **Lead with the answer.** What → So What → Now What. No throat-clearing.
- **One idea per paragraph.** Second sentences earn their place or get cut.
- **Cut ruthlessly.** "In order to" → "To". Every word must change meaning.
- **Structure over prose.** Tables, bullets, code blocks beat walls of text.
- **No hedging.** Drop "I think", "maybe", "it seems like", "it's worth noting".
- **Front-load the important word** in every sentence and heading.
- **Quantify over qualify.** "3 files changed" > "several files were modified".

## Documentation

- JSDoc/TSDoc for public APIs only.
- No redundant comments. `// increment i` is a code smell.
- README: what it does, how to run it, how to contribute. Nothing else.
