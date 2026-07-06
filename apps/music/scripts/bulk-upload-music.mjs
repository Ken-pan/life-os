/**
 * One-off / ops: bulk upload local MP3 folders to Supabase private `music` bucket.
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/bulk-upload-music.mjs <userId> <dir1> [dir2...]
 */
import { createClient } from '@supabase/supabase-js';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'music';
const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;
const META_ONLY = process.env.META_ONLY === '1';
const CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 4);

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const userId = process.argv[2];
const dirs = process.argv.slice(3);
if (!userId || !dirs.length) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/bulk-upload-music.mjs <userId> <dir> [...]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false }
});

function slugKey(s) {
  return (s || 'unknown').trim().toLowerCase() || 'unknown';
}

function parseFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const parts = base.split(' - ');
  if (parts.length >= 2) {
    return { title: parts[0].trim(), artist: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '未知艺术家', title: base.trim() || '未命名' };
}

function readStr(view, offset, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function syncsafe(view, offset) {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function readTextFrame(frame) {
  if (!frame.length) return '';
  const enc = frame[0];
  const bytes = frame.subarray(1);
  if (enc === 0x00) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s.replace(/\0+$/, '');
  }
  return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '');
}

function parseId3(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.byteLength < 10) return null;
  if (readStr(view, 0, 3) !== 'ID3') return null;
  const version = view.getUint8(3);
  const size = syncsafe(view, 6);
  if (size <= 0 || 10 + size > buffer.byteLength) return null;
  const out = {};
  let offset = 10;
  const end = 10 + size;
  while (offset + 10 <= end) {
    const frameId = readStr(view, offset, 4);
    if (!frameId || frameId === '\0\0\0\0') break;
    const frameSize = version === 4 ? syncsafe(view, offset + 4) : view.getUint32(offset + 4);
    offset += 10;
    if (offset + frameSize > end) break;
    const frame = buffer.subarray(offset, offset + frameSize);
    offset += frameSize;
    if (frameId === 'TIT2') out.title = readTextFrame(frame);
    else if (frameId === 'TPE1') out.artist = readTextFrame(frame);
    else if (frameId === 'TALB') out.album = readTextFrame(frame);
  }
  return out;
}

async function hashFile(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function collectFiles() {
  /** @type {string[]} */
  const files = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isFile() && AUDIO_RE.test(name)) files.push(full);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function processFile(filePath) {
  const fileName = basename(filePath);
  const buf = await readFile(filePath);
  const tags = parseId3(buf) || {};
  const fromName = parseFilename(fileName);
  const title = tags.title || fromName.title;
  const artist = tags.artist || fromName.artist;
  const album = tags.album || '未知专辑';
  const trackId = await hashFile(buf);
  const storagePath = `${userId}/${trackId}.mp3`;
  const mime = 'audio/mpeg';
  const size = buf.length;

  const { error: upErr } = META_ONLY
    ? { error: null }
    : await supabase.storage.from(BUCKET).upload(storagePath, buf, {
        contentType: mime,
        upsert: true,
        cacheControl: '3600'
      });
  if (upErr) throw upErr;

  const row = {
    user_id: userId,
    track_id: trackId,
    title,
    artist,
    album,
    album_key: slugKey(`${artist}::${album}`),
    artist_key: slugKey(artist),
    duration: 0,
    liked: 0,
    play_count: 0,
    added_at: Date.now(),
    lyrics: '',
    storage_path: storagePath,
    mime_type: mime,
    size_bytes: size
  };

  const { error: metaErr } = await db.from('music_track_meta').upsert(row);
  if (metaErr) {
    // Fallback: direct SQL when PostgREST schema cache fails
    const esc = (v) => String(v).replace(/'/g, "''");
    const sql = `insert into music.music_track_meta (user_id, track_id, title, artist, album, album_key, artist_key, duration, liked, play_count, added_at, lyrics, storage_path, mime_type, size_bytes)
values ('${userId}', '${trackId}', '${esc(title)}', '${esc(artist)}', '${esc(album)}', '${esc(row.album_key)}', '${esc(row.artist_key)}', 0, 0, 0, ${row.added_at}, '', '${esc(storagePath)}', '${mime}', ${size})
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
    const { spawnSync } = await import('node:child_process');
    const res = spawnSync('supabase', ['db', 'query', '--linked', sql], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8'
    });
    if (res.status !== 0) throw metaErr;
  }

  return { fileName, title, artist, trackId, size };
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  let done = 0;
  let ok = 0;
  let fail = 0;
  let bytes = 0;
  /** @type {Error[]} */
  const errors = [];

  async function next() {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      try {
        const result = await worker(item);
        ok += 1;
        bytes += result.size;
        console.log(`[${++done}/${items.length}] OK ${result.title} — ${result.artist}`);
      } catch (err) {
        fail += 1;
        done += 1;
        errors.push(/** @type {Error} */ (err));
        console.error(`[${done}/${items.length}] FAIL ${basename(item)}: ${err.message || err}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => next()));
  return { ok, fail, bytes, errors };
}

const files = collectFiles();
console.log(`Uploading ${files.length} files for user ${userId}...`);
const started = Date.now();
const { ok, fail, bytes } = await runPool(files, processFile, CONCURRENCY);
const sec = ((Date.now() - started) / 1000).toFixed(1);
console.log(`Done in ${sec}s — ok=${ok} fail=${fail} total=${(bytes / (1024 * 1024)).toFixed(1)} MB`);
if (fail) process.exit(1);
