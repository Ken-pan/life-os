


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";


CREATE SCHEMA IF NOT EXISTS "fitness";


ALTER SCHEMA "fitness" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "music";


ALTER SCHEMA "music" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "music"."canonical_artist"("p_artist" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'music', 'public'
    AS $$
  select coalesce(
    (
      select string_agg(token, ';' order by token)
      from (
        select distinct lower(trim(token)) as token
        from unnest(
          regexp_split_to_array(
            lower(regexp_replace(
              regexp_replace(
                regexp_replace(
                  normalize(coalesce(p_artist, ''), NFKC),
                  '\s*(feat\.?|ft\.?|featuring|with)\s+',
                  ';',
                  'gi'
                ),
                '\s*[;&、，]\s*|\s+x\s+',
                ';',
                'g'
              ),
              '\s+',
              ' ',
              'g'
            )),
            ';'
          )
        ) as token
        where trim(token) <> ''
      ) s
    ),
    ''
  );
$$;


ALTER FUNCTION "music"."canonical_artist"("p_artist" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "music"."canonical_title"("p_title" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'music', 'public'
    AS $$
  select lower(trim(regexp_replace(
    regexp_replace(
      normalize(
        regexp_replace(
          coalesce(p_title, ''),
          '\s*\([^)]*(explicit|clean|radio edit|radio-edit|instrumental|live|remix|version|edit|sped|slowed|dirty|album version)[^)]*\)',
          '',
          'gi'
        ),
        NFKC
      ),
      '[?!.,''""`]+',
      '',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  )));
$$;


ALTER FUNCTION "music"."canonical_title"("p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "music"."canonical_track_key"("p_title" "text", "p_artist" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'music', 'public'
    AS $$
  select
    case
      when music.canonical_title(p_title) = '' or music.canonical_artist(p_artist) = ''
      then null
      else music.canonical_title(p_title) || '::' || music.canonical_artist(p_artist)
    end;
$$;


ALTER FUNCTION "music"."canonical_track_key"("p_title" "text", "p_artist" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "music"."continue_playlist"("p_playlist_id" "text", "p_mode" "text" DEFAULT 'same_vibe'::"text", "p_limit" integer DEFAULT 20) RETURNS TABLE("track_id" "text", "title" "text", "artist" "text", "album" "text", "score" numeric, "matched_tags" "text"[], "reasons" "text"[])
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'music', 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "music"."continue_playlist"("p_playlist_id" "text", "p_mode" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "music"."get_recommendations"("p_seed_track_id" "text", "p_mode" "text" DEFAULT 'same_vibe'::"text", "p_limit" integer DEFAULT 20, "p_exclude_track_ids" "text"[] DEFAULT '{}'::"text"[]) RETURNS TABLE("track_id" "text", "title" "text", "artist" "text", "album" "text", "score" numeric, "matched_tags" "text"[], "reasons" "text"[])
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'music', 'public', 'extensions'
    AS $$
declare
  v_user uuid := auth.uid();
  v_seed_energy numeric;
  v_seed_dance numeric;
  v_seed_artist text;
  v_total numeric;
  v_lim int := greatest(1, least(p_limit, 50));
  v_canonical_seed text;
  v_seed_western_pop boolean := false;
  v_seed_dark_pop boolean := false;
  v_seed_quirky_rap boolean := false;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(e.canonical_track_id, p_seed_track_id), lower(m.artist)
  into v_canonical_seed, v_seed_artist
  from music.music_track_meta m
  left join music.track_enrichment e
    on e.user_id = m.user_id and e.track_id = m.track_id
  where m.user_id = v_user and m.track_id = p_seed_track_id;

  select count(*)::numeric into v_total
  from music.music_track_meta m where m.user_id = v_user;

  select f.energy, f.danceability
  into v_seed_energy, v_seed_dance
  from music.track_audio_features f
  where f.user_id = v_user and f.track_id = p_seed_track_id;

  select exists (
    select 1 from music.track_tags tt
    where tt.user_id = v_user and tt.track_id = p_seed_track_id
      and tt.tag_slug in ('dance-pop', 'pop', 'alt-pop', 'electropop')
      and tt.confidence >= 0.55
  )
  and not exists (
    select 1 from music.track_tags tt
    where tt.user_id = v_user and tt.track_id = p_seed_track_id
      and tt.tag_slug in ('k-pop', 'girl-group', 'k-pop-solo')
      and tt.confidence >= 0.55
  )
  into v_seed_western_pop;

  select exists (
    select 1 from music.track_tags tt
    where tt.user_id = v_user and tt.track_id = p_seed_track_id
      and tt.tag_slug in ('dark-pop', 'alt-r-and-b', 'r-and-b', 'alt-pop')
      and tt.confidence >= 0.55
  )
  or lower(v_seed_artist) like '%raye%'
  into v_seed_dark_pop;

  select exists (
    select 1 from music.track_tags tt
    where tt.user_id = v_user and tt.track_id = p_seed_track_id
      and tt.tag_slug in ('hip-hop', 'rap', 'asian-hip-hop', 'quirky', 'meme')
      and tt.confidence >= 0.55
  )
  or lower(v_seed_artist) like '%connor price%'
  or lower(v_seed_artist) like '%bbno%'
  into v_seed_quirky_rap;

  return query
  with excluded_slugs as (
    select unnest(array[
      'original', 'playlist-continue-good', 'transition-safe',
      'high-compressed', 'standard-quality', 'lossless', 'low-quality',
      'lang-en', 'lang-ko', 'lang-zh', 'lang-ja', 'needs-review', 'duplicate'
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
    where tt.user_id = v_user and tt.track_id = p_seed_track_id
      and tt.confidence >= 0.55 and td.is_active
      and tt.tag_slug not in (select slug from excluded_slugs)
    group by tt.tag_slug, td.namespace
  ),
  seed_vibes as (select tag_slug from seed_tags where namespace = 'vibe'),
  seed_genres as (select tag_slug from seed_tags where namespace = 'genre'),
  seed_context as (
    select tag_slug from seed_tags where namespace = 'context'
      and tag_slug in (select slug from selected_context_slugs)
  ),
  tag_coverage as (
    select tt.tag_slug, count(distinct tt.track_id)::numeric / nullif(v_total, 0) as coverage
    from music.track_tags tt where tt.user_id = v_user group by tt.tag_slug
  ),
  idf_mult as (
    select tc.tag_slug,
      case
        when tc.tag_slug in (select slug from excluded_slugs) then 0::numeric
        when tc.coverage >= 0.80 then 0::numeric
        when tc.coverage >= 0.40 then 0.25::numeric
        when tc.tag_slug in ('confident', 'party', 'gym', 'euphoric') then 0.12::numeric
        else 1::numeric
      end as mult
    from tag_coverage tc
  ),
  behavior as (
    select coalesce(e.canonical_track_id, pe.track_id) as canon_id,
      bool_or(pe.event_type = 'like') as has_like,
      bool_or(pe.event_type = 'complete' and pe.created_at > now() - interval '7 days') as has_recent_complete,
      bool_or(pe.event_type = 'replay') as has_replay,
      count(*) filter (where pe.event_type = 'skip') as skip_count,
      bool_or(pe.event_type = 'remove_from_playlist') as has_remove
    from music.play_events pe
    left join music.track_enrichment e on e.user_id = pe.user_id and e.track_id = pe.track_id
    where pe.user_id = v_user
    group by coalesce(e.canonical_track_id, pe.track_id)
  ),
  candidates as (
    select m.track_id, m.title, m.artist, m.album,
      coalesce(e.canonical_track_id, m.track_id) as canon_id,
      music.canonical_track_key(m.title, m.artist) as norm_key,
      lower(m.artist) as artist_lc,
      coalesce(e.tag_confidence_avg, 0.5) as enrich_conf,
      coalesce(e.source_quality, 'standard-quality') as quality,
      m.liked = 1 as meta_liked
    from music.music_track_meta m
    left join music.track_enrichment e on e.user_id = m.user_id and e.track_id = m.track_id
    where m.user_id = v_user and m.track_id <> p_seed_track_id
      and coalesce(e.canonical_track_id, m.track_id) <> v_canonical_seed
      and not (m.track_id = any (p_exclude_track_ids))
      and coalesce(e.tagging_status, 'pending') not in ('needs_review')
      and coalesce(e.is_duplicate, false) = false
      and coalesce(e.duplicate_of, '') = ''
      and not exists (
        select 1 from music.track_tags dt
        where dt.user_id = v_user and dt.track_id = m.track_id
          and dt.tag_slug = 'duplicate' and dt.confidence >= 0.55
      )
      and not exists (
        select 1 from music.play_events pe
        join music.track_enrichment pe_e on pe_e.user_id = pe.user_id and pe_e.track_id = pe.track_id
        where pe.user_id = v_user
          and coalesce(pe_e.canonical_track_id, pe.track_id) = coalesce(e.canonical_track_id, m.track_id)
          and pe.event_type = 'skip' and pe.created_at > now() - interval '24 hours'
      )
  ),
  tag_components as (
    select c.track_id,
      coalesce(sum(case when td.namespace = 'vibe' and st.tag_slug is not null then
        coalesce(im.mult, 0) * tt.confidence * case tt.tag_slug
          when 'baddie' then 0.40 when 'girl-crush' then 0.38 when 'club' then 0.34
          when 'quirky' then 0.38 when 'meme' then 0.36 when 'playful' then 0.32
          when 'dark' then 0.36 when 'sexy' then 0.36 when 'dramatic' then 0.34
          when 'night-drive' then 0.34 when 'euphoric' then 0.18
          when 'confident' then 0.08 else 0.26 end
      else 0 end), 0) as vibe_score,
      coalesce(sum(case when td.namespace = 'genre' and st.tag_slug is not null then
        coalesce(im.mult, 0) * tt.confidence * case tt.tag_slug
          when 'pop' then 0.02 when 'dance-pop' then 0.24 when 'alt-pop' then 0.20
          when 'electropop' then 0.22 when 'dark-pop' then 0.24
          when 'r-and-b' then 0.20 when 'alt-r-and-b' then 0.22
          when 'hip-hop' then 0.18 when 'rap' then 0.18 when 'asian-hip-hop' then 0.14
          when 'k-pop' then 0.18 when 'girl-group' then 0.18 when 'k-pop-solo' then 0.20
          when 'edm' then 0.06 else 0.12 end
      else 0 end), 0) as genre_score,
      coalesce(sum(case when td.namespace = 'context' and sc.tag_slug is not null and st.tag_slug is not null then
        coalesce(im.mult, 0) * tt.confidence * case tt.tag_slug
          when 'party' then 0.03 when 'gym' then 0.02 else 0.06 end
      else 0 end), 0) as context_score,
      array_agg(distinct tt.tag_slug) filter (
        where st.tag_slug is not null and tt.tag_slug not in (select slug from excluded_slugs)
          and td.namespace in ('vibe', 'genre', 'context')
      ) as matched
    from candidates c
    join music.track_tags tt on tt.user_id = v_user and tt.track_id = c.track_id and tt.confidence >= 0.55
    join music.tag_dictionary td on td.slug = tt.tag_slug
    left join seed_tags st on st.tag_slug = tt.tag_slug
    left join seed_context sc on sc.tag_slug = tt.tag_slug
    left join idf_mult im on im.tag_slug = tt.tag_slug
    where tt.tag_slug not in (select slug from excluded_slugs)
      and (st.tag_slug is not null
        or (p_mode = 'same_vibe' and tt.tag_slug in (select tag_slug from seed_vibes))
        or (p_mode = 'same_genre' and tt.tag_slug in (select tag_slug from seed_genres)))
    group by c.track_id
  ),
  scored as (
    select c.track_id, c.title, c.artist, c.album, c.canon_id, c.norm_key,
      (
        coalesce(tc.vibe_score, 0) * 0.48
        + coalesce(tc.genre_score, 0) * 0.32
        + coalesce(tc.context_score, 0) * 0.05
        + case when v_seed_energy is not null and f.energy is not null
            then greatest(0, 0.05 - abs(f.energy - v_seed_energy) * 0.02) else 0.02 end
        + case when v_seed_dance is not null and f.danceability is not null
            then greatest(0, 0.03 - abs(f.danceability - v_seed_dance) * 0.015) else 0.01 end
        + case when v_seed_artist <> '' and c.artist_lc like '%' || split_part(v_seed_artist, ';', 1) || '%'
            then 0.14 else 0 end
        + case c.quality when 'lossless' then 0.04 when 'high-compressed' then 0.02 else 0.01 end
        + least(coalesce(case when b.has_like or c.meta_liked then 0.08 else 0 end, 0)
            + coalesce(case when b.has_recent_complete then 0.04 else 0 end, 0)
            + coalesce(case when b.has_replay then 0.05 else 0 end, 0), 0.12)
        - least(coalesce(b.skip_count, 0) * 0.06, 0.20)
        - case when coalesce(b.has_remove, false) then 0.15 else 0 end
        - case when v_seed_western_pop and exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('k-pop', 'girl-group', 'k-pop-solo')
          ) and not exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('dance-pop', 'alt-pop', 'electropop', 'pop')
          ) then 0.30 else 0 end
        - case when v_seed_western_pop and exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('edm', 'house', 'techno', 'trance')
          ) and not exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('dance-pop', 'alt-pop', 'electropop')
          ) then 0.25 else 0 end
        + case when v_seed_western_pop and exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('dance-pop', 'electropop', 'alt-pop')
          ) then 0.06 else 0 end
        + case when v_seed_dark_pop and exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55
              and gt.tag_slug in ('dark-pop', 'alt-r-and-b', 'r-and-b', 'sexy', 'dramatic', 'night-drive', 'dark')
          ) then 0.12 else 0 end
        - case when v_seed_dark_pop and exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('euphoric', 'cute', 'playful')
          ) and not exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55
              and gt.tag_slug in ('dark-pop', 'alt-r-and-b', 'dramatic', 'sexy', 'dark')
          ) then 0.14 else 0 end
        - case when v_seed_dark_pop and lower(c.artist) like '%taylor swift%' then 0.08 else 0 end
        + case when v_seed_quirky_rap and exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('quirky', 'meme', 'hip-hop', 'rap', 'playful')
          ) then 0.12 else 0 end
        - case when v_seed_quirky_rap and exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('electropop', 'pop')
          ) and not exists (
            select 1 from music.track_tags gt where gt.user_id = v_user and gt.track_id = c.track_id
              and gt.confidence >= 0.55 and gt.tag_slug in ('hip-hop', 'rap', 'quirky', 'meme')
          ) then 0.12 else 0 end
        + (abs(hashtext(c.track_id)) % 1000)::numeric * 0.000001
      )::numeric as score,
      coalesce(tc.matched, '{}'::text[]) as matched_tags,
      coalesce(tc.vibe_score, 0) as vibe_score,
      b.has_like, b.has_recent_complete, b.has_replay, c.meta_liked
    from candidates c
    left join tag_components tc on tc.track_id = c.track_id
    left join music.track_audio_features f on f.user_id = v_user and f.track_id = c.track_id
    left join behavior b on b.canon_id = c.canon_id
    where coalesce(tc.vibe_score, 0) + coalesce(tc.genre_score, 0) > 0 or p_mode = 'discovery'
  ),
  deduped as (
    select distinct on (coalesce(s.canon_id, s.norm_key)) s.*
    from scored s
    where s.norm_key is not null and s.norm_key <> ''
    order by coalesce(s.canon_id, s.norm_key), s.score desc, s.track_id
  ),
  ranked as (
    select d.*, row_number() over (order by d.score desc, d.title) as rn
    from deduped d order by d.score desc, d.title limit v_lim * 3
  )
  select r.track_id, r.title, r.artist, r.album, round(r.score, 4) as score, r.matched_tags,
    array_remove(array[
      case when r.vibe_score > 0 then 'same vibe' end,
      case when r.matched_tags && array(select tag_slug from seed_genres) then 'same genre' end,
      case when r.matched_tags && array(select tag_slug from seed_context) then 'same context' end,
      case when v_seed_energy is not null then 'energy flow' end,
      case when r.has_like or r.meta_liked then 'you liked' end,
      case when r.has_recent_complete then 'recently completed' end,
      case when r.has_replay then 'you replayed' end
    ], null) as reasons
  from ranked r where r.rn <= v_lim
  order by r.score desc, r.title;
end;
$$;


ALTER FUNCTION "music"."get_recommendations"("p_seed_track_id" "text", "p_mode" "text", "p_limit" integer, "p_exclude_track_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "music"."normalize_track_identity"("p_title" "text", "p_artist" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'music', 'public'
    AS $$
  select coalesce(music.canonical_track_key(p_title, p_artist), '');
$$;


ALTER FUNCTION "music"."normalize_track_identity"("p_title" "text", "p_artist" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."core_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_display_name text;
  v_app text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.core_profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  foreach v_app in array array['finance', 'fitness', 'planner', 'music', 'portal', 'home']
  loop
    insert into public.core_user_app_settings (user_id, app_id)
    values (new.id, v_app)
    on conflict (user_id, app_id) do nothing;
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "private"."core_handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."fitness_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into fitness.fitness_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into fitness.fitness_user_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "private"."fitness_handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_app_access"("requested_app_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.app_memberships m
    where m.user_id = (select auth.uid())
      and m.app_key = requested_app_key
      and m.status = 'active'
  );
$$;


ALTER FUNCTION "private"."has_app_access"("requested_app_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_app_role"("requested_app_key" "text", "allowed_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.app_memberships m
    where m.user_id = (select auth.uid())
      and m.app_key = requested_app_key
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;


ALTER FUNCTION "private"."has_app_role"("requested_app_key" "text", "allowed_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."music_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into music.music_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into music.music_user_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "private"."music_handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."user_has_app_access"("p_user_id" "uuid", "requested_app_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.app_memberships m
    where m.user_id = p_user_id
      and m.app_key = requested_app_key
      and m.status = 'active'
  );
$$;


ALTER FUNCTION "private"."user_has_app_access"("p_user_id" "uuid", "requested_app_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_scenario_to_plan_v1"("payload" "jsonb") RETURNS TABLE("applied_count" integer, "inserted_event_ids" "jsonb", "applied_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  uid uuid;
  src_scenario text;
  selected_ids text[];
  inserted_ids jsonb := '[]'::jsonb;
  row_count integer := 0;
  audit_applied_at timestamptz := now();
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  src_scenario := nullif(payload ->> 'scenario_id', '');
  if src_scenario is null then
    raise exception 'scenario_id required';
  end if;
  if src_scenario = 'scenario_baseline' then
    raise exception 'baseline scenario cannot be applied to itself';
  end if;
  if not exists (
    select 1
    from public.finance_scenarios s
    where s.user_id = uid
      and s.id = src_scenario
  ) then
    raise exception 'scenario not found';
  end if;
  if jsonb_typeof(payload -> 'selected_event_ids') <> 'array' then
    raise exception 'selected_event_ids must be an array';
  end if;

  select coalesce(array_agg(v), '{}') into selected_ids
  from jsonb_array_elements_text(payload -> 'selected_event_ids') as t(v);
  if cardinality(selected_ids) = 0 then
    raise exception 'at least one selected event required';
  end if;

  with source_events as (
    select e.*
    from public.finance_scenario_events e
    where e.user_id = uid
      and e.scenario_id = src_scenario
      and e.id = any(selected_ids)
  ),
  inserted as (
    insert into public.finance_scenario_events (
      user_id,
      id,
      scenario_id,
      name,
      event_type,
      enabled,
      month_offset,
      amount,
      date,
      percent,
      contribution_percent,
      expense_category,
      funding_source,
      reconciled
    )
    select
      uid,
      'evt_apply_' || replace(substr(gen_random_uuid()::text, 1, 8), '-', ''),
      'scenario_baseline',
      se.name,
      se.event_type,
      se.enabled,
      se.month_offset,
      se.amount,
      se.date,
      se.percent,
      se.contribution_percent,
      se.expense_category,
      se.funding_source,
      se.reconciled
    from source_events se
    returning id
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(id), '[]'::jsonb)
  into row_count, inserted_ids
  from inserted;

  if row_count = 0 then
    raise exception 'no events were applied';
  end if;

  insert into public.finance_scenario_apply_audits (
    user_id,
    source_scenario_id,
    selected_event_ids,
    inserted_event_ids,
    applied_at
  ) values (
    uid,
    src_scenario,
    to_jsonb(selected_ids),
    inserted_ids,
    audit_applied_at
  );

  return query
  select row_count, inserted_ids, audit_applied_at;
end;
$$;


ALTER FUNCTION "public"."apply_scenario_to_plan_v1"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bug_logs_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."bug_logs_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_all_financial_data_v1"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_transactions int := 0;
  v_events int := 0;
  v_cash_flows int := 0;
  v_goals int := 0;
  v_accounts int := 0;
  v_settings int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.finance_transactions where user_id = v_uid;
  get diagnostics v_transactions = row_count;

  delete from public.finance_scenario_events where user_id = v_uid;
  get diagnostics v_events = row_count;

  delete from public.finance_cash_flows where user_id = v_uid;
  get diagnostics v_cash_flows = row_count;

  delete from public.finance_goals where user_id = v_uid;
  get diagnostics v_goals = row_count;

  delete from public.finance_accounts where user_id = v_uid;
  get diagnostics v_accounts = row_count;

  delete from public.finance_user_settings where user_id = v_uid;
  get diagnostics v_settings = row_count;

  return jsonb_build_object(
    'deleted', jsonb_build_object(
      'transactions', v_transactions,
      'scenario_events', v_events,
      'cash_flows', v_cash_flows,
      'goals', v_goals,
      'accounts', v_accounts,
      'user_settings', v_settings
    ),
    'deletedAt', now()
  );
end;
$$;


ALTER FUNCTION "public"."delete_all_financial_data_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_all_financial_data_v2"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.finance_expected_occurrences where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('expected_occurrences', v_count);

  delete from public.finance_holding_positions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holding_positions', v_count);

  delete from public.finance_holdings_snapshots where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holdings_snapshots', v_count);

  delete from public.finance_holding_price_trails where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holding_price_trails', v_count);

  delete from public.finance_review_items where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('review_items', v_count);

  delete from public.finance_decision_records where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('decision_records', v_count);

  delete from public.finance_scenario_apply_audits where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_apply_audits', v_count);

  delete from public.finance_scenario_snapshots where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_snapshots', v_count);

  delete from public.finance_transactions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('transactions', v_count);

  delete from public.finance_balance_assertions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('balance_assertions', v_count);

  delete from public.finance_scenario_events where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_events', v_count);

  delete from public.finance_scenarios where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenarios', v_count);

  delete from public.finance_cash_flows where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('cash_flows', v_count);

  delete from public.finance_goals where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('goals', v_count);

  delete from public.finance_accounts where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('accounts', v_count);

  delete from public.finance_user_settings where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('user_settings', v_count);

  return jsonb_build_object('deleted', v_deleted, 'deletedAt', now());
end;
$$;


ALTER FUNCTION "public"."delete_all_financial_data_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_device_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  slot_count integer;
begin
  select count(distinct device_class) into slot_count
  from public.core_allowed_devices
  where user_id = new.user_id;

  if slot_count >= 2 and not exists (
    select 1 from public.core_allowed_devices
    where user_id = new.user_id and device_class = new.device_class
  ) then
    raise exception 'device limit reached (max 1 desktop + 1 mobile)';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_device_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  uid uuid;
  p_envelope_id text;
  p_payload_hash text;
  p_capture_source text;
  p_capture_kind text;
  v_existing_hash text;
  v_already_processed boolean := false;
  v_inserted_txn integer := 0;
  v_skipped_txn integer := 0;
  v_inserted_assert integer := 0;
  v_txn_rows jsonb := '[]'::jsonb;
  v_txn_elem jsonb;
  v_assert_elem jsonb;
  v_platform_id text;
  v_inserted uuid;
  v_txn_date date;
  v_txn_idx integer := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;

  p_envelope_id := left(coalesce(payload ->> 'envelope_id', ''), 512);
  p_payload_hash := left(coalesce(payload ->> 'payload_hash', ''), 128);
  p_capture_source := left(coalesce(payload ->> 'capture_source', ''), 64);
  p_capture_kind := left(coalesce(payload ->> 'capture_kind', ''), 64);

  if p_envelope_id = '' or p_payload_hash = '' or p_capture_source = '' or p_capture_kind = '' then
    raise exception 'missing envelope metadata';
  end if;

  select e.payload_hash
    into v_existing_hash
  from public.finance_extension_processed_captures e
  where e.user_id = uid
    and e.envelope_id = p_envelope_id
  for update;

  if found then
    if v_existing_hash <> p_payload_hash then
      raise exception 'envelope payload mismatch for %', p_envelope_id;
    end if;
    v_already_processed := true;
  else
    insert into public.finance_extension_processed_captures (
      user_id,
      envelope_id,
      payload_hash,
      capture_source,
      capture_kind
    )
    values (
      uid,
      p_envelope_id,
      p_payload_hash,
      p_capture_source,
      p_capture_kind
    );
    v_already_processed := false;
  end if;

  if v_already_processed then
    return jsonb_build_object(
      'already_processed', true,
      'inserted_transaction_count', 0,
      'skipped_transaction_count', 0,
      'inserted_assertion_count', 0,
      'transactions', '[]'::jsonb
    );
  end if;

  if jsonb_typeof(payload -> 'transactions') = 'array' then
    for v_txn_elem in select value from jsonb_array_elements(payload -> 'transactions') loop
      v_txn_idx := v_txn_idx + 1;
      begin
        v_txn_date := public.fos_ext_json_date(v_txn_elem, 'date');
        if v_txn_date is null then
          v_skipped_txn := v_skipped_txn + 1;
          continue;
        end if;

        v_platform_id := nullif(left(coalesce(v_txn_elem ->> 'platform_id', ''), 256), '');

        if v_platform_id is not null then
          insert into public.finance_transactions (
            user_id,
            txn_date,
            occurred_on,
            merchant,
            merchant_name,
            category,
            normalized_category,
            account,
            source_account_label,
            flow,
            flow_type,
            amount,
            source_amount,
            budget_impact,
            in_spending,
            include_in_spending_analytics,
            in_cash_flow,
            include_in_cash_flow_history,
            exclude_reason,
            source,
            platform_id,
            capture_source,
            review_status,
            review_flags
          )
          values (
            uid,
            v_txn_date,
            v_txn_date,
            left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
            left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
            left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
            left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
            left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
            left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
            left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
            left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
            public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
            public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
            public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
            nullif(left(coalesce(v_txn_elem ->> 'exclude_reason', ''), 200), ''),
            coalesce(nullif(left(coalesce(v_txn_elem ->> 'source', ''), 32), ''), 'import'),
            v_platform_id,
            p_capture_source,
            'resolved',
            '[]'::jsonb
          )
          on conflict (user_id, capture_source, platform_id)
          where platform_id is not null and platform_id <> ''
          do nothing
          returning id into v_inserted;

          if v_inserted is null then
            v_skipped_txn := v_skipped_txn + 1;
          else
            v_inserted_txn := v_inserted_txn + 1;
            v_txn_rows := v_txn_rows || jsonb_build_array(
              jsonb_build_object(
                'id', v_inserted,
                'date', v_txn_elem ->> 'date',
                'merchant', v_txn_elem ->> 'merchant',
                'category', coalesce(v_txn_elem ->> 'category', 'Uncategorized'),
                'account', coalesce(v_txn_elem ->> 'account', 'Unknown'),
                'flow_type', coalesce(v_txn_elem ->> 'flow_type', 'expense'),
                'amount', public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
                'budget_impact', public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
                'include_in_spending_analytics', public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
                'include_in_cash_flow_history', public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
                'exclude_reason', v_txn_elem ->> 'exclude_reason',
                'source', coalesce(v_txn_elem ->> 'source', 'import'),
                'platform_id', v_platform_id,
                'capture_source', p_capture_source
              )
            );
          end if;
        else
          insert into public.finance_transactions (
            user_id,
            txn_date,
            occurred_on,
            merchant,
            merchant_name,
            category,
            normalized_category,
            account,
            source_account_label,
            flow,
            flow_type,
            amount,
            source_amount,
            budget_impact,
            in_spending,
            include_in_spending_analytics,
            in_cash_flow,
            include_in_cash_flow_history,
            exclude_reason,
            source,
            capture_source,
            review_status,
            review_flags
          )
          values (
            uid,
            v_txn_date,
            v_txn_date,
            left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
            left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
            left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
            left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
            left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
            left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
            left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
            left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
            public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
            public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
            public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
            public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
            nullif(left(coalesce(v_txn_elem ->> 'exclude_reason', ''), 200), ''),
            coalesce(nullif(left(coalesce(v_txn_elem ->> 'source', ''), 32), ''), 'import'),
            p_capture_source,
            'resolved',
            '[]'::jsonb
          )
          returning id into v_inserted;

          v_inserted_txn := v_inserted_txn + 1;
          v_txn_rows := v_txn_rows || jsonb_build_array(
            jsonb_build_object(
              'id', v_inserted,
              'date', v_txn_elem ->> 'date',
              'merchant', v_txn_elem ->> 'merchant',
              'category', coalesce(v_txn_elem ->> 'category', 'Uncategorized'),
              'account', coalesce(v_txn_elem ->> 'account', 'Unknown'),
              'flow_type', coalesce(v_txn_elem ->> 'flow_type', 'expense'),
              'amount', public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
              'budget_impact', public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
              'include_in_spending_analytics', public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
              'include_in_cash_flow_history', public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
              'exclude_reason', v_txn_elem ->> 'exclude_reason',
              'source', coalesce(v_txn_elem ->> 'source', 'import'),
              'capture_source', p_capture_source
            )
          );
        end if;
      exception
        when invalid_text_representation then
          raise exception
            'finalize_extension_sync_v1 cast failed envelope=% txn_index=% capture_source=% capture_kind=% elem=% pg_error=%',
            p_envelope_id,
            v_txn_idx,
            p_capture_source,
            p_capture_kind,
            left(v_txn_elem::text, 1200),
            sqlerrm
            using errcode = sqlstate;
      end;
    end loop;
  end if;

  if jsonb_typeof(payload -> 'balance_assertions') = 'array' then
    for v_assert_elem in select value from jsonb_array_elements(payload -> 'balance_assertions') loop
      if public.fos_ext_json_date(v_assert_elem, 'assertion_date') is null then
        continue;
      end if;
      insert into public.finance_balance_assertions (
        user_id,
        account_id,
        assertion_date,
        amount,
        note
      )
      values (
        uid,
        left(coalesce(v_assert_elem ->> 'account_id', ''), 128),
        public.fos_ext_json_date(v_assert_elem, 'assertion_date'),
        public.fos_ext_json_numeric(v_assert_elem, 'amount', 0),
        nullif(left(coalesce(v_assert_elem ->> 'note', ''), 500), '')
      );
      v_inserted_assert := v_inserted_assert + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'already_processed', false,
    'inserted_transaction_count', v_inserted_txn,
    'skipped_transaction_count', v_skipped_txn,
    'inserted_assertion_count', v_inserted_assert,
    'transactions', v_txn_rows
  );
end;
$$;


ALTER FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_transaction_import_v1"("payload" "jsonb") RETURNS TABLE("import_id" "uuid", "status" "text", "accepted_row_count" integer, "excluded_row_count" integer, "review_row_count" integer, "date_min" "date", "date_max" "date")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  uid uuid;
  import_row_id uuid;
  accepted_count integer := 0;
  excluded_count integer := 0;
  review_count integer := 0;
  min_date date;
  max_date date;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  if jsonb_typeof(payload -> 'acceptedRows') <> 'array' then
    raise exception 'invalid acceptedRows';
  end if;

  if exists (
    select 1
    from public.finance_transaction_imports ti
    where ti.user_id = uid
      and ti.status = 'finalized'
      and ti.source_file_hash = coalesce(payload ->> 'sourceFileHash', '')
  ) then
    raise exception 'same-file reimport blocked';
  end if;

  insert into public.finance_transaction_imports (
    user_id,
    status,
    source_type,
    source_file_name_masked,
    source_file_hash,
    raw_row_count,
    schema_version
  )
  values (
    uid,
    'draft',
    'csv',
    left(coalesce(payload ->> 'sourceFileNameMasked', 'csv'), 200),
    left(coalesce(payload ->> 'sourceFileHash', ''), 128),
    greatest(coalesce((payload ->> 'rawRowCount')::integer, 0), 0),
    greatest(coalesce((payload ->> 'schemaVersion')::integer, 1), 1)
  )
  returning id into import_row_id;

  insert into public.finance_transactions (
    user_id,
    import_id,
    transaction_fingerprint,
    occurred_on,
    original_date,
    source_account_label,
    source_account_masked,
    institution,
    account_type,
    merchant_name,
    description,
    source_category,
    normalized_category,
    source_amount,
    amount,
    budget_impact,
    net_worth_impact,
    account_balance_impact,
    flow_type,
    flow,
    include_in_spending_analytics,
    in_spending,
    include_in_cash_flow_history,
    in_cash_flow,
    review_status,
    review_flags,
    txn_date,
    merchant,
    category,
    account,
    source
  )
  select
    uid,
    import_row_id,
    left(coalesce(x.transaction_fingerprint, ''), 200),
    x.occurred_on,
    x.original_date,
    nullif(left(coalesce(x.source_account_label, ''), 200), ''),
    nullif(left(coalesce(x.source_account_masked, ''), 64), ''),
    nullif(left(coalesce(x.institution, ''), 200), ''),
    nullif(left(coalesce(x.account_type, ''), 80), ''),
    left(coalesce(x.merchant_name, ''), 200),
    left(coalesce(x.description, ''), 500),
    nullif(left(coalesce(x.source_category, ''), 200), ''),
    left(coalesce(x.normalized_category, 'Uncategorized'), 200),
    x.source_amount,
    x.source_amount,
    x.budget_impact,
    x.net_worth_impact,
    x.account_balance_impact,
    left(coalesce(x.flow_type, 'unknown'), 40),
    left(coalesce(x.flow_type, 'unknown'), 40),
    coalesce(x.include_in_spending_analytics, false),
    coalesce(x.include_in_spending_analytics, false),
    coalesce(x.include_in_cash_flow_history, true),
    coalesce(x.include_in_cash_flow_history, true),
    left(coalesce(x.review_status, 'open'), 20),
    coalesce(x.review_flags, '[]'::jsonb),
    x.occurred_on,
    left(coalesce(x.merchant_name, ''), 200),
    left(coalesce(x.normalized_category, 'Uncategorized'), 200),
    left(coalesce(x.source_account_label, 'Imported account'), 200),
    'import'
  from jsonb_to_recordset(payload -> 'acceptedRows') as x(
    occurred_on date,
    original_date date,
    source_account_label text,
    source_account_masked text,
    institution text,
    account_type text,
    merchant_name text,
    description text,
    source_category text,
    normalized_category text,
    source_amount numeric,
    budget_impact numeric,
    net_worth_impact numeric,
    account_balance_impact numeric,
    flow_type text,
    include_in_spending_analytics boolean,
    include_in_cash_flow_history boolean,
    review_status text,
    review_flags jsonb,
    transaction_fingerprint text
  )
  where x.occurred_on is not null
    and x.source_amount is not null
    and x.description is not null;

  get diagnostics accepted_count = row_count;

  if jsonb_typeof(payload -> 'reviewItems') = 'array' then
    insert into public.finance_review_items (
      user_id,
      import_id,
      transaction_id,
      review_type,
      severity,
      status,
      reason,
      suggested_action
    )
    select
      uid,
      import_row_id,
      t.id,
      left(coalesce(r.review_type, ''), 80),
      case when r.severity in ('high', 'medium', 'low') then r.severity else 'low' end,
      case when r.status in ('open', 'resolved', 'ignored') then r.status else 'open' end,
      left(coalesce(r.reason, ''), 500),
      left(coalesce(r.suggested_action, ''), 500)
    from jsonb_to_recordset(payload -> 'reviewItems') as r(
      transaction_fingerprint text,
      review_type text,
      severity text,
      status text,
      reason text,
      suggested_action text
    )
    left join public.finance_transactions t
      on t.user_id = uid
      and t.import_id = import_row_id
      and t.transaction_fingerprint = r.transaction_fingerprint;
    get diagnostics review_count = row_count;
  end if;

  if jsonb_typeof(payload -> 'merchantRules') = 'array' then
    insert into public.finance_merchant_rules (
      user_id,
      match_type,
      match_value,
      normalized_category,
      flow_type_override,
      include_in_spending_analytics_override
    )
    select
      uid,
      case when m.match_type in ('exact', 'contains', 'prefix', 'regex') then m.match_type else 'exact' end,
      left(coalesce(m.match_value, ''), 200),
      nullif(left(coalesce(m.normalized_category, ''), 200), ''),
      case
        when m.flow_type_override in ('expense', 'income', 'refund_or_reversal', 'internal_transfer', 'credit_card_payment', 'ignored', 'zero_activity', 'unknown')
        then m.flow_type_override
        else null
      end,
      m.include_in_spending_analytics_override
    from jsonb_to_recordset(payload -> 'merchantRules') as m(
      match_type text,
      match_value text,
      normalized_category text,
      flow_type_override text,
      include_in_spending_analytics_override boolean
    )
    where nullif(coalesce(m.match_value, ''), '') is not null;
  end if;

  select min(t.occurred_on), max(t.occurred_on) into min_date, max_date
  from public.finance_transactions t
  where t.user_id = uid and t.import_id = import_row_id;

  select count(*) into excluded_count
  from public.finance_transactions t
  where t.user_id = uid
    and t.import_id = import_row_id
    and t.include_in_spending_analytics = false;

  update public.finance_transaction_imports
  set
    status = 'finalized',
    accepted_row_count = accepted_count,
    excluded_row_count = excluded_count,
    review_row_count = review_count,
    date_min = min_date,
    date_max = max_date,
    finalized_at = now()
  where id = import_row_id;

  return query
  select
    import_row_id,
    'finalized'::text,
    accepted_count,
    excluded_count,
    review_count,
    min_date,
    max_date;
end;
$$;


ALTER FUNCTION "public"."finalize_transaction_import_v1"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fos_ext_json_bigint"("elem" "jsonb", "key" "text", "default_val" bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when elem is null or elem -> key is null or jsonb_typeof(elem -> key) = 'null' then default_val
    when jsonb_typeof(elem -> key) = 'number' then (elem -> key)::bigint
    when btrim(coalesce(elem ->> key, '')) = '' then default_val
    when lower(btrim(elem ->> key)) in ('null', 'undefined', 'nan') then default_val
    else (btrim(elem ->> key))::bigint
  end;
$$;


ALTER FUNCTION "public"."fos_ext_json_bigint"("elem" "jsonb", "key" "text", "default_val" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fos_ext_json_bool"("elem" "jsonb", "key" "text", "default_val" boolean DEFAULT false) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when elem is null or elem -> key is null or jsonb_typeof(elem -> key) = 'null' then default_val
    when jsonb_typeof(elem -> key) = 'boolean' then (elem -> key)::boolean
    when jsonb_typeof(elem -> key) = 'number' then
      case
        when (elem -> key)::numeric = 0 then false
        when (elem -> key)::numeric = 1 then true
        else default_val
      end
    when btrim(coalesce(elem ->> key, '')) = '' then default_val
    when lower(btrim(elem ->> key)) in ('null', 'undefined', 'nan') then default_val
    when lower(btrim(elem ->> key)) in ('true', 't', '1', 'yes') then true
    when lower(btrim(elem ->> key)) in ('false', 'f', '0', 'no') then false
    else default_val
  end;
$$;


ALTER FUNCTION "public"."fos_ext_json_bool"("elem" "jsonb", "key" "text", "default_val" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fos_ext_json_date"("elem" "jsonb", "key" "text") RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when elem is null or elem -> key is null or jsonb_typeof(elem -> key) = 'null' then null::date
    when btrim(coalesce(elem ->> key, '')) = '' then null::date
    when lower(btrim(elem ->> key)) in ('null', 'undefined', 'nan') then null::date
    else (btrim(elem ->> key))::date
  end;
$$;


ALTER FUNCTION "public"."fos_ext_json_date"("elem" "jsonb", "key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fos_ext_json_int"("elem" "jsonb", "key" "text", "default_val" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when elem is null or elem -> key is null or jsonb_typeof(elem -> key) = 'null' then default_val
    when jsonb_typeof(elem -> key) = 'number' then (elem -> key)::integer
    when btrim(coalesce(elem ->> key, '')) = '' then default_val
    when lower(btrim(elem ->> key)) in ('null', 'undefined', 'nan') then default_val
    else (btrim(elem ->> key))::integer
  end;
$$;


ALTER FUNCTION "public"."fos_ext_json_int"("elem" "jsonb", "key" "text", "default_val" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fos_ext_json_numeric"("elem" "jsonb", "key" "text", "default_val" numeric DEFAULT 0) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when elem is null or elem -> key is null or jsonb_typeof(elem -> key) = 'null' then default_val
    when jsonb_typeof(elem -> key) = 'number' then (elem -> key)::numeric
    when btrim(coalesce(elem ->> key, '')) = '' then default_val
    when lower(btrim(elem ->> key)) in ('null', 'undefined', 'nan') then default_val
    else (btrim(elem ->> key))::numeric
  end;
$$;


ALTER FUNCTION "public"."fos_ext_json_numeric"("elem" "jsonb", "key" "text", "default_val" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."paper_device_snapshot"("p_token" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  expected_token_hash text;
  expected_user_id uuid;
  state_payload jsonb;
  task_payload jsonb;
begin
  select value into expected_token_hash
  from public.paper_device_config
  where key = 'token_sha256';

  select value::uuid into expected_user_id
  from public.paper_device_config
  where key = 'user_id';

  if expected_token_hash is null
    or expected_user_id is null
    or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> expected_token_hash
    or p_user_id <> expected_user_id 
    or not private.user_has_app_access(p_user_id, 'paper') then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select payload into state_payload
  from public.planner_user_state
  where user_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data) order by updated_at desc), '[]'::jsonb)
    into task_payload
  from public.planner_tasks
  where user_id = p_user_id;

  return jsonb_build_object(
    'state_payload', coalesce(state_payload, 'null'::jsonb),
    'tasks', task_payload
  );
end;
$$;


ALTER FUNCTION "public"."paper_device_snapshot"("p_token" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."planner_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."planner_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_today_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'fitness', 'music'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('America/Los_Angeles', now()))::date;
  v_today_key text := to_char(v_today, 'YYYY-MM-DD');
  v_month_start date := date_trunc('month', v_today)::date;
  v_planner_today int := 0;
  v_planner_overdue int := 0;
  v_fin_income numeric := 0;
  v_fin_expense numeric := 0;
  v_fit_date date;
  v_fit_day text;
  v_music_title text;
  v_music_artist text;
  v_music_played_at timestamptz;
  v_home_zone_count int;
  v_home_reported_at timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false);
  end if;

  select
    count(*) filter (
      where coalesce((data->>'completed')::boolean, false) = false
        and (data->>'dueDate') = v_today_key
    ),
    count(*) filter (
      where coalesce((data->>'completed')::boolean, false) = false
        and (data->>'dueDate') is not null
        and (data->>'dueDate') < v_today_key
    )
  into v_planner_today, v_planner_overdue
  from public.planner_tasks
  where user_id = v_uid;

  select
    coalesce(sum(case when flow = 'income' then abs(amount) else 0 end), 0),
    coalesce(
      sum(
        case
          when flow = 'expense'
            then abs(coalesce(nullif(budget_impact, 0), amount))
          else 0
        end
      ),
      0
    )
  into v_fin_income, v_fin_expense
  from public.finance_transactions
  where user_id = v_uid
    and txn_date >= v_month_start
    and txn_date <= v_today;

  select s.session_date, s.day_id
  into v_fit_date, v_fit_day
  from fitness.fitness_workout_sessions s
  where s.user_id = v_uid
    and s.ended_at is not null
  order by s.session_date desc, s.ended_at desc
  limit 1;

  select m.title, m.artist, pe.created_at
  into v_music_title, v_music_artist, v_music_played_at
  from music.play_events pe
  join music.music_track_meta m
    on m.user_id = pe.user_id
   and m.track_id = pe.track_id
  where pe.user_id = v_uid
  order by pe.created_at desc
  limit 1;

  select
    (s.settings->'portal_summary'->>'storage_zone_count')::int,
    (s.settings->'portal_summary'->>'reported_at')::timestamptz
  into v_home_zone_count, v_home_reported_at
  from public.core_user_app_settings s
  where s.user_id = v_uid
    and s.app_id = 'home'
    and s.settings ? 'portal_summary';

  return jsonb_build_object(
    'ok', true,
    'asOf', v_today_key,
    'planner', jsonb_build_object(
      'todayOpen', v_planner_today,
      'overdue', v_planner_overdue
    ),
    'finance', jsonb_build_object(
      'monthSurplus', round(v_fin_income - v_fin_expense, 2),
      'monthIncome', round(v_fin_income, 2),
      'monthExpense', round(v_fin_expense, 2)
    ),
    'fitness', case
      when v_fit_date is null then null
      else jsonb_build_object(
        'sessionDate', v_fit_date,
        'dayId', v_fit_day
      )
    end,
    'music', case
      when v_music_title is null then null
      else jsonb_build_object(
        'trackTitle', v_music_title,
        'trackArtist', coalesce(v_music_artist, ''),
        'playedAt', v_music_played_at
      )
    end,
    'home', case
      when v_home_reported_at is null then null
      else jsonb_build_object(
        'storageZoneCount', coalesce(v_home_zone_count, 0),
        'reportedAt', v_home_reported_at
      )
    end
  );
end;
$$;


ALTER FUNCTION "public"."portal_today_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_finance_backup_v1"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_schema_version int;
  v_data_version int;
  v_assumptions jsonb;
  v_privacy boolean;
  v_accounts int := 0;
  v_cash_flows int := 0;
  v_events int := 0;
  v_goals int := 0;
  v_transactions int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if payload is null then
    raise exception 'payload is required';
  end if;

  v_schema_version := coalesce((payload->>'schemaVersion')::int, -1);
  if v_schema_version <> 1 then
    raise exception 'unsupported schemaVersion: %', v_schema_version;
  end if;

  v_data_version := coalesce((payload->>'dataVersion')::int, 6);
  v_assumptions := payload->'assumptions';
  v_privacy := coalesce((payload->>'privacy')::boolean, false);

  -- Atomic replace in one transaction scope.
  delete from public.finance_transactions where user_id = v_uid;
  delete from public.finance_scenario_events where user_id = v_uid;
  delete from public.finance_cash_flows where user_id = v_uid;
  delete from public.finance_goals where user_id = v_uid;
  delete from public.finance_accounts where user_id = v_uid;
  delete from public.finance_user_settings where user_id = v_uid;

  insert into public.finance_user_settings (user_id, assumptions, privacy, data_version, updated_at)
  values (v_uid, coalesce(v_assumptions, '{}'::jsonb), v_privacy, v_data_version, now());

  insert into public.finance_accounts (
    user_id,id,name,type,balance,annual_return,apr,liquid,credit_mode,
    statement_balance,due_day,auto_pay_mode,payment_account_id,annual_fee,annual_fee_date,
    monthly_payment,term_months,basis,note,updated_at
  )
  select
    v_uid,
    a.id, coalesce(a.name, ''), a.type, coalesce(a.balance, 0), a."annualReturn",
    a.apr, a.liquid, a."creditMode", a."statementBalance", a."dueDay", a."autoPayMode",
    a."paymentAccountId", a."annualFee", a."annualFeeDate", a."monthlyPayment", a."termMonths",
    a.basis, a.note, coalesce(a."updatedAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'accounts', '[]'::jsonb)) as a(
    id text, name text, type text, balance numeric, "annualReturn" numeric,
    apr numeric, liquid boolean, "creditMode" text, "statementBalance" numeric,
    "dueDay" integer, "autoPayMode" text, "paymentAccountId" text,
    "annualFee" numeric, "annualFeeDate" text, "monthlyPayment" numeric,
    "termMonths" integer, basis numeric, note text, "updatedAt" text
  );
  get diagnostics v_accounts = row_count;

  insert into public.finance_cash_flows (
    user_id,id,name,type,frequency,amount,essential,start_month,end_month,category,pay_frequency,anchor_date,due_day
  )
  select
    v_uid,
    c.id, coalesce(c.name, ''), c.type, c.frequency, coalesce(c.amount, 0), c.essential,
    c."startMonth", c."endMonth", c.category, c."payFrequency", c."anchorDate", c."dueDay"
  from jsonb_to_recordset(coalesce(payload->'cashFlows', '[]'::jsonb)) as c(
    id text, name text, type text, frequency text, amount numeric, essential boolean,
    "startMonth" integer, "endMonth" integer, category text, "payFrequency" text,
    "anchorDate" text, "dueDay" integer
  );
  get diagnostics v_cash_flows = row_count;

  insert into public.finance_scenario_events (
    user_id,id,name,event_type,enabled,month_offset,amount,date,percent,contribution_percent,expense_category,funding_source,reconciled
  )
  select
    v_uid,
    e.id, coalesce(e.name, ''), e."eventType", coalesce(e.enabled, true), coalesce(e."monthOffset", 0),
    e.amount, e.date, e.percent, e."contributionPercent", e."expenseCategory", e."fundingSource", e.reconciled
  from jsonb_to_recordset(coalesce(payload->'events', '[]'::jsonb)) as e(
    id text, name text, "eventType" text, enabled boolean, "monthOffset" integer,
    amount numeric, date text, percent numeric, "contributionPercent" numeric,
    "expenseCategory" text, "fundingSource" text, reconciled boolean
  );
  get diagnostics v_events = row_count;

  insert into public.finance_goals (
    user_id,id,name,metric,target,current,priority,funding_account_id,monthly_allocation,
    monthly_allocation_day,target_date,reserve_policy,reserve
  )
  select
    v_uid,
    g.id, coalesce(g.name, ''), g.metric, coalesce(g.target, 0), g.current, g.priority,
    g."fundingAccountId", g."monthlyAllocation", g."monthlyAllocationDay", g."targetDate",
    g."reservePolicy", g.reserve
  from jsonb_to_recordset(coalesce(payload->'goals', '[]'::jsonb)) as g(
    id text, name text, metric text, target numeric, current numeric, priority text,
    "fundingAccountId" text, "monthlyAllocation" numeric, "monthlyAllocationDay" integer,
    "targetDate" text, "reservePolicy" text, reserve boolean
  );
  get diagnostics v_goals = row_count;

  insert into public.finance_transactions (
    id,user_id,txn_date,merchant,category,account,flow,amount,budget_impact,in_spending,in_cash_flow,exclude_reason,source,updated_at
  )
  select
    coalesce(t.id, gen_random_uuid()),
    v_uid,
    t.date::date,
    coalesce(t.merchant, ''),
    coalesce(t.category, 'Uncategorized'),
    coalesce(t.account, 'Unknown'),
    coalesce(t.flow, 'expense'),
    coalesce(t.amount, 0),
    coalesce(t."budgetImpact", 0),
    coalesce(t."inSpending", false),
    coalesce(t."inCashFlow", false),
    t."excludeReason",
    coalesce(t.source, 'import'),
    now()
  from jsonb_to_recordset(coalesce(payload->'transactions', '[]'::jsonb)) as t(
    id uuid, date text, merchant text, category text, account text, flow text,
    amount numeric, "budgetImpact" numeric, "inSpending" boolean, "inCashFlow" boolean,
    "excludeReason" text, source text
  );
  get diagnostics v_transactions = row_count;

  return jsonb_build_object(
    'schemaVersion', v_schema_version,
    'restored', jsonb_build_object(
      'accounts', v_accounts,
      'cash_flows', v_cash_flows,
      'scenario_events', v_events,
      'goals', v_goals,
      'transactions', v_transactions
    ),
    'restoredAt', now()
  );
end;
$$;


ALTER FUNCTION "public"."restore_finance_backup_v1"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_finance_backup_v2"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_schema_version int;
  v_data_version int;
  v_assumptions jsonb;
  v_privacy boolean;
  v_active_scenario_id text;
  v_portfolio_target jsonb;
  v_restored jsonb := '{}'::jsonb;
  v_count int;
  snap jsonb;
  pos jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if payload is null then
    raise exception 'payload is required';
  end if;

  v_schema_version := coalesce((payload->>'schemaVersion')::int, -1);
  if v_schema_version <> 2 then
    raise exception 'unsupported schemaVersion: %', v_schema_version;
  end if;

  v_data_version := coalesce((payload->>'dataVersion')::int, 6);
  v_assumptions := payload->'assumptions';
  v_privacy := coalesce((payload->>'privacy')::boolean, false);
  v_active_scenario_id := nullif(payload->>'activeScenarioId', '');
  v_portfolio_target := payload->'portfolioAllocationTarget';

  perform public.delete_all_financial_data_v2();

  insert into public.finance_user_settings (
    user_id, assumptions, privacy, data_version, active_scenario_id,
    portfolio_allocation_target, updated_at
  )
  values (
    v_uid, coalesce(v_assumptions, '{}'::jsonb), v_privacy, v_data_version,
    v_active_scenario_id, v_portfolio_target, now()
  );

  insert into public.finance_accounts (
    user_id,id,name,type,balance,annual_return,apr,liquid,credit_mode,
    statement_balance,due_day,auto_pay_mode,payment_account_id,annual_fee,annual_fee_date,
    monthly_payment,term_months,basis,note,balance_manual,fund_allocations,underlying_allocation,updated_at
  )
  select
    v_uid,
    a.id, coalesce(a.name, ''), a.type, coalesce(a.balance, 0), a."annualReturn",
    a.apr, a.liquid, a."creditMode", a."statementBalance", a."dueDay", a."autoPayMode",
    a."paymentAccountId", a."annualFee", a."annualFeeDate", a."monthlyPayment", a."termMonths",
    a.basis, a.note, coalesce(a."balanceManual", false),
    a."fundAllocations", a."underlyingAllocation",
    coalesce(a."updatedAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'accounts', '[]'::jsonb)) as a(
    id text, name text, type text, balance numeric, "annualReturn" numeric,
    apr numeric, liquid boolean, "creditMode" text, "statementBalance" numeric,
    "dueDay" integer, "autoPayMode" text, "paymentAccountId" text,
    "annualFee" numeric, "annualFeeDate" text, "monthlyPayment" numeric,
    "termMonths" integer, basis numeric, note text, "balanceManual" boolean,
    "fundAllocations" jsonb, "underlyingAllocation" jsonb, "updatedAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('accounts', v_count);

  insert into public.finance_scenarios (
    user_id,id,name,description,scenario_type,status,comparison_color_token,created_at,updated_at,archived_at
  )
  select
    v_uid,
    s.id, coalesce(s.name, 'Scenario'), s.description, coalesce(s."scenarioType", 'custom'),
    coalesce(s.status, 'draft'), s."comparisonColorToken",
    coalesce(s."createdAt", now()::text)::timestamptz,
    coalesce(s."updatedAt", now()::text)::timestamptz,
    s."archivedAt"::timestamptz
  from jsonb_to_recordset(coalesce(payload->'scenarios', '[]'::jsonb)) as s(
    id text, name text, description text, "scenarioType" text, status text,
    "comparisonColorToken" text, "createdAt" text, "updatedAt" text, "archivedAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('scenarios', v_count);

  insert into public.finance_cash_flows (
    user_id,id,name,type,frequency,amount,essential,start_month,end_month,category,pay_frequency,anchor_date,due_day
  )
  select
    v_uid,
    c.id, coalesce(c.name, ''), c.type, c.frequency, coalesce(c.amount, 0), c.essential,
    c."startMonth", c."endMonth", c.category, c."payFrequency", c."anchorDate", c."dueDay"
  from jsonb_to_recordset(coalesce(payload->'cashFlows', '[]'::jsonb)) as c(
    id text, name text, type text, frequency text, amount numeric, essential boolean,
    "startMonth" integer, "endMonth" integer, category text, "payFrequency" text,
    "anchorDate" text, "dueDay" integer
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('cash_flows', v_count);

  insert into public.finance_scenario_events (
    user_id,id,scenario_id,name,event_type,enabled,month_offset,amount,date,percent,contribution_percent,expense_category,funding_source,reconciled
  )
  select
    v_uid,
    e.id, coalesce(e."scenarioId", 'scenario_baseline'), coalesce(e.name, ''), e."eventType",
    coalesce(e.enabled, true), coalesce(e."monthOffset", 0),
    e.amount, e.date, e.percent, e."contributionPercent", e."expenseCategory", e."fundingSource", e.reconciled
  from jsonb_to_recordset(coalesce(payload->'events', '[]'::jsonb)) as e(
    id text, "scenarioId" text, name text, "eventType" text, enabled boolean, "monthOffset" integer,
    amount numeric, date text, percent numeric, "contributionPercent" numeric,
    "expenseCategory" text, "fundingSource" text, reconciled boolean
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('scenario_events', v_count);

  insert into public.finance_goals (
    user_id,id,name,metric,target,current,priority,funding_account_id,monthly_allocation,
    monthly_allocation_day,target_date,reserve_policy,reserve
  )
  select
    v_uid,
    g.id, coalesce(g.name, ''), g.metric, coalesce(g.target, 0), g.current, g.priority,
    g."fundingAccountId", g."monthlyAllocation", g."monthlyAllocationDay", g."targetDate",
    g."reservePolicy", g.reserve
  from jsonb_to_recordset(coalesce(payload->'goals', '[]'::jsonb)) as g(
    id text, name text, metric text, target numeric, current numeric, priority text,
    "fundingAccountId" text, "monthlyAllocation" numeric, "monthlyAllocationDay" integer,
    "targetDate" text, "reservePolicy" text, reserve boolean
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('goals', v_count);

  insert into public.finance_transactions (
    id,user_id,txn_date,merchant,category,account,flow,amount,budget_impact,in_spending,in_cash_flow,exclude_reason,source,updated_at
  )
  select
    coalesce(t.id, gen_random_uuid()),
    v_uid,
    t.date::date,
    coalesce(t.merchant, ''),
    coalesce(t.category, 'Uncategorized'),
    coalesce(t.account, 'Unknown'),
    coalesce(t.flow, 'expense'),
    coalesce(t.amount, 0),
    coalesce(t."budgetImpact", 0),
    coalesce(t."inSpending", false),
    coalesce(t."inCashFlow", false),
    t."excludeReason",
    coalesce(t.source, 'import'),
    now()
  from jsonb_to_recordset(coalesce(payload->'transactions', '[]'::jsonb)) as t(
    id uuid, date text, merchant text, category text, account text, flow text,
    amount numeric, "budgetImpact" numeric, "inSpending" boolean, "inCashFlow" boolean,
    "excludeReason" text, source text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('transactions', v_count);

  insert into public.finance_balance_assertions (
    id,user_id,account_id,assertion_date,amount,note,adjustment_txn_id,created_at
  )
  select
    coalesce(b.id::uuid, gen_random_uuid()),
    v_uid,
    b."accountId", b.date::date, coalesce(b.amount, 0), b.note,
    b."adjustmentTxnId"::uuid, coalesce(b."createdAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'balanceAssertions', '[]'::jsonb)) as b(
    id text, "accountId" text, date text, amount numeric, note text,
    "adjustmentTxnId" text, "createdAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('balance_assertions', v_count);

  insert into public.finance_expected_occurrences (
    id,user_id,source_type,source_id,label,occurrence_date,expected_amount,account_id,state,
    matched_txn_id,actual_amount,actual_date,reconciled_period_id,variance_amount,variance_days,updated_at
  )
  select
    o.id, v_uid, o."sourceType", o."sourceId", coalesce(o.label, ''), o.date::date,
    coalesce(o."expectedAmount", 0), o."accountId", coalesce(o.state, 'planned'),
    o."matchedTxnId"::uuid, o."actualAmount", o."actualDate"::date,
    o."reconciledPeriodId"::uuid, o."varianceAmount", o."varianceDays", now()
  from jsonb_to_recordset(coalesce(payload->'expectedOccurrences', '[]'::jsonb)) as o(
    id text, "sourceType" text, "sourceId" text, label text, date text, "expectedAmount" numeric,
    "accountId" text, state text, "matchedTxnId" text, "actualAmount" numeric, "actualDate" text,
    "reconciledPeriodId" text, "varianceAmount" numeric, "varianceDays" integer
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('expected_occurrences', v_count);

  for snap in select * from jsonb_array_elements(coalesce(payload->'holdingsSnapshots', '[]'::jsonb))
  loop
    insert into public.finance_holdings_snapshots (
      user_id,id,account_id,institution,account_label,as_of_date,as_of_time_local,timezone,
      imported_at,source_type,source_description,note,needs_user_confirmation,reconciliation_status,
      holdings_market_value,implied_cost_basis,unrealized_gain,weighted_total_return_pct,
      today_return_amount_approx,today_return_pct_approx,position_count,stock_count,etf_count
    )
    values (
      v_uid,
      snap->>'id',
      nullif(snap->>'accountId', ''),
      nullif(snap->>'institution', ''),
      coalesce(snap->>'accountLabel', ''),
      (snap->>'asOfDate')::date,
      nullif(snap->>'asOfTimeLocal', ''),
      nullif(snap->>'timezone', ''),
      coalesce(snap->>'importedAt', now()::text)::timestamptz,
      coalesce(snap->>'sourceType', 'manual_snapshot_import'),
      nullif(snap->>'sourceDescription', ''),
      nullif(snap->>'note', ''),
      coalesce((snap->>'needsUserConfirmation')::boolean, false),
      coalesce(snap->>'reconciliationStatus', 'incomplete'),
      coalesce((snap->>'holdingsMarketValue')::numeric, 0),
      (snap->>'impliedCostBasis')::numeric,
      (snap->>'unrealizedGain')::numeric,
      (snap->>'weightedTotalReturnPct')::numeric,
      (snap->>'todayReturnAmountApprox')::numeric,
      (snap->>'todayReturnPctApprox')::numeric,
      coalesce((snap->>'positionCount')::int, 0),
      (snap->>'stockCount')::int,
      (snap->>'etfCount')::int
    );
    for pos in select * from jsonb_array_elements(coalesce(snap->'positions', '[]'::jsonb))
    loop
      insert into public.finance_holding_positions (
        user_id,snapshot_id,id,ticker,security_name,asset_type,shares,market_price,market_value,
        average_cost_per_share,implied_cost_basis,portfolio_weight_pct,portfolio_diversity_displayed_pct,
        today_return_amount,today_return_pct,total_return_amount,total_return_pct_displayed,source_captured_at
      )
      values (
        v_uid,
        snap->>'id',
        pos->>'id',
        coalesce(pos->>'ticker', ''),
        coalesce(pos->>'securityName', ''),
        coalesce(pos->>'assetType', 'other'),
        coalesce((pos->>'shares')::numeric, 0),
        coalesce((pos->>'marketPrice')::numeric, 0),
        coalesce((pos->>'marketValue')::numeric, 0),
        (pos->>'averageCostPerShare')::numeric,
        (pos->>'impliedCostBasis')::numeric,
        (pos->>'portfolioWeightPct')::numeric,
        (pos->>'portfolioDiversityDisplayedPct')::numeric,
        (pos->>'todayReturnAmount')::numeric,
        (pos->>'todayReturnPct')::numeric,
        (pos->>'totalReturnAmount')::numeric,
        (pos->>'totalReturnPctDisplayed')::numeric,
        nullif(pos->>'sourceCapturedAt', '')
      );
    end loop;
  end loop;
  v_restored := v_restored || jsonb_build_object(
    'holdings_snapshots', jsonb_array_length(coalesce(payload->'holdingsSnapshots', '[]'::jsonb))
  );

  insert into public.finance_decision_records (
    user_id,id,scenario_id,decision_status,decision_summary,reason,
    expected_outcome_json,actual_outcome_json,decided_at,review_on,reviewed_at,created_at,updated_at
  )
  select
    v_uid,
    d.id, d."scenarioId", d."decisionStatus", coalesce(d."decisionSummary", ''),
    d.reason, d."expectedOutcomeJson", d."actualOutcomeJson",
    d."decidedAt"::timestamptz, d."reviewOn"::date, d."reviewedAt"::timestamptz,
    coalesce(d."createdAt", now()::text)::timestamptz,
    coalesce(d."updatedAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'decisionRecords', '[]'::jsonb)) as d(
    id text, "scenarioId" text, "decisionStatus" text, "decisionSummary" text, reason text,
    "expectedOutcomeJson" jsonb, "actualOutcomeJson" jsonb, "decidedAt" text, "reviewOn" text,
    "reviewedAt" text, "createdAt" text, "updatedAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('decision_records', v_count);

  return jsonb_build_object(
    'schemaVersion', v_schema_version,
    'restored', v_restored,
    'restoredAt', now()
  );
end;
$$;


ALTER FUNCTION "public"."restore_finance_backup_v2"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_finance_bill_to_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Only trigger for card bills
  if NEW.source_type = 'card_bill' then
    insert into public.life_events (
      user_id,
      type,
      payload
    ) values (
      NEW.user_id,
      'finance.bill_due',
      jsonb_build_object(
        'occurrence_id', NEW.id,
        'label', NEW.label,
        'expected_amount', NEW.expected_amount,
        'occurrence_date', NEW.occurrence_date
      )
    );
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_finance_bill_to_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fitness_workout_to_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'fitness'
    AS $$
begin
  if NEW.ended_at is null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and OLD.ended_at is not distinct from NEW.ended_at then
    return NEW;
  end if;

  if exists (
    select 1
    from public.life_events e
    where e.user_id = NEW.user_id
      and e.type = 'fitness.workout_logged'
      and e.payload->>'session_id' = NEW.id::text
  ) then
    return NEW;
  end if;

  insert into public.life_events (
    user_id,
    type,
    payload
  ) values (
    NEW.user_id,
    'fitness.workout_logged',
    jsonb_build_object(
      'session_id', NEW.id,
      'day_id', NEW.day_id,
      'session_date', NEW.session_date,
      'ended_at', NEW.ended_at
    )
  );

  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_fitness_workout_to_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_latest_scenario_apply_v1"() RETURNS TABLE("undone_count" integer, "undone_event_ids" "jsonb", "undone_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  uid uuid;
  audit_id uuid;
  inserted_ids jsonb;
  ts timestamptz := now();
  rows_deleted integer := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  select a.id, a.inserted_event_ids
  into audit_id, inserted_ids
  from public.finance_scenario_apply_audits a
  where a.user_id = uid
    and a.undone_at is null
  order by a.applied_at desc
  limit 1;

  if audit_id is null then
    raise exception 'no apply operation available to undo';
  end if;

  delete from public.finance_scenario_events e
  where e.user_id = uid
    and e.scenario_id = 'scenario_baseline'
    and e.id in (
      select value::text
      from jsonb_array_elements_text(inserted_ids)
    );
  get diagnostics rows_deleted = row_count;

  update public.finance_scenario_apply_audits
  set undone_at = ts
  where id = audit_id;

  return query
  select rows_deleted, inserted_ids, ts;
end;
$$;


ALTER FUNCTION "public"."undo_latest_scenario_apply_v1"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "fitness"."fitness_exercise_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "exercise_id" "text" NOT NULL,
    "done" integer DEFAULT 0 NOT NULL,
    "sets" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "skipped" "jsonb",
    "started_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'fitness'::"text" NOT NULL,
    CONSTRAINT "exercise_logs_os_module_check" CHECK (("os_module" = 'fitness'::"text"))
);


ALTER TABLE "fitness"."fitness_exercise_logs" OWNER TO "postgres";


COMMENT ON COLUMN "fitness"."fitness_exercise_logs"."os_module" IS '所属 Life OS 模块（fitness）';



CREATE TABLE IF NOT EXISTS "fitness"."fitness_exercise_weights" (
    "user_id" "uuid" NOT NULL,
    "exercise_id" "text" NOT NULL,
    "weight" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'fitness'::"text" NOT NULL,
    CONSTRAINT "exercise_weights_os_module_check" CHECK (("os_module" = 'fitness'::"text"))
);


ALTER TABLE "fitness"."fitness_exercise_weights" OWNER TO "postgres";


COMMENT ON COLUMN "fitness"."fitness_exercise_weights"."os_module" IS '所属 Life OS 模块（fitness）';



CREATE TABLE IF NOT EXISTS "fitness"."fitness_profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'fitness'::"text" NOT NULL,
    CONSTRAINT "profiles_os_module_check" CHECK (("os_module" = 'fitness'::"text"))
);


ALTER TABLE "fitness"."fitness_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "fitness"."fitness_profiles"."os_module" IS '所属 Life OS 模块（fitness）';



CREATE TABLE IF NOT EXISTS "fitness"."fitness_user_state" (
    "user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rotation" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "program_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active_program_id" "text",
    "last_day" "text",
    "schema_version" integer DEFAULT 4 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'fitness'::"text" NOT NULL,
    CONSTRAINT "user_state_os_module_check" CHECK (("os_module" = 'fitness'::"text"))
);


ALTER TABLE "fitness"."fitness_user_state" OWNER TO "postgres";


COMMENT ON COLUMN "fitness"."fitness_user_state"."os_module" IS '所属 Life OS 模块（fitness）';



CREATE TABLE IF NOT EXISTS "fitness"."fitness_workout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_date" "date" NOT NULL,
    "day_id" "text" NOT NULL,
    "program_id" "text",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'fitness'::"text" NOT NULL,
    CONSTRAINT "workout_sessions_os_module_check" CHECK (("os_module" = 'fitness'::"text"))
);


ALTER TABLE "fitness"."fitness_workout_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "fitness"."fitness_workout_sessions"."os_module" IS '所属 Life OS 模块（fitness）';



CREATE TABLE IF NOT EXISTS "music"."music_playlist_tracks" (
    "user_id" "uuid" NOT NULL,
    "playlist_id" "text" NOT NULL,
    "track_id" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "music"."music_playlist_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."music_playlists" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" bigint DEFAULT 0 NOT NULL,
    "updated_at" bigint DEFAULT 0 NOT NULL,
    "row_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "music"."music_playlists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."music_profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "music"."music_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."music_track_meta" (
    "user_id" "uuid" NOT NULL,
    "track_id" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "artist" "text" DEFAULT ''::"text" NOT NULL,
    "album" "text" DEFAULT ''::"text" NOT NULL,
    "album_key" "text" DEFAULT ''::"text" NOT NULL,
    "artist_key" "text" DEFAULT ''::"text" NOT NULL,
    "duration" numeric DEFAULT 0 NOT NULL,
    "liked" smallint DEFAULT 0 NOT NULL,
    "play_count" integer DEFAULT 0 NOT NULL,
    "added_at" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lyrics" "text" DEFAULT ''::"text" NOT NULL,
    "storage_path" "text" DEFAULT ''::"text" NOT NULL,
    "mime_type" "text" DEFAULT ''::"text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "art_remote_url" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "music"."music_track_meta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."music_user_state" (
    "user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "schema_version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "music"."music_user_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."play_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "track_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "position_sec" integer,
    "played_ratio" numeric,
    "context" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "play_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['play'::"text", 'complete'::"text", 'skip'::"text", 'like'::"text", 'dislike'::"text", 'replay'::"text", 'add_to_playlist'::"text", 'remove_from_playlist'::"text", 'search_play'::"text"])))
);


ALTER TABLE "music"."play_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."recommendation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_track_id" "text",
    "recommended_track_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "recommendation_mode" "text",
    "recommendation_rank" integer,
    "recommendation_score" numeric,
    "matched_tags" "text"[],
    "request_id" "uuid",
    "context" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recommendation_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['queue_add'::"text", 'play'::"text", 'skip'::"text", 'complete'::"text", 'like'::"text", 'click'::"text"])))
);


ALTER TABLE "music"."recommendation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."tag_dictionary" (
    "slug" "text" NOT NULL,
    "namespace" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "parent_slug" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tag_dictionary_namespace_check" CHECK (("namespace" = ANY (ARRAY['genre'::"text", 'style'::"text", 'vibe'::"text", 'context'::"text", 'language'::"text", 'quality'::"text", 'version'::"text", 'source'::"text"])))
);


ALTER TABLE "music"."tag_dictionary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."tag_review_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "track_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "confidence" numeric,
    "proposed_tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "tag_review_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "music"."tag_review_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."track_audio_features" (
    "user_id" "uuid" NOT NULL,
    "track_id" "text" NOT NULL,
    "bpm" numeric,
    "musical_key" "text",
    "loudness_lufs" numeric,
    "energy" numeric,
    "danceability" numeric,
    "valence" numeric,
    "acousticness" numeric,
    "instrumentalness" numeric,
    "vocal_presence" numeric,
    "intro_length_sec" numeric,
    "outro_fade" boolean,
    "analyzed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "track_audio_features_danceability_check" CHECK ((("danceability" IS NULL) OR (("danceability" >= (1)::numeric) AND ("danceability" <= (5)::numeric)))),
    CONSTRAINT "track_audio_features_energy_check" CHECK ((("energy" IS NULL) OR (("energy" >= (1)::numeric) AND ("energy" <= (5)::numeric)))),
    CONSTRAINT "track_audio_features_valence_check" CHECK ((("valence" IS NULL) OR (("valence" >= (1)::numeric) AND ("valence" <= (5)::numeric)))),
    CONSTRAINT "track_audio_features_vocal_presence_check" CHECK ((("vocal_presence" IS NULL) OR (("vocal_presence" >= (1)::numeric) AND ("vocal_presence" <= (5)::numeric))))
);


ALTER TABLE "music"."track_audio_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."track_embeddings" (
    "user_id" "uuid" NOT NULL,
    "track_id" "text" NOT NULL,
    "embedding" "extensions"."vector"(1536),
    "embedding_text" "text" DEFAULT ''::"text" NOT NULL,
    "model" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "music"."track_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."track_enrichment" (
    "user_id" "uuid" NOT NULL,
    "track_id" "text" NOT NULL,
    "file_hash" "text",
    "language" "text",
    "release_year" integer,
    "isrc" "text",
    "musicbrainz_recording_id" "text",
    "acoustid" "text",
    "codec" "text",
    "bitrate_kbps" integer,
    "sample_rate" integer,
    "source_quality" "text",
    "version_type" "text",
    "is_live" boolean DEFAULT false NOT NULL,
    "is_remix" boolean DEFAULT false NOT NULL,
    "is_cover" boolean DEFAULT false NOT NULL,
    "is_duplicate" boolean DEFAULT false NOT NULL,
    "tagging_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "tag_confidence_avg" numeric,
    "analyzed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "canonical_track_id" "text",
    "duplicate_of" "text",
    CONSTRAINT "track_enrichment_source_quality_check" CHECK ((("source_quality" IS NULL) OR ("source_quality" = ANY (ARRAY['low-quality'::"text", 'standard-quality'::"text", 'high-compressed'::"text", 'lossless'::"text", 'needs-review'::"text"])))),
    CONSTRAINT "track_enrichment_tagging_status_check" CHECK (("tagging_status" = ANY (ARRAY['pending'::"text", 'partial'::"text", 'ready'::"text", 'needs_review'::"text"]))),
    CONSTRAINT "track_enrichment_version_type_check" CHECK ((("version_type" IS NULL) OR ("version_type" = ANY (ARRAY['original'::"text", 'remix'::"text", 'cover'::"text", 'live'::"text", 'sped-up'::"text", 'slowed'::"text", 'instrumental'::"text", 'radio-edit'::"text", 'explicit'::"text", 'clean'::"text"]))))
);


ALTER TABLE "music"."track_enrichment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "music"."track_tags" (
    "user_id" "uuid" NOT NULL,
    "track_id" "text" NOT NULL,
    "tag_slug" "text" NOT NULL,
    "confidence" numeric DEFAULT 1.0 NOT NULL,
    "source" "text" NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "track_tags_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "track_tags_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'filename'::"text", 'musicbrainz'::"text", 'lastfm'::"text", 'essentia'::"text", 'llm'::"text", 'user_behavior'::"text", 'heuristic'::"text"])))
);


ALTER TABLE "music"."track_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_memberships" (
    "app_key" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activated_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "app_memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))),
    CONSTRAINT "app_memberships_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'suspended'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."app_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_registry" (
    "app_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "app_url" "text",
    "icon_key" "text",
    "is_enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_registry_app_key_check" CHECK (("app_key" ~ '^[a-z][a-z0-9_-]{1,31}$'::"text"))
);


ALTER TABLE "public"."app_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bug_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "app" "text" NOT NULL,
    "route" "text" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "screenshot_path" "text",
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "user_agent" "text",
    "viewport_width" integer,
    "viewport_height" integer,
    "device_pixel_ratio" numeric,
    "console_summary" "text",
    "error_message" "text",
    "error_stack" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bug_logs_app_check" CHECK (("app" = ANY (ARRAY['portal'::"text", 'planner'::"text", 'fitness'::"text", 'music'::"text", 'finance'::"text", 'home'::"text"]))),
    CONSTRAINT "bug_logs_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "bug_logs_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'fixed'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."bug_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."core_allowed_devices" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" DEFAULT '设备'::"text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone,
    "device_class" "text" NOT NULL,
    "device_id" "text",
    "os_module" "text" DEFAULT 'core'::"text" NOT NULL,
    CONSTRAINT "allowed_devices_device_class_check" CHECK (("device_class" = ANY (ARRAY['desktop'::"text", 'mobile'::"text"]))),
    CONSTRAINT "allowed_devices_os_module_check" CHECK (("os_module" = 'core'::"text"))
);


ALTER TABLE "public"."core_allowed_devices" OWNER TO "postgres";


COMMENT ON COLUMN "public"."core_allowed_devices"."os_module" IS '所属 Life OS 模块（core）';



CREATE TABLE IF NOT EXISTS "public"."core_profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "timezone" "text" DEFAULT 'America/Los_Angeles'::"text" NOT NULL,
    "locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "default_app" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'core'::"text" NOT NULL,
    CONSTRAINT "core_profiles_default_app_check" CHECK ((("default_app" IS NULL) OR ("default_app" = ANY (ARRAY['finance'::"text", 'fitness'::"text", 'planner'::"text", 'music'::"text", 'portal'::"text", 'home'::"text"])))),
    CONSTRAINT "core_profiles_os_module_check" CHECK (("os_module" = 'core'::"text"))
);


ALTER TABLE "public"."core_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."core_profiles" IS 'Life OS 共享用户档案；id = auth.users.id';



COMMENT ON COLUMN "public"."core_profiles"."default_app" IS 'Portal / 启动器默认打开的 App';



CREATE TABLE IF NOT EXISTS "public"."core_user_app_settings" (
    "user_id" "uuid" NOT NULL,
    "app_id" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_opened_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'core'::"text" NOT NULL,
    CONSTRAINT "core_user_app_settings_app_id_check" CHECK (("app_id" = ANY (ARRAY['finance'::"text", 'fitness'::"text", 'planner'::"text", 'music'::"text", 'portal'::"text", 'home'::"text"]))),
    CONSTRAINT "core_user_app_settings_os_module_check" CHECK (("os_module" = 'core'::"text"))
);


ALTER TABLE "public"."core_user_app_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."core_user_app_settings" IS 'Life OS 各 App 用户设置（jsonb）与 last_opened_at';



CREATE TABLE IF NOT EXISTS "public"."finance_accounts" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "annual_return" numeric,
    "apr" numeric,
    "liquid" boolean,
    "credit_mode" "text",
    "statement_balance" numeric,
    "due_day" integer,
    "auto_pay_mode" "text",
    "payment_account_id" "text",
    "annual_fee" numeric,
    "annual_fee_date" "text",
    "monthly_payment" numeric,
    "term_months" integer,
    "basis" numeric,
    "note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "balance_manual" boolean DEFAULT false NOT NULL,
    "fund_allocations" "jsonb",
    "underlying_allocation" "jsonb",
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "accounts_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_accounts"."balance_manual" IS 'When true, finance setup skips auto balance/basis sync from holdings snapshots.';



COMMENT ON COLUMN "public"."finance_accounts"."fund_allocations" IS 'Fund weights inside retirement/HSA accounts: ticker, weightPct, assetClass.';



COMMENT ON COLUMN "public"."finance_accounts"."underlying_allocation" IS 'Look-through asset class weights for retirement/HSA (e.g. OGSV MW 2065 breakdown).';



COMMENT ON COLUMN "public"."finance_accounts"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_balance_assertions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" "text" NOT NULL,
    "assertion_date" "date" NOT NULL,
    "amount" numeric NOT NULL,
    "note" "text",
    "adjustment_txn_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "balance_assertions_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_balance_assertions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_balance_assertions"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_cash_flows" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "essential" boolean,
    "start_month" integer,
    "end_month" integer,
    "category" "text",
    "pay_frequency" "text",
    "anchor_date" "text",
    "due_day" integer,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "cash_flows_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_cash_flows" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_cash_flows"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_data" (
    "user_id" "uuid" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "finance_data_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_data" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_data"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_decision_records" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "scenario_id" "text" NOT NULL,
    "decision_status" "text" NOT NULL,
    "decision_summary" "text" DEFAULT ''::"text" NOT NULL,
    "reason" "text",
    "expected_outcome_json" "jsonb",
    "actual_outcome_json" "jsonb",
    "decided_at" timestamp with time zone,
    "review_on" "date",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "decision_records_decision_status_check" CHECK (("decision_status" = ANY (ARRAY['considering'::"text", 'chosen'::"text", 'declined'::"text", 'deferred'::"text", 'reviewed'::"text"]))),
    CONSTRAINT "decision_records_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_decision_records" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_decision_records"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_expected_occurrences" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "occurrence_date" "date" NOT NULL,
    "expected_amount" numeric NOT NULL,
    "account_id" "text",
    "state" "text" NOT NULL,
    "matched_txn_id" "uuid",
    "actual_amount" numeric,
    "actual_date" "date",
    "reconciled_period_id" "uuid",
    "variance_amount" numeric,
    "variance_days" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "expected_occurrences_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "expected_occurrences_source_type_check" CHECK (("source_type" = ANY (ARRAY['cashflow'::"text", 'event'::"text", 'card_bill'::"text", 'goal_transfer'::"text", 'annual_fee'::"text"]))),
    CONSTRAINT "expected_occurrences_state_check" CHECK (("state" = ANY (ARRAY['planned'::"text", 'upcoming'::"text", 'pending'::"text", 'matched'::"text", 'reconciled'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."finance_expected_occurrences" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_expected_occurrences"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_extension_processed_captures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "envelope_id" "text" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "capture_source" "text" NOT NULL,
    "capture_kind" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "extension_processed_captures_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_extension_processed_captures" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_extension_processed_captures"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_goals" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "metric" "text" NOT NULL,
    "target" numeric DEFAULT 0 NOT NULL,
    "current" numeric,
    "priority" "text",
    "funding_account_id" "text",
    "monthly_allocation" numeric,
    "target_date" "text",
    "reserve" boolean,
    "monthly_allocation_day" integer,
    "reserve_policy" "text",
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "goals_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_goals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_goals"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_holding_daily_candles" (
    "user_id" "uuid" NOT NULL,
    "symbol" "text" NOT NULL,
    "date" "date" NOT NULL,
    "close" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "holding_daily_candles_close_check" CHECK (("close" > (0)::numeric)),
    CONSTRAINT "holding_daily_candles_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_holding_daily_candles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_holding_daily_candles"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_holding_positions" (
    "user_id" "uuid" NOT NULL,
    "snapshot_id" "text" NOT NULL,
    "id" "text" NOT NULL,
    "ticker" "text" NOT NULL,
    "security_name" "text" NOT NULL,
    "asset_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "shares" numeric DEFAULT 0 NOT NULL,
    "market_price" numeric DEFAULT 0 NOT NULL,
    "market_value" numeric DEFAULT 0 NOT NULL,
    "average_cost_per_share" numeric,
    "implied_cost_basis" numeric,
    "portfolio_weight_pct" numeric,
    "portfolio_diversity_displayed_pct" numeric,
    "today_return_amount" numeric,
    "today_return_pct" numeric,
    "total_return_amount" numeric,
    "total_return_pct_displayed" numeric,
    "source_captured_at" "text",
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "holding_positions_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['stock'::"text", 'etf'::"text", 'other'::"text"]))),
    CONSTRAINT "holding_positions_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_holding_positions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_holding_positions"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_holding_price_trails" (
    "user_id" "uuid" NOT NULL,
    "symbol" "text" NOT NULL,
    "captured_at" timestamp with time zone NOT NULL,
    "price" numeric NOT NULL,
    "source_type" "text" DEFAULT 'live'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "holding_price_trails_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "holding_price_trails_price_check" CHECK (("price" > (0)::numeric)),
    CONSTRAINT "holding_price_trails_source_type_check" CHECK (("source_type" = ANY (ARRAY['live'::"text", 'snapshot'::"text"])))
);


ALTER TABLE "public"."finance_holding_price_trails" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_holding_price_trails"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_holdings_snapshots" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "account_id" "text",
    "institution" "text",
    "account_label" "text" NOT NULL,
    "as_of_date" "date" NOT NULL,
    "as_of_time_local" "text",
    "timezone" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_type" "text" DEFAULT 'manual_snapshot_import'::"text" NOT NULL,
    "source_description" "text",
    "note" "text",
    "needs_user_confirmation" boolean DEFAULT false NOT NULL,
    "reconciliation_status" "text" DEFAULT 'incomplete'::"text" NOT NULL,
    "holdings_market_value" numeric DEFAULT 0 NOT NULL,
    "implied_cost_basis" numeric,
    "unrealized_gain" numeric,
    "weighted_total_return_pct" numeric,
    "today_return_amount_approx" numeric,
    "today_return_pct_approx" numeric,
    "position_count" integer DEFAULT 0 NOT NULL,
    "stock_count" integer,
    "etf_count" integer,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "holdings_snapshots_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "holdings_snapshots_position_count_check" CHECK (("position_count" >= 0)),
    CONSTRAINT "holdings_snapshots_reconciliation_status_check" CHECK (("reconciliation_status" = ANY (ARRAY['incomplete'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."finance_holdings_snapshots" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_holdings_snapshots"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_merchant_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "match_type" "text" NOT NULL,
    "match_value" "text" NOT NULL,
    "normalized_category" "text",
    "flow_type_override" "text",
    "include_in_spending_analytics_override" boolean,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "merchant_rules_flow_type_override_check" CHECK (("flow_type_override" = ANY (ARRAY['expense'::"text", 'income'::"text", 'refund_or_reversal'::"text", 'internal_transfer'::"text", 'credit_card_payment'::"text", 'ignored'::"text", 'zero_activity'::"text", 'unknown'::"text"]))),
    CONSTRAINT "merchant_rules_match_type_check" CHECK (("match_type" = ANY (ARRAY['exact'::"text", 'contains'::"text", 'prefix'::"text", 'regex'::"text"]))),
    CONSTRAINT "merchant_rules_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_merchant_rules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_merchant_rules"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_recurring_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "merchant_rule_id" "uuid",
    "merchant_label" "text" NOT NULL,
    "normalized_category" "text" NOT NULL,
    "expected_amount" numeric DEFAULT 0 NOT NULL,
    "amount_tolerance" numeric DEFAULT 0.2 NOT NULL,
    "cadence" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "expected_billing_day" integer,
    "status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "recurring_items_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "recurring_items_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'confirmed'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."finance_recurring_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_recurring_items"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_review_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "import_id" "uuid" NOT NULL,
    "transaction_id" "uuid",
    "review_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "suggested_action" "text" NOT NULL,
    "resolution" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "review_items_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "review_items_severity_check" CHECK (("severity" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "review_items_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."finance_review_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_review_items"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_scenario_apply_audits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_scenario_id" "text" NOT NULL,
    "selected_event_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "inserted_event_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "undone_at" timestamp with time zone,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "scenario_apply_audits_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_scenario_apply_audits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_scenario_apply_audits"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_scenario_events" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "month_offset" integer DEFAULT 0 NOT NULL,
    "amount" numeric,
    "date" "text",
    "percent" numeric,
    "contribution_percent" numeric,
    "expense_category" "text",
    "funding_source" "text",
    "reconciled" boolean,
    "scenario_id" "text" NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "scenario_events_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "scenario_events_type_check" CHECK (("event_type" = ANY (ARRAY['one_time_expense'::"text", 'recurring_expense_change'::"text", 'income_change'::"text", 'transfer'::"text", 'goal_allocation_change'::"text", 'partner_contribution'::"text", 'financed_purchase'::"text", 'custom'::"text", 'salary-change'::"text", 'expense-change'::"text", 'one-time-purchase'::"text", 'windfall'::"text"])))
);


ALTER TABLE "public"."finance_scenario_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_scenario_events"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_scenario_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scenario_id" "text" NOT NULL,
    "snapshot_type" "text" NOT NULL,
    "assumptions_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "results_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "scenario_snapshots_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "scenario_snapshots_snapshot_type_check" CHECK (("snapshot_type" = ANY (ARRAY['comparison_preview'::"text", 'decision_saved'::"text", 'review_completed'::"text"])))
);


ALTER TABLE "public"."finance_scenario_snapshots" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_scenario_snapshots"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_scenarios" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "name" "text" DEFAULT 'Scenario'::"text" NOT NULL,
    "description" "text",
    "scenario_type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "comparison_color_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "scenarios_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "scenarios_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'saved'::"text", 'chosen'::"text", 'archived'::"text"]))),
    CONSTRAINT "scenarios_type_check" CHECK (("scenario_type" = ANY (ARRAY['custom'::"text", 'purchase'::"text", 'recurring_cost'::"text", 'rent_change'::"text", 'travel'::"text", 'career_break'::"text", 'partner_contribution'::"text", 'cash_vs_finance'::"text"])))
);


ALTER TABLE "public"."finance_scenarios" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_scenarios"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_transaction_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'csv'::"text" NOT NULL,
    "source_file_name_masked" "text" NOT NULL,
    "source_file_hash" "text" NOT NULL,
    "raw_row_count" integer DEFAULT 0 NOT NULL,
    "accepted_row_count" integer DEFAULT 0 NOT NULL,
    "excluded_row_count" integer DEFAULT 0 NOT NULL,
    "review_row_count" integer DEFAULT 0 NOT NULL,
    "date_min" "date",
    "date_max" "date",
    "schema_version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalized_at" timestamp with time zone,
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    CONSTRAINT "transaction_imports_accepted_row_count_check" CHECK (("accepted_row_count" >= 0)),
    CONSTRAINT "transaction_imports_excluded_row_count_check" CHECK (("excluded_row_count" >= 0)),
    CONSTRAINT "transaction_imports_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "transaction_imports_raw_row_count_check" CHECK (("raw_row_count" >= 0)),
    CONSTRAINT "transaction_imports_review_row_count_check" CHECK (("review_row_count" >= 0)),
    CONSTRAINT "transaction_imports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'finalized'::"text", 'failed'::"text", 'superseded'::"text"])))
);


ALTER TABLE "public"."finance_transaction_imports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_transaction_imports"."os_module" IS '所属 Life OS 模块（finance）';



CREATE TABLE IF NOT EXISTS "public"."finance_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "txn_date" "date" NOT NULL,
    "merchant" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'Uncategorized'::"text" NOT NULL,
    "account" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "flow" "text" DEFAULT 'expense'::"text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "budget_impact" numeric DEFAULT 0 NOT NULL,
    "in_spending" boolean DEFAULT false NOT NULL,
    "in_cash_flow" boolean DEFAULT false NOT NULL,
    "exclude_reason" "text",
    "source" "text" DEFAULT 'import'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "import_id" "uuid",
    "transaction_fingerprint" "text",
    "occurred_on" "date" NOT NULL,
    "original_date" "date",
    "source_account_label" "text",
    "source_account_masked" "text",
    "institution" "text",
    "account_type" "text",
    "merchant_name" "text" NOT NULL,
    "description" "text",
    "source_category" "text",
    "normalized_category" "text" NOT NULL,
    "source_amount" numeric NOT NULL,
    "net_worth_impact" numeric,
    "account_balance_impact" numeric,
    "flow_type" "text" NOT NULL,
    "include_in_spending_analytics" boolean NOT NULL,
    "include_in_cash_flow_history" boolean NOT NULL,
    "review_status" "text" NOT NULL,
    "review_flags" "jsonb" DEFAULT '[]'::"jsonb",
    "platform_id" "text",
    "capture_source" "text",
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    "purchase_enrichment" "jsonb",
    CONSTRAINT "transactions_flow_type_check" CHECK (("flow_type" = ANY (ARRAY['expense'::"text", 'income'::"text", 'refund_or_reversal'::"text", 'internal_transfer'::"text", 'credit_card_payment'::"text", 'ignored'::"text", 'zero_activity'::"text", 'unknown'::"text", 'reconcile_adjustment'::"text"]))),
    CONSTRAINT "transactions_os_module_check" CHECK (("os_module" = 'finance'::"text")),
    CONSTRAINT "transactions_review_status_check" CHECK (("review_status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."finance_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_transactions"."os_module" IS '所属 Life OS 模块（finance）';



COMMENT ON COLUMN "public"."finance_transactions"."purchase_enrichment" IS 'Optional purchase context: { source, orderId, detailUrl, lineItems[{ title, imageUrl, imageStoragePath }], returnInfo, matchConfidence, matchedAt }';



CREATE TABLE IF NOT EXISTS "public"."finance_user_settings" (
    "user_id" "uuid" NOT NULL,
    "assumptions" "jsonb" NOT NULL,
    "privacy" boolean DEFAULT false NOT NULL,
    "data_version" integer DEFAULT 6 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active_scenario_id" "text",
    "portfolio_allocation_target" "jsonb",
    "os_module" "text" DEFAULT 'finance'::"text" NOT NULL,
    "merchant_order_catalog" "jsonb",
    "locale" "text" DEFAULT 'zh-CN'::"text" NOT NULL,
    CONSTRAINT "user_settings_os_module_check" CHECK (("os_module" = 'finance'::"text"))
);


ALTER TABLE "public"."finance_user_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."finance_user_settings"."portfolio_allocation_target" IS 'Portfolio allocation hub: stock/etf targets, concentration caps, drift threshold (JSON).';



COMMENT ON COLUMN "public"."finance_user_settings"."os_module" IS '所属 Life OS 模块（finance）';



COMMENT ON COLUMN "public"."finance_user_settings"."merchant_order_catalog" IS 'Orders harvested from merchant sites that could not auto-match bank txns (JSON: { updatedAt, sources: { target?: { orders }, bestbuy?: { orders } } }).';



COMMENT ON COLUMN "public"."finance_user_settings"."locale" IS 'App UI locale (BCP 47), e.g. zh-CN or en-US';



CREATE TABLE IF NOT EXISTS "public"."life_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "life_events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."life_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."life_os_modules" (
    "slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "schema_name" "text" DEFAULT 'public'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."life_os_modules" OWNER TO "postgres";


COMMENT ON TABLE "public"."life_os_modules" IS 'Life OS 模块注册表：finance / fitness / planner / core';



CREATE OR REPLACE VIEW "public"."life_os_table_catalog" WITH ("security_invoker"='true') AS
 SELECT "n"."nspname" AS "table_schema",
    "c"."relname" AS "table_name",
    COALESCE(( SELECT ((("a"."attname")::"text" || ' = '::"text") || COALESCE("pg_get_expr"("ad"."adbin", "ad"."adrelid"), '（无默认）'::"text"))
           FROM ("pg_attribute" "a"
             LEFT JOIN "pg_attrdef" "ad" ON ((("ad"."adrelid" = "a"."attrelid") AND ("ad"."adnum" = "a"."attnum"))))
          WHERE (("a"."attrelid" = "c"."oid") AND ("a"."attname" = 'os_module'::"name") AND (NOT "a"."attisdropped"))), '（无 os_module 列）'::"text") AS "os_module_default",
    "m"."display_name" AS "os_display_name",
    "m"."description" AS "os_description"
   FROM (("pg_class" "c"
     JOIN "pg_namespace" "n" ON (("n"."oid" = "c"."relnamespace")))
     LEFT JOIN "public"."life_os_modules" "m" ON (("m"."slug" =
        CASE
            WHEN ("n"."nspname" = 'fitness'::"name") THEN 'fitness'::"text"
            WHEN ("c"."relname" ~~ 'planner_%'::"text") THEN 'planner'::"text"
            WHEN ("c"."relname" ~~ 'core_%'::"text") THEN 'core'::"text"
            WHEN (("n"."nspname" = 'public'::"name") AND ("c"."relname" ~~ 'finance_%'::"text")) THEN 'finance'::"text"
            ELSE NULL::"text"
        END)))
  WHERE (("c"."relkind" = 'r'::"char") AND ("n"."nspname" = ANY (ARRAY['public'::"name", 'fitness'::"name"])) AND ("c"."relname" <> 'life_os_modules'::"name"))
  ORDER BY "m"."slug", "n"."nspname", "c"."relname";


ALTER VIEW "public"."life_os_table_catalog" OWNER TO "postgres";


COMMENT ON VIEW "public"."life_os_table_catalog" IS 'Life OS 表级模块对照（配合各表 os_module 列使用）';



CREATE TABLE IF NOT EXISTS "public"."paper_device_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."paper_device_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_lists" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'planner'::"text" NOT NULL,
    CONSTRAINT "planner_lists_os_module_check" CHECK (("os_module" = 'planner'::"text"))
);


ALTER TABLE "public"."planner_lists" OWNER TO "postgres";


COMMENT ON COLUMN "public"."planner_lists"."os_module" IS '所属 Life OS 模块（planner）';



CREATE TABLE IF NOT EXISTS "public"."planner_projects" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."planner_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_push_subscriptions" (
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."planner_push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_reminder_push_log" (
    "user_id" "uuid" NOT NULL,
    "task_id" "text" NOT NULL,
    "fire_at" bigint NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."planner_reminder_push_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_tasks" (
    "user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'planner'::"text" NOT NULL,
    CONSTRAINT "planner_tasks_os_module_check" CHECK (("os_module" = 'planner'::"text"))
);


ALTER TABLE "public"."planner_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."planner_tasks"."os_module" IS '所属 Life OS 模块（planner）';



CREATE TABLE IF NOT EXISTS "public"."planner_user_state" (
    "user_id" "uuid" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "schema_version" integer DEFAULT 2 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "os_module" "text" DEFAULT 'planner'::"text" NOT NULL,
    CONSTRAINT "planner_user_state_os_module_check" CHECK (("os_module" = 'planner'::"text"))
);


ALTER TABLE "public"."planner_user_state" OWNER TO "postgres";


COMMENT ON COLUMN "public"."planner_user_state"."os_module" IS '所属 Life OS 模块（planner）';



ALTER TABLE ONLY "fitness"."fitness_exercise_logs"
    ADD CONSTRAINT "exercise_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "fitness"."fitness_exercise_logs"
    ADD CONSTRAINT "exercise_logs_session_id_exercise_id_key" UNIQUE ("session_id", "exercise_id");



ALTER TABLE ONLY "fitness"."fitness_exercise_weights"
    ADD CONSTRAINT "exercise_weights_pkey" PRIMARY KEY ("user_id", "exercise_id");



ALTER TABLE ONLY "fitness"."fitness_profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "fitness"."fitness_user_state"
    ADD CONSTRAINT "user_state_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "fitness"."fitness_workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "fitness"."fitness_workout_sessions"
    ADD CONSTRAINT "workout_sessions_user_id_session_date_day_id_key" UNIQUE ("user_id", "session_date", "day_id");



ALTER TABLE ONLY "music"."music_playlist_tracks"
    ADD CONSTRAINT "music_playlist_tracks_pkey" PRIMARY KEY ("user_id", "playlist_id", "track_id");



ALTER TABLE ONLY "music"."music_playlists"
    ADD CONSTRAINT "music_playlists_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "music"."music_profiles"
    ADD CONSTRAINT "music_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "music"."music_track_meta"
    ADD CONSTRAINT "music_track_meta_pkey" PRIMARY KEY ("user_id", "track_id");



ALTER TABLE ONLY "music"."music_user_state"
    ADD CONSTRAINT "music_user_state_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "music"."play_events"
    ADD CONSTRAINT "play_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "music"."recommendation_events"
    ADD CONSTRAINT "recommendation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "music"."tag_dictionary"
    ADD CONSTRAINT "tag_dictionary_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "music"."tag_review_queue"
    ADD CONSTRAINT "tag_review_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "music"."track_audio_features"
    ADD CONSTRAINT "track_audio_features_pkey" PRIMARY KEY ("user_id", "track_id");



ALTER TABLE ONLY "music"."track_embeddings"
    ADD CONSTRAINT "track_embeddings_pkey" PRIMARY KEY ("user_id", "track_id");



ALTER TABLE ONLY "music"."track_enrichment"
    ADD CONSTRAINT "track_enrichment_pkey" PRIMARY KEY ("user_id", "track_id");



ALTER TABLE ONLY "music"."track_tags"
    ADD CONSTRAINT "track_tags_pkey" PRIMARY KEY ("user_id", "track_id", "tag_slug", "source");



ALTER TABLE ONLY "public"."finance_accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."core_allowed_devices"
    ADD CONSTRAINT "allowed_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_memberships"
    ADD CONSTRAINT "app_memberships_pkey" PRIMARY KEY ("app_key", "user_id");



ALTER TABLE ONLY "public"."app_registry"
    ADD CONSTRAINT "app_registry_pkey" PRIMARY KEY ("app_key");



ALTER TABLE ONLY "public"."finance_balance_assertions"
    ADD CONSTRAINT "balance_assertions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_logs"
    ADD CONSTRAINT "bug_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_cash_flows"
    ADD CONSTRAINT "cash_flows_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."core_profiles"
    ADD CONSTRAINT "core_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."core_user_app_settings"
    ADD CONSTRAINT "core_user_app_settings_pkey" PRIMARY KEY ("user_id", "app_id");



ALTER TABLE ONLY "public"."finance_decision_records"
    ADD CONSTRAINT "decision_records_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."finance_expected_occurrences"
    ADD CONSTRAINT "expected_occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_extension_processed_captures"
    ADD CONSTRAINT "extension_processed_captures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_extension_processed_captures"
    ADD CONSTRAINT "extension_processed_captures_user_envelope_uidx" UNIQUE ("user_id", "envelope_id");



ALTER TABLE ONLY "public"."finance_data"
    ADD CONSTRAINT "finance_data_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."finance_goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."finance_holding_daily_candles"
    ADD CONSTRAINT "holding_daily_candles_pkey" PRIMARY KEY ("user_id", "symbol", "date");



ALTER TABLE ONLY "public"."finance_holding_positions"
    ADD CONSTRAINT "holding_positions_pkey" PRIMARY KEY ("user_id", "snapshot_id", "id");



ALTER TABLE ONLY "public"."finance_holding_price_trails"
    ADD CONSTRAINT "holding_price_trails_pkey" PRIMARY KEY ("user_id", "symbol", "captured_at");



ALTER TABLE ONLY "public"."finance_holdings_snapshots"
    ADD CONSTRAINT "holdings_snapshots_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."life_events"
    ADD CONSTRAINT "life_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."life_os_modules"
    ADD CONSTRAINT "life_os_modules_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."finance_merchant_rules"
    ADD CONSTRAINT "merchant_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paper_device_config"
    ADD CONSTRAINT "paper_device_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."planner_lists"
    ADD CONSTRAINT "planner_lists_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."planner_projects"
    ADD CONSTRAINT "planner_projects_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."planner_push_subscriptions"
    ADD CONSTRAINT "planner_push_subscriptions_pkey" PRIMARY KEY ("user_id", "endpoint");



ALTER TABLE ONLY "public"."planner_reminder_push_log"
    ADD CONSTRAINT "planner_reminder_push_log_pkey" PRIMARY KEY ("user_id", "task_id", "fire_at");



ALTER TABLE ONLY "public"."planner_tasks"
    ADD CONSTRAINT "planner_tasks_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."planner_user_state"
    ADD CONSTRAINT "planner_user_state_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."finance_recurring_items"
    ADD CONSTRAINT "recurring_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_review_items"
    ADD CONSTRAINT "review_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_scenario_apply_audits"
    ADD CONSTRAINT "scenario_apply_audits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_scenario_events"
    ADD CONSTRAINT "scenario_events_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."finance_scenario_snapshots"
    ADD CONSTRAINT "scenario_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_scenarios"
    ADD CONSTRAINT "scenarios_pkey" PRIMARY KEY ("user_id", "id");



ALTER TABLE ONLY "public"."finance_transaction_imports"
    ADD CONSTRAINT "transaction_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "exercise_logs_user_ex_idx" ON "fitness"."fitness_exercise_logs" USING "btree" ("user_id", "exercise_id");



CREATE INDEX "workout_sessions_user_date_idx" ON "fitness"."fitness_workout_sessions" USING "btree" ("user_id", "session_date" DESC);



CREATE INDEX "play_events_user_track_idx" ON "music"."play_events" USING "btree" ("user_id", "track_id", "created_at" DESC);



CREATE INDEX "recommendation_events_user_created_idx" ON "music"."recommendation_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "tag_dictionary_namespace_idx" ON "music"."tag_dictionary" USING "btree" ("namespace", "is_active");



CREATE INDEX "tag_review_queue_user_status_idx" ON "music"."tag_review_queue" USING "btree" ("user_id", "status", "created_at" DESC);



CREATE INDEX "track_enrichment_canonical_idx" ON "music"."track_enrichment" USING "btree" ("user_id", "canonical_track_id") WHERE ("canonical_track_id" IS NOT NULL);



CREATE INDEX "track_tags_user_tag_idx" ON "music"."track_tags" USING "btree" ("user_id", "tag_slug");



CREATE INDEX "track_tags_user_track_idx" ON "music"."track_tags" USING "btree" ("user_id", "track_id");



CREATE INDEX "allowed_devices_device_id_idx" ON "public"."core_allowed_devices" USING "btree" ("user_id", "device_id");



CREATE UNIQUE INDEX "allowed_devices_user_class_uidx" ON "public"."core_allowed_devices" USING "btree" ("user_id", "device_class");



CREATE INDEX "allowed_devices_user_idx" ON "public"."core_allowed_devices" USING "btree" ("user_id");



CREATE INDEX "app_memberships_user_status_app_idx" ON "public"."app_memberships" USING "btree" ("user_id", "status", "app_key");



CREATE INDEX "balance_assertions_user_account_date_idx" ON "public"."finance_balance_assertions" USING "btree" ("user_id", "account_id", "assertion_date" DESC);



CREATE INDEX "bug_logs_user_created_idx" ON "public"."bug_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "decision_records_user_scenario_idx" ON "public"."finance_decision_records" USING "btree" ("user_id", "scenario_id", "created_at" DESC);



CREATE UNIQUE INDEX "expected_occurrences_user_source_date_uidx" ON "public"."finance_expected_occurrences" USING "btree" ("user_id", "source_type", "source_id", "occurrence_date");



CREATE INDEX "expected_occurrences_user_state_date_idx" ON "public"."finance_expected_occurrences" USING "btree" ("user_id", "state", "occurrence_date");



CREATE INDEX "extension_processed_captures_user_processed_idx" ON "public"."finance_extension_processed_captures" USING "btree" ("user_id", "processed_at" DESC);



CREATE INDEX "finance_transactions_purchase_enrichment_idx" ON "public"."finance_transactions" USING "btree" ("user_id") WHERE ("purchase_enrichment" IS NOT NULL);



CREATE INDEX "holding_daily_candles_user_symbol_date_idx" ON "public"."finance_holding_daily_candles" USING "btree" ("user_id", "symbol", "date" DESC);



CREATE INDEX "holding_positions_user_snapshot_idx" ON "public"."finance_holding_positions" USING "btree" ("user_id", "snapshot_id", "market_value" DESC);



CREATE INDEX "holding_price_trails_user_symbol_idx" ON "public"."finance_holding_price_trails" USING "btree" ("user_id", "symbol", "captured_at" DESC);



CREATE INDEX "holdings_snapshots_user_asof_idx" ON "public"."finance_holdings_snapshots" USING "btree" ("user_id", "as_of_date" DESC, "imported_at" DESC);



CREATE INDEX "life_events_type_idx" ON "public"."life_events" USING "btree" ("type");



CREATE INDEX "life_events_user_status_idx" ON "public"."life_events" USING "btree" ("user_id", "status");



CREATE INDEX "merchant_rules_user_idx" ON "public"."finance_merchant_rules" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "planner_projects_user_updated_idx" ON "public"."planner_projects" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "planner_push_subscriptions_user_idx" ON "public"."planner_push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "planner_tasks_user_updated_idx" ON "public"."planner_tasks" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "recurring_items_user_idx" ON "public"."finance_recurring_items" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE INDEX "review_items_import_idx" ON "public"."finance_review_items" USING "btree" ("import_id");



CREATE INDEX "review_items_user_idx" ON "public"."finance_review_items" USING "btree" ("user_id", "status", "created_at" DESC);



CREATE INDEX "scenario_apply_audits_user_idx" ON "public"."finance_scenario_apply_audits" USING "btree" ("user_id", "applied_at" DESC);



CREATE INDEX "scenario_events_user_scenario_idx" ON "public"."finance_scenario_events" USING "btree" ("user_id", "scenario_id");



CREATE INDEX "scenario_snapshots_user_scenario_idx" ON "public"."finance_scenario_snapshots" USING "btree" ("user_id", "scenario_id", "created_at" DESC);



CREATE INDEX "scenarios_user_idx" ON "public"."finance_scenarios" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE UNIQUE INDEX "transaction_imports_user_file_hash_finalized_uidx" ON "public"."finance_transaction_imports" USING "btree" ("user_id", "source_file_hash") WHERE ("status" = 'finalized'::"text");



CREATE INDEX "transaction_imports_user_idx" ON "public"."finance_transaction_imports" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "transactions_user_capture_platform_uidx" ON "public"."finance_transactions" USING "btree" ("user_id", "capture_source", "platform_id") WHERE (("platform_id" IS NOT NULL) AND ("platform_id" <> ''::"text"));



CREATE INDEX "transactions_user_category_idx" ON "public"."finance_transactions" USING "btree" ("user_id", "category");



CREATE INDEX "transactions_user_date_idx" ON "public"."finance_transactions" USING "btree" ("user_id", "txn_date" DESC);



CREATE INDEX "transactions_user_fingerprint_idx" ON "public"."finance_transactions" USING "btree" ("user_id", "transaction_fingerprint");



CREATE INDEX "transactions_user_flow_idx" ON "public"."finance_transactions" USING "btree" ("user_id", "flow");



CREATE INDEX "transactions_user_import_idx" ON "public"."finance_transactions" USING "btree" ("user_id", "import_id");



CREATE INDEX "transactions_user_spending_analytics_idx" ON "public"."finance_transactions" USING "btree" ("user_id", "include_in_spending_analytics", "occurred_on" DESC);



CREATE OR REPLACE TRIGGER "exercise_logs_updated_at" BEFORE UPDATE ON "fitness"."fitness_exercise_logs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "exercise_weights_updated_at" BEFORE UPDATE ON "fitness"."fitness_exercise_weights" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "fitness_workout_event_trigger" AFTER INSERT OR UPDATE OF "ended_at" ON "fitness"."fitness_workout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fitness_workout_to_event"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "fitness"."fitness_profiles" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_state_updated_at" BEFORE UPDATE ON "fitness"."fitness_user_state" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "workout_sessions_updated_at" BEFORE UPDATE ON "fitness"."fitness_workout_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "music_playlists_updated_at" BEFORE UPDATE ON "music"."music_playlists" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "music_profiles_updated_at" BEFORE UPDATE ON "music"."music_profiles" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "music_track_meta_updated_at" BEFORE UPDATE ON "music"."music_track_meta" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "music_user_state_updated_at" BEFORE UPDATE ON "music"."music_user_state" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "track_enrichment_updated_at" BEFORE UPDATE ON "music"."track_enrichment" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "bug_logs_updated_at" BEFORE UPDATE ON "public"."bug_logs" FOR EACH ROW EXECUTE FUNCTION "public"."bug_logs_touch_updated_at"();



CREATE OR REPLACE TRIGGER "core_profiles_updated_at" BEFORE UPDATE ON "public"."core_profiles" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "core_user_app_settings_updated_at" BEFORE UPDATE ON "public"."core_user_app_settings" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "finance_bill_event_trigger" AFTER INSERT ON "public"."finance_expected_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."trg_finance_bill_to_event"();



CREATE OR REPLACE TRIGGER "planner_user_state_updated_at" BEFORE UPDATE ON "public"."planner_user_state" FOR EACH ROW EXECUTE FUNCTION "public"."planner_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_device_limit" BEFORE INSERT ON "public"."core_allowed_devices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_device_limit"();



ALTER TABLE ONLY "fitness"."fitness_exercise_logs"
    ADD CONSTRAINT "exercise_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "fitness"."fitness_workout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "fitness"."fitness_exercise_logs"
    ADD CONSTRAINT "exercise_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "fitness"."fitness_exercise_weights"
    ADD CONSTRAINT "exercise_weights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "fitness"."fitness_profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "fitness"."fitness_user_state"
    ADD CONSTRAINT "user_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "fitness"."fitness_workout_sessions"
    ADD CONSTRAINT "workout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."music_playlist_tracks"
    ADD CONSTRAINT "music_playlist_tracks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."music_playlists"
    ADD CONSTRAINT "music_playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."music_profiles"
    ADD CONSTRAINT "music_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."music_track_meta"
    ADD CONSTRAINT "music_track_meta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."music_user_state"
    ADD CONSTRAINT "music_user_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."play_events"
    ADD CONSTRAINT "play_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."play_events"
    ADD CONSTRAINT "play_events_user_id_track_id_fkey" FOREIGN KEY ("user_id", "track_id") REFERENCES "music"."music_track_meta"("user_id", "track_id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."recommendation_events"
    ADD CONSTRAINT "recommendation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."recommendation_events"
    ADD CONSTRAINT "recommendation_events_user_id_recommended_track_id_fkey" FOREIGN KEY ("user_id", "recommended_track_id") REFERENCES "music"."music_track_meta"("user_id", "track_id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."tag_dictionary"
    ADD CONSTRAINT "tag_dictionary_parent_slug_fkey" FOREIGN KEY ("parent_slug") REFERENCES "music"."tag_dictionary"("slug") ON DELETE SET NULL;



ALTER TABLE ONLY "music"."tag_review_queue"
    ADD CONSTRAINT "tag_review_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."tag_review_queue"
    ADD CONSTRAINT "tag_review_queue_user_id_track_id_fkey" FOREIGN KEY ("user_id", "track_id") REFERENCES "music"."music_track_meta"("user_id", "track_id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."track_audio_features"
    ADD CONSTRAINT "track_audio_features_user_id_track_id_fkey" FOREIGN KEY ("user_id", "track_id") REFERENCES "music"."music_track_meta"("user_id", "track_id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."track_embeddings"
    ADD CONSTRAINT "track_embeddings_user_id_track_id_fkey" FOREIGN KEY ("user_id", "track_id") REFERENCES "music"."music_track_meta"("user_id", "track_id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."track_enrichment"
    ADD CONSTRAINT "track_enrichment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."track_enrichment"
    ADD CONSTRAINT "track_enrichment_user_id_track_id_fkey" FOREIGN KEY ("user_id", "track_id") REFERENCES "music"."music_track_meta"("user_id", "track_id") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."track_tags"
    ADD CONSTRAINT "track_tags_tag_slug_fkey" FOREIGN KEY ("tag_slug") REFERENCES "music"."tag_dictionary"("slug") ON DELETE CASCADE;



ALTER TABLE ONLY "music"."track_tags"
    ADD CONSTRAINT "track_tags_user_id_track_id_fkey" FOREIGN KEY ("user_id", "track_id") REFERENCES "music"."music_track_meta"("user_id", "track_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_accounts"
    ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."core_allowed_devices"
    ADD CONSTRAINT "allowed_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_memberships"
    ADD CONSTRAINT "app_memberships_app_key_fkey" FOREIGN KEY ("app_key") REFERENCES "public"."app_registry"("app_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_memberships"
    ADD CONSTRAINT "app_memberships_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_memberships"
    ADD CONSTRAINT "app_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_balance_assertions"
    ADD CONSTRAINT "balance_assertions_adjustment_txn_id_fkey" FOREIGN KEY ("adjustment_txn_id") REFERENCES "public"."finance_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_balance_assertions"
    ADD CONSTRAINT "balance_assertions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bug_logs"
    ADD CONSTRAINT "bug_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_cash_flows"
    ADD CONSTRAINT "cash_flows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."core_profiles"
    ADD CONSTRAINT "core_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."core_user_app_settings"
    ADD CONSTRAINT "core_user_app_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_decision_records"
    ADD CONSTRAINT "decision_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_decision_records"
    ADD CONSTRAINT "decision_records_user_scenario_fk" FOREIGN KEY ("user_id", "scenario_id") REFERENCES "public"."finance_scenarios"("user_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_expected_occurrences"
    ADD CONSTRAINT "expected_occurrences_matched_txn_id_fkey" FOREIGN KEY ("matched_txn_id") REFERENCES "public"."finance_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_expected_occurrences"
    ADD CONSTRAINT "expected_occurrences_reconciled_period_id_fkey" FOREIGN KEY ("reconciled_period_id") REFERENCES "public"."finance_balance_assertions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_expected_occurrences"
    ADD CONSTRAINT "expected_occurrences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_extension_processed_captures"
    ADD CONSTRAINT "extension_processed_captures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_data"
    ADD CONSTRAINT "finance_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_goals"
    ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_holding_daily_candles"
    ADD CONSTRAINT "holding_daily_candles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_holding_positions"
    ADD CONSTRAINT "holding_positions_snapshot_fk" FOREIGN KEY ("user_id", "snapshot_id") REFERENCES "public"."finance_holdings_snapshots"("user_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_holding_positions"
    ADD CONSTRAINT "holding_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_holding_price_trails"
    ADD CONSTRAINT "holding_price_trails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_holdings_snapshots"
    ADD CONSTRAINT "holdings_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."life_events"
    ADD CONSTRAINT "life_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_merchant_rules"
    ADD CONSTRAINT "merchant_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_lists"
    ADD CONSTRAINT "planner_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_projects"
    ADD CONSTRAINT "planner_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_push_subscriptions"
    ADD CONSTRAINT "planner_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_reminder_push_log"
    ADD CONSTRAINT "planner_reminder_push_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_tasks"
    ADD CONSTRAINT "planner_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_user_state"
    ADD CONSTRAINT "planner_user_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_recurring_items"
    ADD CONSTRAINT "recurring_items_merchant_rule_id_fkey" FOREIGN KEY ("merchant_rule_id") REFERENCES "public"."finance_merchant_rules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_recurring_items"
    ADD CONSTRAINT "recurring_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_review_items"
    ADD CONSTRAINT "review_items_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."finance_transaction_imports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_review_items"
    ADD CONSTRAINT "review_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_review_items"
    ADD CONSTRAINT "review_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_scenario_apply_audits"
    ADD CONSTRAINT "scenario_apply_audits_source_fk" FOREIGN KEY ("user_id", "source_scenario_id") REFERENCES "public"."finance_scenarios"("user_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_scenario_apply_audits"
    ADD CONSTRAINT "scenario_apply_audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_scenario_events"
    ADD CONSTRAINT "scenario_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_scenario_events"
    ADD CONSTRAINT "scenario_events_user_scenario_fk" FOREIGN KEY ("user_id", "scenario_id") REFERENCES "public"."finance_scenarios"("user_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_scenario_snapshots"
    ADD CONSTRAINT "scenario_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_scenarios"
    ADD CONSTRAINT "scenarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_transaction_imports"
    ADD CONSTRAINT "transaction_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."finance_transaction_imports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "fitness"."fitness_exercise_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fitness_exercise_logs_delete_own" ON "fitness"."fitness_exercise_logs" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_exercise_logs_insert_own" ON "fitness"."fitness_exercise_logs" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_exercise_logs_select_own" ON "fitness"."fitness_exercise_logs" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_exercise_logs_update_own" ON "fitness"."fitness_exercise_logs" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



ALTER TABLE "fitness"."fitness_exercise_weights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fitness_exercise_weights_delete_own" ON "fitness"."fitness_exercise_weights" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_exercise_weights_insert_own" ON "fitness"."fitness_exercise_weights" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_exercise_weights_select_own" ON "fitness"."fitness_exercise_weights" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_exercise_weights_update_own" ON "fitness"."fitness_exercise_weights" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



ALTER TABLE "fitness"."fitness_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fitness_profiles_insert_own" ON "fitness"."fitness_profiles" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_profiles_select_own" ON "fitness"."fitness_profiles" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_profiles_update_own" ON "fitness"."fitness_profiles" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('fitness'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('fitness'::"text")));



ALTER TABLE "fitness"."fitness_user_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fitness_user_state_insert_own" ON "fitness"."fitness_user_state" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_user_state_select_own" ON "fitness"."fitness_user_state" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_user_state_update_own" ON "fitness"."fitness_user_state" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



ALTER TABLE "fitness"."fitness_workout_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fitness_workout_sessions_delete_own" ON "fitness"."fitness_workout_sessions" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_workout_sessions_insert_own" ON "fitness"."fitness_workout_sessions" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_workout_sessions_select_own" ON "fitness"."fitness_workout_sessions" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



CREATE POLICY "fitness_workout_sessions_update_own" ON "fitness"."fitness_workout_sessions" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('fitness'::"text")));



ALTER TABLE "music"."music_playlist_tracks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "music_playlist_tracks_delete_own" ON "music"."music_playlist_tracks" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_playlist_tracks_insert_own" ON "music"."music_playlist_tracks" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_playlist_tracks_select_own" ON "music"."music_playlist_tracks" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_playlist_tracks_update_own" ON "music"."music_playlist_tracks" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."music_playlists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "music_playlists_delete_own" ON "music"."music_playlists" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_playlists_insert_own" ON "music"."music_playlists" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_playlists_select_own" ON "music"."music_playlists" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_playlists_update_own" ON "music"."music_playlists" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."music_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "music_profiles_insert_own" ON "music"."music_profiles" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_profiles_select_own" ON "music"."music_profiles" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_profiles_update_own" ON "music"."music_profiles" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."music_track_meta" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "music_track_meta_delete_own" ON "music"."music_track_meta" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_track_meta_insert_own" ON "music"."music_track_meta" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_track_meta_select_own" ON "music"."music_track_meta" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_track_meta_update_own" ON "music"."music_track_meta" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."music_user_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "music_user_state_delete_own" ON "music"."music_user_state" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_user_state_insert_own" ON "music"."music_user_state" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_user_state_select_own" ON "music"."music_user_state" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "music_user_state_update_own" ON "music"."music_user_state" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."play_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "play_events_delete_own" ON "music"."play_events" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "play_events_insert_own" ON "music"."play_events" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "play_events_select_own" ON "music"."play_events" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "play_events_update_own" ON "music"."play_events" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."recommendation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recommendation_events_delete_own" ON "music"."recommendation_events" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "recommendation_events_insert_own" ON "music"."recommendation_events" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "recommendation_events_select_own" ON "music"."recommendation_events" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "recommendation_events_update_own" ON "music"."recommendation_events" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."tag_dictionary" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tag_dictionary_select_all" ON "music"."tag_dictionary" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "music"."tag_review_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tag_review_queue_delete_own" ON "music"."tag_review_queue" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "tag_review_queue_insert_own" ON "music"."tag_review_queue" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "tag_review_queue_select_own" ON "music"."tag_review_queue" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "tag_review_queue_update_own" ON "music"."tag_review_queue" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."track_audio_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "track_audio_features_delete_own" ON "music"."track_audio_features" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_audio_features_insert_own" ON "music"."track_audio_features" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_audio_features_select_own" ON "music"."track_audio_features" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_audio_features_update_own" ON "music"."track_audio_features" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."track_embeddings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "track_embeddings_delete_own" ON "music"."track_embeddings" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_embeddings_insert_own" ON "music"."track_embeddings" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_embeddings_select_own" ON "music"."track_embeddings" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_embeddings_update_own" ON "music"."track_embeddings" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



ALTER TABLE "music"."track_enrichment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "track_enrichment_delete_own" ON "music"."track_enrichment" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "track_enrichment_insert_own" ON "music"."track_enrichment" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "track_enrichment_select_own" ON "music"."track_enrichment" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "track_enrichment_update_own" ON "music"."track_enrichment" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "music"."track_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "track_tags_delete_own" ON "music"."track_tags" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_tags_insert_own" ON "music"."track_tags" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_tags_select_own" ON "music"."track_tags" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "track_tags_update_own" ON "music"."track_tags" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('music'::"text")));



CREATE POLICY "Users read accessible apps" ON "public"."app_registry" FOR SELECT TO "authenticated" USING ((("is_enabled" = true) AND (EXISTS ( SELECT 1
   FROM "public"."app_memberships" "m"
  WHERE (("m"."app_key" = "app_registry"."app_key") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."status" = 'active'::"text"))))));



CREATE POLICY "Users read own app memberships" ON "public"."app_memberships" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "accounts_delete" ON "public"."finance_accounts" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "accounts_insert" ON "public"."finance_accounts" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "accounts_select" ON "public"."finance_accounts" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "accounts_update" ON "public"."finance_accounts" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



ALTER TABLE "public"."app_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_registry" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "balance_assertions_delete" ON "public"."finance_balance_assertions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "balance_assertions_insert" ON "public"."finance_balance_assertions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "balance_assertions_select" ON "public"."finance_balance_assertions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "balance_assertions_update" ON "public"."finance_balance_assertions" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."bug_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bug_logs_delete_own" ON "public"."bug_logs" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app")));



CREATE POLICY "bug_logs_insert_own" ON "public"."bug_logs" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app")));



CREATE POLICY "bug_logs_select_own" ON "public"."bug_logs" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app")));



CREATE POLICY "bug_logs_update_own" ON "public"."bug_logs" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app")));



CREATE POLICY "cash_flows_delete" ON "public"."finance_cash_flows" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "cash_flows_insert" ON "public"."finance_cash_flows" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "cash_flows_select" ON "public"."finance_cash_flows" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "cash_flows_update" ON "public"."finance_cash_flows" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



ALTER TABLE "public"."core_allowed_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."core_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "core_profiles_insert_own" ON "public"."core_profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "core_profiles_select_own" ON "public"."core_profiles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "core_profiles_update_own" ON "public"."core_profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."core_user_app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "core_user_app_settings_insert_own" ON "public"."core_user_app_settings" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app_id")));



CREATE POLICY "core_user_app_settings_select_own" ON "public"."core_user_app_settings" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app_id")));



CREATE POLICY "core_user_app_settings_update_own" ON "public"."core_user_app_settings" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"("app_id")));



CREATE POLICY "decision_records_delete" ON "public"."finance_decision_records" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "decision_records_insert" ON "public"."finance_decision_records" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "decision_records_select" ON "public"."finance_decision_records" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "decision_records_update" ON "public"."finance_decision_records" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "expected_occurrences_delete" ON "public"."finance_expected_occurrences" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "expected_occurrences_insert" ON "public"."finance_expected_occurrences" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "expected_occurrences_select" ON "public"."finance_expected_occurrences" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "expected_occurrences_update" ON "public"."finance_expected_occurrences" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "extension_processed_captures_delete" ON "public"."finance_extension_processed_captures" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "extension_processed_captures_insert" ON "public"."finance_extension_processed_captures" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "extension_processed_captures_select" ON "public"."finance_extension_processed_captures" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."finance_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_balance_assertions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_cash_flows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_data_delete" ON "public"."finance_data" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "finance_data_insert" ON "public"."finance_data" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "finance_data_select" ON "public"."finance_data" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "finance_data_update" ON "public"."finance_data" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



ALTER TABLE "public"."finance_decision_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_expected_occurrences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_extension_processed_captures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_holding_daily_candles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_holding_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_holding_price_trails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_holdings_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_merchant_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_recurring_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_review_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_scenario_apply_audits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_scenario_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_scenario_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_scenarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_transaction_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goals_delete" ON "public"."finance_goals" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "goals_insert" ON "public"."finance_goals" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "goals_select" ON "public"."finance_goals" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "goals_update" ON "public"."finance_goals" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_daily_candles_delete" ON "public"."finance_holding_daily_candles" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_daily_candles_insert" ON "public"."finance_holding_daily_candles" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_daily_candles_select" ON "public"."finance_holding_daily_candles" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_daily_candles_update" ON "public"."finance_holding_daily_candles" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_positions_delete" ON "public"."finance_holding_positions" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_positions_insert" ON "public"."finance_holding_positions" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_positions_select" ON "public"."finance_holding_positions" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_positions_update" ON "public"."finance_holding_positions" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_price_trails_delete" ON "public"."finance_holding_price_trails" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_price_trails_insert" ON "public"."finance_holding_price_trails" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_price_trails_select" ON "public"."finance_holding_price_trails" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holding_price_trails_update" ON "public"."finance_holding_price_trails" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holdings_snapshots_delete" ON "public"."finance_holdings_snapshots" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holdings_snapshots_insert" ON "public"."finance_holdings_snapshots" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holdings_snapshots_select" ON "public"."finance_holdings_snapshots" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "holdings_snapshots_update" ON "public"."finance_holdings_snapshots" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



ALTER TABLE "public"."life_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "life_events_delete" ON "public"."life_events" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "life_events_insert" ON "public"."life_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "life_events_select" ON "public"."life_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "life_events_update" ON "public"."life_events" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."life_os_modules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "life_os_modules_select_all" ON "public"."life_os_modules" FOR SELECT USING (true);



CREATE POLICY "merchant_rules_delete" ON "public"."finance_merchant_rules" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "merchant_rules_insert" ON "public"."finance_merchant_rules" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "merchant_rules_select" ON "public"."finance_merchant_rules" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "merchant_rules_update" ON "public"."finance_merchant_rules" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own devices delete" ON "public"."core_allowed_devices" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own devices insert" ON "public"."core_allowed_devices" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own devices select" ON "public"."core_allowed_devices" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own devices update" ON "public"."core_allowed_devices" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."paper_device_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planner_lists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_lists_delete_own" ON "public"."planner_lists" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_lists_insert_own" ON "public"."planner_lists" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_lists_select_own" ON "public"."planner_lists" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_lists_update_own" ON "public"."planner_lists" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



ALTER TABLE "public"."planner_projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_projects_delete_own" ON "public"."planner_projects" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_projects_insert_own" ON "public"."planner_projects" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_projects_select_own" ON "public"."planner_projects" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_projects_update_own" ON "public"."planner_projects" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



ALTER TABLE "public"."planner_push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_push_subscriptions_delete_own" ON "public"."planner_push_subscriptions" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_push_subscriptions_insert_own" ON "public"."planner_push_subscriptions" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_push_subscriptions_select_own" ON "public"."planner_push_subscriptions" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_push_subscriptions_update_own" ON "public"."planner_push_subscriptions" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



ALTER TABLE "public"."planner_reminder_push_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_reminder_push_log_delete_own" ON "public"."planner_reminder_push_log" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_reminder_push_log_insert_own" ON "public"."planner_reminder_push_log" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_reminder_push_log_select_own" ON "public"."planner_reminder_push_log" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_reminder_push_log_update_own" ON "public"."planner_reminder_push_log" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_state_insert_own" ON "public"."planner_user_state" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "planner_state_select_own" ON "public"."planner_user_state" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "planner_state_update_own" ON "public"."planner_user_state" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."planner_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_tasks_delete_own" ON "public"."planner_tasks" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_tasks_insert_own" ON "public"."planner_tasks" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_tasks_select_own" ON "public"."planner_tasks" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_tasks_update_own" ON "public"."planner_tasks" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



ALTER TABLE "public"."planner_user_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_user_state_delete_own" ON "public"."planner_user_state" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_user_state_insert_own" ON "public"."planner_user_state" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_user_state_select_own" ON "public"."planner_user_state" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "planner_user_state_update_own" ON "public"."planner_user_state" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('planner'::"text")));



CREATE POLICY "recurring_items_delete" ON "public"."finance_recurring_items" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "recurring_items_insert" ON "public"."finance_recurring_items" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "recurring_items_select" ON "public"."finance_recurring_items" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "recurring_items_update" ON "public"."finance_recurring_items" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "review_items_delete" ON "public"."finance_review_items" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "review_items_insert" ON "public"."finance_review_items" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "review_items_select" ON "public"."finance_review_items" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "review_items_update" ON "public"."finance_review_items" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "scenario_apply_audits_delete" ON "public"."finance_scenario_apply_audits" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_apply_audits_insert" ON "public"."finance_scenario_apply_audits" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_apply_audits_select" ON "public"."finance_scenario_apply_audits" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_apply_audits_update" ON "public"."finance_scenario_apply_audits" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_events_delete" ON "public"."finance_scenario_events" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_events_insert" ON "public"."finance_scenario_events" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_events_select" ON "public"."finance_scenario_events" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_events_update" ON "public"."finance_scenario_events" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_snapshots_delete" ON "public"."finance_scenario_snapshots" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_snapshots_insert" ON "public"."finance_scenario_snapshots" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_snapshots_select" ON "public"."finance_scenario_snapshots" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenario_snapshots_update" ON "public"."finance_scenario_snapshots" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenarios_delete" ON "public"."finance_scenarios" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenarios_insert" ON "public"."finance_scenarios" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenarios_select" ON "public"."finance_scenarios" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "scenarios_update" ON "public"."finance_scenarios" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "transaction_imports_delete" ON "public"."finance_transaction_imports" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "transaction_imports_insert" ON "public"."finance_transaction_imports" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "transaction_imports_select" ON "public"."finance_transaction_imports" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "transaction_imports_update" ON "public"."finance_transaction_imports" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "transactions_delete" ON "public"."finance_transactions" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "transactions_insert" ON "public"."finance_transactions" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "transactions_select" ON "public"."finance_transactions" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "transactions_update" ON "public"."finance_transactions" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "user_settings_delete" ON "public"."finance_user_settings" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "user_settings_insert" ON "public"."finance_user_settings" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "user_settings_select" ON "public"."finance_user_settings" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



CREATE POLICY "user_settings_update" ON "public"."finance_user_settings" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."has_app_access"('finance'::"text")));



GRANT USAGE ON SCHEMA "fitness" TO "anon";
GRANT USAGE ON SCHEMA "fitness" TO "authenticated";
GRANT USAGE ON SCHEMA "fitness" TO "service_role";



GRANT USAGE ON SCHEMA "music" TO "anon";
GRANT USAGE ON SCHEMA "music" TO "authenticated";
GRANT USAGE ON SCHEMA "music" TO "service_role";
GRANT USAGE ON SCHEMA "music" TO "authenticator";



GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "music"."canonical_artist"("p_artist" "text") TO "anon";
GRANT ALL ON FUNCTION "music"."canonical_artist"("p_artist" "text") TO "authenticated";
GRANT ALL ON FUNCTION "music"."canonical_artist"("p_artist" "text") TO "service_role";



GRANT ALL ON FUNCTION "music"."canonical_title"("p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "music"."canonical_title"("p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "music"."canonical_title"("p_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "music"."canonical_track_key"("p_title" "text", "p_artist" "text") TO "anon";
GRANT ALL ON FUNCTION "music"."canonical_track_key"("p_title" "text", "p_artist" "text") TO "authenticated";
GRANT ALL ON FUNCTION "music"."canonical_track_key"("p_title" "text", "p_artist" "text") TO "service_role";



GRANT ALL ON FUNCTION "music"."continue_playlist"("p_playlist_id" "text", "p_mode" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "music"."continue_playlist"("p_playlist_id" "text", "p_mode" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "music"."continue_playlist"("p_playlist_id" "text", "p_mode" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "music"."get_recommendations"("p_seed_track_id" "text", "p_mode" "text", "p_limit" integer, "p_exclude_track_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "music"."get_recommendations"("p_seed_track_id" "text", "p_mode" "text", "p_limit" integer, "p_exclude_track_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "music"."get_recommendations"("p_seed_track_id" "text", "p_mode" "text", "p_limit" integer, "p_exclude_track_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "music"."normalize_track_identity"("p_title" "text", "p_artist" "text") TO "anon";
GRANT ALL ON FUNCTION "music"."normalize_track_identity"("p_title" "text", "p_artist" "text") TO "authenticated";
GRANT ALL ON FUNCTION "music"."normalize_track_identity"("p_title" "text", "p_artist" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."has_app_access"("requested_app_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_app_access"("requested_app_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."has_app_access"("requested_app_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."has_app_role"("requested_app_key" "text", "allowed_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_app_role"("requested_app_key" "text", "allowed_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "private"."has_app_role"("requested_app_key" "text", "allowed_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "private"."user_has_app_access"("p_user_id" "uuid", "requested_app_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."user_has_app_access"("p_user_id" "uuid", "requested_app_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_scenario_to_plan_v1"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_scenario_to_plan_v1"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_scenario_to_plan_v1"("payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."bug_logs_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."bug_logs_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bug_logs_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_all_financial_data_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_all_financial_data_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_all_financial_data_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_all_financial_data_v2"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_all_financial_data_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_all_financial_data_v2"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_device_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_device_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_transaction_import_v1"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_transaction_import_v1"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_transaction_import_v1"("payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."fos_ext_json_bigint"("elem" "jsonb", "key" "text", "default_val" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."fos_ext_json_bigint"("elem" "jsonb", "key" "text", "default_val" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fos_ext_json_bigint"("elem" "jsonb", "key" "text", "default_val" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."fos_ext_json_bool"("elem" "jsonb", "key" "text", "default_val" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fos_ext_json_bool"("elem" "jsonb", "key" "text", "default_val" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fos_ext_json_bool"("elem" "jsonb", "key" "text", "default_val" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."fos_ext_json_date"("elem" "jsonb", "key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fos_ext_json_date"("elem" "jsonb", "key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fos_ext_json_date"("elem" "jsonb", "key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fos_ext_json_int"("elem" "jsonb", "key" "text", "default_val" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fos_ext_json_int"("elem" "jsonb", "key" "text", "default_val" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fos_ext_json_int"("elem" "jsonb", "key" "text", "default_val" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."fos_ext_json_numeric"("elem" "jsonb", "key" "text", "default_val" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fos_ext_json_numeric"("elem" "jsonb", "key" "text", "default_val" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fos_ext_json_numeric"("elem" "jsonb", "key" "text", "default_val" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."paper_device_snapshot"("p_token" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."paper_device_snapshot"("p_token" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."paper_device_snapshot"("p_token" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."paper_device_snapshot"("p_token" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."planner_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."planner_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."planner_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_today_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_today_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."portal_today_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_today_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_finance_backup_v1"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_finance_backup_v1"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_finance_backup_v1"("payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_finance_backup_v2"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_finance_backup_v2"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_finance_backup_v2"("payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_finance_bill_to_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_finance_bill_to_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_finance_bill_to_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fitness_workout_to_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fitness_workout_to_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fitness_workout_to_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."undo_latest_scenario_apply_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_latest_scenario_apply_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."undo_latest_scenario_apply_v1"() TO "service_role";



GRANT ALL ON TABLE "fitness"."fitness_exercise_logs" TO "anon";
GRANT ALL ON TABLE "fitness"."fitness_exercise_logs" TO "authenticated";
GRANT ALL ON TABLE "fitness"."fitness_exercise_logs" TO "service_role";



GRANT ALL ON TABLE "fitness"."fitness_exercise_weights" TO "anon";
GRANT ALL ON TABLE "fitness"."fitness_exercise_weights" TO "authenticated";
GRANT ALL ON TABLE "fitness"."fitness_exercise_weights" TO "service_role";



GRANT ALL ON TABLE "fitness"."fitness_profiles" TO "anon";
GRANT ALL ON TABLE "fitness"."fitness_profiles" TO "authenticated";
GRANT ALL ON TABLE "fitness"."fitness_profiles" TO "service_role";



GRANT ALL ON TABLE "fitness"."fitness_user_state" TO "anon";
GRANT ALL ON TABLE "fitness"."fitness_user_state" TO "authenticated";
GRANT ALL ON TABLE "fitness"."fitness_user_state" TO "service_role";



GRANT ALL ON TABLE "fitness"."fitness_workout_sessions" TO "anon";
GRANT ALL ON TABLE "fitness"."fitness_workout_sessions" TO "authenticated";
GRANT ALL ON TABLE "fitness"."fitness_workout_sessions" TO "service_role";



GRANT ALL ON TABLE "music"."music_playlist_tracks" TO "anon";
GRANT ALL ON TABLE "music"."music_playlist_tracks" TO "authenticated";
GRANT ALL ON TABLE "music"."music_playlist_tracks" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."music_playlist_tracks" TO "authenticator";



GRANT ALL ON TABLE "music"."music_playlists" TO "anon";
GRANT ALL ON TABLE "music"."music_playlists" TO "authenticated";
GRANT ALL ON TABLE "music"."music_playlists" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."music_playlists" TO "authenticator";



GRANT ALL ON TABLE "music"."music_profiles" TO "anon";
GRANT ALL ON TABLE "music"."music_profiles" TO "authenticated";
GRANT ALL ON TABLE "music"."music_profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."music_profiles" TO "authenticator";



GRANT ALL ON TABLE "music"."music_track_meta" TO "anon";
GRANT ALL ON TABLE "music"."music_track_meta" TO "authenticated";
GRANT ALL ON TABLE "music"."music_track_meta" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."music_track_meta" TO "authenticator";



GRANT ALL ON TABLE "music"."music_user_state" TO "anon";
GRANT ALL ON TABLE "music"."music_user_state" TO "authenticated";
GRANT ALL ON TABLE "music"."music_user_state" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."music_user_state" TO "authenticator";



GRANT ALL ON TABLE "music"."play_events" TO "anon";
GRANT ALL ON TABLE "music"."play_events" TO "authenticated";
GRANT ALL ON TABLE "music"."play_events" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."play_events" TO "authenticator";



GRANT ALL ON TABLE "music"."recommendation_events" TO "anon";
GRANT ALL ON TABLE "music"."recommendation_events" TO "authenticated";
GRANT ALL ON TABLE "music"."recommendation_events" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."recommendation_events" TO "authenticator";



GRANT ALL ON TABLE "music"."tag_dictionary" TO "anon";
GRANT ALL ON TABLE "music"."tag_dictionary" TO "authenticated";
GRANT ALL ON TABLE "music"."tag_dictionary" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."tag_dictionary" TO "authenticator";



GRANT ALL ON TABLE "music"."tag_review_queue" TO "anon";
GRANT ALL ON TABLE "music"."tag_review_queue" TO "authenticated";
GRANT ALL ON TABLE "music"."tag_review_queue" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."tag_review_queue" TO "authenticator";



GRANT ALL ON TABLE "music"."track_audio_features" TO "anon";
GRANT ALL ON TABLE "music"."track_audio_features" TO "authenticated";
GRANT ALL ON TABLE "music"."track_audio_features" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."track_audio_features" TO "authenticator";



GRANT ALL ON TABLE "music"."track_embeddings" TO "anon";
GRANT ALL ON TABLE "music"."track_embeddings" TO "authenticated";
GRANT ALL ON TABLE "music"."track_embeddings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."track_embeddings" TO "authenticator";



GRANT ALL ON TABLE "music"."track_enrichment" TO "anon";
GRANT ALL ON TABLE "music"."track_enrichment" TO "authenticated";
GRANT ALL ON TABLE "music"."track_enrichment" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."track_enrichment" TO "authenticator";



GRANT ALL ON TABLE "music"."track_tags" TO "anon";
GRANT ALL ON TABLE "music"."track_tags" TO "authenticated";
GRANT ALL ON TABLE "music"."track_tags" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "music"."track_tags" TO "authenticator";



GRANT ALL ON TABLE "public"."app_memberships" TO "service_role";
GRANT SELECT ON TABLE "public"."app_memberships" TO "authenticated";



GRANT ALL ON TABLE "public"."app_registry" TO "service_role";
GRANT SELECT ON TABLE "public"."app_registry" TO "authenticated";



GRANT ALL ON TABLE "public"."bug_logs" TO "anon";
GRANT ALL ON TABLE "public"."bug_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_logs" TO "service_role";



GRANT ALL ON TABLE "public"."core_allowed_devices" TO "anon";
GRANT ALL ON TABLE "public"."core_allowed_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."core_allowed_devices" TO "service_role";



GRANT ALL ON TABLE "public"."core_profiles" TO "anon";
GRANT ALL ON TABLE "public"."core_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."core_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."core_user_app_settings" TO "anon";
GRANT ALL ON TABLE "public"."core_user_app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."core_user_app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."finance_accounts" TO "anon";
GRANT ALL ON TABLE "public"."finance_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."finance_balance_assertions" TO "anon";
GRANT ALL ON TABLE "public"."finance_balance_assertions" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_balance_assertions" TO "service_role";



GRANT ALL ON TABLE "public"."finance_cash_flows" TO "anon";
GRANT ALL ON TABLE "public"."finance_cash_flows" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_cash_flows" TO "service_role";



GRANT ALL ON TABLE "public"."finance_data" TO "anon";
GRANT ALL ON TABLE "public"."finance_data" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_data" TO "service_role";



GRANT ALL ON TABLE "public"."finance_decision_records" TO "anon";
GRANT ALL ON TABLE "public"."finance_decision_records" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_decision_records" TO "service_role";



GRANT ALL ON TABLE "public"."finance_expected_occurrences" TO "anon";
GRANT ALL ON TABLE "public"."finance_expected_occurrences" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_expected_occurrences" TO "service_role";



GRANT ALL ON TABLE "public"."finance_extension_processed_captures" TO "anon";
GRANT ALL ON TABLE "public"."finance_extension_processed_captures" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_extension_processed_captures" TO "service_role";



GRANT ALL ON TABLE "public"."finance_goals" TO "anon";
GRANT ALL ON TABLE "public"."finance_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_goals" TO "service_role";



GRANT ALL ON TABLE "public"."finance_holding_daily_candles" TO "anon";
GRANT ALL ON TABLE "public"."finance_holding_daily_candles" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_holding_daily_candles" TO "service_role";



GRANT ALL ON TABLE "public"."finance_holding_positions" TO "anon";
GRANT ALL ON TABLE "public"."finance_holding_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_holding_positions" TO "service_role";



GRANT ALL ON TABLE "public"."finance_holding_price_trails" TO "anon";
GRANT ALL ON TABLE "public"."finance_holding_price_trails" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_holding_price_trails" TO "service_role";



GRANT ALL ON TABLE "public"."finance_holdings_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."finance_holdings_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_holdings_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."finance_merchant_rules" TO "anon";
GRANT ALL ON TABLE "public"."finance_merchant_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_merchant_rules" TO "service_role";



GRANT ALL ON TABLE "public"."finance_recurring_items" TO "anon";
GRANT ALL ON TABLE "public"."finance_recurring_items" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_recurring_items" TO "service_role";



GRANT ALL ON TABLE "public"."finance_review_items" TO "anon";
GRANT ALL ON TABLE "public"."finance_review_items" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_review_items" TO "service_role";



GRANT ALL ON TABLE "public"."finance_scenario_apply_audits" TO "anon";
GRANT ALL ON TABLE "public"."finance_scenario_apply_audits" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_scenario_apply_audits" TO "service_role";



GRANT ALL ON TABLE "public"."finance_scenario_events" TO "anon";
GRANT ALL ON TABLE "public"."finance_scenario_events" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_scenario_events" TO "service_role";



GRANT ALL ON TABLE "public"."finance_scenario_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."finance_scenario_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_scenario_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."finance_scenarios" TO "anon";
GRANT ALL ON TABLE "public"."finance_scenarios" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_scenarios" TO "service_role";



GRANT ALL ON TABLE "public"."finance_transaction_imports" TO "anon";
GRANT ALL ON TABLE "public"."finance_transaction_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_transaction_imports" TO "service_role";



GRANT ALL ON TABLE "public"."finance_transactions" TO "anon";
GRANT ALL ON TABLE "public"."finance_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."finance_user_settings" TO "anon";
GRANT ALL ON TABLE "public"."finance_user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."life_events" TO "anon";
GRANT ALL ON TABLE "public"."life_events" TO "authenticated";
GRANT ALL ON TABLE "public"."life_events" TO "service_role";



GRANT ALL ON TABLE "public"."life_os_modules" TO "anon";
GRANT ALL ON TABLE "public"."life_os_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."life_os_modules" TO "service_role";



GRANT ALL ON TABLE "public"."life_os_table_catalog" TO "anon";
GRANT ALL ON TABLE "public"."life_os_table_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."life_os_table_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."paper_device_config" TO "service_role";



GRANT ALL ON TABLE "public"."planner_lists" TO "anon";
GRANT ALL ON TABLE "public"."planner_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_lists" TO "service_role";



GRANT ALL ON TABLE "public"."planner_projects" TO "anon";
GRANT ALL ON TABLE "public"."planner_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_projects" TO "service_role";



GRANT ALL ON TABLE "public"."planner_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."planner_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."planner_reminder_push_log" TO "anon";
GRANT ALL ON TABLE "public"."planner_reminder_push_log" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_reminder_push_log" TO "service_role";



GRANT ALL ON TABLE "public"."planner_tasks" TO "anon";
GRANT ALL ON TABLE "public"."planner_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."planner_user_state" TO "anon";
GRANT ALL ON TABLE "public"."planner_user_state" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_user_state" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "fitness" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "fitness" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "fitness" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "fitness" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "fitness" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "fitness" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "music" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticator";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




-- ===== Life OS baseline reference data =====

insert into public.app_registry (app_key, display_name, app_url, sort_order)
values
  ('portal',  'OS Portal', 'https://portal.kenos.space', 10),
  ('planner', 'PlannerOS', 'https://planner.kenos.space', 20),
  ('fitness', 'FitnessOS', 'https://fitness.kenos.space', 30),
  ('finance', 'FinanceOS', 'https://finance.kenos.space', 40),
  ('music',   'MusicOS',   'https://music.kenos.space', 50),
  ('home',    'HomeOS',    'https://home.kenos.space', 60),
  ('paper',   'PaperOS',   'https://paper.kenos.space', 70)
on conflict (app_key) do update
set
  display_name = excluded.display_name,
  app_url = excluded.app_url,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.life_os_modules (slug, display_name, schema_name, description)
values
  ('finance', 'Finance OS', 'public', '个人财务、交易、场景、持仓与回顾'),
  ('fitness', 'Fitness OS', 'fitness', '健身训练计划、重量与训练记录'),
  ('planner', 'Planner OS', 'public', '任务清单与 Planner 用户状态'),
  ('music', 'Music OS', 'music', '音乐库、标签、推荐与播放行为'),
  ('portal', 'Life OS Portal', 'public', '跨应用启动器与今日摘要'),
  ('home', 'Home OS', 'public', '居家空间规划与储藏摘要'),
  ('paper', 'Paper OS', 'public', '纸屏设备集成'),
  ('core', 'Life OS Core', 'public', '跨模块共享基础设施')
on conflict (slug) do update
set
  display_name = excluded.display_name,
  schema_name = excluded.schema_name,
  description = excluded.description;

-- ===== Auth triggers managed outside ordinary schema dumps =====

drop trigger if exists core_on_auth_user_created on auth.users;
create trigger core_on_auth_user_created
  after insert on auth.users
  for each row execute function private.core_handle_new_user();

drop trigger if exists fitness_on_auth_user_created on auth.users;
create trigger fitness_on_auth_user_created
  after insert on auth.users
  for each row execute function private.fitness_handle_new_user();

drop trigger if exists music_on_auth_user_created on auth.users;
create trigger music_on_auth_user_created
  after insert on auth.users
  for each row execute function private.music_handle_new_user();

-- ===== Storage buckets and policies =====

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'bug-attachments',
    'bug-attachments',
    false,
    6291456,
    array['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[]
  ),
  (
    'finance-purchase-images',
    'finance-purchase-images',
    false,
    262144,
    array['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif']::text[]
  ),
  (
    'music',
    'music',
    false,
    104857600,
    array[
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/m4a',
      'audio/aac',
      'audio/flac',
      'audio/x-flac',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/opus',
      'audio/webm',
      'application/octet-stream'
    ]::text[]
  ),
  (
    'music-covers',
    'music-covers',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists bug_attachments_select_own on storage.objects;
create policy bug_attachments_select_own on storage.objects
  for select using (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists bug_attachments_insert_own on storage.objects;
create policy bug_attachments_insert_own on storage.objects
  for insert with check (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists bug_attachments_update_own on storage.objects;
create policy bug_attachments_update_own on storage.objects
  for update using (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists bug_attachments_delete_own on storage.objects;
create policy bug_attachments_delete_own on storage.objects
  for delete using (
    bucket_id = 'bug-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists finance_purchase_images_public_select on storage.objects;
drop policy if exists finance_purchase_images_select_own on storage.objects;
create policy finance_purchase_images_select_own on storage.objects
  for select using (
    bucket_id = 'finance-purchase-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('finance')
  );

drop policy if exists finance_purchase_images_insert_own on storage.objects;
create policy finance_purchase_images_insert_own on storage.objects
  for insert with check (
    bucket_id = 'finance-purchase-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('finance')
  );

drop policy if exists finance_purchase_images_update_own on storage.objects;
create policy finance_purchase_images_update_own on storage.objects
  for update using (
    bucket_id = 'finance-purchase-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('finance')
  )
  with check (
    bucket_id = 'finance-purchase-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('finance')
  );

drop policy if exists finance_purchase_images_delete_own on storage.objects;
create policy finance_purchase_images_delete_own on storage.objects
  for delete using (
    bucket_id = 'finance-purchase-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('finance')
  );

drop policy if exists music_audio_select_own on storage.objects;
create policy music_audio_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  );

drop policy if exists music_audio_insert_own on storage.objects;
create policy music_audio_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  );

drop policy if exists music_audio_update_own on storage.objects;
create policy music_audio_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  )
  with check (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  );

drop policy if exists music_audio_delete_own on storage.objects;
create policy music_audio_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  );

drop policy if exists music_covers_public_select on storage.objects;
create policy music_covers_public_select on storage.objects
  for select using (bucket_id = 'music-covers');

drop policy if exists music_covers_insert_own on storage.objects;
create policy music_covers_insert_own on storage.objects
  for insert with check (
    bucket_id = 'music-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  );

drop policy if exists music_covers_update_own on storage.objects;
create policy music_covers_update_own on storage.objects
  for update using (
    bucket_id = 'music-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  )
  with check (
    bucket_id = 'music-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  );

drop policy if exists music_covers_delete_own on storage.objects;
create policy music_covers_delete_own on storage.objects
  for delete using (
    bucket_id = 'music-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_app_access('music')
  );


