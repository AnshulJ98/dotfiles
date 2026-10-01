#!/usr/bin/env bash
# Installs the Raycast store extensions carried over from Raycast into Vicinae.
# Mirrors Vicinae's own store install (RaycastStoreService + ExtensionRegistry::installFromZip):
# the store zip is unpacked with its top directory stripped into
# ~/.local/share/vicinae/extensions/store.raycast.<name>, which Vicinae's watcher picks up.
# Idempotent: installed extensions are skipped; pass --update to reinstall all.
#
# Not migrated: per-extension preferences (API keys, vault paths) live in Raycast's
# encrypted database; Vicinae prompts for required ones on first launch.
# Dropped: pernielsentikaer/installed-extensions reads Raycast's own directory;
# Vicinae's "List Extensions" (core:list-extensions) replaces it.

set -euo pipefail

# Store slugs are <owner>/<name>; owner falls back to author when package.json has none.
EXTENSIONS=(
  AntonNiklasson/lorem-ipsum
  Codely/google-chrome
  abielzulio/chatgpt
  asubbotin/shell
  destiner/json-format
  erics118/change-case
  erics118/file-manager
  gdsmith/jwt-decoder
  jarry_chung/ghostty
  josephschmitt/gif-search
  limonkufu/aerospace
  lucaschultz/port-manager
  marcjulian/obsidian
  mattisssa/spotify-player
  mblode/google-search
  nathan_schwermann/ray-boop
  nhojb/brew
  raycast/model-context-protocol-registry
  rolandleth/kill-process
  ron-myers/brave
  tegola/remove-paywall
  thomas/color-picker
  thomas/visual-studio-code
  tonka3000/speedtest
  tonka3000/weather
  yedongze/terminalfinder
)

STORE_API="https://backend.raycast.com/api/v1/extensions"
DEST="$HOME/.local/share/vicinae/extensions"
UPDATE=false
[ "${1:-}" = "--update" ] && UPDATE=true

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$DEST"

failures=0
for slug in "${EXTENSIONS[@]}"; do
  name="${slug#*/}"
  target="$DEST/store.raycast.$name"
  if [ -d "$target" ] && [ "$UPDATE" = false ]; then
    echo "✓ present: $name"
    continue
  fi

  url="$(curl -fsS "$STORE_API/$slug" | jq -r '.download_url // empty')" || url=""
  if [ -z "$url" ]; then
    echo "⚠ no download_url for $slug" >&2
    failures=$((failures + 1))
    continue
  fi

  rm -rf "$WORK/$name" && mkdir -p "$WORK/$name"
  curl -fsSL "$url" -o "$WORK/$name.zip"
  unzip -q "$WORK/$name.zip" -d "$WORK/$name"
  # Equivalent of stripComponents = 1: the bundle is the zip's single top directory.
  bundle="$(find "$WORK/$name" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [ -z "$bundle" ] || [ ! -f "$bundle/package.json" ]; then
    echo "⚠ $slug: bundle has no package.json, skipped" >&2
    failures=$((failures + 1))
    continue
  fi

  rm -rf "$target"
  mv "$bundle" "$target"
  echo "✓ installed: $name"
done

if [ "$failures" -gt 0 ]; then
  echo "⚠ $failures extension(s) failed" >&2
  exit 1
fi
