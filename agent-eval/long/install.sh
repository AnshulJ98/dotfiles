#!/usr/bin/env bash
# Install the pinned pi-blackhole into agent-eval/long/.pkgs and apply the worker-usage patch (lib.ts patchBlackhole).
# usage: install.sh   (idempotent; a version without the patch anchors fails loudly)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkgs="$here/.pkgs"
mkdir -p "$pkgs"
[ -f "$pkgs/package.json" ] || echo '{"private":true}' > "$pkgs/package.json"
(cd "$pkgs" && npm install --no-audit --no-fund --silent pi-blackhole@0.5.18)
dist="$pkgs/node_modules/pi-blackhole/dist/index.js"
node --input-type=module -e "
import fs from 'node:fs';
import { patchBlackhole } from '$here/lib.ts';
fs.writeFileSync('$dist', patchBlackhole(fs.readFileSync('$dist', 'utf8')));
"
node --check "$dist"
echo "installed: $dist"
