#!/usr/bin/env bash
# Brings `code serve-web` (Herdr UI's VS Code tab) in line with the desktop app.
# Re-run after editing settings.json, the custom CSS, or a VS Code update:
# each update unpacks a fresh server, which drops the CSS patch.
#
# 1. Machine settings: the server reads these from disk (its user settings live
#    in the browser). A copy of settings.json with the GPU editor renderer off,
#    since Herdr's WebKit view can't observe device-pixel sizes and every
#    editor then fails to open.
# 2. Custom CSS: the desktop custom-CSS extension patches Electron files only,
#    so this links the same stylesheet into each server's workbench.html.
#    HACK: edits VS Code's own server files; skipped if the page has changed.
#    No vibrancy or transparency: Herdr's web view paints opaque white behind
#    the page, so transparent backgrounds show white, not Herdr's backdrop.
set -euo pipefail

DOT="$(cd "$(dirname "$(readlink "$0" || echo "$0")")/.." && pwd)"
SETTINGS="$DOT/vscode-insiders/settings.json"
CSS="$DOT/vscode-insiders/css/.vscode-custom.css" # also vscode_custom_css.imports
MARK="<!-- dotfiles: custom css -->"

for data in "$HOME/.vscode-server/data" "$HOME/.vscode-server-insiders/data"; do
  machine="$data/Machine/settings.json"
  mkdir -p "$data/Machine"
  rm -f "$machine" # may be an older symlink to settings.json
  sed -E 's/("editor\.experimentalGpuAcceleration":[[:space:]]*)"on"/\1"off"/' "$SETTINGS" >"$machine"
  echo "settings: $machine"
done

if [ ! -f "$CSS" ]; then
  echo "skip css: $CSS missing" >&2
  exit 0
fi
for dir in "$HOME"/.vscode/cli/serve-web/*/out/vs/code/browser/workbench \
  "$HOME"/.vscode-insiders/cli/serve-web/*/out/vs/code/browser/workbench; do
  html="$dir/workbench.html"
  [ -f "$html" ] || continue
  cp "$CSS" "$dir/dotfiles-custom.css"
  if grep -qF "$MARK" "$html"; then
    echo "css: already patched $html"
  elif grep -q 'workbench/workbench.css">' "$html"; then
    sed -i '' "s#\(.*\)\(workbench/workbench.css\">\)#&\\
\1workbench/dotfiles-custom.css\"> $MARK#" "$html"
    echo "css: patched $html"
  else
    echo "skip css: no workbench.css link in $html" >&2
  fi
done
