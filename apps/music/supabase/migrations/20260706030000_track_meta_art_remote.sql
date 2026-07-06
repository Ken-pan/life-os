-- Sync iTunes / remote cover URLs across devices (metadata only; not the image blob).

alter table music.music_track_meta
  add column if not exists art_remote_url text not null default '';
