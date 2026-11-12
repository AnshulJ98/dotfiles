---
files-allowed: [src/cli.ts]
tests: npm run check
---
# cube: the CLI

`SPEC.md` in the repo root describes a 3×3 Rubik's cube in TypeScript; all the modules the CLI needs exist (`src/cube.ts`, `src/moves.ts`, `src/notation.ts`, `src/scramble.ts`, `src/render.ts`, `src/solve.ts`). `npm run check` is `tsc -p .` then `node --test "src/**/*.test.ts"`. This slice is the "CLI" section:

> **CLI: `src/cli.ts`**
> - `npm run cube -- "R U R' U'"` applies the moves to a solved cube and prints the net.
> - `--scramble` prints a random scramble and its net; `--seed N` makes it repeatable.
> - `--solve`, given moves or `--scramble`, also prints the solution, its length and the solved net.
> - `--plain` forces letters. Colour is the default only when stdout is a TTY and `NO_COLOR` is unset.
> - Bad notation prints a message on stderr and exits 2. An unknown flag prints usage on stderr and exits 2.
> - Tests run `node src/cli.ts` as a child process for one happy path and both exit-2 paths.

Create `src/cli.ts`; it is run as `node src/cli.ts <args>` from the repo root (`package.json` already has the `cube` script). Exact behaviour:

- Positional arguments are the moves, joined with spaces and parsed (so `'R U'` as one argument or `R U` as two both work). With `--plain` and `R U`, stdout is the plain net of `applyMoves(SOLVED, ['R', 'U'])` as `render` prints it (`color: false`) followed by one newline, exit 0.
- `--scramble` ignores positional moves and uses `scramble(25, rng)`; with `--seed N` the rng is `seeded(N)` (N an integer), otherwise `Math.random`. Output is `Scramble: <moves joined by single spaces>`, a newline, then the net of the scrambled cube, then a final newline.
- `--solve` appends, after one blank line, `Solution (<count> moves): <moves joined by single spaces>`, a newline, and the net of the state after the solution is applied (the solved net). Output still ends with exactly one newline. So `--plain --scramble --seed 7 --solve` exits 0, its stdout starts with `Scramble: `, contains a line starting `Solution (` followed by digits and ` moves): `, and its last nine lines are the plain net of `SOLVED`.
- Colour is used only when stdout is a TTY, `NO_COLOR` is unset and `--plain` is absent.
- Bad notation (for example the argument `R X`): exit code 2, nothing on stdout, and stderr carries a message that names the offending token in double quotes (`"X"`).
- An unknown flag (for example `--bogus`): exit code 2, nothing on stdout, and stderr carries a line containing the word `usage` (lower case).

Steps:

1. Read `SPEC.md` and the exports of `src/notation.ts`, `src/scramble.ts`, `src/render.ts` and `src/solve.ts`. check: `npm run check` runs and passes.
2. Write `src/cli.ts` for the behaviour above. check: `node src/cli.ts --plain "R U"` prints the net and exits 0, `node src/cli.ts R X` exits 2 with `"X"` on stderr, and `node src/cli.ts --bogus` exits 2 with `usage` on stderr.
3. Run the seeded solve path. check: `node src/cli.ts --plain --scramble --seed 7 --solve` prints a scramble, a solution and a solved net, and `npm run check` passes with no `tsc` errors.
