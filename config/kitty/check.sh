#!/bin/sh
# Re-run after kitty or zmx upgrades; tests do not modify user sessions.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$HERE/tests" -p 'test_*.py'
