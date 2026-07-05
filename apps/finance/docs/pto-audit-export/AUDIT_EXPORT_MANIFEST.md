# Audit Export Manifest

| File | Purpose | Key findings included |
| ---- | ------- | --------------------- |
| `00_EXECUTIVE_SUMMARY.md` | PTO 一页纸快照 | 成熟度=Functional prototype；safe-to-spend 口径分裂；Supabase 非 local-first |
| `01_FEATURE_INVENTORY.md` | 全功能清单与状态 | 各 Area WORKING/PARTIAL/MOCKED 证据表 |
| `02_CORE_LOGIC_AND_FORMULAS.md` | 金融公式与风险 | 29+ 计算项；TRUSTED/NEEDS_REVIEW 分类；误导场景 |
| `03_DATA_MODEL_AND_PIPELINE.md` | 数据源、实体、管道 | Mermaid 架构/导入/余额/预测图；SoT 矩阵 |
| `04_USER_FLOWS.md` | 九条用户流实现 vs 意图 | 逐步表；流程缺口 |
| `05_INFORMATION_ARCHITECTURE.md` | 导航与路由 | 6 Tab 结构；与 PTO 建议 Nav 对比 |
| `06_UX_HEURISTIC_AUDIT.md` | 启发式 UX 问题 | 绑定实现的发现表 |
| `07_SECURITY_PRIVACY_ACCESSIBILITY.md` | 安全/隐私/a11y | Supabase RLS；无导出 UI；a11y 部分 UNVERIFIED |
| `08_TEST_AND_QA_COVERAGE.md` | 测试与构建状态 | 70 tests pass；回归清单缺口 |
| `09_PTO_DECISION_LOG.md` | 决策待办 | Fix before features / Build next / Defer |
| `10_OPEN_QUESTIONS_FOR_OWNER.md` | 需 PTO 回答的问题 | 余额 SoT、专款口径、移动优先等 |
| `11_TRACEABILITY_INDEX.md` | 概念→文件索引 | 快速导航 |
| `12_RLS_LIVE_VERIFICATION.md` | 线上 RLS 验证手册 | 需人工两用户隔离验证矩阵 |
| `13_OPERATOR_ASSISTED_IMPORT_RUNBOOK.md` | 临时导入操作手册 | user_id 参数化、批处理与安全检查 |
| `13_P0_5_RELEASE_HARDENING.md` | P0.5 发布加固报告 | protected reserve 策略、原子恢复、线上 RLS 与视觉 QA 结果 |

## Review instructions for the Product + Technical Owner

请按以下顺序阅读：

1. `00_EXECUTIVE_SUMMARY.md` — 总体结论与 Top 10 风险
2. `02_CORE_LOGIC_AND_FORMULAS.md` — 公式是否可信（最高优先级）
3. `04_USER_FLOWS.md` — 用户能否完成关键任务
4. `03_DATA_MODEL_AND_PIPELINE.md` — 数据从哪来、到哪去
5. `01_FEATURE_INVENTORY.md` — 功能完整度对照表
6. `09_PTO_DECISION_LOG.md` — 下一步决策包
7. 其余支持文件（UX、安全、测试、开放问题、索引）

**审计执行日期**：2026-05-30
**构建验证**：`npm run test` 86/86 pass；`npm run typecheck` pass；`npm run lint` 3 warnings；`npm run build` pass
**本地预览**：VERIFIED（含 1440/1024/390 视口与关键流程截图）
