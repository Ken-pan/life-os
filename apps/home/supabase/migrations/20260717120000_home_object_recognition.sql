-- HomeOS · 物体识别层(P0 数据契约:跨扫描认亲 + 视觉 embedding)。
-- 目标:让「同一件家具跨多次扫描」有独立的可累积载体,并给 DINOv2 视觉
-- 实例特征一个版本化的落点 —— 现有 home.scans/payload 只到「每次扫描的
-- pl-N/fx-N 观察」为止,没有跨扫描的永久身份、没有多次观察的历史、没有
-- 视觉 embedding。这两张表就是补这三样,**加法式**:不动 scans/payload,
-- 网页现有拉取/合并链路一个字节都不用改(embedding 只作正向 bonus 叠加)。
--
-- 采集端不变:iOS 早已把多角度裁剪 JPEG 传进 home-scan-photos 桶
-- (obj-{observationId}-{k}.jpg)。P0 的接入是 Mac 侧离线批处理服务从桶里
-- 拉裁剪算 embedding 写 object_embeddings —— 不碰 LAN/Bonjour,走现有云链路。
--
-- ⚠️ 部署照 supabase/README.md「从零复现 / 新增迁移」:禁止 db push;用
--    scripts/supabase-sql.sh -f 应用,再注册进 schema_migrations。home schema
--    已在 PostgREST exposed(scans 那次已 PATCH),这次无需再动 exposed schemas。
-- 契约三处同源:本文件 · apps/home/supabase/README.md · types.js
--   (ObjectObservation / ObjectEmbedding typedef)。改一处三处同步。

-- ── 观察历史:一行 = 某次扫描里的某个物体(pl-N/fx-N) ──────────────────────
-- 是 scans.payload 里埋着的 per-object 数据的**规范化投影**,额外加两样:
--   ① canonical_object_id —— 跨扫描永久身份(承接 scan-merge carryUserAuthored
--      现有的 id 延续语义,promote 成独立一等字段);同一件家具的历次观察共享它。
--   ② match —— 匹配器对这次观察的判定 + 候选打分 + 证据(P0「保存所有候选分数
--      和最终决定」的落点,升级规则后可回放对比,防准确率倒退)。
-- 事实字段(dims/color/dhash/photo_paths)一次扫描定死、不该改;可回写的只有
-- canonical_object_id 与 match(模型/规则升级后重算认亲结果)。
create table if not exists home.object_observations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scan_id uuid not null,
  observation_id text not null,            -- 那次扫描的 pl-N / fx-N(payload 内 id)
  canonical_object_id text,                -- 跨扫描永久身份;未认亲前为 null
  kind text,
  label text,
  dims jsonb not null default '{}'::jsonb,  -- { wIn, hIn, heightIn?, elevIn? } LiDAR 实测
  color_hex text,
  color_confidence real,
  kind_confidence real,
  dhash text,                              -- 最佳裁剪的感知哈希(16 hex,与 photo-hash.js 同源)
  photo_paths text[] not null default '{}',-- 多角度裁剪桶内路径(obj-{observation_id}-{k}.jpg)
  azimuths real[] not null default '{}',   -- 与 photo_paths 同序的方位角(度),可空
  observed_at bigint not null,             -- 客户端毫秒(= scan updated_at / capturedAt)
  match jsonb not null default '{}'::jsonb,-- { state, chosenCanonicalId, candidates[], resolver,
                                           --   modelVersion, calibrationVersion } 见 README/types
  v int not null default 1,
  primary key (user_id, scan_id, observation_id)
);

alter table home.object_observations enable row level security;

-- 四条策略全限定本人行。事实不可变、认亲结果可回写,所以给全 update/delete
-- (不像 events 强制 append-only)。update 必须 using + with check 双给。
create policy "obj_obs_select_own" on home.object_observations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "obj_obs_insert_own" on home.object_observations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "obj_obs_update_own" on home.object_observations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "obj_obs_delete_own" on home.object_observations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- gallery:一件家具的历次观察;按永久身份聚。
create index if not exists obj_obs_canonical
  on home.object_observations (user_id, canonical_object_id);
create index if not exists obj_obs_user_observed
  on home.object_observations (user_id, observed_at desc);

-- ── 视觉 embedding:一行 = 某张裁剪在某个模型版本下的向量 ────────────────────
-- 版本化落点(提案 §1.2:别裸存 Float 数组当永久格式)。不引 pgvector ——
-- 单个家几十~上百件,匹配时把候选家具的向量全拉出来在服务端/JS 暴力余弦即可,
-- 无需 ANN,也就不在共享生产项目上启扩展。dim 显式存(不写死 768/1024/2048),
-- 模型升级换 model_version 追加新行、旧行留着可回放;同 model_version 重算走 upsert。
-- crop_recipe_version 变(裁剪边距/重采样改了)即视为需重算,不与旧向量混比。
create table if not exists home.object_embeddings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  photo_path text not null,                -- 这条向量对应的裁剪(桶内路径,全库唯一含 scanId)
  model_version text not null,             -- 版本化模型标识,如 'dinov2-vitb14@2026-07'
  scan_id uuid not null,
  observation_id text not null,
  canonical_object_id text,                -- 冗余一份便于按家具聚向量;认亲后回填
  dim int not null,                        -- 向量维数(不写死;随模型变)
  embedding real[] not null,               -- L2 归一化后的向量;余弦=点积
  calibration_version text,                -- 这批向量面向的匹配器校准版本
  source text,                             -- 产出来源(如 'mac-dinov2'/Vision revision),排查用
  crop_recipe_version text,                -- 裁剪配方版本;变了要重算,勿与旧向量混比
  created_at bigint not null,              -- 客户端/服务端毫秒
  v int not null default 1,
  primary key (user_id, model_version, photo_path)
);

alter table home.object_embeddings enable row level security;

-- 本人可见;可回算(同 model_version upsert)故给全 update/delete。
create policy "obj_emb_select_own" on home.object_embeddings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "obj_emb_insert_own" on home.object_embeddings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "obj_emb_update_own" on home.object_embeddings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "obj_emb_delete_own" on home.object_embeddings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 认亲时按「某件家具 + 某模型版本」把一 gallery 的向量一次拉齐。
create index if not exists obj_emb_canonical_model
  on home.object_embeddings (user_id, canonical_object_id, model_version);
