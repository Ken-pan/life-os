# Docs 维护约定

单人现代团队实践：**短 hub、深分卷、明确 Not-list、发货写日志**。

## 角色分工（一人兼全部）

| 文档类型               | 你的角色              | 更新频率                       |
| ---------------------- | --------------------- | ------------------------------ |
| `LIFEOS_ROADMAP.md`    | 产品经理 + 技术负责人 | 每周或每次发货                 |
| `roadmap/SHIPPED.md`   | 同上                  | 每次从 §Now 移除项             |
| `roadmap/GROWTH.md`    | 同上                  | Growth 跨站项状态变化时        |
| `roadmap/POTENTIAL.md` | 同上                  | ROI 研判、二次代码检索后       |
| `roadmap/apps/*`       | 同上                  | 单 app 排期；与 hub §Next 同步 |
| `ops/*`                | 运维                  | 部署/infra 变更时              |
| `architecture/*`       | 架构师                | 契约/边界变更时                |
| `qa/e2e-issues.md`     | QA                    | 每次跑批 E2E 后                |
| `archive/*`            | —                     | **只读**，不更新               |

## 更新流程

1. **改优先级** → 只动 `LIFEOS_ROADMAP.md` 的 §Now / §Next / §推荐执行顺序 / §Not doing（ROI：🔥◆○✗）
2. **完成一项** → Now 删除 → Shipped 摘要表 + `roadmap/SHIPPED.md` 一行
3. **阶段细节** → 对应 `roadmap/INTEGRATION|PLATFORM|DESIGN|GROWTH.md` 或 `roadmap/apps/{app}.md`
4. **新共享提取想法** → 先写 `roadmap/BACKLOG.md`，未评估不得进 Now
5. **运维变更**（新 Netlify site、migration）→ `ops/` 对应文件 + 必要时 Supabase 表
6. **月度** → 跑 hub 验收命令；更新 `LIFEOS_ROADMAP.md` frontmatter `last_verified`

## 不要做的事

- 不要把 Wave 完成表、commit 列表堆回 `LIFEOS_ROADMAP.md`（放 `SHIPPED.md` 或分卷）
- 不要在 `archive/` 写新规划
- 不要用 Figma / 外部 PM 工具替代 repo 内 Markdown
- 不要把 `ui-qa-screenshots/` 当计划文档（那是证据目录）
- 不要复制 `apps/*/docs` 进全局 docs（保持 app-owned）

## 新文档放哪？

| 内容                          | 位置                                     |
| ----------------------------- | ---------------------------------------- |
| 部署、DNS、env、canonical     | `docs/ops/`                              |
| 契约、RFC、长期架构           | `docs/architecture/`                     |
| 测试 playbook、失败记录       | `docs/qa/`                               |
| Cursor / 脚本工具             | `docs/tooling/`                          |
| 品牌资产、manifest            | `docs/assets/`                           |
| 已完成阶段史                  | `roadmap/SHIPPED.md` 或 `archive/`       |
| Growth、外部对标、Portal 体感 | `roadmap/GROWTH.md`                      |
| ROI 研判、执行顺序依据        | `roadmap/POTENTIAL.md`                   |
| 单 app 产品排期、脑暴         | `roadmap/apps/`                          |
| 不确定归属                    | 先在 `roadmap/BACKLOG.md` 开一行，再归类 |

## AI / Agent 读取顺序

1. `docs/LIFEOS_ROADMAP.md` — scope、优先级、§六 app 一览
2. `docs/roadmap/POTENTIAL.md` — ROI 排序与代码证据（改优先级前必读）
3. `docs/ops/canonical.md` — 别改错仓库
4. 任务相关分卷（`roadmap/*`、`roadmap/apps/*`、`architecture/*`、`ops/*`）
5. `packages/*/README.md` — 实现细节

`AGENTS.md`（repo 根）指向本 hub；不必在每次会话重复粘贴长篇阶段史。
