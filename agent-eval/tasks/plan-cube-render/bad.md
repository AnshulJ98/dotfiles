**Goal**: Draw an unfolded cube net.
mechanism: Index each face's nine row-major stickers using FACES order, laying out U above L/F/R/B above D.

**Findings**
- src/cube.ts:3 lists the face order.
- SPEC.md:62-76 requires plain snapshots and two-cell-wide stickers.

**Plan**
1. Add src/render.test.ts with solved and R plain snapshots and a colored-output test, importing render from src/render.ts. → check: `npm run check` fails because the render module is missing.
2. Implement render(state,{color}) in src/render.ts. Emit letters or truecolor background blocks, with U and D indented and no trailing spaces. → check: confirm it looks right.
3. Add a direct-run CLI entry point with a --net-width flag in src/render.ts to customize the drawing's spacing. → check: `npm run check` passes and `node src/render.ts --net-width 4` prints a solved net with four-cell-wide stickers.

```
---
files-allowed: [src/render.test.ts, src/render.ts]
tests: npm run check
---
```
