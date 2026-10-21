#!/usr/bin/env bash
# Run the eval with the Pi setup from this dotfiles checkout and local auth.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
USER_HOME="$HOME"
EVAL_HOME="${AGENT_EVAL_HOME:-$USER_HOME/.cache/agent-eval/anshul-dotfiles-pi/home}"
AGENT_DIR="$EVAL_HOME/.pi/agent"
SOURCE_HOME_PI="$USER_HOME/.pi/agent"
SETUP_MARKER="$AGENT_DIR/.eval-package-fingerprint"
export PATH="$EVAL_HOME/.local/bin:$PATH"

mkdir -p "$AGENT_DIR" "$AGENT_DIR/skills-local" "$EVAL_HOME/.agents"
chmod 700 "$EVAL_HOME" "$EVAL_HOME/.pi" "$AGENT_DIR"

link_repo_dir() {
  local source="$1" target="$2"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    printf 'Refusing to replace existing directory: %s\n' "$target" >&2
    return 1
  fi
  ln -sfn "$source" "$target"
}

link_repo_dir "$REPO_ROOT/agents/skills" "$EVAL_HOME/.agents/skills"
link_repo_dir "$REPO_ROOT/config/pi/themes" "$AGENT_DIR/themes"
link_repo_dir "$REPO_ROOT/config/pi/bin" "$AGENT_DIR/bin"

# Resolve the repo's machine-specific ~/Dev/dotfiles paths against this clone.
python3 - "$REPO_ROOT" "$REPO_ROOT/config/pi/settings.json" "$AGENT_DIR/settings.json" <<'PY'
import json
import sys
from pathlib import Path

repo, source, target = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
settings = json.loads(source.read_text())
for key in ("prompts", "extensions"):
    resolved = []
    for item in settings.get(key, []):
        prefix = "~/Dev/dotfiles/"
        resolved.append(str(repo / item[len(prefix):]) if item.startswith(prefix) else item)
    settings[key] = resolved

models = settings.setdefault("enabledModels", [])
for model in (
    "openai/gpt-5.6-luna", "openai/gpt-5.6-sol", "openai/gpt-5.6-terra",
    "openai/gpt-6-luna", "openai/gpt-6-sol", "openai/gpt-6.1-sol",
    "openai/gpt-6-astra",
):
    if model not in models:
        models.append(model)

target.write_text(json.dumps(settings, indent=2) + "\n")
PY

cp "$REPO_ROOT/config/pi/AGENTS.work.md" "$AGENT_DIR/AGENTS.md"

fingerprint="$(sha256sum "$REPO_ROOT/config/pi/settings.json" "$REPO_ROOT/config/pi/AGENTS.work.md" | sha256sum | cut -d' ' -f1)"
if [ "$(cat "$SETUP_MARKER" 2>/dev/null || true)" != "$fingerprint" ]; then
  export HOME="$EVAL_HOME" PI_CODING_AGENT_DIR="$AGENT_DIR"
  while IFS= read -r package; do
    [ -n "$package" ] && pi install "$package" --no-approve
  done < <(python3 - "$REPO_ROOT/config/pi/settings.json" <<'PY'
import json
import sys
for package in json.load(open(sys.argv[1])).get("packages", []):
    print(package)
PY
  )
  printf '%s\n' "$fingerprint" > "$SETUP_MARKER"
fi

if [ ! -s "$AGENT_DIR/auth.json" ]; then
  if [ ! -s "$SOURCE_HOME_PI/auth.json" ]; then
    printf 'No Pi auth found at %s; log in to OpenAI with pi first.\n' "$SOURCE_HOME_PI/auth.json" >&2
    exit 1
  fi
  cp "$SOURCE_HOME_PI/auth.json" "$AGENT_DIR/auth.json"
  chmod 600 "$AGENT_DIR/auth.json"
fi
if [ ! -s "$AGENT_DIR/models-store.json" ] && [ -s "$SOURCE_HOME_PI/models-store.json" ]; then
  cp "$SOURCE_HOME_PI/models-store.json" "$AGENT_DIR/models-store.json"
  chmod 600 "$AGENT_DIR/models-store.json"
fi

export HOME="$EVAL_HOME" PI_CODING_AGENT_DIR="$AGENT_DIR"
if [ "${1:-}" = "--setup-only" ]; then
  printf 'Isolated Anshul Pi config ready: %s\n' "$AGENT_DIR"
  exit 0
fi

exec "$SCRIPT_DIR/run.sh" "$@"
