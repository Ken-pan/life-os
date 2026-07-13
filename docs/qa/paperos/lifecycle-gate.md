# PaperOS Device Lifecycle Gate（PAPR.SYS.gate）

**Status:** ⏳ **BLOCKED** — 依赖 `PAPR.SYS.1` implementation（**UNBLOCKED BUT NOT STARTED — PAUSED BY OWNER**）· `PAPR.SYS.2` · `PAPR.SYS.3`
**Owner:** Ken + Codex
**Agent 线:** Line B（Shell）

> **Antigravity 不能**替代本 gate：网页截图无法证明物理睡眠、Folio 或 system suspend。

**前置状态（2026-07-11）：** **`PAPR.DATA.verify` PASS** · PAPR.SYS.0 accepted · PAPR.SYS.1a closed · PAPR.SYS.1b.fs closed · PAPR.SYS.1b.jrn conditional pass accepted · PAPR.SYS.1 implementation paused/not started · PAPR.SYS.2 hard blocked。

**导航 hub：** [`paperos-device-lifecycle/README.md`](./paperos-device-lifecycle/README.md) · 发现 SSOT：[`paperos-device-lifecycle-discovery.md`](./paperos-device-lifecycle-discovery.md)

## 仍待验证项（PAPR.SYS.0 / discovery 未覆盖）

以下在 PAPR.SYS.gate 前仍为开放项，不得因 PAPR.SYS.0 accepted 或 PAPR.DEV.4 PASS 而视为已测：

- 冷启动与原生解锁（LC-01）
- 设备端无 Mac/SSH 进入（LC-04）— journal UUID 机制 viable；PAPR.SYS.1 实现 paused/not started
- Folio 合盖/开盖（LC-06）— 当前设备无 Folio
- 重复 enter/exit 循环（Mode B 升级表 10/10）
- 重复崩溃 / crash-loop fallback（LC-10、LC-11）— 仅单次 `kill -9` 已测
- readiness 失败路径
- wrapper 中断恢复
- PaperOS 前台短按电源键睡眠 UX（LC-05）— PAPR.SYS.0 判定 FAIL
- 写字中 suspend（LC-08）
- Qt `applicationStateChanged` / 唤醒网络 / sync reconciliation
- 48 小时长时间运行
- 无 Mac 恢复 auto-launch 关闭路径

## Mode B Beta 开放条件（PAPR.SYS.gate 扩展）

在 LC-01–LC-15 通过后，若要将 **Launch PaperOS after unlock [Beta]** 向用户推广，还须满足 discovery §产品假设 中的可靠性表（10/10 双向切换、5/5 crash fallback、20 次睡眠唤醒、48h 稳定性等）。**Mode B 不得成为系统默认**，直至上述 Gate 全部关闭。

## 最低用例矩阵

| ID    | 用例                            | 预期                            | 状态 |
| ----- | ------------------------------- | ------------------------------- | ---- |
| LC-01 | 冷启动                          | 不黑屏；不绕过设备解锁          | ⬜   |
| LC-02 | 自动进入 PaperOS（若启用 Beta） | 无 Mac/SSH                      | ⬜   |
| LC-03 | PaperOS → Xochitl               | rm-sync 恢复                    | ⬜   |
| LC-04 | Xochitl → PaperOS               | 无 Mac/SSH                      | ⬜   |
| LC-05 | 短按电源 睡眠/唤醒              | 页面与输入恢复                  | ⬜   |
| LC-06 | Folio 合盖/开盖                 | 与短按睡眠行为一致或可解释差异  | ⬜   |
| LC-07 | 空闲超时                        | 进入睡眠；唤醒可补偿 sync       | ⬜   |
| LC-08 | 写字中等待超时                  | 不丢笔迹；睡眠抑制有效          | ⬜   |
| LC-09 | 离线睡眠 → 联网唤醒             | 补同步一次（`lastSyncAt` 策略） | ⬜   |
| LC-10 | PaperOS 强制崩溃                | 可恢复或自动回 xochitl          | ⬜   |
| LC-11 | 120s 内 3 次崩溃                | 退回 xochitl                    | ⬜   |
| LC-12 | 重启时 PaperOS 曾运行           | 冷启动路径正常                  | ⬜   |
| LC-13 | 低电量                          | 不进入重启循环                  | ⬜   |
| LC-14 | 充电 Desk mode                  | 无高频刷新、无明显发热          | ⬜   |
| LC-15 | 长时间睡眠后唤醒                | 时间、页面、缓存正确            | ⬜   |

## 证据

_通过后在此追加：日期 · 用例 ID · 操作步骤 · journal 片段 · 截图路径_

## 相关

- [`lifecycle.md`](./lifecycle.md)
- [`../../roadmap/AGENT_WORKSTREAMS.md`](../../roadmap/AGENT_WORKSTREAMS.md) §PaperOS lifecycle
