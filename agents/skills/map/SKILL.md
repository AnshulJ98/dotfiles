---
name: map
description: Build a module map for a TypeScript, JavaScript or Python module before working in it — prints a zero-token digest (reading order, fan-in, exported signatures), then plays back the operator's own ten-line summary verbatim; nothing is written unless the operator says "save". Use when the operator says "map <module>".
---

# Map

A map is ten lines the operator writes in their own words after reading
the module's interfaces. Its value is the operator's comprehension; a
drafted map has none. Your job is the mechanical half. Nothing is
written to disk unless the operator says "save".

1. Run the digest to stdout. It costs no model tokens:

   ```sh
   node ~/.agents/skills/map/map.mjs <repo> <module-dir>
   ```

   Exit 2 means a bad argument (including `ast-grep` missing from
   PATH); report the message and stop.

2. Tool output is collapsed in the TUI, so repeat the digest verbatim
   in your reply, every line, then stop. Add nothing: no summary of the
   exports, no description of what the module does. The operator reads
   the exports in reading order. The Internals table is where to start
   reading inside a file, ranked by call sites and length; it is not a
   judgment of what matters, and you don't add one yet. After the
   digest, print this blueprint, unfilled, and stop:

   ```
   1. Purpose: what it is for, one sentence
   2. Entry points: the exports callers use; which is the main path
   3. Data: the state or core shape it owns
   4. Contract: the rule it promises (invariants, order, units)
   5. Mechanism: how the main path works; the internal that carries it
   6. Boundaries: what it depends on; what it leaves to callers (I/O, time, storage)
   7. Failure: how it fails; what the caller sees
   8. Coupling: who calls whom; what must happen before what
   9. Surprise: one
   10. Open: one question
   ```

   Fewer lines is fine for a small module; say so rather than pad.

3. Wait for the operator's ten lines. Play them back verbatim under a
   `# <module-dir> map` heading with today's date and the digest's
   commit, so the block can be copied into a spec. Fix typos only if
   asked.

4. Now read the code, and only now: the files holding the top three
   Internals rows (every row for a one-file module). Print a block
   headed `## Agent's reading` with four lines per function: what it
   does, why it exists (which export needs it), how (the mechanism in
   one line), where (call sites as `file:line`). Then one line per
   place the ten lines disagree with the code or miss one of these
   functions, or "the ten lines hold". This is a check on the map, not
   part of it. If the operator says "explain first", do this step
   before waiting for the ten lines.

5. Ask once, through `ask_user`, whether to save the map to
   `docs/maps/<name>-map.md`, where `<name>` is the module path with
   `/` replaced by `-`, e.g. `src-core`. Recommend yes: a map is read
   again weeks later, when the operator returns to the module. The
   saved file is the ten lines, then the agent's reading under its own
   heading. On no, nothing is written.

If asked to draft the lines, decline once and say why: a map the
operator did not write does not carry their understanding into the
worker specs that carry it. If they insist, draft it and open the block
with `DRAFTED BY AGENT, NOT REVIEWED`.

## Digest limits

- Edges come from ast-grep over every TS, TSX, JS, JSX, MJS, CJS and
  Python file in the repo (git's ignore rules apply at a work tree root;
  tests, `.d.ts`, `node_modules`, `dist`, `build` and virtualenvs are
  skipped). Followed: relative imports (static, side-effect, re-export,
  dynamic `import()`, `require`; `./x.js` finds `x.ts`, `./dir` finds
  `dir/index`), aliases from the nearest tsconfig/jsconfig `paths` (one
  level of `extends`), barrels (importing a file that re-exports another
  counts toward that file's fan-in, listed `(via <barrel>)`), and Python
  relative imports plus absolute ones from the repo root, `src/` or a
  `pyproject.toml` package-dir. Packages and built-ins are dropped.
- No inferred types: export lines are the headers as written.
- A Python package-dir not in those roots is not resolved, so imports
  of it are dropped.
- `export default` of an anonymous expression shows as `export default`.
