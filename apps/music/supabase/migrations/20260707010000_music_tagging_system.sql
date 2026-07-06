-- MUSIC.OS · 三层标签 + 音频特征 + 行为事件 + 推荐 RPC（方案 A+）
-- 主键沿用 music_track_meta (user_id, track_id)；不另建 tracks 表。

create extension if not exists vector with schema extensions;

-- ── 标签字典（全局只读）────────────────────────────────────────
create table if not exists music.tag_dictionary (
  slug text primary key,
  namespace text not null check (namespace in (
    'genre', 'style', 'vibe', 'context', 'language', 'quality', 'version', 'source'
  )),
  label text not null,
  description text not null default '',
  parent_slug text references music.tag_dictionary (slug) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tag_dictionary_namespace_idx
  on music.tag_dictionary (namespace, is_active);

alter table music.tag_dictionary enable row level security;

drop policy if exists "tag_dictionary_select_all" on music.tag_dictionary;
create policy "tag_dictionary_select_all"
  on music.tag_dictionary for select
  to authenticated, anon
  using (is_active = true);

-- ── 曲目 enrichment（身份 / 质量 / 打标状态）────────────────────
create table if not exists music.track_enrichment (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  file_hash text,
  language text,
  release_year int,
  isrc text,
  musicbrainz_recording_id text,
  acoustid text,
  codec text,
  bitrate_kbps int,
  sample_rate int,
  source_quality text check (source_quality is null or source_quality in (
    'low-quality', 'standard-quality', 'high-compressed', 'lossless', 'needs-review'
  )),
  version_type text check (version_type is null or version_type in (
    'original', 'remix', 'cover', 'live', 'sped-up', 'slowed', 'instrumental', 'radio-edit', 'explicit', 'clean'
  )),
  is_live boolean not null default false,
  is_remix boolean not null default false,
  is_cover boolean not null default false,
  is_duplicate boolean not null default false,
  tagging_status text not null default 'pending' check (tagging_status in (
    'pending', 'partial', 'ready', 'needs_review'
  )),
  tag_confidence_avg numeric,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id),
  foreign key (user_id, track_id)
    references music.music_track_meta (user_id, track_id) on delete cascade
);

alter table music.track_enrichment enable row level security;

create policy "track_enrichment_select_own" on music.track_enrichment
  for select using ((select auth.uid()) = user_id);
create policy "track_enrichment_insert_own" on music.track_enrichment
  for insert with check ((select auth.uid()) = user_id);
create policy "track_enrichment_update_own" on music.track_enrichment
  for update using ((select auth.uid()) = user_id);
create policy "track_enrichment_delete_own" on music.track_enrichment
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists track_enrichment_updated_at on music.track_enrichment;
create trigger track_enrichment_updated_at
  before update on music.track_enrichment
  for each row execute function private.set_updated_at();

-- ── 曲目标签（多来源 + 置信度）──────────────────────────────────
create table if not exists music.track_tags (
  user_id uuid not null,
  track_id text not null,
  tag_slug text not null references music.tag_dictionary (slug) on delete cascade,
  confidence numeric not null default 1.0 check (confidence >= 0 and confidence <= 1),
  source text not null check (source in (
    'manual', 'filename', 'musicbrainz', 'lastfm', 'essentia', 'llm', 'user_behavior', 'heuristic'
  )),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id, tag_slug, source),
  foreign key (user_id, track_id)
    references music.music_track_meta (user_id, track_id) on delete cascade
);

create index if not exists track_tags_user_tag_idx
  on music.track_tags (user_id, tag_slug);

create index if not exists track_tags_user_track_idx
  on music.track_tags (user_id, track_id);

alter table music.track_tags enable row level security;

create policy "track_tags_select_own" on music.track_tags
  for select using ((select auth.uid()) = user_id);
create policy "track_tags_insert_own" on music.track_tags
  for insert with check ((select auth.uid()) = user_id);
create policy "track_tags_update_own" on music.track_tags
  for update using ((select auth.uid()) = user_id);
create policy "track_tags_delete_own" on music.track_tags
  for delete using ((select auth.uid()) = user_id);

-- ── 音频特征 ────────────────────────────────────────────────────
create table if not exists music.track_audio_features (
  user_id uuid not null,
  track_id text not null,
  bpm numeric,
  musical_key text,
  loudness_lufs numeric,
  energy numeric check (energy is null or (energy >= 1 and energy <= 5)),
  danceability numeric check (danceability is null or (danceability >= 1 and danceability <= 5)),
  valence numeric check (valence is null or (valence >= 1 and valence <= 5)),
  acousticness numeric,
  instrumentalness numeric,
  vocal_presence numeric check (vocal_presence is null or (vocal_presence >= 1 and vocal_presence <= 5)),
  intro_length_sec numeric,
  outro_fade boolean,
  analyzed_at timestamptz not null default now(),
  primary key (user_id, track_id),
  foreign key (user_id, track_id)
    references music.music_track_meta (user_id, track_id) on delete cascade
);

alter table music.track_audio_features enable row level security;

create policy "track_audio_features_select_own" on music.track_audio_features
  for select using ((select auth.uid()) = user_id);
create policy "track_audio_features_insert_own" on music.track_audio_features
  for insert with check ((select auth.uid()) = user_id);
create policy "track_audio_features_update_own" on music.track_audio_features
  for update using ((select auth.uid()) = user_id);
create policy "track_audio_features_delete_own" on music.track_audio_features
  for delete using ((select auth.uid()) = user_id);

-- ── 向量（后续 semantic 召回；A+ 可先空表）────────────────────────
create table if not exists music.track_embeddings (
  user_id uuid not null,
  track_id text not null,
  embedding extensions.vector(1536),
  embedding_text text not null default '',
  model text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id),
  foreign key (user_id, track_id)
    references music.music_track_meta (user_id, track_id) on delete cascade
);

alter table music.track_embeddings enable row level security;

create policy "track_embeddings_select_own" on music.track_embeddings
  for select using ((select auth.uid()) = user_id);
create policy "track_embeddings_insert_own" on music.track_embeddings
  for insert with check ((select auth.uid()) = user_id);
create policy "track_embeddings_update_own" on music.track_embeddings
  for update using ((select auth.uid()) = user_id);
create policy "track_embeddings_delete_own" on music.track_embeddings
  for delete using ((select auth.uid()) = user_id);

-- ── 播放行为（推荐闭环）──────────────────────────────────────────
create table if not exists music.play_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  event_type text not null check (event_type in (
    'play', 'complete', 'skip', 'like', 'dislike', 'replay',
    'add_to_playlist', 'remove_from_playlist', 'search_play'
  )),
  position_sec int,
  played_ratio numeric,
  context text,
  created_at timestamptz not null default now(),
  foreign key (user_id, track_id)
    references music.music_track_meta (user_id, track_id) on delete cascade
);

create index if not exists play_events_user_track_idx
  on music.play_events (user_id, track_id, created_at desc);

alter table music.play_events enable row level security;

create policy "play_events_select_own" on music.play_events
  for select using ((select auth.uid()) = user_id);
create policy "play_events_insert_own" on music.play_events
  for insert with check ((select auth.uid()) = user_id);

-- ── 人工 review 队列 ───────────────────────────────────────────
create table if not exists music.tag_review_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  reason text not null,
  confidence numeric,
  proposed_tags jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (user_id, track_id)
    references music.music_track_meta (user_id, track_id) on delete cascade
);

create index if not exists tag_review_queue_user_status_idx
  on music.tag_review_queue (user_id, status, created_at desc);

alter table music.tag_review_queue enable row level security;

create policy "tag_review_queue_select_own" on music.tag_review_queue
  for select using ((select auth.uid()) = user_id);
create policy "tag_review_queue_insert_own" on music.tag_review_queue
  for insert with check ((select auth.uid()) = user_id);
create policy "tag_review_queue_update_own" on music.tag_review_queue
  for update using ((select auth.uid()) = user_id);
