---
files-allowed: [src/solve.test.ts, src/solve.ts]
tests: npm run check
---
# cube: solver, steps 4 to 7

`SPEC.md` in the repo root describes a 3×3 Rubik's cube in TypeScript. `src/solve.ts` already solves steps 1 to 3 (white cross, first-layer corners, second-layer edges); everything else exists too. `npm run check` is `tsc -p .` then `node --test "src/**/*.test.ts"`. This slice finishes the "Solver" section:

> **Solver: `src/solve.ts`**
> - `solve(state): Move[]` uses the beginner layer-by-layer method, in this order: 1. White cross. 2. First-layer corners. 3. Second-layer edges. 4. Yellow cross. 5. Yellow edges. 6. Placing the yellow corners. 7. Orienting the yellow corners.
> - It returns `simplify`-ed moves and throws on an invalid state.
> - Each step finds pieces by searching stickers, not by tracking moves, and picks an algorithm from a small per-case table.
> - Tests: 200 seeded 25-move scrambles each solve to `SOLVED`. Every solution is ≤ 200 moves. `solve(SOLVED)` is `[]`. All 200 finish in under 2 s.

Do steps 4 to 7 so `solve(state): Move[]` (same signature, in `src/solve.ts`) solves the whole cube. Required behaviour:

- For each state `applyMoves(SOLVED, scramble(25, seeded(i)))` with i from 0 to 199, `applyMoves(state, solve(state))` equals `SOLVED`, the solution has at most 200 moves, and all 200 scramble-and-solve runs together take under 2 seconds.
- `solve(SOLVED)` is `[]`; a state that fails `isValid` (for example fifty-four `U`) still throws.
- A state that passes `isValid` but cannot be solved by turning faces (for example `SOLVED` with the three stickers of the U-R-F corner rotated in place, so that one corner is twisted) makes `solve` throw an Error whose message contains `cannot solve this state`. It must not return an unsolved sequence or loop forever.

Steps:

1. Read `SPEC.md`, `src/solve.ts` and its test; run the test command. check: `npm run check` runs and passes.
2. Add the yellow cross and yellow edges (steps 4 and 5). check: a throwaway `node` script solving the first few seeded scrambles ends with the yellow cross and the yellow edges in place.
3. Add placing and orienting the yellow corners (steps 6 and 7), and the unsolvable-state error. check: a throwaway `node` script over seeds 0 to 199 reports every state solved, every solution ≤ 200 moves, a total under 2 seconds, and the twisted corner throwing `cannot solve this state`; then `npm run check` passes with no `tsc` errors.
