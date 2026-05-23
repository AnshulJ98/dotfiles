---
name: test-runner
description: Auto-detect and run the correct test framework per project. Use when running tests in any project. Covers Jest, Vitest, Pytest, Playwright detection and execution with correct commands.
---

# Test Runner

## Auto-Detection

```bash
# Check package.json test script
cat package.json | jq .scripts.test

# Detect framework
ls package.json 2>/dev/null && grep -l "vitest\|jest" package.json node_modules/.bin/ 2>/dev/null
ls pytest.ini pyproject.toml setup.cfg 2>/dev/null
```

## Framework Commands

### Jest
```bash
npx jest                          # run all tests
npx jest --watch                  # watch mode
npx jest path/to/test.test.ts     # specific file
npx jest --testNamePattern "name" # specific test
npx jest --coverage               # with coverage
```

### Vitest
```bash
npx vitest run                    # run once (CI mode)
npx vitest                        # watch mode
npx vitest run path/to/test.ts    # specific file
npx vitest run --reporter=verbose # detailed output
npx vitest coverage               # with coverage
```

### Pytest
```bash
pytest                            # run all
pytest -x                         # stop on first failure
pytest path/to/test_file.py       # specific file
pytest -k "test_name"             # specific test
pytest -v                         # verbose
pytest --cov=src                  # with coverage
```

### Playwright
```bash
npx playwright test               # run all e2e tests
npx playwright test --ui          # interactive UI mode
npx playwright test path/test.ts  # specific file
npx playwright test --debug       # debug mode
```

## Detection Priority

1. Check `package.json` scripts.test — if it specifies the runner, use that
2. Check for `vitest.config.*` → use Vitest
3. Check for `jest.config.*` → use Jest
4. Check for `pytest.ini` / `pyproject.toml [tool.pytest]` → use Pytest
5. Check for `playwright.config.*` → use Playwright

## Running Before/After Changes (Test Sandwich)

```bash
# Before: establish baseline
npm test 2>&1 | tee /tmp/test-before.txt
# ... make changes ...
# After: verify no breakage
npm test 2>&1 | tee /tmp/test-after.txt
diff /tmp/test-before.txt /tmp/test-after.txt
```
