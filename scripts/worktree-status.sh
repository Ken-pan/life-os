#!/bin/sh
# worktree-status.sh — one-glance map of every git worktree, branch, and PR.
#
# Answers "how many worktrees/branches do I have and which is which?" in a
# single view: each worktree's branch, whether it has uncommitted changes, how
# far it is from master, and any open/merged PR. Also lists branches that have
# NO worktree so nothing hides.
#
# Usage:  scripts/worktree-status.sh
# Needs:  git. Uses `gh` for PR columns if installed+authed (optional).
set -u

MAIN=master

# ── optional PR lookup (branch -> "#<n> <STATE>") ────────────────────────────
PR_MAP=""
if command -v gh >/dev/null 2>&1; then
  PR_MAP=$(gh pr list --state all --limit 200 \
    --json number,state,isDraft,headRefName \
    --jq '.[] | "\(.headRefName)\t#\(.number) \(.state)\(if .isDraft and .state=="OPEN" then " draft" else "" end)"' \
    2>/dev/null)
fi
pr_for() { # branch -> pr cell (first match wins; open states listed first by gh)
  [ -n "$PR_MAP" ] || { printf '%s' "-"; return; }
  _m=$(printf '%s\n' "$PR_MAP" | awk -F'\t' -v b="$1" '$1==b{print $2; exit}')
  [ -n "$_m" ] && printf '%s' "$_m" || printf '%s' "-"
}

# how far a ref is from master, as "+ahead/-behind"
delta() {
  _a=$(git rev-list --count "$MAIN..$1" 2>/dev/null || echo "?")
  _b=$(git rev-list --count "$1..$MAIN" 2>/dev/null || echo "?")
  printf '+%s/-%s' "$_a" "$_b"
}

printf '\n=== WORKTREES ===\n'
printf '%-42s %-14s %-9s %-13s %s\n' BRANCH DIRTY AHEAD/BEH PR PATH
printf '%-42s %-14s %-9s %-13s %s\n' ------ ----- --------- -- ----

# collect worktree paths+branches, track which branches have a worktree
SEEN_BRANCHES=""
git worktree list --porcelain 2>/dev/null | awk '
  /^worktree /{wt=substr($0,10)}
  /^branch /{print wt "\t" substr($0,8)}
' | while IFS="$(printf '\t')" read -r path ref; do
  br=${ref#refs/heads/}
  n=$(git -C "$path" status --porcelain 2>/dev/null | grep -c .)
  [ "$n" -gt 0 ] 2>/dev/null && dirty="dirty($n)" || dirty="clean"
  printf '%-42s %-14s %-9s %-13s %s\n' "$br" "$dirty" "$(delta "$br")" "$(pr_for "$br")" "$path"
done

# branches without a worktree (checked-out branches are excluded above)
WT_BRANCHES=$(git worktree list --porcelain 2>/dev/null | awk '/^branch /{print substr($0,8)}' | sed 's#refs/heads/##' | tr '\n' ' ')
printf '\n=== BRANCHES WITHOUT A WORKTREE ===\n'
printf '%-46s %-11s %s\n' BRANCH AHEAD/BEH PR
printf '%-46s %-11s %s\n' ------ --------- --
git for-each-ref --format='%(refname:short)' refs/heads/ | while read -r br; do
  case " $WT_BRANCHES " in *" $br "*) continue ;; esac
  printf '%-46s %-11s %s\n' "$br" "$(delta "$br")" "$(pr_for "$br")"
done

printf '\n=== TOTALS ===\n'
printf 'worktrees: %s   local branches: %s\n' \
  "$(git worktree list | grep -c .)" \
  "$(git for-each-ref refs/heads/ | grep -c .)"
printf 'legend: AHEAD/BEH = commits +ahead/-behind %s;  PR "-" = no PR\n\n' "$MAIN"
