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

function isValidMeta(s) {
  const t = cleanText(s);
  if (!t || t.length > 240) return false;
  if (/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/.test(t)) return false;
  // Reject obvious mojibake runs from mis-decoded ID3
  if (/^[\u0080-\u00ff]{4,}$/.test(t)) return false;
  return true;
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
