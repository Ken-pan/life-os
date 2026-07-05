-- MUSIC.OS · Life OS 统一 Supabase 项目 · music schema
-- 仅同步元数据（设置 / 歌单 / 曲目信息），音频 Blob 保留在本机 IndexedDB

create schema if not exists music;

grant usage on schema music to postgres, anon, authenticated, service_role;
grant all on all tables in schema music to anon, authenticated, service_role;
grant all on all routines in schema music to anon, authenticated, service_role;
grant all on all sequences in schema music to anon, authenticated, service_role;
alter default privileges in schema music grant all on tables to anon, authenticated, service_role;
alter default privileges in schema music grant all on routines to anon, authenticated, service_role;
alter default privileges in schema music grant all on sequences to anon, authenticated, service_role;

create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists music.music_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table music.music_profiles enable row level security;

create policy "music_profiles_select_own" on music.music_profiles
  for select using ((select auth.uid()) = id);
create policy "music_profiles_insert_own" on music.music_profiles
  for insert with check ((select auth.uid()) = id);
create policy "music_profiles_update_own" on music.music_profiles
  for update using ((select auth.uid()) = id);

drop trigger if exists music_profiles_updated_at on music.music_profiles;
create trigger music_profiles_updated_at
  before update on music.music_profiles
  for each row execute function private.set_updated_at();

create table if not exists music.music_user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table music.music_user_state enable row level security;

create policy "music_user_state_select_own" on music.music_user_state
  for select using ((select auth.uid()) = user_id);
create policy "music_user_state_insert_own" on music.music_user_state
  for insert with check ((select auth.uid()) = user_id);
create policy "music_user_state_update_own" on music.music_user_state
  for update using ((select auth.uid()) = user_id);

drop trigger if exists music_user_state_updated_at on music.music_user_state;
create trigger music_user_state_updated_at
  before update on music.music_user_state
  for each row execute function private.set_updated_at();

create table if not exists music.music_track_meta (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null,
  title text not null default '',
  artist text not null default '',
  album text not null default '',
  album_key text not null default '',
  artist_key text not null default '',
  duration numeric not null default 0,
  liked smallint not null default 0,
  play_count int not null default 0,
  added_at bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table music.music_track_meta enable row level security;

create policy "music_track_meta_select_own" on music.music_track_meta
  for select using ((select auth.uid()) = user_id);
create policy "music_track_meta_insert_own" on music.music_track_meta
  for insert with check ((select auth.uid()) = user_id);
create policy "music_track_meta_update_own" on music.music_track_meta
  for update using ((select auth.uid()) = user_id);
create policy "music_track_meta_delete_own" on music.music_track_meta
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists music_track_meta_updated_at on music.music_track_meta;
create trigger music_track_meta_updated_at
  before update on music.music_track_meta
  for each row execute function private.set_updated_at();

create table if not exists music.music_playlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  kind text not null default 'user',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  row_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table music.music_playlists enable row level security;

create policy "music_playlists_select_own" on music.music_playlists
  for select using ((select auth.uid()) = user_id);
create policy "music_playlists_insert_own" on music.music_playlists
  for insert with check ((select auth.uid()) = user_id);
create policy "music_playlists_update_own" on music.music_playlists
  for update using ((select auth.uid()) = user_id);
create policy "music_playlists_delete_own" on music.music_playlists
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists music_playlists_updated_at on music.music_playlists;
create trigger music_playlists_updated_at
  before update on music.music_playlists
  for each row execute function private.set_updated_at();

create table if not exists music.music_playlist_tracks (
  user_id uuid not null references auth.users (id) on delete cascade,
  playlist_id text not null,
  track_id text not null,
  position int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, playlist_id, track_id)
);

alter table music.music_playlist_tracks enable row level security;

create policy "music_playlist_tracks_select_own" on music.music_playlist_tracks
  for select using ((select auth.uid()) = user_id);
create policy "music_playlist_tracks_insert_own" on music.music_playlist_tracks
  for insert with check ((select auth.uid()) = user_id);
create policy "music_playlist_tracks_update_own" on music.music_playlist_tracks
  for update using ((select auth.uid()) = user_id);
create policy "music_playlist_tracks_delete_own" on music.music_playlist_tracks
  for delete using ((select auth.uid()) = user_id);

create or replace function private.music_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into music.music_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into music.music_user_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists music_on_auth_user_created on auth.users;
create trigger music_on_auth_user_created
  after insert on auth.users
  for each row execute function private.music_handle_new_user();
