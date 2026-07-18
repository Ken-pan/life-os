// 本地演示数据（localhost 网页）—— 一整套自洽的第二大脑快照，全面点亮各页面：
// 收集箱(/) / 库(/library) / 概览(/overview) / 项目(/projects) / 时间线(/timeline)。
// 仅 localhost 网页空库时灌入（见 demoMode.js），原生 Vault 后端永不触及。
//
// KItem 形状：{ id, type:'note'|'link'|'clip', title, body(markdown 含 #tag/[[wikilink]]),
//   url, tags:string[]（无 # 前缀）, pinned, createdAt, updatedAt, _meta? }。
// - createdAt 每条给「具体某天的本地某时某分」，时间点各不相同（时间线不再千篇一律）；
// - createdAt 密集分布在最近 1~3 周（点亮「本周新增」），并稀疏拉回到 ~16 周（增长曲线/热力图）；
// - tags 数组显式给（驱动概览 topTags treemap 与库筛选 chip，≥20 个标签）；
// - 三个互链簇（PKM / 系统设计 / 项目）用 [[标题]] 交叉引用 → 反向链接丰满；
// - 8 条项目笔记带 _meta:{ tags:['project'], status, path, last_updated }，覆盖 5 种状态；
// - id 用稳定的 k-demo-N，便于 /library?note=k-demo-1 深链稳定复现旗舰笔记。

const DAY = 86_400_000

/**
 * 具体时刻：今天本地 00:00 往前推 offsetDays 天，再落到 hour:minute。
 * 关键点——每条笔记 hour/minute 各异，时间线分组内展示的时间不再全是同一个 HH:MM。
 * @param {[number, number, number]} spec [距今天数, 时(0-23), 分(0-59)]
 */
function at([offsetDays, hour = 9, minute = 0]) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - offsetDays)
  d.setHours(hour, minute, 0, 0)
  return d.getTime()
}

/** @param {number} offsetDays → YYYY-MM-DD（frontmatter last_updated 用） */
function ymd(offsetDays) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - offsetDays)
  return d.toISOString().slice(0, 10)
}

/**
 * 每条 spec：{ id, type?, title, body, url?, tags, pinned?, c, u?, meta? }
 * c/u 为 [距今天数, 时, 分]；u 省略时取 c；meta 直接落到 _meta（项目笔记必需）。
 */
const SPECS = [
  // ===== PKM 方法论簇（5 条互链，点亮反向链接）=====
  {
    id: 'k-demo-1',
    title: '第二大脑方法论',
    tags: ['pkm', '方法论', '效率'],
    pinned: true,
    c: [112, 9, 14],
    u: [2, 22, 5],
    body: `# 第二大脑方法论

把外部信息系统化地捕获、组织、提炼、表达，减轻生物大脑的记忆负担。它不是又一个笔记 app，而是一套**贯穿输入到输出**的工作流。

## 核心：CODE 四步
- **Capture 捕获**——只留触动你的（resonance），别做剪贴板搬运工
- **Organize 组织**——按可执行性归位（PARA：项目 / 领域 / 资源 / 归档）
- **Distill 提炼**——[[渐进式总结]]，让未来的自己一眼抓住重点
- **Express 表达**——知识只有被再次用出去才算真正属于你

## 我的落地约定
1. 收集箱当天清空，每条要么删、要么归、要么长成一篇 [[原子笔记与卡片盒]]
2. 每周日回顾，把散点连成网络（见 [[Zettelkasten 落地实践]]）
3. 任务型信息一律进 [[GTD 五步工作流]]，笔记库只留「值得回看的思考」

延伸阅读：[[《Thinking in Systems》读书笔记]] 把「系统」视角带进了知识管理本身。

#pkm #方法论`,
  },
  {
    id: 'k-demo-2',
    title: '原子笔记与卡片盒',
    tags: ['pkm', '笔记法', '方法论'],
    c: [96, 11, 38],
    u: [20, 15, 9],
    body: `# 原子笔记与卡片盒

一条笔记只表达一个想法（atomic），用唯一标识串联成网络。灵感来自卡片盒笔记法（Zettelkasten）。

- 每条笔记自成上下文，可脱离原文独立阅读
- 用链接而非目录组织：对应 [[第二大脑方法论]] 的 Organize 阶段
- 与 [[渐进式总结]] 配合，逐层析出可复用的知识块
- 实操参考 [[Zettelkasten 落地实践]] 与 [[《How to Take Smart Notes》读书笔记]]

#pkm #笔记法`,
  },
  {
    id: 'k-demo-3',
    title: '渐进式总结',
    tags: ['pkm', '笔记法', '读书笔记'],
    c: [88, 8, 51],
    u: [30, 19, 42],
    body: `# 渐进式总结

Progressive Summarization：分多轮加粗、高亮、摘要，让未来的自己一眼抓住重点，而不是重读全文。

- 第一层：原文段落
- 第二层：加粗关键句
- 第三层：高亮加粗中的核心
- 第四层：用自己的话写一句执行摘要

回链 [[第二大脑方法论]] 的 Distill 阶段；实操时常配合 [[原子笔记与卡片盒]] 拆分长文。

#pkm #笔记法`,
  },
  {
    id: 'k-demo-19',
    type: 'clip',
    title: '《How to Take Smart Notes》读书笔记',
    tags: ['读书笔记', 'pkm', '笔记法'],
    c: [45, 21, 6],
    u: [45, 21, 6],
    body: `# 《How to Take Smart Notes》读书笔记

> 写作不是思考之后的事，写作本身就是思考。

- **闪念笔记 fleeting**：随手记，48 小时内处理掉
- **文献笔记 literature**：读到什么、我怎么理解，用自己的话
- **永久笔记 permanent**：一条一想法，进卡片盒，见 [[原子笔记与卡片盒]]

这本书是 [[第二大脑方法论]] 之外另一条主线——写作驱动的知识管理。落地见 [[Zettelkasten 落地实践]]。

#读书笔记 #pkm`,
  },
  {
    id: 'k-demo-20',
    title: 'Zettelkasten 落地实践',
    tags: ['pkm', '笔记法', '效率'],
    c: [78, 14, 27],
    u: [11, 10, 18],
    body: `# Zettelkasten 落地实践

理论好懂，难在坚持。我的三条硬规则：

1. 每条永久笔记必须链到至少一条已有笔记，否则它会变成孤岛
2. 索引笔记（MOC）只做入口，不塞内容
3. 每周把「闪念笔记」清成永久笔记，配合 [[渐进式总结]]

理论背景见 [[原子笔记与卡片盒]] 和 [[《How to Take Smart Notes》读书笔记]]，方法论母题回到 [[第二大脑方法论]]。

#pkm #笔记法`,
  },
  {
    id: 'k-demo-21',
    title: 'GTD 五步工作流',
    tags: ['方法论', 'gtd', '效率'],
    c: [65, 7, 42],
    u: [65, 7, 42],
    body: `# GTD 五步工作流

Getting Things Done 把「任务」和「参考资料」彻底分开——笔记库不该塞待办。

1. **捕获 Capture**：一切进收集箱
2. **理清 Clarify**：可执行吗？两分钟内做完就做
3. **组织 Organize**：情境清单 / 项目 / 将来也许
4. **回顾 Reflect**：每周回顾是灵魂
5. **执行 Engage**：按情境和精力选下一步

与 [[第二大脑方法论]] 分工：GTD 管行动，第二大脑管思考沉淀。

#方法论 #gtd`,
  },

  // ===== 系统设计簇（6 条互链）=====
  {
    id: 'k-demo-5',
    title: '系统设计：一致性与共识',
    tags: ['系统设计', '分布式', '架构'],
    pinned: true,
    c: [63, 16, 3],
    u: [1, 9, 12],
    body: `# 系统设计：一致性与共识

线性一致性 > 顺序一致性 > 因果一致性 > 最终一致性。共识算法（Raft/Paxos）为强一致性买单：多数派写入。

- CAP 下分区必然发生，只能在 C 与 A 间取舍
- Raft：leader 选举 + 日志复制 + 安全性，细节见 [[剪藏：Raft 论文精读]]
- 读优化见 [[系统设计：缓存策略]]，解耦见 [[系统设计：消息队列与解耦]]

背景参考 [[剪藏：分布式系统的八个谬误]] 与 [[《Designing Data-Intensive Applications》读书笔记]]。

#系统设计 #分布式`,
  },
  {
    id: 'k-demo-6',
    title: '系统设计：缓存策略',
    tags: ['系统设计', '缓存', '架构'],
    c: [49, 13, 30],
    u: [8, 20, 47],
    body: `# 系统设计：缓存策略

- **Cache-Aside**：应用负责读穿与回填，最常用
- **Write-Through / Write-Back**：一致性与延迟的取舍
- 失效难题：TTL、主动失效、版本号
- 雪崩 / 击穿 / 穿透：加随机 TTL、互斥重建、空值缓存

与 [[系统设计：一致性与共识]] 是一体两面：缓存本质是牺牲一致性换性能。降级时配合 [[系统设计：限流与降级]]。

#系统设计 #缓存`,
  },
  {
    id: 'k-demo-7',
    type: 'clip',
    title: '剪藏：分布式系统的八个谬误',
    tags: ['分布式', '架构', '系统设计'],
    c: [55, 10, 22],
    u: [55, 10, 22],
    body: `# 剪藏：分布式系统的八个谬误

1. 网络是可靠的
2. 延迟为零
3. 带宽无限
4. 网络是安全的
5. 拓扑不会变
6. 只有一个管理员
7. 传输开销为零
8. 网络是同质的

每一条都会在 [[系统设计：一致性与共识]] 里以代价的形式回来。

#分布式 #架构`,
  },
  {
    id: 'k-demo-23',
    title: '系统设计：消息队列与解耦',
    tags: ['系统设计', '分布式', '架构'],
    c: [44, 18, 15],
    u: [44, 18, 15],
    body: `# 系统设计：消息队列与解耦

MQ 的价值：削峰、解耦、异步。代价是复杂度和一致性。

- **投递语义**：at-most-once / at-least-once / exactly-once（后者往往靠幂等消费假装）
- **顺序**：分区内有序，跨分区无序
- **积压**：消费者要能水平扩，死信队列兜底

和 [[系统设计：一致性与共识]] 呼应：MQ 把强一致换成了最终一致 + 可观测。限流细节见 [[系统设计：限流与降级]]。

#系统设计 #分布式`,
  },
  {
    id: 'k-demo-24',
    title: '系统设计：限流与降级',
    tags: ['系统设计', '架构', '效率'],
    c: [38, 22, 41],
    u: [38, 22, 41],
    body: `# 系统设计：限流与降级

保护系统的最后一道闸。

- **限流算法**：固定窗口 / 滑动窗口 / 漏桶 / 令牌桶
- **熔断**：连续失败即快速失败，半开探测恢复
- **降级**：非核心功能先关，保住主链路（配合 [[系统设计：缓存策略]] 返回兜底数据）

上游解耦见 [[系统设计：消息队列与解耦]]。

#系统设计 #架构`,
  },
  {
    id: 'k-demo-25',
    type: 'clip',
    title: '《Designing Data-Intensive Applications》读书笔记',
    tags: ['读书笔记', '系统设计', '数据库'],
    c: [52, 9, 9],
    u: [52, 9, 9],
    body: `# 《Designing Data-Intensive Applications》读书笔记

> 可靠、可扩展、可维护——衡量一切数据系统的三把尺子。

- **复制**：单主 / 多主 / 无主，冲突与延迟的老问题
- **分区**：按范围 vs 按哈希，热点与再平衡
- **事务**：隔离级别与它们防不住的异常

几乎每一章都在给 [[系统设计：一致性与共识]] 做注脚；索引部分延伸到 [[技术笔记：索引与查询优化]]。

#读书笔记 #系统设计`,
  },

  // ===== 前端 / AI 技术笔记 =====
  {
    id: 'k-demo-26',
    title: '前端笔记：Svelte5 响应式心智模型',
    tags: ['前端', 'web', '编辑器'],
    c: [6, 23, 12],
    u: [6, 23, 12],
    body: `# 前端笔记：Svelte5 响应式心智模型

runes 之后，响应式从「编译魔法」变成显式声明，心智负担小很多。

- \`$state\`：可变根，深层代理
- \`$derived\`：纯派生，别写副作用
- \`$effect\`：副作用，异步里给 $state 赋值有坑——多实例场景改用 \`$derived.by\` 返 promise + {#await}

这条经验直接喂给了 [[项目：KnowledgeOS 块编辑器]]。

#前端 #web`,
  },
  {
    id: 'k-demo-27',
    title: '前端笔记：CSS 容器查询实战',
    tags: ['前端', 'web'],
    c: [18, 15, 48],
    u: [18, 15, 48],
    body: `# 前端笔记：CSS 容器查询实战

组件该按**自己容器**的宽度响应，而不是视口——这才是真正的组件化响应式。

- \`container-type: inline-size\` + \`@container\`
- 设置行「横排↔竖排」用 @container，避免桌面窄卡片里中文被挤成竖排
- 组件 <style> 里别用 @custom-media，会原样进产物被浏览器忽略，写字面量断点

#前端 #web`,
  },
  {
    id: 'k-demo-28',
    title: 'AI 笔记：RAG 检索增强生成',
    tags: ['ai', '系统设计', '数据库'],
    pinned: true,
    c: [2, 14, 30],
    u: [2, 16, 20],
    body: `# AI 笔记：RAG 检索增强生成

让模型「带着资料答题」，缓解幻觉与知识过期。

## 管线
1. **切块 chunking**：语义切分 > 定长切分
2. **嵌入 embedding**：进向量库（选型见 [[AI 笔记：向量数据库选型]]）
3. **召回 retrieval**：向量 + 关键词混合，再 rerank
4. **生成**：把召回片段塞进上下文，让模型引用

难点从来不是模型，而是检索质量。切块和 rerank 决定天花板。可以给第二大脑做一个「问我的笔记」，母题见 [[第二大脑方法论]]。

#ai #系统设计`,
  },
  {
    id: 'k-demo-29',
    title: 'AI 笔记：向量数据库选型',
    tags: ['ai', '数据库', '架构'],
    c: [25, 11, 5],
    u: [25, 11, 5],
    body: `# AI 笔记：向量数据库选型

- **pgvector**：已有 Postgres 就先用它，够到百万级
- **专用库**（Qdrant / Milvus）：亿级、高 QPS 才值得引
- 关键指标：召回率 vs 延迟，HNSW 的 ef 参数在调这个权衡

给 [[AI 笔记：RAG 检索增强生成]] 打底；索引原理见 [[技术笔记：索引与查询优化]]。

#ai #数据库`,
  },

  // ===== 外部链接（type:link，点亮类型分布 donut）=====
  {
    id: 'k-demo-8',
    type: 'link',
    title: "Andy Matuschak's notes",
    url: 'https://notes.andymatuschak.org/',
    tags: ['pkm', '笔记法', 'web'],
    c: [82, 20, 33],
    u: [82, 20, 33],
    body: `公开的常青笔记花园，示范 [[原子笔记与卡片盒]] 与双向链接如何长期演化。值得反复读的活样本。

#pkm #web`,
  },
  {
    id: 'k-demo-9',
    type: 'link',
    title: 'Zettelkasten 方法官网',
    url: 'https://zettelkasten.de/',
    tags: ['pkm', '笔记法', 'web'],
    c: [41, 8, 19],
    u: [41, 8, 19],
    body: `卡片盒笔记法的社区与文章合集，理论背景补充 [[原子笔记与卡片盒]]，实践对照 [[Zettelkasten 落地实践]]。

#pkm #web`,
  },
  {
    id: 'k-demo-10',
    type: 'link',
    title: '每周一读：工程博客精选',
    url: 'https://example.com/eng-weekly',
    tags: ['架构', '效率', 'web'],
    c: [12, 12, 8],
    u: [12, 12, 8],
    body: `攒下的架构类长文，周末批量消化后拆进 [[系统设计：缓存策略]] 之类的主题笔记。

#架构 #web`,
  },
  {
    id: 'k-demo-31',
    type: 'link',
    title: '收藏：DDIA 中文笔记站',
    url: 'https://vonng.github.io/ddia/',
    tags: ['数据库', '读书笔记', 'web'],
    c: [36, 13, 52],
    u: [36, 13, 52],
    body: `逐章的 DDIA 精读，回看时比原书快。配合我自己的 [[《Designing Data-Intensive Applications》读书笔记]] 交叉对照。

#数据库 #web`,
  },
  {
    id: 'k-demo-32',
    type: 'link',
    title: '收藏：Excalidraw 手绘白板',
    url: 'https://excalidraw.com/',
    tags: ['效率', 'web', '整理'],
    c: [20, 17, 24],
    u: [20, 17, 24],
    body: `画系统草图最顺手的白板，架构评审前先在这里理清依赖，再落成 [[系统设计：消息队列与解耦]] 这类笔记。

#效率 #web`,
  },

  // ===== 项目笔记（_meta.tags 含 project；点亮 /projects 看板 + 状态环）=====
  {
    id: 'k-demo-11',
    title: '项目：KnowledgeOS 块编辑器',
    tags: ['项目', '编辑器', 'web'],
    pinned: true,
    c: [70, 10, 40],
    u: [0, 11, 8],
    meta: {
      tags: ['project'],
      status: 'active',
      path: '~/「Projects」/life-os/apps/knowledge',
      last_updated: ymd(0),
    },
    body: `# 项目：KnowledgeOS 块编辑器

对标 Notion 的所见即所得块编辑器，零依赖手写。块数组 ⇄ 干净 .md，行内 input-rule，浮层 portal。

- [x] 段落 / 标题 / 列表块
- [x] [[wikilink]] 与 #tag 行内解析
- [ ] 表格块
- [ ] 拖拽重排

响应式细节踩坑见 [[前端笔记：Svelte5 响应式心智模型]]，方法论母题 [[第二大脑方法论]]。

#项目 #编辑器`,
  },
  {
    id: 'k-demo-12',
    title: '项目：Life OS 云同步',
    tags: ['项目', '云同步', '架构'],
    c: [58, 15, 55],
    u: [3, 9, 41],
    meta: {
      tags: ['project'],
      status: 'active',
      path: '~/「Projects」/life-os/packages/sync',
      last_updated: ymd(3),
    },
    body: `# 项目：Life OS 云同步

统一 Supabase 后端，本地优先 + LWW + 墓碑。多 app 共享登录态。

技术选型直接受益于 [[系统设计：一致性与共识]]：最终一致 + 冲突以 updatedAt 裁决。CRDT 方案还在评估，见 [[待读清单]]。

#项目 #云同步`,
  },
  {
    id: 'k-demo-34',
    title: '项目：AIOS 桌面助手',
    tags: ['项目', 'ai', 'web'],
    c: [28, 19, 33],
    u: [2, 21, 14],
    meta: {
      tags: ['project'],
      status: 'active',
      path: '~/「Projects」/life-os/apps/aios',
      last_updated: ymd(2),
    },
    body: `# 项目：AIOS 桌面助手

Tauri v2 原生壳 + 本地模型网关，接 Life OS 统一登录态。

- [x] 对话 + 记忆本地优先同步
- [x] 本地生图（mflux 三档）
- [ ] 「问我的笔记」——落地 [[AI 笔记：RAG 检索增强生成]]

向量库选型见 [[AI 笔记：向量数据库选型]]。

#项目 #ai`,
  },
  {
    id: 'k-demo-15',
    title: '项目：读书计划 2026',
    tags: ['项目', '读书笔记', '效率'],
    c: [105, 21, 17],
    u: [6, 8, 26],
    meta: {
      tags: ['project'],
      status: 'active',
      path: '~/Documents/reading-2026',
      last_updated: ymd(6),
    },
    body: `# 项目：读书计划 2026

每月两本，读完必留 [[渐进式总结]]。

- [x] 《Thinking in Systems》→ [[《Thinking in Systems》读书笔记]]
- [x] 《How to Take Smart Notes》→ [[《How to Take Smart Notes》读书笔记]]
- [x] 《Designing Data-Intensive Applications》→ [[《Designing Data-Intensive Applications》读书笔记]]
- [ ] 《Domain-Driven Design》

#项目 #读书笔记`,
  },
  {
    id: 'k-demo-13',
    title: '项目：家庭知识库整理',
    tags: ['项目', '整理', 'pkm'],
    c: [92, 9, 3],
    u: [40, 14, 50],
    meta: {
      tags: ['project'],
      status: 'paused',
      path: '~/Documents/family-vault',
      last_updated: ymd(40),
    },
    body: `# 项目：家庭知识库整理

把散落的家庭文档（保修单、说明书、账单）归拢进统一 Vault，套用 [[渐进式总结]] 分层。

暂停：等块编辑器（[[项目：KnowledgeOS 块编辑器]]）稳定后再迁。

#项目 #整理`,
  },
  {
    id: 'k-demo-14',
    title: '项目：个人网站重构',
    tags: ['项目', 'web', '架构'],
    c: [100, 16, 44],
    u: [60, 11, 30],
    meta: {
      tags: ['project'],
      status: 'completed',
      path: '~/「Projects」/personal-site',
      last_updated: ymd(60),
    },
    body: `# 项目：个人网站重构

已上线。SvelteKit + 静态导出，把旧博客迁到 Markdown 源。

复盘写进了 [[渐进式总结]]，缓存层参考 [[系统设计：缓存策略]]。

#项目 #web`,
  },
  {
    id: 'k-demo-35',
    title: '项目：博客迁移到 Astro',
    tags: ['项目', 'web', '前端'],
    c: [84, 13, 26],
    u: [70, 10, 12],
    meta: {
      tags: ['project'],
      status: 'archived',
      path: '~/「Projects」/blog-astro',
      last_updated: ymd(70),
    },
    body: `# 项目：博客迁移到 Astro

一次搁浅的尝试。Astro 的 islands 很香，但当时内容还没稳定，迁移收益不足，归档。

经验：先稳内容源，再挑框架。教训并入 [[项目：个人网站重构]] 的复盘。

#项目 #web`,
  },
  {
    id: 'k-demo-36',
    title: '项目：家庭财务看板',
    tags: ['项目', '整理', '效率'],
    c: [48, 20, 9],
    u: [15, 18, 37],
    meta: {
      tags: ['project'],
      status: 'reference',
      path: '~/Documents/finance-dashboard',
      last_updated: ymd(15),
    },
    body: `# 项目：家庭财务看板

作为参考资料留存：分类规则、月度模板、对账口径。不再主动开发，但常回来查口径。

数据可视化配色参考通用图表组件族的固定槽位方案。

#项目 #整理`,
  },

  // ===== 收集箱 / 每日笔记 / 会议纪要 / 灵感（点亮 / 收集箱与时间线近期分组）=====
  {
    id: 'k-demo-16',
    title: '会议纪要：架构评审 2026-06',
    type: 'clip',
    tags: ['会议纪要', '架构', '系统设计'],
    c: [33, 15, 20],
    u: [33, 15, 20],
    body: `# 架构评审 2026-06

- 决定：同步层走本地优先，冲突用 LWW
- 待办：给 [[系统设计：缓存策略]] 补一节失效方案
- 风险：跨 app 共享 Supabase 迁移分叉

#会议纪要 #架构`,
  },
  {
    id: 'k-demo-33',
    title: '会议纪要：周会 2026-07-13',
    type: 'clip',
    tags: ['会议纪要', '效率'],
    c: [5, 10, 30],
    u: [5, 10, 30],
    body: `# 周会 2026-07-13

- KnowledgeOS 块编辑器进入 UI 收口（[[项目：KnowledgeOS 块编辑器]]）
- 云同步冲突用例补测（[[项目：Life OS 云同步]]）
- 下周聚焦：概览页图表打磨 + demo 数据补真实感

#会议纪要`,
  },
  {
    id: 'k-demo-39',
    title: '每日笔记 2026-07-17',
    tags: ['每日笔记', '效率'],
    c: [1, 8, 12],
    u: [1, 8, 45],
    body: `# 每日笔记 2026-07-17

- 上午读完 DDIA 复制章，笔记并入 [[《Designing Data-Intensive Applications》读书笔记]]
- 下午调块编辑器浮层的 portal 问题
- 晚上：把 RAG 管线草图画进 [[AI 笔记：RAG 检索增强生成]]

明日：概览热力图密度、时间线时间戳。

#每日笔记`,
  },
  {
    id: 'k-demo-40',
    title: '每日笔记 2026-07-15',
    tags: ['每日笔记', 'pkm'],
    c: [3, 22, 40],
    u: [3, 22, 40],
    body: `# 每日笔记 2026-07-15

- 周回顾：把 12 条闪念清成 4 条永久笔记（[[Zettelkasten 落地实践]] 的规则起作用了）
- 灵感：给库页标签加稳定色，见 [[灵感：把标签做成颜色可视化]]

#每日笔记`,
  },
  {
    id: 'k-demo-41',
    title: '技术笔记：索引与查询优化',
    tags: ['数据库', '系统设计', '架构'],
    c: [22, 9, 55],
    u: [22, 9, 55],
    body: `# 技术笔记：索引与查询优化

- **B-Tree**：范围查询友好，是默认选择
- **覆盖索引**：查询字段全在索引里，免回表
- **最左前缀**：联合索引的顺序不是随便排的
- \`EXPLAIN ANALYZE\` 是唯一可信的真相来源，别猜

延伸：向量检索的 HNSW 是另一套索引思路，见 [[AI 笔记：向量数据库选型]]。

#数据库 #系统设计`,
  },
  {
    id: 'k-demo-42',
    title: '方法论：如何做文献综述',
    tags: ['方法论', '读书笔记', 'pkm'],
    c: [15, 11, 33],
    u: [15, 11, 33],
    body: `# 方法论：如何做文献综述

不是把摘要拼起来，而是**围绕问题重新组织别人的发现**。

1. 先定问题，再找文献，别反过来
2. 每篇提炼成一条 [[原子笔记与卡片盒]]
3. 按论点而非按论文组织，让冲突的观点正面相遇
4. 用 [[渐进式总结]] 逐层收敛

#方法论 #读书笔记`,
  },
  {
    id: 'k-demo-30',
    type: 'clip',
    title: '剪藏：Raft 论文精读',
    tags: ['分布式', '系统设计', '读书笔记'],
    c: [60, 14, 8],
    u: [60, 14, 8],
    body: `# 剪藏：Raft 论文精读

Raft 用「可理解性」当第一设计目标，把共识拆成三块：

- **Leader 选举**：随机超时避免选票瓜分
- **日志复制**：leader 追加，多数派确认才提交
- **安全性**：只有拥有最新日志的节点能当选

比 Paxos 好懂太多。回链主题笔记 [[系统设计：一致性与共识]]。

#分布式 #读书笔记`,
  },
  {
    id: 'k-demo-4',
    type: 'clip',
    title: '《Thinking in Systems》读书笔记',
    tags: ['读书笔记', '系统设计', '方法论'],
    c: [74, 20, 51],
    u: [5, 16, 33],
    body: `# 《Thinking in Systems》读书笔记

> 系统 = 元素 + 连接 + 目标。改变连接与目标，往往比替换元素更有杠杆。

- **存量与流量**：浴缸模型，理解延迟与惯性
- **反馈回路**：平衡回路求稳、增强回路求变
- **杠杆点**：越靠近范式，撬动力越大

延伸到 [[系统设计：一致性与共识]]——分布式系统本质也是一组反馈回路。方法论层面呼应 [[第二大脑方法论]]。

#读书笔记 #系统设计`,
  },
  {
    id: 'k-demo-17',
    title: '灵感：把标签做成颜色可视化',
    tags: ['灵感', '编辑器', '效率'],
    c: [4, 23, 5],
    u: [4, 23, 5],
    body: `随手记：库页的标签 chip 按内容 hash 生成稳定色，概览的 treemap 也复用同一套配色。

可以顺带给 [[第二大脑方法论]] 的笔记加一层「主题色」提示。

#灵感 #效率`,
  },
  {
    id: 'k-demo-37',
    title: '灵感：用图谱视图看笔记网络',
    tags: ['灵感', 'pkm', '编辑器'],
    c: [9, 13, 47],
    u: [9, 13, 47],
    body: `# 灵感：用图谱视图看笔记网络

把 [[wikilink]] 反向链接渲染成力导向图，孤岛笔记一眼可见——正好落地 [[Zettelkasten 落地实践]] 的第一条规则。

节点大小按入链数，颜色按标签（复用 [[灵感：把标签做成颜色可视化]] 的配色）。

#灵感 #pkm`,
  },
  {
    id: 'k-demo-38',
    title: '灵感：语音随手记接入',
    tags: ['灵感', 'ai', '效率'],
    c: [0, 8, 20],
    u: [0, 8, 20],
    body: `散步时的想法总丢。想接一个语音 → 转写 → 落进收集箱的快捷入口，转写走本地模型。

清理流程仍走 [[第二大脑方法论]] 的收集箱当天清空约定。

#灵感 #ai`,
  },
  {
    id: 'k-demo-18',
    title: '待读清单',
    tags: ['读书笔记', '效率'],
    c: [1, 21, 30],
    u: [1, 21, 30],
    body: `# 待读清单

- 《Domain-Driven Design》—— 给 [[项目：Life OS 云同步]] 的领域建模打底
- 一篇讲 CRDT 的长文 —— 无主复制的另一条路，呼应 [[系统设计：一致性与共识]]
- 缓存一致性综述 —— 补 [[系统设计：缓存策略]]
- 《How to Take Smart Notes》二刷 —— 见 [[《How to Take Smart Notes》读书笔记]]

#读书笔记`,
  },
]

/** 构建全套 demo 条目（~40 条，宽松字段直接就是 KItem）。 */
export function buildDemoItems() {
  return SPECS.map((s) => ({
    id: s.id,
    type: s.type ?? 'note',
    title: s.title,
    body: s.body,
    url: s.url ?? '',
    tags: s.tags,
    pinned: s.pinned ?? false,
    createdAt: at(s.c),
    updatedAt: at(s.u ?? s.c),
    ...(s.meta ? { _meta: s.meta } : {}),
  }))
}
