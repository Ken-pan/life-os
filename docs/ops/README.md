# Ops — 生产运维（Present）

「现在怎么跑」：仓库准绳、部署、数据库、遗留路径。

| 文档                                   | 用途                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| [`canonical.md`](./canonical.md)       | **先读** — 唯一准绳 repo、legacy 归档状态                    |
| [`netlify.md`](./netlify.md)           | 六个 canonical web surface + Knowledge 实验 site + AIOS viewer、env、CLI deploy |
| [`supabase.md`](./supabase.md)         | 共享 DB migration、`supabase-sql.sh`、Auth redirect          |
| [`legacy-local.md`](./legacy-local.md) | 已删除的本地 sibling 克隆路径                                |
| [`scheduled-jobs.md`](./scheduled-jobs.md) | 本机 launchd 定时任务（镜像去重）、装法、排障            |

> PaperOS 设备运维已随 PaperOS 于 2026-07-12 迁出至独立仓库 → [`../roadmap/apps/paperos.md`](../roadmap/apps/paperos.md)。
> HealthOS 当前是本地 Mac + Watch/iPhone companion，manifest `production: false`，不在 Netlify 生产面。

**关联：** 身份/事件阶段见 [`../roadmap/INTEGRATION.md`](../roadmap/INTEGRATION.md)；优先级见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。
