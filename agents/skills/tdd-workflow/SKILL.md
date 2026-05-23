---
name: tdd-workflow
description: RED → GREEN → REFACTOR discipline for feature and bug fix work. Use when writing new code (test first) or fixing bugs (reproduce before fix). Complements test-runner (framework detection) and testing-patterns (dependency-breaking). Covers the TDD cycle, anti-patterns, characterization tests for legacy code, and TDD for bug fixes.
---

# TDD Patterns: Red-Green-Refactor

**The non-negotiable discipline.**

> "Legacy code is simply code without tests." — Michael Feathers

## The Cycle

```
RED → write a failing test
GREEN → minimum code to pass
REFACTOR → clean up, no behavior change
Repeat until feature complete
```

### RED: Write a Failing Test

1. Write a test for behavior that doesn't exist yet
2. Run it — **it MUST fail**
3. If it passes, your test is wrong or the behavior already exists
4. The failure message should be clear about what's missing

### GREEN: Make It Pass (Quickly)

1. Write the **minimum code** to make the test pass
2. Don't worry about elegance — just make it work
3. Hardcoding is fine if it makes the test pass
4. Clean up in REFACTOR

### REFACTOR: Clean Up

1. Remove duplication
2. Improve naming
3. Extract functions/classes
4. Tests must still pass after every change

## TDD Anti-Patterns

- **Writing tests after implementation** — defeats the purpose; tests become verification theater
- **Testing implementation details** — test behavior, not private methods
- **Too large a RED step** — if you need >10 lines to go GREEN, your RED step is too big
- **Skipping REFACTOR** — code debt accumulates fast
- **Ignoring test quality** — tests are production code; they need the same care

## Characterization Tests (Legacy Code)

When adding tests to untested code:
1. Write a test that calls the code
2. Run it — observe the actual output
3. Hard-code that output as the expected value
4. Now you have a safety net for refactoring

## TDD for Bug Fixes

1. Write a failing test that reproduces the bug
2. Verify it fails (RED)
3. Fix the bug (GREEN)
4. Ensure all tests pass
5. The test prevents regression

## Test Sandwich

Run tests BEFORE (baseline) and AFTER (validation) every implementation.
- Before fails → report + HALT — don't implement on broken baseline
- After fails → you broke something — fix before continuing
