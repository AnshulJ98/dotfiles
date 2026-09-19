#!/usr/bin/env bash
# check.sh — prove ImageMagick can decode SVG through the rsvg-convert delegate.
#
# Two assertions:
#   1. The delegate itself works (fatal). Catches a missing rsvg-convert, bad
#      XML, or an ImageMagick upgrade that changes the svg:decode argument
#      contract described in delegates.xml.
#   2. The ambient shell is wired to load it (warning). During a fresh install
#      the new .zshrc export is not in the running environment yet, so this
#      cannot be fatal.
#
# Usage: config/imagemagick/check.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d -t imagemagick-svg-check)"
trap 'rm -rf "$WORK"' EXIT
FIXTURE="$WORK/fixture.svg"
OUT="$WORK/out.png"
ERR="$WORK/stderr.txt"

fail() { printf "✗ %s\n" "$*" >&2; exit 1; }
warn() { printf "⚠ %s\n" "$*" >&2; }
ok()   { printf "✓ %s\n" "$*"; }

# An @font-face family no font server can resolve: exactly what makes the
# internal MSVG renderer fail, and what d2 emits in every export.
cat > "$FIXTURE" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
  <style type="text/css"><![CDATA[ .t { font-family: "nonexistent-embedded-font"; } ]]></style>
  <rect width="120" height="40" fill="#ffffff"/>
  <text class="t" x="8" y="26" font-size="16">svg check</text>
</svg>
EOF

command -v magick >/dev/null 2>&1 || fail "magick not on PATH (brew install imagemagick)"
command -v rsvg-convert >/dev/null 2>&1 || fail "rsvg-convert not on PATH (brew install librsvg)"

# 1. Delegate correctness, independent of the ambient environment. Mirrors the
#    two stages kitten icat runs: identify, then rasterise.
if ! MAGICK_CONFIGURE_PATH="$DIR" magick identify -format '%m %wx%h' -- "$FIXTURE" >/dev/null 2>"$ERR"; then
  fail "svg:decode delegate failed: $(tr '\n' ' ' < "$ERR")
      Read the argument-coupling note in $DIR/delegates.xml."
fi
[ -s "$ERR" ] && fail "svg:decode delegate emitted diagnostics: $(tr '\n' ' ' < "$ERR")"

if ! MAGICK_CONFIGURE_PATH="$DIR" magick -background none -- "$FIXTURE" -auto-orient "$OUT" 2>"$ERR"; then
  fail "svg rasterisation failed: $(tr '\n' ' ' < "$ERR")"
fi
[ -s "$OUT" ] || fail "svg rasterisation produced an empty file"
ok "svg:decode delegate renders SVG through rsvg-convert"

# 2. Ambient wiring. Without this the Homebrew inkscape entry wins, because
#    $HOME/.config/ImageMagick is searched after it.
if magick identify -format '%m' -- "$FIXTURE" >/dev/null 2>&1; then
  ok "MAGICK_CONFIGURE_PATH is wired in this shell"
else
  warn "this shell does not load the delegate (MAGICK_CONFIGURE_PATH=${MAGICK_CONFIGURE_PATH:-unset}); open a new shell after install"
fi
