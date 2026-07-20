---
title: KENOS AIOS CAPTURE INGEST — WRITER CANARY DEPLOY
owner: kenpan
last_verified: 2026-07-20
status: DEPLOYED — AWAITING_OWNER_UI_SMOKE
---

# AIOS Capture Ingest Writer Canary

| Item | Value |
| --- | --- |
| Site | `aios-kenos-read-canary` (`8557bb44-…`) |
| Deploy | `6a5dbd6d78f6c3d467eabcd8` |
| SHA | `854ed08e09e4f1c706452a87aa25d9f9e88a02e1` |
| URL | https://aios-kenos-read-canary.netlify.app |
| Production AIOS | unchanged (`6a5dbab9…` Money/Training bake) |
| Bake | Capture ingest ON + Approval decide ON + Owner emails; Music/Home/Training/Money reads ON; READ_CANARY=0 |
| Executor | disabled |

## Owner UI smoke

1. 已登录 canary 时打开任意页 → Quick Capture
2. 输入短文本 → 「打开 Inbox」
3. 期望：信封 `needs_review`；outbox pending；无 Plan 任务自动创建
4. 完成后回复「Capture 已测」

## Apple（并行 Owner 门）

解锁并信任 iPhone「Ken’s 17 Pro」后回复「设备已就绪」。
