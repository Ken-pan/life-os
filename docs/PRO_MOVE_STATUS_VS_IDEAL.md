# PaperOS 现状核查：对照"理想 e-ink 体验"差距报告

**日期:** 2026-07-09 · **核查方式:** 代码 + 设备实机验证

一份外部差距分析报告把大量模块标为"未指定"。本文档逐项核实真实状态。
结论先行：**报告中的 P0 差距（离线 cache、启动恢复、设备端启动、home-only
部署）在核查时点已全部实现并在设备上验证通过**。真正剩余的差距是
P1/P2 级：定时同步、性能基线、CI/CD、写路径生产启用。

## 逐项核查结果

| 报告中的模块           | 报告判断             | 实际状态                                                                                                                                                                       | 证据                                                                                                          |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 构建系统               | 未指定               | **已实现** — Docker + chiappa 5.7.119 SDK，一条命令构建                                                                                                                        | `apps/planner-device/remarkable-lite/scripts/build-remarkable.sh`                                             |
| UI / QML 层            | 未指定               | **已实现** — 单文件 `qml/Main.qml`（header / focus card / 分页任务列表 / pager / footer）                                                                                      | `apps/planner-device/remarkable-lite/qml/Main.qml`                                                            |
| 字体集成               | 实现方式未指定       | **已实现，正是报告推荐的保守方案** — `QFontDatabase::addApplicationFont()` + 全局默认 family（未依赖 Qt 6.8 fallback API）；缺字体时回退平台默认、不 crash                     | `src/main.cpp` `loadPaperOsFont()`；[PAPR.DEV.3 gate](PRO_MOVE_P_MOVE_3_CJK_PAGINATION_GATE.md)                 |
| 字体文件               | 未指定               | **Noto Sans CJK SC Regular**，device-only（15.7M，gitignored），路径 `/home/root/paperos/fonts/`                                                                               | 设备实测日志 `loaded font "Noto Sans CJK SC"`                                                                 |
| 分页交互               | 实现形态未指定       | **硬分页切片**（非 ListView snap）：`Column + Repeater` 渲染 `slice()`，每页 5 条，`‹ Prev · X / Y · Next ›`，无 Flickable、无惯性、无动画 — 比报告建议的 `SnapOneItem` 更彻底 | `qml/Main.qml`；操作者实机确认好用                                                                            |
| 离线 / last-good cache | 未指定，列为 P0 差距 | **已实现** — 启动先读 `cache.json` 再发网络请求；成功响应原子写入（`.tmp` + rename）；失败时保留旧数据并显示错误，`last_sync.txt` 单独维护；断网启动已实测通过                 | `src/ApiClient.cpp` `loadCache()/saveCache()`；[PAPR.DEV.2 gate](PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md) 离线验证 |
| Sidecar sync helper    | 未指定，列为可选方案 | **已实现** — `refresh-cache.sh`（wget + token，独立于 UI 进程写 cache），正是报告说的"UI 只读 cache"形态的基础                                                                 | `apps/planner/paper-device/refresh-cache.sh`                                                                  |
| 部署脚本               | 未指定               | **已实现** — `deploy-paperos.sh` 一条命令：scp 全部脚本 + unit、权限收紧、`systemctl link` + `daemon-reload`                                                                   | `apps/planner/paper-device/deploy-paperos.sh`                                                                 |
| Device launcher        | 未指定               | **已实现且超出报告的 home-only 方案** — `open-paperos.sh`（trap 恢复 + exit code 记录）加 `paperos.service`（unit 文件在 /home，根分区仅 symlink）                             | [PAPR.DEV.4 gate](PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md)                                             |
| Recover 脚本           | 未指定               | **已实现并实测** — `recover-xochitl.sh` 停 systemd 实例 + 双阶段 kill + 拉起 xochitl；`kill -9` 模拟崩溃后 xochitl 自动恢复                                                    | 同上，设备实测                                                                                                |
| Exit / 快速恢复        | 未指定，列为 P0      | **已实现** — 屏幕右上角 Exit 按钮 → `Qt.quit()` → supervisor 恢复 xochitl；stop/crash 路径均实测通过（按钮 tap 待操作者最终确认）                                              | 同上                                                                                                          |
| 升级安全               | 未指定               | **符合 home-only 目标** — 全部资产在 `/home/root/paperos`，根分区只有一个 unit symlink；每次转正都留 `paperos.backup-*`；回滚命令已写入 gate 文档                              | 各 gate 文档 Rollback 节                                                                                      |
| Scheduled Planner Mode | 未指定，P1           | **未实现（有意推迟）** — 与报告建议一致：先手动、后定时                                                                                                                        | roadmap PAPR.SYNC.6                                                                                              |
| 性能 / 内存基线        | 未指定，P1           | **未实现** — 无量化启动/翻页/内存指标                                                                                                                                          | 待做                                                                                                          |
| CI/CD 到设备           | 未指定，P2           | **未实现** — 部署为本机脚本 + USB SSH（这本身是报告推荐的最安全通道）                                                                                                          | 待做                                                                                                          |
| 写路径                 | —                    | 后端 `task.complete` 已实现并本地全量验证，**生产写开关仍关闭**（`PAPER_ACTIONS_WRITE_ENABLED`）                                                                               | [PR-3B gates](PRO_MOVE_PR3B_LOCAL_HTTP_VALIDATION_GATE.md)                                                    |

## 报告建议 vs 实际采纳

- **"App 内置 cache" vs "Sidecar helper"**：两者都已存在。App 内置
  cache 是主路径（`ApiClient`），`refresh-cache.sh` 是独立 helper，未来
  接 systemd timer 即可实现报告的"定时 cache 刷新"而不动前台架构。
- **"Home-only launcher" vs "Minimal systemd handoff"**：采用了混合形态
  ——unit 文件放 `/home`，只 link 一个 symlink 到 `/etc/systemd/system`。
  拿到了 systemd 的崩溃自动恢复和会话独立性，同时把根分区足迹压到
  34 字节，且一条命令可完全移除。
- **字体策略**：与报告的"最保守方案"完全一致（addApplicationFont +
  全局 family，不押注 Qt 6.8+ fallback API）。

## UI/UX 差距（2026-07-10 · 与工程差距互补）

Shell MVP（6 模块 + 底栏 Tab）已在设备上可用，但产品方向已升级为 **paper-first OS**。
技术项（cache、launcher、CJK、ink runtime）≠ 产品体验达标。

| 类别       | 现状                                        | 目标                                               | 文档                                                                                  |
| ---------- | ------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 导航       | 永久底栏 `Home/Today/Write/···` + More 中转 | System drawer + 临时 overlay                       | [`qa/paperos-eink-uiux-gap-audit.md`](qa/paperos-eink-uiux-gap-audit.md) §3           |
| Home/Today | 两 Tab 分裂                                 | 合并为 Continue writing + Recent notes + Tasks     | 同上 §4.01                                                                            |
| Notes      | Notebooks 列表；`+` 直进 ink                | Gallery + 模板流 + Folders/Favorites               | 同上 §4.03–4.13                                                                       |
| Editor     | 固定顶栏 + 左工具轨                         | 满屏画布 + chrome 收起 + 页码                      | 同上 §4.06–4.08                                                                       |
| 缺失 P0    | —                                           | Page Overview · Search · Quick Switcher · New Note | brief [`qa/paperos-eink-uiux-agent-brief.md`](qa/paperos-eink-uiux-agent-brief.md) §6 |

设备截图 baseline：`docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/`。

**执行 SSOT（当前）：** [`qa/paperos-next-ui-update-guide.md`](qa/paperos-next-ui-update-guide.md) — Slice 1.1 **代码已修**（`52ae55e0` toolbar · `d7c52858` QML）；**待设备复验**后进入 Slice 2。

**Gate 索引：** [`PRO_MOVE.md`](PRO_MOVE.md)

## 剩余真实差距（按优先级）

1. **PAPR.UI.1.1 device re-verify** — native + QML commits landed; operator pass before `PAPR.UI.2`.
2. **PAPR.SYS.1** — journal UUID launch architecture viable; implementation **paused by owner**（见 [`qa/paperos-device-lifecycle/README.md`](qa/paperos-device-lifecycle/README.md)）.
3. **PAPR.UI.2** — 合并 Home/Today + 最终 drawer IA（`PAPR.UI.1.1` 设备复验后；真机合并等 `PAPR.SYS.1`）。
4. **手动 Sync 按钮**（P1）— UI 已有 sync 状态展示，但无"Sync now"按钮；
   `ApiClient::fetchDashboard()` 已可直接复用，工作量小。
5. **定时 cache 刷新 timer**（P1）— `refresh-cache.sh` + systemd timer
6. **性能基线**（P1）— 冷启动时长、翻页延迟、RSS 内存记录进 gate 文档。
7. **字体回归测试**（P1）— 中英混排 + 新页面的固定验收字符串。
8. **OS 升级演练**（P1）— 升级后重 link unit + 重传 binary 的实操记录。
9. **CI/CD 与部署 profile**（P2）— 自托管 runner 或保持本机脚本；
   Claude Code 部署权限单列 profile。
10. **生产写启用**（P2，被 staging 验证阻塞）— 见 roadmap PAPR.WRITE.5。
