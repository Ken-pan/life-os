#!/usr/bin/env bash
# HomeOS 跨扫描认亲「事后精修」一键作业(Track B / auto-refine)。
#
# 顺序:
#   ① embed_objects.py --all-iphone --apply
#      给所有 iPhone 扫描的裁剪算 DINOv2 embedding。断点续跑:已算的(同 model_version)跳过,
#      所以反复跑很便宜、没新扫描时近乎空转。
#   ② match_objects.py --all-iphone --apply
#      跨扫描认亲、populate object_observations、回填 canonical。尊重用户 P3 裁决(locked_decisions),
#      不覆盖已裁决行。possibly_same 难例落库 → 网页 P3 证据卡片自动出现。
#
# 幂等:反复跑不产生重复对象/重复 embedding。设计成 launchd 每 15 分钟触发
# (= 战略「Mac 15 分钟内精修」),也可手动跑一次。见 README「auto-refine」。
#
# 依赖:持久 venv(默认 ~/.local-ai/vision-venv,含 torch/torchvision/pillow/numpy/scipy);
# service_role 取自钥匙串 "Supabase CLI"(LaunchAgent 在用户会话内跑 → 钥匙串可访问)。
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PY="${VISION_PY:-$HOME/.local-ai/vision-venv/bin/python}"
LOG="${VISION_REFINE_LOG:-$HOME/.local-ai/logs/vision-refine.log}"
LOCK="${VISION_REFINE_LOCK:-$HOME/.local-ai/vision-refine.lock}"

mkdir -p "$(dirname "$LOG")"

# 原子锁(macOS 无 flock):上一轮还在跑就跳过,防两次精修叠一起打架。
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') refine 已在运行,跳过本次" >> "$LOG"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

cd "$DIR"
{
  echo "===== refine $(date '+%F %T') ====="
  if [ ! -x "$PY" ]; then
    echo "✗ 找不到 venv python:$PY —— 先按 README 建 ~/.local-ai/vision-venv"
    exit 1
  fi
  EMBED_OUT="$("$PY" embed_objects.py --all-iphone --apply)"
  printf '%s\n' "$EMBED_OUT"
  # 没有新增 embedding(所有扫描都续跑跳过)→ 身份图不会变 → 跳过 matcher 的全表重写,
  # 省掉每 15 分钟对 ~300 行 object_observations 的无谓 upsert。用户 P3 裁决由网页即时
  # 写入、不靠这轮 matcher;真有新扫描时(入库 >0)才重算认亲。
  if printf '%s' "$EMBED_OUT" | grep -qE "总摘要: 入库 0 "; then
    echo "无新增 embedding → 跳过 matcher(身份图无变化)"
  else
    "$PY" match_objects.py --all-iphone --apply
  fi
  echo "===== done $(date '+%F %T') ====="
} >> "$LOG" 2>&1
