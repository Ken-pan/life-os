# HealthOS Roadmap

**Workspace：** `health-os` · **Dev 端口：** 5192 · **ID 前缀：** `HLT` · **层级：** 实验 / 本地优先

> HealthOS 已不是 starter 占位：`app.manifest.json`、生成注册表、PWA 矩阵与跨 app switcher 均已收录。当前没有生产 Netlify 站，也未接 Portal；主形态是 Tauri macOS app + 本地 Focus agent + Watch/iPhone HealthKit companion。

## 终局（Done when）

> 回链 [`NORTH_STAR`](../../architecture/NORTH_STAR.md) · 取舍 [`COMPOUND`](../COMPOUND.md)。非排期。Status = Health + Focus。

**回答的问题：** 我现在适合做什么？

**近程成功（日用闭环）：** Watch/iPhone → Mac 状态连续；Focus 窗口按当天状态调节。

**Done when：**
1. HLT-0–4 能力在仓 ✅；**HLT-5** companion 真机签名 + HealthKit/iCloud/LAN 连续交付
2. 六维状态可解释（energy/focus/recovery/stress/sleepDebt/physical）
3. 跨 OS **只**暴露 capacity/readiness 类摘要（HLT-5 后再研判契约）；**永不**上传健康明细
4. 未进 Portal，直到有每日启动触点与可消费摘要

**故意不做：** 未过 HLT-5 就扩跨 OS 契约；把 Health 做成第二 Apple Health 云同步。

**与底座：** 本地优先 ✅ · 无 SSO 依赖产品主路径 · 无 MCP · object_ref 不适用。

## 一句话

Life OS 的状态调节中枢：把专注负荷、睡眠、HRV、静息心率与步数变成可解释的六维状态，并据此调整当天专注窗口；原始健康数据本地保存，不向其他 OS 暴露明细。

## 当前能力（已提交）

| ID | 能力 | 状态 / 证据 |
| --- | --- | --- |
| **HLT-0** | App 基建 | ✅ `LifeOsAppShell` + Tauri macOS 壳 + 九 app 注册表 / PWA 矩阵 |
| **HLT-1** | Focus 防沉迷 | ✅ 本地 Swift agent；前台 app / CPU / 键鼠信号、预警与强制休息、HTTP 状态桥 |
| **HLT-2** | State Engine v0 | ✅ 六维状态（energy/focus/recovery/stress/sleepDebt/physical）与可解释 reasons |
| **HLT-3** | 自适应专注 | ✅ 纯信号驱动状态引擎；按当天状态把 5–60 分钟窗口策略推回 Focus agent |
| **HLT-4** | 健康趋势 | ✅ 睡眠 / HRV / 静息心率 / 步数跨日趋势 + 个人基线 |
| **HLT-5** | HealthKit companion 交付 | 🟡 源码与 Xcode 工程已入仓（`5a2b7773`）；剩真机签名 + HealthKit/iCloud/LAN 连续交付用户 gate |
| — | Apple Health 导入 | ✅ macOS agent 流式解析 `export.xml`，作为 companion 未部署时的离线回退 |

## 数据边界

```text
Apple Watch / iPhone HealthKit
  ├── iCloud Drive inbox ──► Focus agent ──► health.jsonl
  └── LAN POST :5193 ──────► Focus agent ──► health.jsonl

Focus agent + health.jsonl ──► HealthOS State Engine ──► Now / Focus / Trends
```

- macOS 没有 HealthKit；持续数据必须经 iPhone/watchOS companion，或手动导入 Apple Health XML。
- 原始数据落在 `~/Library/Application Support/HealthOS/`，当前不进 Supabase。
- 跨 OS 只应输出解释后的状态/建议，不共享健康明细。

## Next / Gate

| 项 | 状态 |
| --- | --- |
| companion 源码/Xcode 工程进入版本史 | ✅ `5a2b7773` |
| companion 真机签名、HealthKit 授权、iCloud/LAN 持续交付 | ⏳ 用户设备 gate；不阻塞其他 app Agent 工作 |
| Calendar / Screen Time 等连接器 | 待研判；受 TCC / Full Disk Access 约束 |
| Portal / `core_*` / `life_events` 接入 | 待明确消费者与最小隐私契约后再排期 |
| Netlify / `health.kenos.space` | 未供给；manifest `production: false` |

**ROI 判断：** HLT-0–4 已形成可用本地闭环；除 HLT-5 checkpoint/真机 gate 外，Calendar/Screen Time、Portal、云端 surface 都没有明确消费者，不进入当前工程队列。

## 实现锚点

| 域 | 文件 / 位置 |
| --- | --- |
| 状态引擎 | `apps/health/src/lib/stateEngine.core.js` |
| Focus 桥 | `apps/health/src/lib/agent.svelte.js` · `apps/health/agent/FocusAgent.swift` |
| HealthKit companion | `apps/health/companion/` |
| 数据源与隐私边界 | `apps/health/docs/data-sources.md` |
| 注册真源 | `apps/health/app.manifest.json` |

## 验收命令

```bash
npm run test -w health-os
npm run check -w health-os
npm run build -w health-os
npm run app:health
```
