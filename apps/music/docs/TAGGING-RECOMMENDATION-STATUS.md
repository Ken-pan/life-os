# MUSIC.OS · 标签与推荐系统 · 状态报告

> **报告日期：** 2026-07-06（A++ 闭环更新）  
> **范围：** 三层标签架构（Identity → Audio → Semantic）+ pgvector 混合推荐 + 自动续播  
> **对照方案：** 设计文档「方案 A+」→ **「A++ 可用闭环」** →「方案 B」  
> **主账号 / 曲库：** `c2831538-94b0-4a57-b034-5e873a53c42e`（268 首云端曲目）  
> **生产部署：** https://musicos-ken.netlify.app（commit `4c946d5`，2026-07-06 CLI deploy）

---

## A++ 闭环进度（2026-07-06 晚）

| 任务 | 状态 |
|------|------|
| Commit + deploy 推荐/play_events 代码 | ✅ `4c946d5` → Netlify 生产 |
| LLM 批量补标 partial | ✅ 121 首 → **243 ready / 25 partial** |
| RPC v2：降低 pop 权重 + play_events 行为分 | ✅ migration `20260707010200` |
| UI 展示 reasons / matched_tags | ✅ 队列「相似续播」下方推荐原因区 |
| 生产 play_events 验证 | ⏳ **需你登录生产站播放后验收**（当前云端 0 条） |
| track_id 本地/云端一致性 | ⏳ 需 sync 后点「相似续播」实测 |

**综合准备度更新：51 → ~62**（标签与 RPC 已提升；行为闭环待生产验证）

---

## 1. 执行摘要

### 1.1 一句话结论

**基础设施和数据管道已经搭好，K-pop / 女 pop / club 向的「相似续播」可以开始试用；但距离设计文档里的「可解释 + 可搜索 + 可推荐 + 可自动续播」完整愿景，整体准备度约 45–50%。**

### 1.2 准备度评分（0–100）

| 维度 | 分数 | 权重 | 加权 |
|------|------|------|------|
| 数据库 Schema & RLS | 88 | 15% | 13.2 |
| 标签词表 & 数据覆盖 | 58 | 20% | 11.6 |
| 打标 Pipeline（自动化） | 42 | 15% | 6.3 |
| 推荐算法（召回 + 重排） | 38 | 20% | 7.6 |
| 前端产品化（行为闭环 + UI） | 52 | 15% | 7.8 |
| 运维 / 可重复部署 | 35 | 10% | 3.5 |
| 身份识别 & 音频分析深度 | 18 | 5% | 0.9 |
| **综合** | — | 100% | **≈ 51** |

**解读：**

- **对你当前曲库口味（K-pop solo、girl crush、baddie、Dua Lipa、RAYE 系）**，实际可用度 **偏高（~65–70%）**，因为启发式规则就是按这批上传文件夹写的。
- **对全库均衡推荐、发现新歌、跨语种 bridge**，实际可用度 **偏低（~35–40%）**，因为 121 首仍是 `partial`，大量 Western pop 只有泛化 `pop` 标签。
- **对「越用越准」**，目前 **几乎为 0**：`play_events` 表已建、前端已接线，但云端 **0 条事件**，且推荐 RPC **尚未读取** 行为数据。

---

## 2. 与设计文档的对照

设计文档要求的核心等式：

```txt
identity metadata
+ audio features
+ semantic tags
+ user behavior
+ vector embedding
→ hybrid recommender（vector + tag + behavior + 重排）
```

### 2.1 已实现 vs 未实现

| 设计模块 | 方案 A+ 要求 | 当前状态 | 完成度 |
|----------|----------------|----------|--------|
| 正规化表结构（非 `tags[]`） | ✅ | `tag_dictionary` / `track_tags` / `track_enrichment` / `track_audio_features` / `play_events` / `tag_review_queue` / `track_embeddings` | **100%** |
| 标签词表 v1 seed | ✅ | 82 条（genre 27 / vibe 22 / context 12 / version 10 / quality 7 / language 4） | **100%** |
| ffprobe 扫库 | ✅ | `enrich-track-tags.mjs` 已从 Storage 下载 + ffprobe | **90%** |
| filename / 专辑名解析 | ✅ | 启发式 + 艺术家名单匹配 | **75%** |
| LLM 语义标签 | 可选 A+ | **未做** | **0%** |
| AcoustID / MusicBrainz | 方案 B | **未做** | **0%** |
| Last.fm 外部 tags | 方案 B | **未做** | **0%** |
| Essentia BPM/key/energy | 方案 B | energy/danceability 为**规则推断**，非真实分析；BPM=0 | **10%** |
| pgvector embedding | 方案 B | 表已建，**无数据、无索引、RPC 未用** | **5%** |
| 推荐 RPC | ✅ 简版 | `get_recommendations` + `continue_playlist`（纯标签+启发式 audio） | **55%** |
| play_events 行为闭环 | ✅ | DB + 前端 insert；**推荐未消费** | **40%** |
| 人工 review 队列 | ✅ | 表已建；脚本逻辑有；当前 pending **0**（needs-review 进了 tags 未进 queue） | **30%** |
| 前端相似续播 | ✅ | 队列「相似续播」按钮 + 队列结束自动续播 | **70%** |
| 可解释 reason 展示 | 期望 | RPC 返回 `reasons` / `matched_tags`，**UI 未展示** | **20%** |

---

## 3. 云端数据实况（2026-07-06 查询）

### 3.1 曲库规模

| 指标 | 数值 |
|------|------|
| `music_track_meta` 总行数（你的账号） | **268** |
| 有 `storage_path`（可云端播放） | **268（100%）** |
| 已跑 enrichment | **268（100%）** |

上传来源摘要（历史批次）：

- 怪可爱 / Rap / TikTok 感（~19）
- RAYE / Tate / Doja / Ariana / Halsey（~20）
- BLACKPINK 成员 solo（~20）
- K-Pop Girl Crush（~20）
- Dua Lipa（~20）
- 另有更早同步的 ~169 首

### 3.2 打标状态分布

| `tagging_status` | 曲目数 | 占比 |
|------------------|--------|------|
| `ready` | 147 | 54.9% |
| `partial` | 121 | 45.1% |
| `needs_review` | 0 | 0% |

> **说明：** `partial` 曲目大多仍带 `pop` + 质量标签，但 vibe/genre 不够细；`needs-review` 作为 **tag** 有 111 首，但未全部进入 `tag_review_queue` 表。

| 指标 | 数值 |
|------|------|
| `track_tags` 总行数 | **1,915**（约 7.1 tags/曲） |
| 平均 `tag_confidence_avg` | **0.737** |
| `track_audio_features` 有 BPM | **0** |
| `track_embeddings` 有向量 | **0** |
| `play_events` | **0**（前端刚接线，尚未部署/日常使用） |

### 3.3 标签分布（Top）

**Vibe（强项 — 符合你的 taste profile）**

| 标签 | 覆盖曲目数 |
|------|------------|
| club | 84 |
| girl-crush | 56 |
| baddie | 56 |
| confident | 45 |
| dramatic | 39 |
| meme / quirky | 11 each |

**Genre（弱点 — pop 过载）**

| 标签 | 覆盖曲目数 |
|------|------------|
| pop | **187**（69.8% 曲库） |
| dance-pop | 72 |
| k-pop | 56 |
| girl-group | 35 |
| k-pop-solo | 21 |
| hip-hop / edm | ≤11 |

**质量**

| `source_quality` | 数量 |
|------------------|------|
| high-compressed（≈320kbps MP3） | 265 |
| standard-quality | 3 |

### 3.4 推荐 smoke test（已验证）

Seed：**JENNIE – ZEN** → `same_vibe` Top 结果：

1. LISA – Born Again ft. Doja Cat & RAYE
2. JISOO – All Eyes On Me
3. ROSÉ – APT.
4. LISA – LALISA
5. JENNIE – ExtraL

**结论：** 在 K-pop solo / girl crush 簇内，标签召回 **有效**。

---

## 4. 技术架构现状

### 4.1 数据库（Supabase · `music` schema）

**已应用 migration（远程 + `schema_migrations` 已记录）：**

| 文件 | 内容 |
|------|------|
| `20260705180000_music_core_schema.sql` | 核心：`music_track_meta`、歌单、用户状态 |
| `20260706003048_music_audio_storage.sql` | Storage 路径、`size_bytes` |
| `20260706010000_track_meta_lyrics.sql` | 歌词字段 |
| `20260706030000_track_meta_art_remote.sql` | 封面 remote URL |
| `20260707010000_music_tagging_system.sql` | 标签体系全套表 + RLS |
| `20260707010100_music_tag_seed_and_rpc.sql` | 词表 seed + 推荐 RPC |

**主键设计（重要）：** 未另建 `tracks` 表；`track_id` = 文件 SHA256，与 Storage 路径 `{user_id}/{track_id}.mp3` 一致。

### 4.2 打标 Pipeline

**脚本：** `apps/music/scripts/enrich-track-tags.mjs`

```txt
Supabase Storage 下载
  → ffprobe（codec / bitrate / duration / sample_rate）
  → 文件名 + 专辑名 + 艺术家启发式
  → upsert track_enrichment / track_tags / track_audio_features
  → 可选 tag_review_queue（低置信度）
```

**置信度来源（当前仅 `heuristic` + 隐含 `filename`）：**

| 来源 | 状态 |
|------|------|
| manual | 未做 UI |
| musicbrainz / lastfm | 未接入 |
| essentia | 未接入 |
| llm | 未接入 |
| heuristic | ✅ 唯一主力 |

**已知已修复问题：** `boygenius` 因子串 `iu` 误标 K-pop → 已改为词边界匹配。

### 4.3 推荐 RPC（v1 · 无 embedding）

**`music.get_recommendations(seed, mode, limit, exclude[])`**

重排因子（简化版）：

```txt
score ≈
  0.45 × tag_overlap（vibe 0.35 / genre 0.20 / context 0.15）
+ 0.10 × enrich_confidence
+ 0.12 × energy 接近（启发式 energy，非真实 BPM）
+ 0.08 × danceability 接近
+ quality bonus（high-compressed / lossless）
+ play_count / liked 轻权重
− 24h 内 skip 过滤
− duplicate / needs_review 过滤
```

**`music.continue_playlist(playlist_id, mode, limit)`** — 取歌单最后一首作 seed，排除已在歌单内的曲目。

**未实现的设计项：**

- 向量相似度 50% 召回
- 行为 / co-occurrence 25% 召回
- 多样性控制（同 artist 连播上限等）仅在 RPC 有部分过滤，无显式 diversity pass
- 多 seed 加权（最近 5–10 首）— `continue_playlist` 只用最后一首

### 4.4 前端集成

| 模块 | 文件 | 状态 |
|------|------|------|
| play_events 上报 | `playEvents.js` ← `musicInteractions.js` / `db.toggleLike` | ✅ 已写 |
| 推荐客户端 | `recommendations.js` | ✅ 已写 |
| 相似续播按钮 | `QueueList.svelte` | ✅ 已写 |
| 队列结束自动续播 | `player.svelte.js` + `autoContinueSimilar` 设置 | ✅ 默认开 |
| reason / matched_tags UI | — | ❌ |
| 设置页自动续播开关 | — | ❌（仅有 localStorage 字段） |
| 首页 / Quick picks 用推荐 | — | ❌ |
| `continue_playlist` RPC 前端封装 | — | ❌ |

**部署状态：** 生产站 [musicos-ken.netlify.app](https://musicos-ken.netlify.app) 最后一次 deploy 为 **Apple 风 Now Playing**（commit `5801433`），**标签/推荐/ play_events 相关代码尚未 commit & deploy**。

---

## 5. 分层准备度详解

### 5.1 Layer A — Identity 元数据

| 字段 | 状态 |
|------|------|
| title / artist / album | ✅ `music_track_meta` + ID3 / 文件名 |
| duration | ⚠️ enrichment 后 ffprobe 回写；上传脚本初始为 0 |
| file_hash / track_id | ✅ SHA256 |
| storage_path / size / codec / bitrate | ✅ |
| language / release_year / isrc | ❌ 未填 |
| musicbrainz_recording_id / acoustid | ❌ 未填 |

**准备度：~60%** — 播放和去重够用；跨库精准匹配不够。

### 5.2 Layer B — Audio 特征

| 字段 | 状态 |
|------|------|
| codec / bitrate / sample_rate | ✅ ffprobe |
| bpm / musical_key / loudness_lufs | ❌ |
| energy / danceability / valence | ⚠️ **按 vibe 规则赋值 1–5，非音频分析** |
| intro_length / outro_fade | ❌ |

**准备度：~20%** — 推荐里的「energy flow」目前是 **标签代理**，不是真实听感连续。

### 5.3 Layer C — Semantic 标签

| 维度 | 状态 |
|------|------|
| 词表结构（namespace / slug / parent） | ✅ |
| 多来源 + confidence + source | ✅ 表结构；来源单一 |
| vibe / context 对你口味 | ✅ 较强 |
| genre 细粒度 | ⚠️ 大量 `pop` fallback |
| version（remix/live/sped-up） | ⚠️ 仅文件名关键词 |
| quality 标签 | ✅ high-compressed 覆盖 99% |

**准备度：~55%** — 结构完整，语义深度不均衡。

### 5.4 Layer D — User Behavior

| 项目 | 状态 |
|------|------|
| `play_events` 表 | ✅ |
| 前端 play / skip / complete / like | ✅ 已接线 |
| 云端实际数据 | **0 条** |
| 推荐 RPC 读取 play_events | ❌（仅 24h skip 惩罚） |
| 本地 `interactions` IndexedDB | ✅ 已有，用于 Speed Dial 等 |

**准备度：~25%** — 管道就绪，闭环未转起来。

### 5.5 Layer E — Vector Embedding

| 项目 | 状态 |
|------|------|
| `track_embeddings` 表 + vector(1536) | ✅ |
| embedding 生成 | ❌ |
| HNSW / IVFFlat 索引 | ❌ |
| RPC vector 召回 | ❌ |

**准备度：~5%** — 仅占位。

---

## 6. 为什么整体是 ~50% 而不是更高/更低

### 6.1 比 30% 高的原因

1. **Schema 一次到位**：没有走 `tags text[]` 的弯路；RLS、`user_id`、多来源 confidence 都考虑了。
2. **268 首全量 enrichment**：不是空库 demo；quality、Storage、meta 齐。
3. **推荐 RPC 真实跑通**：JENNIE seed 结果合理，说明 tag 召回 + 重排 **最小闭环成立**。
4. **前端关键路径已接**：play_events、相似续播、自动续播 — 差 deploy 和日常使用积累数据。
5. **词表贴合你的真实 taste**（baddie / girl-crush / club），不是泛 Spotify genre。

### 6.2 比 70% 低的原因

1. **121 首（45%）仅 partial**：Western pop / indie / 非规则 artist 几乎只有 `pop`，推荐会 **趋同、无聊**。
2. **无真实 audio features**：BPM/key/energy 全是推断，「接歌体验」「gym 模式」等设计场景 **无法兑现**。
3. **无 identity 解析**：同名曲、live/remix 误判风险仍在；设计文档强调的 AcoustID 未做。
4. **行为闭环空转**：`play_events = 0`，协同信号、skip 惩罚、affinity 权重名存实亡。
5. **无 embedding**：设计文档的 hybrid 50% vector 召回完全缺失。
6. **工程债**：migration / 新脚本 / 前端改动 **大量未 commit**；README 仍指向旧 `MusicOS` 路径；无 CI 步骤跑 enrichment。

---

## 7. 风险与已知问题

| 风险 | 严重度 | 说明 |
|------|--------|------|
| 泛 `pop` 标签稀释推荐 | 高 | 187/268 带 pop；不同 artist 被当成相似 |
| 启发式 artist 误匹配 | 中 | 已修 `iu`；其他短 token 仍可能误伤 |
| 本地 IndexedDB 与云端 track_id 不一致 | 中 | 推荐 RPC 返回 id 需在本地存在；未 sync 则「相似续播」空 |
| play_events 未部署 | 中 | 行为数据无法积累 |
| 推荐不读 embedding / co-occurrence | 中 | 长期质量天花板低 |
| `tag_review_queue` 与 `needs-review` tag 脱节 | 低 | 111 首标了 needs-review 但 queue pending=0 |
| `continue_playlist` 未接 UI | 低 | 仅从单曲 seed 续播 |
| Spotify API 依赖 | 无 | 正确避开 |

---

## 8. 按使用场景的准备度

| 场景 | 准备度 | 说明 |
|------|--------|------|
| K-pop solo 队列续播（JENNIE→LISA→ROSÉ） | **70%** | 已验证 |
| Girl crush / baddie 歌单延续 | **65%** | 标签覆盖好 |
| Dua / club / dance-pop 簇 | **60%** | dance-pop 72 首 |
| Western pop 混合发现 | **35%** | partial 多 |
| 健身 / BPM 稳定续播 | **15%** | 无 BPM |
| 夜车 / night-drive 模式 | **40%** | 标签少，靠 heuristic |
| 越用越准（行为学习） | **10%** | 无数据、未进 RPC |
| 首页智能推荐 | **20%** | 未接 UI |
| 跨语种 bridge（K-pop → Western） | **30%** | 设计有，未实现模式 |

---

## 9. 代码与运维清单

### 9.1 新增 / 修改的关键文件（**多数未 commit**）

```
apps/music/
  docs/TAGGING-RECOMMENDATION-STATUS.md     ← 本报告
  scripts/enrich-track-tags.mjs             ← 打标 pipeline（新）
  scripts/bulk-upload-music.mjs             ← 批量上传（改）
  src/lib/playEvents.js                     ← 新
  src/lib/recommendations.js                ← 新
  src/lib/musicInteractions.js              ← +云端 sync
  src/lib/player.svelte.js                  ← 自动续播
  src/lib/components/QueueList.svelte       ← 相似续播按钮
  src/lib/supabaseTables.js                 ← 新表名
  src/lib/state.svelte.js                   ← autoContinueSimilar
  supabase/migrations/
    20260707010000_music_tagging_system.sql
    20260707010100_music_tag_seed_and_rpc.sql
```

### 9.2 常用命令

```bash
# 打标 / 重跑全库
cd apps/music
SUPABASE_SERVICE_ROLE_KEY=... node scripts/enrich-track-tags.mjs <userId>

# 应用 migration（若新环境）
./scripts/supabase-sql.sh -f apps/music/supabase/migrations/20260707010000_music_tagging_system.sql
./scripts/supabase-sql.sh -f apps/music/supabase/migrations/20260707010100_music_tag_seed_and_rpc.sql

# 前端开发
cd apps/music && npm run dev
```

---

## 10. 与设计路线图的对齐

### 方案 A+（1–2 天）— **约 75% 完成**

| Step | 状态 |
|------|------|
| 建表 + seed | ✅ |
| ffprobe 扫 Storage | ✅ |
| filename 解析 | ✅ |
| LLM genre/vibe/context | ❌ |
| 简单推荐公式 | ✅ RPC |
| 前端续播 | ✅（未 deploy） |
| play_events | ✅（未 deploy / 无数据） |

### 方案 B（4–7 天）— **约 15% 完成**

| Step | 状态 |
|------|------|
| AcoustID / MusicBrainz | ❌ |
| Last.fm tags | ❌ |
| Essentia 分析 | ❌ |
| LLM + confidence 合并 | ❌ |
| pgvector + embedding RPC | ❌（表 only） |
| play_events 驱动重排 | ❌ |

---

## 11. 建议优先级（Next Steps）

### P0 — 让现有能力「真正可用」（0.5–1 天）

1. **Commit + deploy** 当前 music 改动到 Netlify
2. 登录生产站，播放几首，确认 `play_events` 开始写入
3. 本地 sync 确保 268 首 `track_id` 与云端一致（否则续播空）

### P1 — 把 partial 121 首拉上来（0.5–1 天）

4. **LLM batch 打标**：输入 title/artist/album + 现有 heuristic，输出 vibe/genre/context
5. 或接 **MusicBrainz** 拉 genre（比 LLM 便宜、可解释）

### P2 — 推荐质量上限（2–4 天）

6. Essentia / librosa 本地批处理 → 真 BPM + energy
7. embedding 生成 + pgvector 索引 + RPC 混合召回
8. play_events 加权进 `get_recommendations`
9. UI 展示 `reasons` / `matched_tags`

### P3 — 产品化

10. 设置页：`autoContinueSimilar` 开关
11. 首页 Quick picks 接推荐
12. `tag_review_queue` 简易 review UI
13. CI：migration check + enrichment dry-run

---

## 12. 最终判断

**你现在拥有的是一套「Schema 成熟、K-pop 向标签较准、标签推荐 MVP 已通、前端刚接线」的系统。**

它 **已经能** 在你最常在听的簇（K-pop solo / girl crush / baddie / club）里做 **可解释的相似续播**。

它 **还不能** 胜任设计文档里的完整 hybrid recommender：无向量、无真实音频、无行为学习、近半曲库标签偏粗、生产未 deploy。

**综合准备度：51 / 100（个人 K-pop 主场景可用度 ~68 / 100）。**

下一刀最值得砍的是：**deploy + play_events 跑起来 + LLM/MusicBrainz 补 partial 121 首** — 这三项做完，整体可快速拉到 **~65–70**。

---

*本报告由开发会话自动生成，数据来自 Supabase 实查与代码库静态分析。*
