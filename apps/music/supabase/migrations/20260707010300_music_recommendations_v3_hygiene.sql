-- P0.5 Ranking Hygiene: 排除泛标签 + IDF 降权 + 去重 + 分数分化

create or replace function music.normalize_track_identity(p_title text, p_artist text)
returns text
language sql
immutable
set search_path = music, public
as $$
  select
    lower(trim(regexp_replace(
      regexp_replace(
        coalesce(p_title, ''),
        '\s*\([^)]*(explicit|live|remix|version|edit|sped|slowed|instrumental|clean|dirty)[^)]*\)',
        '',
        'gi'
      ),
      '[^\w\s''&$]+',
      ' ',
      'g'
    )))
    || '::'
    || lower(trim(regexp_replace(coalesce(p_artist, ''), '[^\w\s''&$;]+', ' ', 'g')));
$$;

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
  v_total numeric;
  v_lim int := greatest(1, least(p_limit, 50));
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select count(*)::numeric into v_total
  from music.music_track_meta m where m.user_id = v_user;

  select f.energy, f.danceability
  into v_seed_energy, v_seed_dance
  from music.track_audio_features f
  where f.user_id = v_user and f.track_id = p_seed_track_id;

  return query
  with excluded_slugs as (
    select unnest(array[
      'original', 'playlist-continue-good', 'transition-safe',
      'high-compressed', 'standard-quality', 'lossless', 'low-quality',
      'lang-en', 'lang-ko', 'lang-zh', 'lang-ja', 'needs-review'
    ]) as slug
  ),
  selected_context_slugs as (
    select unnest(array[
      'gym', 'party', 'background', 'focus', 'game', 'shower', 'homepage-safe'
    ]) as slug
  ),
  seed_tags as (
    select tt.tag_slug, td.namespace, max(tt.confidence) as conf
    from music.track_tags tt
    join music.tag_dictionary td on td.slug = tt.tag_slug
    where tt.user_id = v_user
      and tt.track_id = p_seed_track_id
      and tt.confidence >= 0.55
      and td.is_active
      and tt.tag_slug not in (select slug from excluded_slugs)
    group by tt.tag_slug, td.namespace
  ),
  seed_vibes as (select tag_slug from seed_tags where namespace = 'vibe'),
  seed_genres as (select tag_slug from seed_tags where namespace = 'genre'),
  seed_context as (
    select tag_slug from seed_tags
    where namespace = 'context'
      and tag_slug in (select slug from selected_context_slugs)
  ),
  tag_coverage as (
    select tt.tag_slug, count(distinct tt.track_id)::numeric / nullif(v_total, 0) as coverage
    from music.track_tags tt
    where tt.user_id = v_user
    group by tt.tag_slug
  ),
  idf_mult as (
    select
      tc.tag_slug,
      case
        when tc.tag_slug in (select slug from excluded_slugs) then 0::numeric
        when tc.coverage >= 0.80 then 0::numeric
        when tc.coverage >= 0.40 then 0.30::numeric
        else 1::numeric
      end as mult
    from tag_coverage tc
  ),
  behavior as (
    select
      pe.track_id,
      bool_or(pe.event_type = 'like') as has_like,
      bool_or(pe.event_type = 'complete' and pe.created_at > now() - interval '7 days') as has_recent_complete,
      bool_or(pe.event_type = 'replay') as has_replay,
      count(*) filter (where pe.event_type = 'skip') as skip_count,
      bool_or(pe.event_type = 'remove_from_playlist') as has_remove
    from music.play_events pe
    where pe.user_id = v_user
    group by pe.track_id
  ),
  candidates as (
    select
      m.track_id,
      m.title,
      m.artist,
      m.album,
      music.normalize_track_identity(m.title, m.artist) as norm_key,
      lower(split_part(m.artist, ';', 1)) as primary_artist,
      coalesce(e.tag_confidence_avg, 0.5) as enrich_conf,
      coalesce(e.source_quality, 'standard-quality') as quality,
      m.liked = 1 as meta_liked
    from music.music_track_meta m
    left join music.track_enrichment e
      on e.user_id = m.user_id and e.track_id = m.track_id
    where m.user_id = v_user
      and m.track_id <> p_seed_track_id
      and not (m.track_id = any (p_exclude_track_ids))
      and coalesce(e.tagging_status, 'pending') not in ('needs_review')
      and coalesce(e.is_duplicate, false) = false
      and not exists (
        select 1 from music.play_events pe
        where pe.user_id = v_user
          and pe.track_id = m.track_id
          and pe.event_type = 'skip'
          and pe.created_at > now() - interval '24 hours'
      )
  ),
  tag_components as (
    select
      c.track_id,
      coalesce(sum(
        case when td.namespace = 'vibe' and st.tag_slug is not null then
          coalesce(im.mult, 0) * tt.confidence *
          case tt.tag_slug
            when 'baddie' then 0.40 when 'girl-crush' then 0.38 when 'club' then 0.38
            when 'runway' then 0.36 when 'quirky' then 0.36 when 'meme' then 0.34
            when 'night-drive' then 0.34 when 'euphoric' then 0.32 else 0.35
          end
        else 0 end
      ), 0) as vibe_score,
      coalesce(sum(
        case when td.namespace = 'genre' and st.tag_slug is not null then
          coalesce(im.mult, 0) * tt.confidence *
          case tt.tag_slug
            when 'pop' then 0.02 when 'dance-pop' then 0.18 when 'alt-pop' then 0.16
            when 'k-pop-solo' then 0.28 when 'k-pop' then 0.22 when 'girl-group' then 0.22
            when 'electropop' then 0.16 when 'dark-pop' then 0.16 when 'edm' then 0.18
            when 'hip-hop' then 0.14 when 'rap' then 0.14 when 'mandopop' then 0.14
            when 'c-pop' then 0.12 else 0.14
          end
        else 0 end
      ), 0) as genre_score,
      coalesce(sum(
        case when td.namespace = 'context' and sc.tag_slug is not null and st.tag_slug is not null then
          coalesce(im.mult, 0) * tt.confidence * 0.15
        else 0 end
      ), 0) as context_score,
      array_agg(distinct tt.tag_slug) filter (
        where st.tag_slug is not null
          and tt.tag_slug not in (select slug from excluded_slugs)
          and td.namespace in ('vibe', 'genre', 'context')
      ) as matched
    from candidates c
    join music.track_tags tt on tt.user_id = v_user and tt.track_id = c.track_id and tt.confidence >= 0.55
    join music.tag_dictionary td on td.slug = tt.tag_slug
    left join seed_tags st on st.tag_slug = tt.tag_slug
    left join seed_context sc on sc.tag_slug = tt.tag_slug
    left join idf_mult im on im.tag_slug = tt.tag_slug
    where tt.tag_slug not in (select slug from excluded_slugs)
      and (
        st.tag_slug is not null
        or (p_mode = 'same_vibe' and tt.tag_slug in (select tag_slug from seed_vibes))
        or (p_mode = 'same_genre' and tt.tag_slug in (select tag_slug from seed_genres))
      )
    group by c.track_id
  ),
  scored as (
    select
      c.track_id,
      c.title,
      c.artist,
      c.album,
      c.norm_key,
      c.primary_artist,
      (
        coalesce(tc.vibe_score, 0) * 0.50
        + coalesce(tc.genre_score, 0) * 0.25
        + coalesce(tc.context_score, 0) * 0.10
        + case
            when v_seed_energy is not null and f.energy is not null
              then greatest(0, 0.06 - abs(f.energy - v_seed_energy) * 0.02)
            else 0.02
          end
        + case
            when v_seed_dance is not null and f.danceability is not null
              then greatest(0, 0.04 - abs(f.danceability - v_seed_dance) * 0.015)
            else 0.01
          end
        + case when p_mode = 'discovery' then 0.05 else 0 end
        + case c.quality when 'lossless' then 0.05 when 'high-compressed' then 0.03 else 0.01 end
        + least(
            coalesce(case when b.has_like or c.meta_liked then 0.08 else 0 end, 0)
            + coalesce(case when b.has_recent_complete then 0.04 else 0 end, 0)
            + coalesce(case when b.has_replay then 0.06 else 0 end, 0),
            0.12
          )
        - least(coalesce(b.skip_count, 0) * 0.06, 0.20)
        - case when coalesce(b.has_remove, false) then 0.15 else 0 end
        + (abs(hashtext(c.track_id)) % 1000)::numeric * 0.000001
      )::numeric as score,
      coalesce(tc.matched, '{}'::text[]) as matched_tags,
      coalesce(tc.vibe_score, 0) as vibe_score,
      b.has_like,
      b.has_recent_complete,
      b.has_replay,
      c.meta_liked
    from candidates c
    left join tag_components tc on tc.track_id = c.track_id
    left join music.track_audio_features f on f.user_id = v_user and f.track_id = c.track_id
    left join behavior b on b.track_id = c.track_id
    where coalesce(tc.vibe_score, 0) + coalesce(tc.genre_score, 0) > 0
       or p_mode = 'discovery'
  ),
  deduped as (
    select distinct on (s.norm_key)
      s.*
    from scored s
    order by s.norm_key, s.score desc, s.track_id
  ),
  ranked as (
    select
      d.*,
      row_number() over (order by d.score desc, d.title) as rn
    from deduped d
    order by d.score desc, d.title
    limit v_lim * 3
  )
  select
    r.track_id,
    r.title,
    r.artist,
    r.album,
    round(r.score, 4) as score,
    r.matched_tags,
    array_remove(array[
      case when r.vibe_score > 0 then 'same vibe' end,
      case when r.matched_tags && array(select tag_slug from seed_genres) then 'same genre' end,
      case when r.matched_tags && array(select tag_slug from seed_context) then 'same context' end,
      case when v_seed_energy is not null then 'energy flow' end,
      case when r.has_like or r.meta_liked then 'you liked' end,
      case when r.has_recent_complete then 'recently completed' end,
      case when r.has_replay then 'you replayed' end
    ], null) as reasons
  from ranked r
  where r.rn <= v_lim
  order by r.score desc, r.title;
end;
$$;

grant execute on function music.normalize_track_identity(text, text) to authenticated, service_role;
grant execute on function music.get_recommendations(text, text, int, text[]) to authenticated, service_role;
