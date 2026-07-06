-- Tag dictionary v1 seed + 推荐 RPC（标签召回 + 重排）

insert into music.tag_dictionary (slug, namespace, label, description, parent_slug) values
  -- genre
  ('pop', 'genre', 'Pop', '流行', null),
  ('dance-pop', 'genre', 'Dance Pop', '舞曲流行', 'pop'),
  ('electropop', 'genre', 'Electropop', '电子流行', 'pop'),
  ('dark-pop', 'genre', 'Dark Pop', '暗色流行', 'pop'),
  ('alt-pop', 'genre', 'Alt Pop', '另类流行', 'pop'),
  ('k-pop', 'genre', 'K-Pop', '韩国流行', null),
  ('k-pop-solo', 'genre', 'K-Pop Solo', 'K-Pop 独唱', 'k-pop'),
  ('girl-group', 'genre', 'Girl Group', '女团', 'k-pop'),
  ('j-pop', 'genre', 'J-Pop', '日本流行', null),
  ('c-pop', 'genre', 'C-Pop', '华语流行', null),
  ('mandopop', 'genre', 'Mandopop', '国语流行', 'c-pop'),
  ('hip-hop', 'genre', 'Hip-Hop', '嘻哈', null),
  ('rap', 'genre', 'Rap', '说唱', 'hip-hop'),
  ('asian-hip-hop', 'genre', 'Asian Hip-Hop', '亚洲嘻哈', 'hip-hop'),
  ('r-and-b', 'genre', 'R&B', '节奏布鲁斯', null),
  ('alt-r-and-b', 'genre', 'Alt R&B', '另类 R&B', 'r-and-b'),
  ('edm', 'genre', 'EDM', '电子舞曲', null),
  ('house', 'genre', 'House', '浩室', 'edm'),
  ('techno', 'genre', 'Techno', ' techno', 'edm'),
  ('trance', 'genre', 'Trance', ' trance', 'edm'),
  ('melodic-techno', 'genre', 'Melodic Techno', '旋律 techno', 'edm'),
  ('hyperpop', 'genre', 'Hyperpop', '超流行', 'pop'),
  ('soundtrack', 'genre', 'Soundtrack', '原声', null),
  ('game-ost', 'genre', 'Game OST', '游戏原声', 'soundtrack'),
  ('anime', 'genre', 'Anime', '动漫', 'soundtrack'),
  ('ambient', 'genre', 'Ambient', '氛围', null),
  ('sleep', 'genre', 'Sleep', '助眠', 'ambient'),
  -- vibe
  ('baddie', 'vibe', 'Baddie', '冷脸自信时髦', null),
  ('girl-crush', 'vibe', 'Girl Crush', 'K-pop 女王感', null),
  ('runway', 'vibe', 'Runway', '走秀 / fashion', null),
  ('club', 'vibe', 'Club', '夜店 dancefloor', null),
  ('sexy', 'vibe', 'Sexy', '性感 R&B', null),
  ('quirky', 'vibe', 'Quirky', '怪可爱洗脑', null),
  ('meme', 'vibe', 'Meme', '梗歌魔性', null),
  ('dark', 'vibe', 'Dark', '阴暗压迫', null),
  ('euphoric', 'vibe', 'Euphoric', '爽感开阔', null),
  ('cute', 'vibe', 'Cute', '甜轻 bubble', null),
  ('dramatic', 'vibe', 'Dramatic', '戏剧大情绪', null),
  ('confident', 'vibe', 'Confident', '自信', null),
  ('rebellious', 'vibe', 'Rebellious', '叛逆', null),
  ('luxury', 'vibe', 'Luxury', '奢华', null),
  ('neon', 'vibe', 'Neon', '霓虹', null),
  ('night-drive', 'vibe', 'Night Drive', '夜车', null),
  ('soft', 'vibe', 'Soft', '柔软', null),
  ('sad', 'vibe', 'Sad', '伤感', null),
  ('angry', 'vibe', 'Angry', '愤怒', null),
  ('playful', 'vibe', 'Playful', ' playful', null),
  ('cinematic', 'vibe', 'Cinematic', '电影感', null),
  ('boss-fight', 'vibe', 'Boss Fight', '战斗/游戏能量', null),
  -- context
  ('homepage-safe', 'context', 'Homepage Safe', '首页安全推荐', null),
  ('playlist-continue-good', 'context', 'Playlist Continue', '适合自动续播', null),
  ('gym', 'context', 'Gym', '健身训练', null),
  ('walking', 'context', 'Walking', '步行', null),
  ('running', 'context', 'Running', '跑步', null),
  ('party', 'context', 'Party', '派对', null),
  ('focus', 'context', 'Focus', '专注', null),
  ('shower', 'context', 'Shower', '洗澡', null),
  ('game', 'context', 'Game', '游戏', null),
  ('background', 'context', 'Background', '背景音', null),
  ('karaoke', 'context', 'Karaoke', '卡拉 OK', null),
  ('transition-safe', 'context', 'Transition Safe', '接歌过渡友好', null),
  -- version
  ('original', 'version', 'Original', '原版', null),
  ('remix', 'version', 'Remix', '混音', null),
  ('cover', 'version', 'Cover', '翻唱', null),
  ('live', 'version', 'Live', '现场', null),
  ('sped-up', 'version', 'Sped Up', '加速版', null),
  ('slowed', 'version', 'Slowed', '减速版', null),
  ('instrumental', 'version', 'Instrumental', '纯音乐', null),
  ('radio-edit', 'version', 'Radio Edit', '电台版', null),
  ('explicit', 'version', 'Explicit', '脏版', null),
  ('clean', 'version', 'Clean', '净版', null),
  -- quality
  ('low-quality', 'quality', 'Low Quality', '低音质', null),
  ('standard-quality', 'quality', 'Standard', '标准音质', null),
  ('high-compressed', 'quality', 'High Compressed', '高码率有损', null),
  ('lossless', 'quality', 'Lossless', '无损', null),
  ('needs-review', 'quality', 'Needs Review', '待人工确认', null),
  ('duplicate', 'quality', 'Duplicate', '重复文件', null),
  ('bad-metadata', 'quality', 'Bad Metadata', '元数据缺失/错误', null),
  -- language hints
  ('lang-en', 'language', 'English', '英语', null),
  ('lang-ko', 'language', 'Korean', '韩语', null),
  ('lang-ja', 'language', 'Japanese', '日语', null),
  ('lang-zh', 'language', 'Chinese', '中文', null)
on conflict (slug) do update set
  namespace = excluded.namespace,
  label = excluded.label,
  description = excluded.description,
  parent_slug = excluded.parent_slug,
  is_active = excluded.is_active;

-- ── 推荐：标签重叠 + 音频接近 + 行为加权（A+ v1，无 embedding）────────
create or replace function music.get_recommendations(
  p_seed_track_id text,
  p_mode text default 'same_vibe',
  p_limit int default 20,
  p_exclude_track_ids text[] default '{}'::text[]
)
returns table (
  track_id text,
  title text,
  artist text,
  album text,
  score numeric,
  matched_tags text[],
  reasons text[]
)
language plpgsql
stable
security invoker
set search_path = music, public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_seed_energy numeric;
  v_seed_dance numeric;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select f.energy, f.danceability
  into v_seed_energy, v_seed_dance
  from music.track_audio_features f
  where f.user_id = v_user and f.track_id = p_seed_track_id;

  return query
  with seed_tags as (
    select tt.tag_slug, td.namespace, max(tt.confidence) as conf
    from music.track_tags tt
    join music.tag_dictionary td on td.slug = tt.tag_slug
    where tt.user_id = v_user
      and tt.track_id = p_seed_track_id
      and tt.confidence >= 0.55
      and td.is_active
    group by tt.tag_slug, td.namespace
  ),
  seed_vibes as (
    select tag_slug from seed_tags where namespace = 'vibe'
  ),
  seed_genres as (
    select tag_slug from seed_tags where namespace = 'genre'
  ),
  seed_context as (
    select tag_slug from seed_tags where namespace = 'context'
  ),
  candidates as (
    select
      m.track_id,
      m.title,
      m.artist,
      m.album,
      coalesce(e.tag_confidence_avg, 0.5) as enrich_conf,
      coalesce(q.source_quality, 'standard-quality') as quality
    from music.music_track_meta m
    left join music.track_enrichment e
      on e.user_id = m.user_id and e.track_id = m.track_id
    left join lateral (
      select tt.tag_slug as source_quality
      from music.track_tags tt
      where tt.user_id = m.user_id
        and tt.track_id = m.track_id
        and tt.tag_slug in ('high-compressed', 'lossless', 'standard-quality', 'low-quality')
      order by tt.confidence desc
      limit 1
    ) q on true
    where m.user_id = v_user
      and m.track_id <> p_seed_track_id
      and not (m.track_id = any (p_exclude_track_ids))
      and coalesce(e.tagging_status, 'pending') <> 'needs_review'
      and coalesce(e.is_duplicate, false) = false
      and not exists (
        select 1 from music.play_events pe
        where pe.user_id = v_user
          and pe.track_id = m.track_id
          and pe.event_type = 'skip'
          and pe.created_at > now() - interval '24 hours'
      )
  ),
  tag_overlap as (
    select
      c.track_id,
      array_agg(distinct tt.tag_slug) filter (where tt.tag_slug is not null) as matched,
      coalesce(sum(
        case td.namespace
          when 'vibe' then 0.35 * tt.confidence
          when 'genre' then 0.20 * tt.confidence
          when 'context' then 0.15 * tt.confidence
          when 'style' then 0.15 * tt.confidence
          else 0.05 * tt.confidence
        end
      ), 0) as tag_score
    from candidates c
    left join music.track_tags tt
      on tt.user_id = v_user and tt.track_id = c.track_id and tt.confidence >= 0.55
    left join music.tag_dictionary td on td.slug = tt.tag_slug
    where tt.tag_slug in (select tag_slug from seed_tags)
       or (p_mode = 'same_vibe' and tt.tag_slug in (select tag_slug from seed_vibes))
       or (p_mode = 'same_genre' and tt.tag_slug in (select tag_slug from seed_genres))
    group by c.track_id
  ),
  scored as (
    select
      c.track_id,
      c.title,
      c.artist,
      c.album,
      (
        coalesce(t.tag_score, 0) * 0.45
        + case when p_mode = 'discovery' then 0.15 else 0 end
        + case c.quality
            when 'lossless' then 0.08
            when 'high-compressed' then 0.06
            when 'standard-quality' then 0.04
            else 0
          end
        + c.enrich_conf * 0.10
        + case
            when v_seed_energy is not null and f.energy is not null
              then greatest(0, 0.12 - abs(f.energy - v_seed_energy) * 0.04)
            else 0.05
          end
        + case
            when v_seed_dance is not null and f.danceability is not null
              then greatest(0, 0.08 - abs(f.danceability - v_seed_dance) * 0.03)
            else 0.03
          end
        + least(coalesce(m.play_count, 0), 20) * 0.002
        + case when m.liked = 1 then 0.05 else 0 end
      )::numeric as score,
      coalesce(t.matched, '{}'::text[]) as matched_tags
    from candidates c
    left join tag_overlap t on t.track_id = c.track_id
    left join music.track_audio_features f
      on f.user_id = v_user and f.track_id = c.track_id
    left join music.music_track_meta m
      on m.user_id = v_user and m.track_id = c.track_id
    where coalesce(t.tag_score, 0) > 0
       or p_mode = 'discovery'
  )
  select
    s.track_id,
    s.title,
    s.artist,
    s.album,
    round(s.score, 4) as score,
    s.matched_tags,
    array_remove(array[
      case when s.matched_tags && array(select tag_slug from seed_vibes) then 'same vibe' end,
      case when s.matched_tags && array(select tag_slug from seed_genres) then 'same genre' end,
      case when s.matched_tags && array(select tag_slug from seed_context) then 'same context' end,
      case when v_seed_energy is not null then 'energy flow' end
    ], null) as reasons
  from scored s
  order by s.score desc, s.title
  limit greatest(1, least(p_limit, 50));
end;
$$;

grant execute on function music.get_recommendations(text, text, int, text[]) to authenticated, service_role;

-- 歌单续播：取最近 N 首加权 seed，合并推荐
create or replace function music.continue_playlist(
  p_playlist_id text,
  p_mode text default 'same_vibe',
  p_limit int default 20
)
returns table (
  track_id text,
  title text,
  artist text,
  album text,
  score numeric,
  matched_tags text[],
  reasons text[]
)
language plpgsql
stable
security invoker
set search_path = music, public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_seed text;
  v_exclude text[];
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select pt.track_id
  into v_seed
  from music.music_playlist_tracks pt
  where pt.user_id = v_user
    and pt.playlist_id = p_playlist_id
  order by pt.position desc
  limit 1;

  if v_seed is null then
    return;
  end if;

  select coalesce(array_agg(pt.track_id), '{}'::text[])
  into v_exclude
  from music.music_playlist_tracks pt
  where pt.user_id = v_user and pt.playlist_id = p_playlist_id;

  return query
  select * from music.get_recommendations(v_seed, p_mode, p_limit, v_exclude);
end;
$$;

grant execute on function music.continue_playlist(text, text, int) to authenticated, service_role;
