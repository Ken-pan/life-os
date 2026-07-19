#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

run_gate() {
  local gate="$1"
  shift
  echo "[kenos-verify] ${gate}"
  "$@"
}

run_gate "phase0 freeze package" node scripts/check-kenos-phase0.mjs
run_gate "phase1 contract freeze" node scripts/check-kenos-phase1.mjs
run_gate "phase2 Assistant/Portal strangler" node scripts/check-kenos-phase2.mjs
run_gate "phase3 Work loop foundation" node scripts/check-kenos-phase3.mjs
run_gate "phase4 Apple native daily loop" node scripts/check-kenos-phase4.mjs
run_gate "phase4b cross-device daily loop" node scripts/check-kenos-phase4b.mjs
run_gate "phase5 contextual intelligence" node scripts/check-kenos-phase5.mjs
run_gate "ticket naming" npm run verify:ticket-naming
run_gate "dependency boundaries" npm run check:lifeos-boundaries
run_gate "style boundaries" npm run check:lifeos-styles
run_gate "app manifests" npm run check:app-manifests
run_gate "design tokens" npm run validate:tokens
run_gate "MCP contract smoke" npm run test:mcp
run_gate "typecheck" npm run check
run_gate "production builds" npm run build

echo "[kenos-verify] all deterministic repository gates passed"
