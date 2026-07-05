# FitnessOS 归档 (2026-07-05)

原 Supabase 项目 `drtqnhtlpjbwrpyqlrjk`（FitnessOS）在合并进 Life OS 前的快照。

## 文件

| 文件 | 说明 |
|------|------|
| `project.json` | 项目元数据 |
| `schema.sql` | 原 public schema 迁移 |
| `data.json` | 全部业务表数据 (profiles: 1, user_state: 1, exercise_weights: 8, workout_sessions: 2, exercise_logs: 10) |
| `auth-users.json` | auth.users 摘要（无密码） |

## 合并去向

- 目标项目：**Life OS** (`iueozzuctstwvzbcxcyh`)
- Fitness 数据 schema：**`fitness.*`**
- 用户 UUID 已映射到 Life OS Finance 账号

此目录可在确认 Life OS 正常后安全删除旧 FitnessOS 云端项目。

## 注意：Planner 数据

旧 FitnessOS 项目上还有 **Planner** 表（`planner_*`），归档时未单独导出。
FitnessOS 已删除后，Planner 云端历史数据无法从本归档恢复；请在 Planner 应用中重新登录并从本机 `planos_v1` 重新上传同步。
