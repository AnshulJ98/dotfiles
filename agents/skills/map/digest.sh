#!/usr/bin/env bash
# digest.sh — mechanical input for a module map: reading order, fan-in, and
# exported signatures for one TypeScript module. Zero model tokens.
#
# Usage: digest.sh <repo> <module-dir> <out.md>
#   module-dir is relative to repo, e.g. src/core
#
# Signatures come from the repo's own tsc (--emitDeclarationOnly); when that
# emit fails, the export lines are grepped instead and the section says so.
# Edges come from relative specifiers only (`from './x'`, `import './x'`,
# `import('./x')`, `require('./x')`), with `./dir` resolved to `./dir/index`:
# path aliases and barrel re-exports are not followed, so fan-in through them
# is undercounted. tsc runs against the nearest tsconfig.json at or above the
# module, so a monorepo package digests against its own project. Paths with
# spaces are refused rather than mis-split.
set -euo pipefail

[ $# -eq 3 ] || { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' >&2; exit 2; }
REPO="$(cd "$1" && pwd)"
MODULE="${2%/}"
OUT="$3"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
mkdir -p "$(dirname "$OUT")"
cd "$REPO"
[ -d "$MODULE" ] || { echo "digest: no directory $MODULE in $REPO" >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

source_files() {
  rg --files "$@" -g '*.ts' -g '*.tsx' -g '!*.test.*' -g '!*.spec.*' -g '!*.d.ts' -g '!node_modules' 2>/dev/null | sort
}

SPACED=$(source_files . | grep ' ' | head -1 || true)
[ -z "$SPACED" ] || { echo "digest: paths with spaces are not supported: $SPACED" >&2; exit 2; }

# "imported importer" pairs, extension-less, repo-relative.
source_files . | node -e '
const fs = require("fs"), path = require("path");
const files = fs.readFileSync(0, "utf8").split("\n").filter(Boolean);
const strip = (f) => f.replace(/\.(ts|tsx|js|mjs)$/, "");
const known = new Set(files.map((f) => strip(path.normalize(f))));
const specifier = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)["\x27](\.{1,2}\/[^"\x27]+)["\x27]/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(specifier)) {
    const target = strip(path.normalize(path.join(path.dirname(file), m[1])));
    const resolved = known.has(target) || !known.has(path.join(target, "index")) ? target : path.join(target, "index");
    console.log(resolved, strip(path.normalize(file)));
  }
}' > "$TMP/edges"

MODULE_FILES=$(source_files "$MODULE" | sed -E 's/\.(ts|tsx)$//')
in_module() { grep -qxF "$1" <<<"$MODULE_FILES"; }

{
  echo "# $MODULE interfaces"
  echo
  echo "Generated $(date +%F) at $(git rev-parse --short HEAD 2>/dev/null || echo 'no-git'). Edges: relative imports only."
  echo
  echo "## Reading order (leaves first)"
  echo
  # Module-internal edges plus every module file as a self-pair, so isolated files still appear.
  { awk -v m="$MODULE/" 'index($1, m) == 1 && index($2, m) == 1' "$TMP/edges"
    for f in $MODULE_FILES; do echo "$f $f"; done; } | tsort 2>"$TMP/cycles" > "$TMP/order"
  ORDER=$(cat "$TMP/order")
  sed 's/^/1. /' "$TMP/order"
  [ -s "$TMP/cycles" ] && { echo; echo "Cycles:"; sed 's/^tsort: /- /' "$TMP/cycles"; }
  echo
  echo "## Fan-in"
  echo
  echo "| file | in | imported by |"
  echo "|---|---|---|"
  for f in $MODULE_FILES; do
    importers=$(awk -v f="$f" '$1 == f { print $2 }' "$TMP/edges" | sort -u)
    count=$(grep -c . <<<"$importers" || true)
    echo "$count|$f|$(tr '\n' ' ' <<<"$importers" | sed 's/ $//; s/ /, /g')"
  done | sort -t'|' -k1,1nr | awk -F'|' '{ printf "| %s | %s | %s |\n", $2, $1, ($3 == "" ? "entry or unused" : $3) }'
  echo
  echo "## Exports"
  TSC="node_modules/.bin/tsc"
  PROJECT="$MODULE"
  while [ "$PROJECT" != "." ] && [ ! -f "$PROJECT/tsconfig.json" ]; do PROJECT=$(dirname "$PROJECT"); done
  # tsc emits declarations despite type errors and exits non-zero, so judge by what landed.
  [ -x "$TSC" ] && [ -f "$PROJECT/tsconfig.json" ] && \
    "$TSC" -p "$PROJECT" --declaration --emitDeclarationOnly --noEmit false --outDir "$TMP/dts" >"$TMP/tsc.log" 2>&1 || true
  emitted=0
  find "$TMP/dts" -name '*.d.ts' 2>/dev/null | grep -q . && emitted=1
  [ "$emitted" = 1 ] || { echo; echo "_tsc declaration emit produced nothing; export lines grepped instead (no inferred types)._"; }
  for f in $ORDER; do
    echo
    echo "### $f"
    echo
    echo '```ts'
    dts=""
    rel="$f"
    while [ "$emitted" = 1 ] && [ -n "$rel" ]; do
      [ -f "$TMP/dts/$rel.d.ts" ] && { dts="$TMP/dts/$rel.d.ts"; break; }
      [[ "$rel" == */* ]] && rel="${rel#*/}" || rel=""
    done
    if [ -n "$dts" ]; then
      # Whole export blocks: an interface or class is its members, not its first line.
      awk '/^export \{\};$/ { next }
           /^export / { depth = 0; on = 1 }
           on { print; depth += gsub(/\{/, "{") - gsub(/\}/, "}"); if (depth <= 0) on = 0 }' "$dts"
    else
      src=$(ls "$f".ts "$f".tsx 2>/dev/null | head -1)
      grep -E '^export ' "$src" | sed 's/ *{ *$//' || echo "// no exports"
    fi
    echo '```'
  done
} > "$OUT"
echo "wrote $OUT ($(wc -l <<<"$MODULE_FILES" | tr -d ' ') files, $(grep -c . "$TMP/cycles" || true) cycle lines)"
