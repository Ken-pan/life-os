# KNOWLEDGE.OS — 第二大脑 · Life OS 的长期记忆层

> 2026-07-16 用当日补全的设计系统地基（22+ theme 原语 / 12 表单组件）经
> `create-life-os-app` + `promote-life-os-app` 管线搭出。端口 5879，
> workspace `knowledge-os`，品牌 indigo（`design-tokens/tokens/brands/knowledge.json`）。

## 原生 Mac app（主形态，取代 Obsidian）

Tauri v2 壳（同 AIOS 模式）：`npm run app:knowledge` 构建并装入
`/Applications/KnowledgeOS.app`。**Vault 目录的 .md 文件即数据库**
（`~/「Projects」/Vault`，fs 能力严格限定在该目录）：

- 启动全量加载（437 篇实测秒开）；frontmatter（type/url/tags/pinned/created）+
  顶层目录名 → 标签（`030_Frameworks` → `frameworks`），`.obsidian/` 等目录跳过
- 收集 → 写 `010_Inbox/<标题>.md`（同名自动加序号，`#` 等字符从文件名清洗）；
  编辑写回原文件，改题即重命名；删除即删文件
- 网页/云端（knowledgeos-ken.netlify.app）自动退回 localStorage 模式；
  同一套 UI，`state.svelte.js` 按 `isTauri()` 分流后端
- localStorage 在原生模式只存 settings（437 篇 4.3MB 会爆配额，绝不入内）

Obsidian 可直接停用：文件原样保留、路径不变，KnowledgeOS 读写同一批 .md。

## v1 已实现（本地优先，零后端）

| 视图 | 能力 | 用到的设计系统件 |
| --- | --- | --- |
| 收集箱 `/` | 快速收集（首行为题、`#标签`自动抽取、纯 URL 识别为链接、⌘Enter 提交）；.md/.txt 拖放导入；概览 | `.stat` / `.kbd` / `.divider` / `.dropzone` / `.list` / EmptyState |
| 知识库 `/library` | 实时全文检索（题/正文/URL/标签）+ 标签 filter chips（多选交集）+ 置顶排序 | `SearchField` / `button.chip` / `.list` / LifeOsSheet 编辑（TextField/TextareaField） |
| 时间线 `/timeline` | 按天分组回看，节点色区分类型（笔记/链接/摘录） | `.timeline` / `.divider` / `.chip.tag` |
| 设置 `/settings` | 主题/语言（starter 基座）+ JSON 导出/按 id 合并导入 | `.seg` / `.badge` |

数据模型：`KItem { id, type: note|link|clip, title, body, url, tags[], pinned, createdAt, updatedAt }`，
localStorage key `knowledgeos_v1`（`createSettingsPersistence`）。

## AI 检索（Obsidian 做不到的核心差异）

**架构决策：KnowledgeOS 只做前端，重活在 local-ai 的服务里。**
`~/「Projects」/local-ai/services/knowledge/` 已有成熟后端，**不物理移进本 app**
（它们靠 launchd 从 `~/.local-ai` 跑、经网关服务 AIOS 等多个消费者，移动会破坏生产）：

- `vault_server.py`（600 行）：混合 RAG 检索服务 —— BM25 + 向量 + RRF 融合 +
  交叉编码器重排 + 上下文分块 + 90s 自动增量扫描 + SQLite 索引。经网关
  `127.0.0.1:18888/upstream/vault` 暴露 `POST /search`、`POST /ask`、`GET /note`。
- `curator.py`（1611 行）：知识策展流水线 —— 每日摘要 → 主题折叠（带双链时间线）→
  周/月汇总 → 人物笔记 → 园丁巡检（去重/看板/停滞提醒），launchd 每晚定时，
  产出直接写进 Vault（因此在 KnowledgeOS 里就是普通笔记/文件夹）。

KnowledgeOS 侧（`src/lib/knowledgeService.js`，纯客户端消费）：

- **回忆页 `/recall`**：`vaultAsk()` 自然语言问答（服务端检索 + LLM 引用作答，
  溯源链回本地条目）；`vaultSearch()` 只检索看原始命中。数据不出机器。
- **阅读视图「相关笔记」**：NoteReader 用标题+正文头调 `/search`，排除自身与已双链的，
  露出语义近邻（Obsidian 只有显式链接 + 字符串匹配的 unlinked mentions）。
- 服务未起时全部静默降级，退回纯本地（双链/文件夹/全文过滤）体验。

> 曾走过弯路：先在客户端做了 localStorage 向量索引 + 余弦，发现 local-ai 已有
> 远更强的服务端混合 RAG，遂删客户端索引、改直连服务。别再在 app 里重造检索。

## 路线图（KnowledgeOS 愿景 → 阶段化）

0. **Obsidian 收尾**：Vault 路径可配置（设置页）、文件外部变更监听（watch，
   让 curator 每晚写入的主题/人物笔记免重启即现）。
1. **云同步**：接 `@life-os/sync` 统一 Supabase（LWW + 墓碑，同 aios 模式），
   原生端为真源、网页端只读镜像起步。
2. **Understand**：接本地 AI 网关（llama-swap）做自动摘要 / 自动标签 / embedding。
3. **Recall / Knowledge Chat**：语义检索 + 「问自己的知识库」（引用溯源）。
4. **Graph**：实体-关系图（catalog 已有 charts/mindmap 可视件可复用）。
5. **跨 OS 引用**：Planner 任务 / HomeOS 物品 / Finance 保修 → 引用 knowledge 条目，
   KnowledgeOS 成为全 Life OS 唯一 Knowledge Layer。
6. **Collections / Evolution**：AI 自动合集、知识过期与缺口提醒。

## 命令

```bash
npm exec --workspace knowledge-os -- vite dev   # 或 preview_start "knowledge"（端口 5879）
npm run build -w knowledge-os
npm run check -w knowledge-os
```

Day-2（尚未做）：品牌图标 `generate-life-os-brand-icons.py --bootstrap knowledge`、
Netlify 供给 `netlify-provision.mjs knowledge`、上线后 manifest `production: true`。
