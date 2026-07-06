-- Sync embedded / LRC lyrics metadata (audio blobs remain local-only)
alter table music.music_track_meta
  add column if not exists lyrics text not null default '';
