/**
 * Insert music_track_meta rows for already-uploaded Storage objects.
 * Usage: node scripts/bulk-sync-music-meta.mjs <userId> <dir1> [dir2...]
 */
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseId3, isValidMeta } from '../src/lib/id3.js';

const userId = process.argv[2];
const dirs = process.argv.slice(3);
const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;

if (!userId || !dirs.length) {
  console.error('Usage: node scripts/bulk-sync-music-meta.mjs <userId> <dir> [...]');
  process.exit(1);
}

function slugKey(s) {
  return (s || 'unknown').trim().toLowerCase() || 'unknown';
}

function parseFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const parts = base.split(' - ');
  if (parts.length >= 2) {
    // Library files use "Title - Artist"
    return { title: parts[0].trim(), artist: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '未知艺术家', title: base.trim() || '未命名' };
}

function cleanText(v) {
  return String(v ?? '')
    .replace(/\0/g, '')
    .trim();
}

function sqlQuote(v) {
  return `'${cleanText(v).replace(/'/g, "''")}'`;
}

async function runSql(sql) {
  const res = spawnSync('supabase', ['db', 'query', '--linked', sql], {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (res.status !== 0) {
    throw new Error((res.stdout || res.stderr || 'SQL failed').slice(0, 500));
  }
}

function collectFiles() {
  const files = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isFile() && AUDIO_RE.test(name)) files.push(full);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const files = collectFiles();
console.log(`Building metadata for ${files.length} tracks...`);

/** @type {object[]} */
const rows = [];
for (const filePath of files) {
  const fileName = basename(filePath);
  const buf = await readFile(filePath);
  const tags = parseId3(buf) || {};
  const fromName = parseFilename(fileName);
  const title = fromName.title;
  const artist = fromName.artist;
  const album = isValidMeta(tags.album) ? cleanText(tags.album) : '未知专辑';
  const trackId = createHash('sha256').update(buf).digest('hex');
  const storagePath = `${userId}/${trackId}.mp3`;
  rows.push({
    trackId,
    title,
    artist,
    album,
    albumKey: slugKey(`${artist}::${album}`),
    artistKey: slugKey(artist),
    storagePath,
    size: buf.length,
    addedAt: Date.now()
  });
}

let applied = 0;
for (const row of rows) {
  const sql = `insert into music.music_track_meta (user_id, track_id, title, artist, album, album_key, artist_key, duration, liked, play_count, added_at, lyrics, storage_path, mime_type, size_bytes)
values (${sqlQuote(userId)}, ${sqlQuote(row.trackId)}, ${sqlQuote(row.title)}, ${sqlQuote(row.artist)}, ${sqlQuote(row.album)}, ${sqlQuote(row.albumKey)}, ${sqlQuote(row.artistKey)}, 0, 0, 0, ${row.addedAt}, '', ${sqlQuote(row.storagePath)}, 'audio/mpeg', ${row.size})
on conflict (user_id, track_id) do update set
  title = excluded.title,
  artist = excluded.artist,
  album = excluded.album,
  album_key = excluded.album_key,
  artist_key = excluded.artist_key,
  storage_path = excluded.storage_path,
  mime_type = excluded.mime_type,
  size_bytes = excluded.size_bytes,
  updated_at = now();`;
  try {
    await runSql(sql);
    applied += 1;
    if (applied % 10 === 0 || applied === rows.length) {
      console.log(`Applied ${applied}/${rows.length} — ${row.title}`);
    }
  } catch (err) {
    console.error(`FAIL ${row.title}: ${err.message}`);
    process.exit(1);
  }
}

console.log('Metadata sync complete.');
