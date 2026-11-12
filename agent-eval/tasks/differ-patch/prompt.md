---
files-allowed: [differ/package.json, differ/src/patch.ts, differ/tsconfig.json]
tests: cd differ && npm test
---
# differ: patch, the inverse of diff

In `differ/`, `diff(a, b)` (in `differ/src/diff.ts`, with the exported types `JsonValue`, `Path` and `Change`) returns the changes between two JSON values: objects compare by key, arrays by index, each change `{ path, kind: "added" | "removed" | "changed", before?, after? }`; read its header comment for the output order.

**Feature.** `patch(a, changes)` applies a diff and is the inverse of `diff`.

Create `differ/src/patch.ts` exporting `patch(a: JsonValue, changes: readonly Change[]): JsonValue` and `class PatchError extends Error` with a `readonly path: Path` property. Required behaviour:

- **Inverse.** For any JSON values `a` and `b`, `patch(a, diff(a, b))` deep-equals `b`. This includes objects with an own key named `__proto__` (created with `JSON.parse`) and integer-like keys such as `"0"`: the result keeps `__proto__` as an ordinary own key, its prototype is still `Object.prototype`, and nothing global is polluted. The tests also check it over 500 seeded random pairs.
- **Paths refer to `a`.** Every change's path addresses a position in `a` as it is before patching. So the removals `diff` emits for the tail of a shorter array (ascending indices, e.g. 1, 2, 3 of `[1,2,3,4]`) all apply and give `[1]`.
- **Meaning of each kind.** `changed` replaces the value at an existing path whose current value deep-equals `before` (at the root path `[]` it replaces the whole value). `removed` deletes an existing path whose current value deep-equals `before`. `added` creates a key that is not yet present in an object, or appends to an array: the index must equal the array's length counting the elements the earlier changes in the list already add. Adding or removing at the root path `[]` is an error.
- **Errors.** Anything that cannot be applied throws `PatchError` (an `Error` subclass) whose `path` deep-equals the path of the first change in the list that cannot be applied, and nothing after it matters. Cases: a missing key or intermediate key; an array index that is missing, past the end or negative; an inherited key such as `"toString"` (not an own key, so absent); a path that goes through a number, null or a string; a string key used on an array or a number index used on an object; a `before` that does not match; `added` at an existing key; `added` at an array index that is not the next append position (a gap, inside the array, or out of order); `added` or `removed` at the root. The input `a` is never modified, even on an error.
- **Purity and sharing.** `patch` never mutates `a` or the change list. The result shares no object or array with `a` or with the changes' `path`, `before` or `after` values: mutating the result afterwards must not affect either. `patch(a, [])` returns a copy, not `a` itself, and a root `changed` returns a deep copy of `after` (own `__proto__` keys kept).

`npm test` in `differ/` should typecheck as well as run the tests: it should run `tsc --noEmit -p .` before the node tests, and `patch.ts` and the existing sources and tests must typecheck under the package's tsconfig (strict, with the `.ts` import extensions the sources already use). Adjust `differ/tsconfig.json` only as far as that needs.

Steps:

1. Read `differ/src/diff.ts`, its tests, `differ/package.json` and `differ/tsconfig.json`; run the test command to see the starting state. check: `cd differ && npm test` runs and passes.
2. Write `differ/src/patch.ts` with `patch` and `PatchError` as above. check: a `node` one-liner importing `./src/patch.ts` and `./src/diff.ts` from `differ/` confirms `patch(a, diff(a, b))` equals `b` for `{x:1,y:[1,2]}` to `{x:2,y:[1]}`, and `patch({a:1}, [{path:["x"],kind:"removed",before:1}])` throws a `PatchError` with `path` `["x"]`.
3. Make `npm test` typecheck first and fix whatever the typecheck then reports in the allowed files. check: `cd differ && npm test` prints no `tsc` errors and passes.
