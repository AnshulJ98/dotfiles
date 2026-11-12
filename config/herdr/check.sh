#!/bin/sh
# Re-run after kitty or Herdr upgrades. No server or pane is modified.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PYTHONDONTWRITEBYTECODE=1 python3 "$HERE/tests/test_keys.py"
PYTHONDONTWRITEBYTECODE=1 python3 "$HERE/../kitty/tests/test_workspaces.py"
result=$(HERDR_CONFIG_PATH="$HERE/config.toml" herdr config check)
printf '%s\n' "$result"
[ "$result" = 'config: ok' ]
