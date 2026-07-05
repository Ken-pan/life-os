# 本地 legacy 目录已移除

2026-07-05 起，以下 **本地 sibling 目录已删除**（GitHub 对应仓库已 archive，代码以 monorepo 为准）：

| 已删本地路径 | GitHub（只读 archive） | Monorepo 路径 |
|-------------|------------------------|---------------|
| `Projects/Planner` | Ken-pan/planner-os | `apps/planner` |
| `Projects/Fitness` | Ken-pan/fitness-os | `apps/fitness` |
| `Projects/Moneymoneymoney` | Ken-pan/Moneymoneymoney | `apps/finance` |
| `Projects/MusicOS` | Ken-pan/MusicOS | `apps/music` |
| `Projects/life-os-theme` | Ken-pan/life-os-theme | `packages/theme` |
| `Projects/life-os-sync` | Ken-pan/life-os-sync | `packages/sync` |

开发、构建、部署 **只在** `life-os` 进行。`.env` 已迁移到各 `apps/*/.env.example`（secrets 在本地 `.env`，gitignore）。

Cursor：打开 `Projects/life-os.code-workspace`。
