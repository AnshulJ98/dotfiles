#!/usr/bin/env bash
# Snapshot check for the pi config. Asserts the machine matches what the
# repository claims, so drift fails loudly instead of silently.
#
# Exit 0 = every check passed. Exit 1 = at least one failed.
# usage: config/pi/verify.sh [-v]
set -uo pipefail

DOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT="$HOME/.pi/agent"
VERBOSE="${1:-}"
pass=0 fail=0

ok()   { pass=$((pass+1)); [ "$VERBOSE" = "-v" ] && printf '  ok    %s\n' "$1"; return 0; }
bad()  { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; return 0; }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

jqs() { python3 -c "import json,sys;d=json.load(open('$1'));print($2)" 2>/dev/null; }

echo "pi config verify"

# --- generated files are in sync with their fragments ---
echo "[build]"
if "$DOT/build-agents.sh" --check >/dev/null 2>&1; then
  ok "AGENTS.md/CLAUDE.md regenerate cleanly from agents-md/"
else
  bad "generated agent files are stale — run config/pi/build-agents.sh"
fi

# --- no enabled model may be one we have verified cannot run ---
# `pi models` prints ranges ("opus-4-5 through opus-5"), so it cannot be
# substring-matched. Instead assert against models proven dead by a live call:
#   openai-codex/gpt-5.4-mini  "not supported when using Codex with a ChatGPT account"
#   github-copilot/*           pi drives Copilot via the Responses API; this
#                              account has no model on it (model_not_supported)
echo "[models]"
enabled="$(jqs "$DOT/settings.json" "' '.join(d['enabledModels'])")"
DEAD_MODELS="openai-codex/gpt-5.4-mini"
DEAD_PROVIDERS="github-copilot"
for m in $enabled; do
  dead=0
  for d in $DEAD_MODELS; do [ "$m" = "$d" ] && dead=1; done
  for p in $DEAD_PROVIDERS; do [ "${m%%/*}" = "$p" ] && dead=1; done
  if [ "$dead" -eq 1 ]; then
    bad "enabledModels lists $m, which is verified non-functional"
  else
    ok "model $m"
  fi
done

# --- scout wrapper: the delegation rule in AGENTS.md names it by path ---
echo "[scout]"
check "bin/scout is executable" "[ -x '$DOT/bin/scout' ]"
check "bin/scout.prompt.md exists and is non-empty" "[ -s '$DOT/bin/scout.prompt.md' ]"
check "~/.pi/agent/bin resolves to config/pi/bin" "[ \"\$(readlink -f '$AGENT/bin')\" = \"\$(readlink -f '$DOT/bin')\" ]"
check "scout --help exits 0" "'$DOT/bin/scout' --help >/dev/null"
check "scout refuses to nest" "! PI_SCOUT_DEPTH=1 '$DOT/bin/scout' x >/dev/null 2>&1"
check "scout model is enabled" "grep -qF \"\$(grep -oE '^MODEL=\"[^\"]+\"' '$DOT/bin/scout' | cut -d'\"' -f2)\" '$DOT/settings.json'"
check "no legacy agents/ roster" "[ ! -e '$DOT/agents' ]"
check "no pi-subagents in settings.json packages" "! grep -q 'pi-subagents' '$DOT/settings.json'"

# --- paths the config names must exist ---
echo "[paths]"
check "extensions referenced by settings.json all exist" \
  'for e in $(jqs "'"$DOT"'/settings.json" "chr(10).join(x if isinstance(x,str) else x[chr(34)+chr(34)] for x in d.get(chr(34)+"extensions"+chr(34),[]))"); do
     p="${e/#\~/$HOME}"; [ -f "$p" ] || exit 1; done'
for d in "$AGENT/skills-local" "$DOT/themes" "$DOT/agents-md" "$DOT/extensions"; do
  check "directory exists: ${d/#$HOME/~}" "[ -d '$d' ]"
done
check "no broken symlinks under dotfiles/claude/skills" \
  "! find '$DOT/../../claude/skills' -type l ! -exec test -e {} \; -print 2>/dev/null | grep -q ."

# --- skills the prompt names must be real ---
echo "[skills]"
check "~/.agents/skills resolves" "[ -d \"$HOME/.agents/skills\" ]"
for s in $(grep -rhoE '\`?~/\.agents/skills/[a-z0-9-]+' "$DOT"/agents-md/*.md 2>/dev/null | sed 's|.*/||' | sort -u); do
  check "skill referenced by a fragment exists: $s" "[ -d \"$HOME/.agents/skills/$s\" ]"
done
check "no fragment references the nonexistent config/pi/skills" \
  "! grep -rq 'config/pi/skills' '$DOT'/agents-md/"

# --- install.sh must reproduce what the machine actually has ---
echo "[install]"
check "install.sh links the themes directory, not a single theme file" \
  "grep -q 'config/pi/themes\"' '$DOT/../../install.sh'"
check "install.sh creates skills-local" \
  "grep -q 'skills-local' '$DOT/../../install.sh'"
check "install.sh links verify.sh's settings target" \
  "grep -q 'config/pi/settings.json' '$DOT/../../install.sh'"
check "install.sh links config/pi/bin (scout)" \
  "grep -q 'config/pi/bin\"' '$DOT/../../install.sh'"
check "install.sh no longer links the subagent config" \
  "! grep -q 'subagent-config' '$DOT/../../install.sh'"

# --- packages declared in settings must be installed ---
echo "[packages]"
for p in $(jqs "$DOT/settings.json" "chr(10).join(x if isinstance(x,str) else x['source'] for x in d['packages'])"); do
  name="${p#npm:}"
  check "package installed: $name" "[ -d '$AGENT/npm/node_modules/$name' ]"
done

# --- files end with a newline (settings.json lost one once) ---
echo "[hygiene]"
for f in "$DOT/settings.json"; do
  [ -f "$f" ] || continue
  check "trailing newline: $(basename "$f")" "[ -n \"\$(tail -c1 '$f')\" ] || true; [ \"\$(tail -c1 '$f' | xxd -p)\" = '0a' ]"
done

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
