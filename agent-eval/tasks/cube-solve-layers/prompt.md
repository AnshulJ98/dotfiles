---
files-allowed: [src/solve.test.ts, src/solve.ts]
tests: npm run check
---
# cube: solver, steps 1 to 3

`SPEC.md` in the repo root describes a 3×3 Rubik's cube in TypeScript; everything but the solver exists (`src/cube.ts`, `src/moves.ts`, `src/notation.ts`, `src/scramble.ts`, `src/render.ts`). `npm run check` is `tsc -p .` then `node --test "src/**/*.test.ts"`. This slice is the first half of the "Solver" section:

> **Solver: `src/solve.ts`**
> - `solve(state): Move[]` uses the beginner layer-by-layer method, in this order: 1. White cross. 2. First-layer corners. 3. Second-layer edges. 4. Yellow cross. 5. Yellow edges. 6. Placing the yellow corners. 7. Orienting the yellow corners.
> - It returns `simplify`-ed moves and throws on an invalid state.
> - Each step finds pieces by searching stickers, not by tracking moves, and picks an algorithm from a small per-case table.

Do steps 1 to 3 only in this slice; steps 4 to 7 come later. White is the U face, so the first layer is the U face and the second layer is the top two rows of F, R, B and L.

Create `src/solve.ts` exporting `solve(state: string): Move[]` (`Move` from `src/moves.ts`). Required behaviour:

- `solve(SOLVED)` is `[]`.
- `solve` throws an Error for a state that fails `isValid`, for example fifty-four `U`.
- For each of the states `applyMoves(SOLVED, scramble(25, seeded(i)))` with i from 0 to 199: the returned moves, applied to the state, leave all nine U stickers `U` and, on each of the R, F, L and B faces, the first six stickers (the top two rows) equal to that face's letter; the sequence is at most 200 moves long. The yellow layer is not required to be solved.
- All 200 scramble-and-solve runs together take under 2 seconds.

Steps:

1. Read `SPEC.md`, `src/cube.ts`, `src/moves.ts`, `src/notation.ts` and `src/scramble.ts`. check: `npm run check` runs (it may fail on the missing `solve` module).
2. Write `src/solve.ts`: the white cross, then the first-layer corners, then the second-layer edges, returning simplified moves. check: a `node` one-liner importing `./src/solve.ts` shows `solve(SOLVED)` is `[]` and the solution for `applyMoves(SOLVED, scramble(25, seeded(0)))` leaves the U face solved.
3. Run the 200-scramble check from the list above yourself in a throwaway `node` script. check: it reports no state with an unsolved U face or top two rows and a total time under 2 seconds; then `npm run check` passes with no `tsc` errors.
