---
files-allowed: [src/moves.test.ts, src/notation.test.ts, src/notation.ts, src/scramble.test.ts, src/scramble.ts]
tests: npm run check
---
# cube: notation and the seeded scramble

`SPEC.md` in the repo root describes a 3×3 Rubik's cube in TypeScript; `src/cube.ts` and `src/moves.ts` already exist (the model and `applyMove`, `applyMoves`, `invert`, `MOVES`, `Move`). `npm run check` is `tsc -p .` then `node --test "src/**/*.test.ts"`. This slice is the "Notation" and "Scramble" sections:

> **Notation: `src/notation.ts`**
> - `parse(text): Move[]` splits on whitespace. A token is a face letter, optionally followed by `'` or `2`. Anything else throws `NotationError`, naming the token and its index. Empty input gives `[]`.
> - `format(moves)` joins with single spaces, and `parse(format(m))` round-trips.
> - `simplify(moves)` merges consecutive turns of the same face (`R R` → `R2`, `R R'` → nothing, `R2 R` → `R'`), repeating until stable. It never reorders across other faces.
>
> **Scramble: `src/scramble.ts`**
> - `scramble(length = 25, rng = Math.random): Move[]` never turns the same face twice in a row, and never one axis three times in a row (`R L R`).
> - `seeded(seed)` returns a small deterministic PRNG (mulberry32 or similar), used by tests and by `--seed`.

Names the tests import: from `src/notation.ts` `parse`, `format`, `simplify` and the class `NotationError`; from `src/scramble.ts` `scramble` and `seeded`. The existing `src/moves.test.ts` is being changed to build its random sequences with `seeded(seed)` from `src/scramble.ts`. Required behaviour:

- `NotationError extends Error` with a `token: string` property (the bad token) and an `index: number` property (its zero-based position among the whitespace-separated tokens); its message contains both the token and the index as decimal text. Examples: `parse('x')` fails on token `x` index 0; `'R R3'` on `R3` at 1; `'R U r'` on `r` at 2; `"R U F D L B R'2"` on `R'2` at 6; `'R M'` on `M` at 1.
- `parse` accepts any whitespace (spaces, tabs, newlines, runs of them, leading and trailing): `parse("  R \t U'\n\nF2  \n")` is `['R', "U'", 'F2']`. Empty or blank input gives `[]`.
- `format(['R', "U'", 'F2'])` is `"R U' F2"`; `format([])` is `''`; `parse(format(MOVES))` returns all 18 moves.
- `simplify`: `R R` → `R2`; `R R'` → empty; `R2 R` → `R'`; `R R R` → `R'`; `R2 R2` → empty; `R U U' R'` → empty (cancellations cascade); `R L R` stays `R L R`; empty stays empty. For any move list the simplified list leaves `SOLVED` in the same state as the original and is never longer.
- `seeded(seed: number): () => number` returns a deterministic generator of numbers in [0, 1): the same seed gives the same sequence, and ten thousand draws stay in range.
- `scramble(length = 25, rng = Math.random)`: default length 25, any given length honoured (`scramble(0)` is `[]`, `scramble(60, seeded(1))` has 60 moves). The same seeded rng gives the same scramble and `seeded(1)` and `seeded(2)` give different 25-move scrambles. Consecutive moves never share a face, and three consecutive moves never share an axis (U/D, R/L, F/B). Across seeds 0 to 199 with length 25, all 18 moves appear.

Steps:

1. Read `SPEC.md`, `src/cube.ts` and `src/moves.ts`; run the test command. check: `npm run check` runs and passes.
2. Write `src/notation.ts`. check: a `node` one-liner importing `./src/notation.ts` shows `simplify(parse("R U U' R'"))` is `[]` and `parse('R M')` throws with token `M` index 1.
3. Write `src/scramble.ts`. check: `npm run check` passes with no `tsc` errors, and a `node` one-liner shows `scramble(25, seeded(1))` has length 25 and repeats for the same seed.
