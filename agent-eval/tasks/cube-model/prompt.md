---
files-allowed: [src/cube.ts, src/moves.ts]
tests: npm run check
---
# cube: the model and the face turns

`SPEC.md` in the repo root describes a 3×3 Rubik's cube in TypeScript: plain functions over a 54-character string state. Node runs the `.ts` files directly (no build); `npm run check` is `tsc -p .` then `node --test "src/**/*.test.ts"`. Read `SPEC.md` and `tsconfig.json` first. This slice is the "Model" and "Moves" sections:

> **Model: `src/cube.ts`**
> - A state is a 54-character string in Kociemba facelet order: faces U, R, F, D, L, B, nine stickers each, row-major, each face seen from outside. U's top edge touches B; the top edges of F, R, B and L touch U; D's top edge touches F. A sticker's letter names the face whose colour it is.
> - `SOLVED` is nine of each letter in that order.
> - `isSolved(state)`.
> - `isValid(state)`: 54 characters, nine of each letter, centres in place. Full parity checks are out of scope.
>
> **Moves: `src/moves.ts`**
> - `Move` covers the 18 face turns: U, D, L, R, F and B, each plain (clockwise looking at that face), `'` or `2`.
> - `applyMove(state, move)` and `applyMoves(state, moves)` are pure and return new strings.
> - Each face's quarter turn is one 54-index permutation, written as tabulated cycles or generated from sticker coordinates. `'` is three quarter turns and `2` is two. Build all 18 tables at module load.
> - `invert(moves)` reverses the order and inverts each move.

Names the tests import:

- from `src/cube.ts`: `FACES` (a readonly array of the six face letters in the order U, R, F, D, L, B), `SOLVED`, `isSolved`, `isValid`, and the type `Face`.
- from `src/moves.ts`: `MOVES` (a readonly array of the 18 distinct moves, grouped by face in `FACES` order, each face as `X`, `X'`, `X2`), `applyMove(state: string, move: Move): string`, `applyMoves(state: string, moves: readonly Move[]): string`, `invert(moves: readonly Move[]): Move[]`, and the type `Move`. `Move` must be the union of the 18 move strings, so that a plain face letter and a template string such as `${face}'` (with `face` of type `Face`) typecheck as moves.

Required behaviour:

- `SOLVED` equals each of `FACES` repeated nine times, joined in order. `isSolved(SOLVED)` and `isValid(SOLVED)` are true; a changed state (`UU` turned into `UR`) is not solved.
- `isValid` is false for: a state one character too short, one too long, the empty string, a state with wrong letter counts (an `R` replacing the first sticker), one with a letter outside U R F D L B, and one with two centres swapped (centres are the middle sticker of each face).
- Quarter turns from `SOLVED` give exactly these states (published Kociemba facelet strings): `R` → `UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB`; `U` → `UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB`; `F` → `UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB`.
- For every face X, from `SOLVED` and from a scrambled state: X X X X, X X', X X X2 and X2 X2 each return the starting state.
- Every move keeps a valid state valid. `R U R' U'` repeated has order 6: back to `SOLVED` after 6 repetitions and not before.
- `invert(['R', "U'", 'F2'])` is `['F2', 'U', "R'"]`; `invert([])` is `[]`. Any sequence followed by its inverse returns the start state.
- The superflip `U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2` from `SOLVED` leaves every corner and centre solved and every one of the 12 edges in its place but flipped (its two stickers swapped).

Steps:

1. Read `SPEC.md`, `tsconfig.json` and `package.json`. check: `npm run check` runs (it may fail on the missing modules).
2. Write `src/cube.ts`. check: a `node` one-liner importing `./src/cube.ts` shows `SOLVED.length === 54` and `isValid(SOLVED)`.
3. Write `src/moves.ts`. check: `npm run check` passes with no `tsc` errors, and a `node` one-liner shows `applyMove(SOLVED, 'R')` equals the `R` string above.
