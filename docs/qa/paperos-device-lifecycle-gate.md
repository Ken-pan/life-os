# PaperOS Device Lifecycle Gate（P-MOVE-SYS-GATE）

**Status:** ⏳ 未开始 — 依赖 `P-MOVE-SYS-1` · `SYS-2` · `SYS-3`
**Owner:** Ken + Codex
**Agent 线:** Line B（Shell）

> **Antigravity 不能**替代本 gate：网页截图无法证明物理睡眠、Folio 或 system suspend。

## Mode B Beta 开放条件（SYS-GATE 扩展）

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

- [`paperos-device-lifecycle-discovery.md`](./paperos-device-lifecycle-discovery.md)
- [`../roadmap/AGENT_WORKSTREAMS.md`](../roadmap/AGENT_WORKSTREAMS.md) §PaperOS lifecycle
