---
files-allowed: [src/render.test.ts, src/render.ts]
tests: npm run check
---
# cube: render the unfolded net

`SPEC.md` in the repo root describes a 3×3 Rubik's cube in TypeScript; `src/cube.ts` and `src/moves.ts` already exist. `npm run check` is `tsc -p .` then `node --test "src/**/*.test.ts"`. This slice is the "Render" section:

> **Render: `src/render.ts`**
> - `render(state, { color })` draws the unfolded net:
>
>   ```
>         U
>       L F R B
>         D
>   ```
>
>   - Each sticker is two cells wide.
>   - With `color`, stickers are truecolor background blocks: U white, R red, F green, D yellow, L orange, B blue. Without it, the face letters are printed.
>   - No trailing spaces.

Create `src/render.ts` exporting `render(state: string, options: { color: boolean }): string`; the state is the 54-character facelet string of `src/cube.ts` (faces in the order U, R, F, D, L, B, nine stickers each, row-major). The result is nine lines joined with `\n` and no final newline: three rows of the U face, three rows of L F R B side by side, three rows of the D face.

Plain output (`color: false`): every sticker is its letter followed by one space, so the L F R B rows are twelve letters separated by single spaces; the U and D rows are indented by six spaces (three stickers wide); trailing whitespace is trimmed from every line. Solved cube:

```
      U U U
      U U U
      U U U
L L L F F F R R R B B B
L L L F F F R R R B B B
L L L F F F R R R B B B
      D D D
      D D D
      D D D
```

After `R` (state `UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB`) the same layout is:

```
      U U F
      U U F
      U U F
L L L F F D R R R U B B
L L L F F D R R R U B B
L L L F F D R R R U B B
      D D B
      D D B
      D D B
```

Colour output (`color: true`): each sticker is the truecolor background escape `ESC[48;2;<r>;<g>;<b>m` followed by two spaces, with the same indent for U and D rows, and every line ends with the reset `ESC[0m`. White (face U) is exactly `255;255;255`; pick distinct, sensible colours for the others (red, green, yellow, orange, blue). Stripped of escape sequences the colour net contains only spaces and newlines; a solved cube has 54 `ESC[48;2;` sequences, 9 of them white. Neither mode has a line ending in whitespace (the colour lines end in the reset sequence).

Steps:

1. Read `SPEC.md`, `src/cube.ts` and `src/moves.ts`; run the test command. check: `npm run check` runs and passes.
2. Write `src/render.ts`. check: `npm run check` passes with no `tsc` errors, and a `node` one-liner importing `./src/render.ts` prints the solved plain net exactly as above.
