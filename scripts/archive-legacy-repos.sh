#!/usr/bin/env bash
# Archive legacy Life OS repos: remove vendored packages, netlify.toml, push, gh archive.
set -euo pipefail

ROOT="/Users/kenpan/「Projects」"
TEMPLATE="$ROOT/life-os/scripts/LEGACY.md.template"

declare -A REPOS=(
  [Planner]=planner-os
  [Fitness]=fitness-os
  [Moneymoneymoney]=Moneymoneymoney
  [MusicOS]=MusicOS
)

LEGACY_BANNER='> **⚠️ ARCHIVED** — Development and Netlify deploys moved to [Ken-pan/life-os](https://github.com/Ken-pan/life-os). This repository is read-only history.

'

for dir in "${!REPOS[@]}"; do
  gh_name="${REPOS[$dir]}"
  path="$ROOT/$dir"
  echo "========== $dir ($gh_name) =========="
  cd "$path"

  cp "$TEMPLATE" LEGACY.md

  if [[ -f README.md ]] && ! grep -q 'ARCHIVED' README.md; then
    { echo "$LEGACY_BANNER"; cat README.md; } > README.md.tmp && mv README.md.tmp README.md
  fi

  rm -rf packages/life-os-theme packages/life-os-sync
  rmdir packages 2>/dev/null || true
  rm -f netlify.toml

  node -e "
    const fs = require('fs');
    const p = 'package.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const k of ['dependencies','devDependencies','peerDependencies']) {
      if (!j[k]) continue;
      delete j[k]['@life-os/theme'];
      delete j[k]['@life-os/sync'];
    }
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "

  git add LEGACY.md README.md package.json
  git add -u
  if git diff --cached --quiet; then
    echo "No changes to commit in $dir"
  else
    git commit -m "$(cat <<'EOF'
chore: archive legacy repo — point to life-os monorepo

Remove vendored life-os packages and Netlify config; production deploys from Ken-pan/life-os only.
EOF
)"
    git push origin HEAD
  fi

  if ! gh repo view "Ken-pan/$gh_name" --json isArchived -q .isArchived | grep -q true; then
    gh repo edit "Ken-pan/$gh_name" -d "ARCHIVED — use https://github.com/Ken-pan/life-os"
    gh repo archive "Ken-pan/$gh_name" --yes
    echo "Archived Ken-pan/$gh_name"
  else
    echo "Already archived: Ken-pan/$gh_name"
  fi
done

# Shared package repos (keep source, archive only)
for pair in "life-os-theme:packages/theme" "life-os-sync:packages/sync"; do
  repo="${pair%%:*}"
  monopath="${pair##*:}"
  path="$ROOT/$repo"
  echo "========== $repo =========="
  cd "$path"

  cat > LEGACY.md <<EOF
# Archived — packages live in life-os

Canonical path: \`life-os/$monopath\` in https://github.com/Ken-pan/life-os

Do not publish or develop this standalone repo. History preserved for reference.
EOF

  if [[ -f README.md ]] && ! grep -q 'ARCHIVED' README.md; then
    { echo "> **⚠️ ARCHIVED** — Edit \`$monopath\` in [Ken-pan/life-os](https://github.com/Ken-pan/life-os) instead.

"; cat README.md; } > README.md.tmp && mv README.md.tmp README.md
  fi

  git add LEGACY.md README.md
  if git diff --cached --quiet; then
    echo "No doc changes in $repo"
  else
    git commit -m "chore: mark archived — canonical code in life-os monorepo"
    git push origin HEAD
  fi

  if ! gh repo view "Ken-pan/$repo" --json isArchived -q .isArchived | grep -q true; then
    gh repo edit "Ken-pan/$repo" -d "ARCHIVED — use life-os/$monopath"
    gh repo archive "Ken-pan/$repo" --yes
    echo "Archived Ken-pan/$repo"
  fi
done

echo "Done."
