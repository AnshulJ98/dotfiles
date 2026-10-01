---
name: map
description: Build a module map for a TypeScript module before working in it — runs a zero-token digest (reading order, fan-in, exported signatures), then records the operator's own ten-line summary verbatim. Use when the operator says "map <module>" or before the first worker spec for a module that has no docs/maps/<module>-map.md.
---

# Map

A map is ten lines the operator writes in their own words after reading
the module's interfaces. Its value is the operator's comprehension; a
drafted map has none. Your job is the mechanical half and the file.

1. Run the digest. It costs no model tokens:

   ```sh
   ~/.agents/skills/map/digest.sh <repo> <module-dir> docs/maps/<name>-interfaces.md
   ```

   `<name>` is the module path with `/` replaced by `-`, e.g. `src-core`.
   Exit 2 means a bad argument; report the message and stop.

2. Reply with the path, the reading-order list, and the fan-in table
   copied from the file. Do not summarize the exports or describe what
   the module does: the operator reads the file in reading order.

3. Wait for the operator's ten lines. Write them verbatim to
   `docs/maps/<name>-map.md` under a `# <module-dir> map` heading with
   today's date and the digest's commit. Fix typos only if asked.

If asked to draft the lines, decline once and say why: a map the
operator did not write does not carry their understanding into the
worker briefs that open with it. If they insist, draft it and mark the
file `DRAFTED BY AGENT, NOT REVIEWED` on its first line.

## Digest limits

- Edges come from relative imports only (static, side-effect, dynamic,
  `require`; `./dir` resolves to `./dir/index`). Path aliases (`@/x`) and
  barrel re-exports are not followed, so their fan-in is undercounted.
  Say so when the repo's tsconfig declares `paths`.
- Signatures come from the repo's own `tsc --emitDeclarationOnly`, run
  against the nearest `tsconfig.json` at or above the module. When that
  emit produces nothing, the file says so and lists grepped `export`
  lines without inferred types.
- Paths containing spaces are refused.
