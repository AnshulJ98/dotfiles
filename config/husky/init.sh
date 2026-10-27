# Sourced by husky 9's hook runner (.husky/_/h) with $n set to the hook name, and only
# for hooks the repo defines. The guard is config/git/bin/auto-guard; a refusal exits
# the runner before the repo's own hook body.
case "$n" in pre-commit|pre-merge-commit|pre-push) if command -v auto-guard >/dev/null 2>&1; then auto-guard "$n" || exit 1; fi ;; esac
