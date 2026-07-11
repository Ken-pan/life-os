# PaperOS Device Lifecycle Discovery（P-MOVE-SYS-0）

**Status:** ⏳ 待采集（2026-07-11 建单）
**Owner:** Codex + Ken
**Agent 线:** Line B（Shell）· 与 **P-MOVE-VERIFY** 同一设备窗口优先
**阻塞：** 任何 `P-MOVE-SYS-1+` 实现不得仅凭推测开工

> PaperOS 正在从「前台 App」升级为 **设备主 Shell**。本 gate 产出**真机状态机**，回答启动、退出、睡眠、唤醒、崩溃恢复与同步在 suspend 下的行为。

## 产品假设：PaperOS 默认启动模式

**定案（2026-07-11）：** MVP 采用 **Mode A — Xochitl default**；架构按 **「A 默认、B-ready」** 实现——`SYS-1` 先完成安全进出与故障回退，`SYS-3` 再加入默认关闭的 Beta 自动启动。

### 决策

PaperOS MVP 采用 **Mode A — Xochitl default**。

设备启动和解锁流程继续由原生系统负责。PaperOS 必须支持用户**直接在设备上**进入和退出，**不得**要求日常连接 Mac、SSH 或开发工具。

```text
Cold boot
→ Xochitl starts
→ User completes native unlock
→ User launches PaperOS on device
→ paperos-enter performs managed handoff
→ PaperOS becomes the foreground shell
```

PaperOS 的 System 菜单必须始终提供：

```text
Sleep
Restart PaperOS
Return to reMarkable
Restart device
Shut down
```

`Return to reMarkable` 必须：

1. 保存 PaperOS 当前状态和未提交笔迹；
2. 停止 PaperOS；
3. 释放显示、触控和 Marker 资源；
4. 启动或恢复 Xochitl；
5. 验证 Xochitl 及相关原生服务（含 rm-sync）恢复；
6. 不依赖 Mac 或 SSH。

### Beta 自动启动（Mode B-ready，SYS-3）

`P-MOVE-SYS-3` 可加入以下**默认关闭**设置：

```text
Launch PaperOS after unlock [Beta]: Off
```

开启后，supervisor 只能在确认原生解锁流程完成后自动运行 `paperos-enter`。**不得**在设备加密解锁之前抢占前台。

自动启动必须具备 crash-loop fallback：

```text
3 PaperOS launch failures within 120 seconds
→ disable auto-launch for the next boot
→ restore Xochitl
→ persist the failure reason
```

失败后须**持久关闭**下一次 auto-launch（非仅临时回 Xochitl），避免重启再次进入失败循环。设备侧须有 documented safe action 可关闭 auto-launch 并回到 Xochitl，无需 Mac。

### 升级为推荐模式（Mode B 默认）的条件

Mode B **不得**仅凭功能完成进入默认状态。须通过：

| Gate | 最低标准 |
| --- | ---: |
| PaperOS → Xochitl | 连续 10/10 成功 |
| Xochitl → PaperOS | 连续 10/10 成功 |
| Crash-loop fallback | 强制失败 5/5 自动恢复 |
| 短按睡眠／唤醒 | 连续 20 次无黑屏、无输入失效 |
| Folio 睡眠／唤醒 | 连续 20 次通过 |
| 写入中睡眠 | 10/10 不丢最后笔迹 |
| 冷启动 | 10/10 不绕过解锁、不进入循环 |
| 长时间运行 | 至少 48 小时无不可恢复故障 |
| 无 Mac 恢复 | 用户仅用设备可关闭自动启动并返回 Xochitl |

另须通过：冷启动与解锁 Gate · 双向切换 Gate · 电源键与 Folio Gate · 写入中 suspend 完整性 Gate（见 [`paperos-device-lifecycle-gate.md`](./paperos-device-lifecycle-gate.md)）。

在上述条件完成前，**Mode A 保持默认**；Mode B 仅作为明确标注的 Beta 选项。

---

在 **45–60 分钟设备窗口**内，用日志与 instrumentation 回答 hub / `AGENT_WORKSTREAMS.md` §PaperOS lifecycle 所列问题。**禁止**只写桌面推测。

## 必须采集的命令

在设备上（USB SSH）记录输出到本目录证据或粘贴于下文 §采集记录：

```bash
systemctl cat xochitl
systemctl status xochitl
systemctl list-dependencies sleep.target
systemctl list-dependencies suspend.target
cat /sys/power/state
cat /etc/os-release
journalctl -b --no-pager | tail -200
```

## 必须 instrumentation 的场景

| #   | 场景                                                   | 记录                         |
| --- | ------------------------------------------------------ | ---------------------------- |
| 1   | 冷启动 → 解锁 → 当前默认谁在前台                       | journal + 操作者备注         |
| 2   | `systemctl start paperos` 前后 xochitl / rm-sync 状态  | `systemctl status`           |
| 3   | PaperOS Exit 后 xochitl 是否恢复、rm-sync 是否 active  | 同上                         |
| 4   | 短按电源键 睡眠 → 再按 唤醒                            | journal 时间窗               |
| 5   | Folio 合上 → 打开（若硬件支持）                        | 操作者 + journal             |
| 6   | PaperOS 前台时 suspend：进程是否冻结、最后一帧是否保留 | `ps` / journal               |
| 7   | 唤醒后触控、Marker、显示刷新                           | 操作者                       |
| 8   | Qt `applicationStateChanged` 是否出现在 epaper 平台    | PaperOS 日志（若已加 probe） |
| 9   | 唤醒后 Wi-Fi 与 sync 行为                              | `ApiClient` / footer 状态    |

## 待填：真实状态机（采集后更新）

```text
NATIVE              — xochitl 正常运行；rm-sync 状态：___
ENTERING_PAPEROS    — 观测到的进入路径：___
PAPEROS_ACTIVE      — 已验证：是 / 否
PAPEROS_AMBIENT     — 已验证：是 / 否 / 未区分
SUSPENDED           — 系统 suspend 时 PaperOS 进程：___
RESUMING            — 唤醒后首帧刷新：___
RECOVERY            — kill -9 / crash 后：___
```

## 待填：开放问题清单

| 问题                             | 结论（采集后） | 证据 |
| -------------------------------- | -------------- | ---- |
| 重启后谁先启动？                 |                |      |
| 必须经过 xochitl 解锁吗？        |                |      |
| 无 Mac/SSH 如何进入 PaperOS？    |                |      |
| 如何安全返回 xochitl + rm-sync？ |                |      |
| 短按电源键行为？                 |                |      |
| Folio 睡眠/唤醒？                |                |      |
| suspend 期间 Qt Timer / 网络？   |                |      |
| 唤醒后 sync 补偿策略？           |                |      |
| 连续崩溃 fallback？              |                |      |

## Gate 关闭条件

1. 上表 **全部**有设备证据（非推测）
2. 产出推荐默认行为表（→ 输入 `P-MOVE-SYS-1/2` 实现）
3. `AGENT_WORKSTREAMS.md` §依赖图 与本文状态机一致

## 相关

- [`../roadmap/apps/planner-pro-move.md`](../roadmap/apps/planner-pro-move.md) §P-MOVE-SYS
- [`paperos-device-lifecycle-gate.md`](./paperos-device-lifecycle-gate.md)（SYS-GATE 用例）
- [`../PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md`](../PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md)（P-MOVE-4 基线）
