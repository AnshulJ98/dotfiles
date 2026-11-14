**Goal**: Render the cube's unfolded net in letters or truecolor blocks.
mechanism: Extract row-major stickers from face offsets in the state; arrange three rows each of U, L/F/R/B, D, translating sticker letters to colors.

**Findings**
- src/cube.ts:3 defines FACES in U,R,F,D,L,B order; each face occupies nine characters.
- SPEC.md:62-76 requires two-cell stickers, plain solved/R snapshots and no trailing spaces.
- src/moves.ts:49 exports applyMove; use applyMove(SOLVED,"R") for the moved fixture.

**Plan**
1. Add src/render.test.ts importing render, SOLVED and applyMove. Snapshot nine lines without final newline: solved U and D rows indented six spaces; middle rows "L L L F F F R R R B B B". For R, top rows are "      U U F", middle "L L L F F D R R R U B B", bottom "      D D B". Assert no trailing whitespace in either mode, 54 truecolor background escapes, nine white blocks, and every colored line ends in reset. → check: `npm run check` fails because src/render.ts is missing.
2. Add src/render.ts exporting render(state:string,options:{color:boolean}):string. Slice each face row at 9*FACES.indexOf(face)+3*row. Plain cells are letter plus space; trimEnd each plain row. Color cells are `\x1b[48;2;RGBm  `; use U=255;255;255, R=200;30;30, F=0;155;72, D=255;213;0, L=255;88;0, B=0;70;173. Indent single-face rows six spaces, append `\x1b[0m` to colored rows and join nine rows with newline, no final newline. → check: `npm run check` passes all snapshots and color assertions.

```
---
files-allowed: [src/render.test.ts, src/render.ts]
tests: npm run check
---
```
