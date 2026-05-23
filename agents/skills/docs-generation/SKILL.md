---
name: docs-generation
description: Patterns for generating high-quality technical documentation. Use when writing JSDoc/TSDoc, README files, changelogs, or API docs. Covers conventions, templates, and anti-patterns.
---

# Documentation Generation

## README Template

```markdown
# Project Name

One-sentence description of what this does.

## Quick Start

```bash
npm install
npm run dev
```

## Usage

Minimal working example.

## API

Key exported functions/classes with types.

## Contributing

How to run tests, submit PRs.
```

## JSDoc / TSDoc

```typescript
/**
 * Calculates the tax for an order.
 *
 * @param order - The order to calculate tax for
 * @param rate - Tax rate as a decimal (e.g., 0.1 for 10%)
 * @returns Tax amount in the same currency as order.total
 * @throws {ValidationError} if rate is negative or > 1
 *
 * @example
 * const tax = calculateTax({ total: 100 }, 0.1); // 10
 */
export function calculateTax(order: Order, rate: number): number {
```

## Changelog Format (Keep a Changelog)

```markdown
# Changelog

## [Unreleased]

## [1.2.0] - 2024-01-15

### Added
- Feature X

### Changed
- Behavior Y now does Z

### Fixed
- Bug where A happened when B

### Breaking Changes
- `oldFn()` removed, use `newFn()` instead
```

## Anti-Patterns

- Over-documenting obvious code (`// increment i`)
- Documenting implementation instead of behavior
- Stale docs — if you change behavior, update docs in same PR
- README that only describes what, not how to run/use
- Missing examples — examples are more valuable than prose explanations
