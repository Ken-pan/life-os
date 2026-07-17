# KnowledgeOS Roadmap

**Workspace：** `knowledge-os` · **Dev 端口：** 5879 · **ID 前缀：** `KNOW` · **品牌：** indigo

> **层级：实验 / 本地优先。** 原生 Mac app（Tauri v2 壳，装在 `/Applications/KnowledgeOS.app`），取代 Obsidian——**Vault 目录的 .md 文件即数据库**（`~/「Projects」/Vault`，fs 能力严格限定该目录）。网页/云端（knowledgeos-ken.netlify.app）自动退回 localStorage 模式，同一套 UI 按 `isTauri()` 分流后端。

## 一句话

Life OS 的长期记忆层：本地优先笔记库 + 语义检索/问答（重活在 local-ai 服务端，本 app 只做前端消费）+ 项目现状自动感知（融合 git 活动 + Planner 只读快照）。**2026-07-16 建站**，已推进原生 app、RAG 问答、性能优化三轮迭代。

## 当前能力（已落地）

| 域 | 状态 | 要点 |
| --- | --- | --- |
| 原生 Vault 后端 | ✅ | Tauri fs 能力限定目录；启动全量加载（437 篇实测秒开）；frontmatter 保真 + 顶层目录名→标签；收集/编辑/删除直接读写 .md |
| 收集箱 `/` | ✅ | 首行为题、`#标签` 自动抽取、纯 URL 识别为链接、⌘Enter 提交、.md/.txt 拖放导入 |
| 知识库 `/library` | ✅ | 实时全文检索（题/正文/URL/标签）+ 标签 filter chips 多选交集 + 置顶排序 |
| 时间线 `/timeline` | ✅ | 按天分组回看，节点色区分类型 |
| 项目现状 `/projects` | ✅ | Vault frontmatter + git 活动 + Planner 项目/任务只读快照三路融合，漂移检测一键写回、一键生成汇总笔记 |
| AI 语义问答 `/recall` | ✅ | `vaultAsk()` 自然语言问答（服务端混合 RAG + LLM 引用作答，溯源回本地条目）；`vaultSearch()` 纯检索；服务未起时静默降级 |
| 阅读视图相关笔记 | ✅ | NoteReader 语义近邻检索，露出 Obsidian 双链做不到的隐性关联 |
| Planner 只读联动 | ✅ | `cloud.svelte.js` 经 Life OS 统一 Supabase 读 Planner 项目/任务（RLS 限本人），Vault 内容本身未接云 |
| Planner 反向检索 | ✅ | Planner 项目详情直连同一 local-ai Vault 服务做语义检索；网关不可达时优雅降级，不影响 Planner 主流程 |
| 设置 `/settings` | ✅ | 主题/语言 + JSON 导出/合并导入 |

后端依赖（不在本 app 内，`~/「Projects」/local-ai/services/knowledge/`）：`vault_server.py`（BM25+向量+RRF+交叉编码器重排，经网关 `127.0.0.1:18888/upstream/vault`）、`curator.py`（每日摘要/主题折叠/周月汇总/园丁巡检，launchd 定时写回 Vault）。**架构决策：别在 app 里重造检索**——已从客户端 localStorage 向量索引改为直连服务端。

**当前 WIP（2026-07-17）：** 块状所见即所得编辑器 + library/overview/compose 导航重构仍在工作区（20 个已跟踪文件约 +1284/−485，另有新增组件/模块）；Knowledge unit **167/167**、`svelte-check` 0 错误/0 warning，但尚缺真实 library/editor 浏览器 smoke 与版本史闭环。

## Next（按 ROI）

| ID | 主题 | 备注 |
| --- | --- | --- |
| **KNOW.EDITOR.7** | 块编辑器 WIP 稳定化 | **先做**：补 library/editor browser smoke，确认 ItemViewer/NoteReader 删除由新组件完整替代，提交当前大 WIP |
| **KNOW.VAULT.0** | 外部文件变更监听（路径配置拆后） | **高 ROI**：让 curator/Obsidian 写入免重启即现；先固定当前 Vault watcher，路径可配置另开小项 |
| **KNOW.SYNC.1** | 接 `@life-os/sync` 统一 Supabase | LWW+墓碑同 aios 模式；原生端真源、网页端只读镜像起步；Planner 只读联动已铺路 |
| **KNOW.UNDERSTAND.2** | 接本地 AI 网关自动摘要/标签/embedding | 依赖 llama-swap 网关 |
| **KNOW.GRAPH.4** | 实体-关系图 | catalog 已有 charts/mindmap 可视件可复用 |
| **KNOW.XREF.5** | 跨 OS 引用 | 🟡 Planner 项目→Knowledge 语义检索首个 slice 已发货；稳定 `object_ref` 与 Home/Finance 引用仍未做 |
| **KNOW.EVOLVE.6** | Collections 自动合集 + 知识过期/缺口提醒 | 远期 |

> 执行顺序：`KNOW.EDITOR.7`（交付完整性）→ `KNOW.VAULT.0`（每日体感）→ 再研判 sync/graph/xref 扩面。不要在大 WIP 未闭合时继续叠功能。

## Parked / 待研判

- Portal 接入：目前 Portal **未收录** KnowledgeOS（同 AIOS 现状），是否作为启动器入口进 Portal 待定。
- Day-2 未完成：manifest 仍为 `production: false`；Netlify/DNS 实际状态以 [`../../ops/netlify.md`](../../ops/netlify.md) 为准。

## 实现锚点

| 域 | 文件 / 位置 |
| --- | --- |
| Vault 读写 / frontmatter | `src/lib/vault.js` · `src/lib/frontmatter.js` |
| 状态层（Tauri/Web 分流） | `src/lib/state.svelte.js` |
| 项目现状感知 | `src/lib/projects.js` · `src/routes/projects/+page.svelte` |
| 云联动（只读 Planner） | `src/lib/cloud.svelte.js` |
| Planner 反向语义检索 | `apps/planner/src/lib/services/knowledgeClient.js` · `apps/planner/src/routes/projects/[id]/+page.svelte` |
| RAG 客户端消费 | `src/lib/knowledgeService.js` · `local-ai/services/knowledge/vault_server.py` |
| 原生壳 | `src-tauri/` |

## 验收命令

```bash
npm exec --workspace knowledge-os -- vite dev   # 或 preview_start "knowledge"（端口 5879）
npm run build -w knowledge-os
npm run check -w knowledge-os
npm run app:knowledge                            # 更新原生 Mac app
```

## 集成

```text
local-ai 网关(127.0.0.1:18888)──RAG 检索/问答──► KnowledgeOS(/recall, 相关笔记)
Vault .md ──curator.py 定时写回──► KnowledgeOS 普通笔记
Life OS Supabase(planner 表) ──只读──► /projects 视图(Planner 联动)
```
