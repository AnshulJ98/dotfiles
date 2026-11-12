---
files-allowed: [differ/src/format.ts]
tests: cd differ && npm test
---
# differ: format(changes)

In `differ/`, `diff(a, b)` (in `differ/src/diff.ts`, with the exported types `JsonValue`, `Path` and `Change`) returns the changes between two JSON values: `{ path: (string | number)[], kind: "added" | "removed" | "changed", before?, after? }`.

**Feature.** `format(changes)` prints one line per change, stable across runs. Printed values have their object keys sorted.

Create `differ/src/format.ts` exporting `format(changes: readonly Change[]): string`. `npm test` in `differ/` runs `tsc --noEmit -p .` first, so the file must typecheck under the package's strict tsconfig. Exact output:

- One line per change, in the order given, each line ending with `\n`. No changes gives `""`.
- Added: `+ <pointer> <after>`. Removed: `- <pointer> <before>`. Changed: `~ <pointer> <before> -> <after>`. Single spaces as shown.
- `<pointer>` is the path as a JSON Pointer (RFC 6901): every segment is preceded by `/`; inside a segment `~` is written `~0` and `/` is written `~1`. A numeric segment and a string segment print alike (index `0` and key `"0"` both give `/0`). The root path (an empty path) is the empty string, so a changed root prints as `~  1 -> 2` (two spaces after the `~`).
- Values print as compact JSON (no spaces after `:` or `,`), strings escaped as JSON does, so a newline in a string stays on the one line (`+ /s "x\ny"` with a real backslash-n).
- Object keys are sorted at every depth, by UTF-16 code-unit order of the key string, and printed in that order even when the keys look like integers: `{"b":1,"10":2,"2":3}` prints as `{"10":2,"2":3,"b":1}`. Arrays keep their order. An own key named `__proto__` (as `JSON.parse` creates it) is printed and sorted like any other key (`{"A":3,"__proto__":2,"z":1}`).
- For `changed`, both values are printed sorted.

Examples: `format([{ path: ["x"], kind: "changed", before: 1, after: 2 }])` is `"~ /x 1 -> 2\n"`; a removed `["y", 1, "z"]` with before `null` is `"- /y/1/z null\n"`; an added `["a/b"]` with after 1 is `"+ /a~1b 1\n"`; `format(diff({ x: 1, y: [1, 2] }, { x: 2, y: [1] }))` is `"~ /x 1 -> 2\n- /y/1 2\n"`.

Steps:

1. Read `differ/src/diff.ts` and its tests for the types and conventions; run the test command to see the starting state. check: `cd differ && npm test` runs and passes.
2. Write `differ/src/format.ts` as above. check: `cd differ && npm test` passes (typecheck included), and a `node` one-liner importing `./src/format.ts` prints the examples above exactly.
