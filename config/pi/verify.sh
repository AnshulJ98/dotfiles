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
check "build-agents.sh refuses an unknown flag" "'$DOT/build-agents.sh' --chek >/dev/null 2>&1; [ \$? -eq 2 ]"

# --- every enabled model must resolve, and none may be proven dead ---
# pi itself prints `Warning: No models match pattern "<p>"` on stderr for each
# enabledModels entry that matches nothing, so --list-models is the check.
# DEAD_MODELS lists models a live call refused, with the quote:
#   openai-codex/gpt-5.4-mini  "not supported when using Codex with a ChatGPT account"
#   openai-codex/gpt-5.6-sol   same refusal, live call 10-27
echo "[models]"
enabled="$(jqs "$DOT/settings.json" "' '.join(d['enabledModels'])")"
DEAD_MODELS="openai-codex/gpt-5.4-mini openai-codex/gpt-5.6-sol"
for m in $enabled; do
  dead=0
  for d in $DEAD_MODELS; do [ "$m" = "$d" ] && dead=1; done
  if [ "$dead" -eq 1 ]; then
    bad "enabledModels lists $m, which is verified non-functional"
  else
    ok "model $m"
  fi
done
# Run from $HOME so no project .pi/ settings are mixed in.
if listing="$(cd "$HOME" && timeout 60 pi --list-models 2>&1)"; then
  nomatch="$(printf '%s\n' "$listing" | sed -n 's/^Warning: No models match pattern "\(.*\)"$/\1/p')"
  if [ -n "$nomatch" ]; then
    while IFS= read -r p; do
      bad "enabledModels pattern $p matches no available model"
    done <<< "$nomatch"
  else
    ok "every enabledModels pattern matches a model"
  fi
else
  bad "pi --list-models ran"
fi

# --- tools and pi internals the config depends on ---
echo "[tools]"
check "timeout on PATH is GNU (scout uses --foreground)" "timeout --version 2>/dev/null | grep -q 'GNU coreutils'"
# OAuth shim: loaded by bin/scout only when present (work machines may lack it).
# claude-opus-5-5 needs Claude Code >= 2.1.280; claude-fable-5-1 needs >= 2.1.251.
# Upgrades of the package have reverted a hand patch before.
CC_FLOOR="2.1.280"
SHIM="$AGENT/npm/node_modules/@gotgenes/pi-anthropic-auth/src/claude-code-version.ts"
if [ -f "$SHIM" ]; then
  ccv="${PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION:-$(sed -n 's/^export const CLAUDE_CODE_VERSION = "\([0-9][0-9.]*\)";.*/\1/p' "$SHIM")}"
  check "anthropic auth shim Claude Code version ${ccv:-<not found>} >= $CC_FLOOR" \
    "[ -n '$ccv' ] && [ \"\$(printf '%s\n%s\n' '$ccv' '$CC_FLOOR' | sort -V | head -1)\" = '$CC_FLOOR' ]"
fi
# Extensions patch these prototypes and skip silently when a method is gone,
# so a pi upgrade would turn them into no-ops.
PI_PKG="$(node --no-warnings --input-type=module -e "import { piPackage } from '$DOT/tests/pi-package.ts'; console.log(piPackage())" 2>/dev/null)"
proto_fn() { # package class method
  (cd "$PI_PKG" && node --input-type=module -e \
    "const m = await import('$1'); process.exit(typeof m['$2']?.prototype?.['$3'] === 'function' ? 0 : 1)")
}
check "AssistantMessageComponent.prototype.updateContent is a function (polish-chrome)" \
  "proto_fn @earendil-works/pi-coding-agent AssistantMessageComponent updateContent"
check "UserMessageComponent.prototype.rebuild is a function (polish-chrome)" \
  "proto_fn @earendil-works/pi-coding-agent UserMessageComponent rebuild"
check "UserMessageComponent.prototype.render is a function (polish-chrome)" \
  "proto_fn @earendil-works/pi-coding-agent UserMessageComponent render"
check "TuiAltScreen.prototype.handleSelectionMouseEvent is a function (kitty-links)" \
  "proto_fn @earendil-works/pi-tui TuiAltScreen handleSelectionMouseEvent"

# --- scout wrapper: the delegation rule in AGENTS.md names it by path ---
echo "[scout]"
check "bin/scout is executable" "[ -x '$DOT/bin/scout' ]"
check "bin/scout.prompt.md exists and is non-empty" "[ -s '$DOT/bin/scout.prompt.md' ]"
check "~/.pi/agent/bin resolves to config/pi/bin" "[ \"\$(readlink -f '$AGENT/bin')\" = \"\$(readlink -f '$DOT/bin')\" ]"
check "scout --help exits 0" "'$DOT/bin/scout' --help >/dev/null"
check "scout refuses to nest" "! PI_SCOUT_DEPTH=1 '$DOT/bin/scout' x >/dev/null 2>&1"
check "bin/worker.prompt.md exists and is non-empty" "[ -s '$DOT/bin/worker.prompt.md' ]"
check "extensions/worker-sensors.ts exists" "[ -s '$DOT/extensions/worker-sensors.ts' ]"
check "scout refuses --thinking max" "'$DOT/bin/scout' --thinking max x >/dev/null 2>&1; [ \$? -eq 2 ]"
check "scout --rw refuses a run without a brief" "'$DOT/bin/scout' --rw x >/dev/null 2>&1; [ \$? -eq 2 ]"
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
  # A pinned spec (name@1.2.3, @scope/name@1.2.3) installs under the bare name
  name=$(printf '%s' "$name" | sed -E 's/(.)@[^@/]+$/\1/')
  check "package installed: $name" "[ -d '$AGENT/npm/node_modules/$name' ]"
done

# --- git hooks: auto-guard reaches new repos (templateDir), husky repos and this one ---
echo "[git]"
GITT="$DOT/../git/template"
check "init.templateDir is ~/.config/git/template" "[ \"\$(git config --global --path init.templateDir)\" = \"$HOME/.config/git/template\" ]"
check "~/.config/git/template resolves to config/git/template" "[ \"\$(readlink -f '$HOME/.config/git/template')\" = \"\$(readlink -f '$GITT')\" ]"
for stub in "$GITT"/hooks/*; do
  check "template hook ${stub##*/} is executable and has # dotfiles-hook" "[ -x '$stub' ] && grep -qF '# dotfiles-hook' '$stub'"
done
check "auto-guard on PATH" "command -v auto-guard"
check "git-hooks-install on PATH" "command -v git-hooks-install"
check "wt on PATH" "command -v wt"
check "worktree-setup on PATH" "command -v worktree-setup"
check "~/.config/worktrunk/config.toml resolves to config/worktrunk/config.toml" "[ \"\$(readlink -f '$HOME/.config/worktrunk/config.toml')\" = \"\$(readlink -f '$DOT/../worktrunk/config.toml')\" ]"
check ".zshrc has the wt shell integration line" "grep -qF 'wt config shell init zsh' '$DOT/../../home/.zshrc'"
check "~/.config/husky/init.sh resolves to config/husky/init.sh" "[ \"\$(readlink -f '$HOME/.config/husky/init.sh')\" = \"\$(readlink -f '$DOT/../husky/init.sh')\" ]"
for h in pre-commit pre-merge-commit pre-push; do
  check "githooks/$h has # dotfiles-hook" "grep -qF '# dotfiles-hook' '$DOT/../../githooks/$h'"
done

# --- the node tests; run here in review, never by workers ---
echo "[tests]"
check "node tests pass" "node --test '$DOT'/tests/*.test.ts"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
