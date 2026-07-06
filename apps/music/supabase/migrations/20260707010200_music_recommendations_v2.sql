-- A++：推荐 RPC v2 — 降低 pop 权重 + play_events 行为加权

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
      coalesce(e.tag_confidence_avg, 0.5) as enrich_conf,
      coalesce(q.source_quality, 'standard-quality') as quality,
      m.liked = 1 as meta_liked
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
  tag_overlap as (
    select
      c.track_id,
      array_agg(distinct tt.tag_slug) filter (where tt.tag_slug is not null) as matched,
      coalesce(sum(
        case td.namespace
          when 'vibe' then
            case tt.tag_slug
              when 'baddie' then 0.40 * tt.confidence
              when 'girl-crush' then 0.38 * tt.confidence
              when 'club' then 0.38 * tt.confidence
              when 'runway' then 0.36 * tt.confidence
              else 0.35 * tt.confidence
            end
          when 'genre' then
            case tt.tag_slug
              when 'pop' then 0.04 * tt.confidence
              when 'dance-pop' then 0.22 * tt.confidence
              when 'k-pop-solo' then 0.22 * tt.confidence
              when 'k-pop' then 0.20 * tt.confidence
              when 'alt-pop' then 0.20 * tt.confidence
              when 'dark-pop' then 0.20 * tt.confidence
              when 'electropop' then 0.18 * tt.confidence
              when 'edm' then 0.18 * tt.confidence
              else 0.16 * tt.confidence
            end
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
        + c.enrich_conf * 0.15
        + case when p_mode = 'discovery' then 0.10 else 0 end
        + case
            when v_seed_energy is not null and f.energy is not null
              then greatest(0, 0.12 - abs(f.energy - v_seed_energy) * 0.04)
            else 0.04
          end
        + case
            when v_seed_dance is not null and f.danceability is not null
              then greatest(0, 0.08 - abs(f.danceability - v_seed_dance) * 0.03)
            else 0.02
          end
        + least(
            coalesce(case when b.has_like or c.meta_liked then 0.20 else 0 end, 0)
            + coalesce(case when b.has_recent_complete then 0.08 else 0 end, 0)
            + coalesce(case when b.has_replay then 0.12 else 0 end, 0),
            0.20
          )
        + case c.quality
            when 'lossless' then 0.05
            when 'high-compressed' then 0.03
            when 'standard-quality' then 0.02
            else 0
          end
        - least(coalesce(b.skip_count, 0) * 0.08, 0.25)
        - case when coalesce(b.has_remove, false) then 0.30 else 0 end
      )::numeric as score,
      coalesce(t.matched, '{}'::text[]) as matched_tags,
      b.has_like,
      b.has_recent_complete,
      b.has_replay,
      c.meta_liked
    from candidates c
    left join tag_overlap t on t.track_id = c.track_id
    left join music.track_audio_features f
      on f.user_id = v_user and f.track_id = c.track_id
    left join behavior b on b.track_id = c.track_id
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
      case when v_seed_energy is not null then 'energy flow' end,
      case when s.has_like or s.meta_liked then 'you liked' end,
      case when s.has_recent_complete then 'recently completed' end,
      case when s.has_replay then 'you replayed' end
    ], null) as reasons
  from scored s
  where s.score > 0
  order by s.score desc, s.title
  limit greatest(1, least(p_limit, 50));
end;
$$;

grant execute on function music.get_recommendations(text, text, int, text[]) to authenticated, service_role;
