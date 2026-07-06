#!/usr/bin/env bash
# 通过 Supabase 管理 API 对 Life OS 项目执行 SQL（绕过 5432 直连不可用的问题）。
# 用法:
#   ./scripts/supabase-sql.sh "select now();"
#   ./scripts/supabase-sql.sh -f apps/music/supabase/migrations/xxx.sql
# 凭证来源（按优先级）: $SUPABASE_ACCESS_TOKEN → macOS 钥匙串（supabase login 写入）。
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-iueozzuctstwvzbcxcyh}"

TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)
fi
if [[ -z "$TOKEN" ]]; then
  echo "未找到 Supabase access token。先运行: supabase login" >&2
  exit 1
fi

if [[ "${1:-}" == "-f" ]]; then
  [[ -f "${2:-}" ]] || { echo "文件不存在: ${2:-}" >&2; exit 1; }
  QUERY=$(cat "$2")
else
  QUERY="${1:?用法: supabase-sql.sh \"<sql>\" 或 supabase-sql.sh -f <file.sql>}"
fi

curl -sS -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' <<<"$QUERY")"
echo
