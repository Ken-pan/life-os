#!/usr/bin/env bash
# Netlify [build].ignore helper — exit 0 skips build, non-zero runs build.
#
# Monorepo pitfall: when cache is missing or multiple sites deploy the same
# commit in parallel, CACHED_COMMIT_REF can equal COMMIT_REF and plain
# `git diff --quiet` falsely skips the build.
# See: https://answers.netlify.com/t/cached-commit-ref-eqals-commit-ref/81697

set -euo pipefail

if [ -z "${CACHED_COMMIT_REF:-}" ] || [ "${COMMIT_REF:-}" = "${CACHED_COMMIT_REF}" ]; then
  exit 1
fi

git diff --quiet "${CACHED_COMMIT_REF}" "${COMMIT_REF}" -- "$@"
