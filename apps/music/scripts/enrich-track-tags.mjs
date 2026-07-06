/**
 * 方案 A+：ffprobe + 元数据启发式打标 → track_enrichment / track_tags / track_audio_features
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/enrich-track-tags.mjs <userId> [--limit N] [--dry-run] [--skip-download]
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'music';
const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 3);

const args = process.argv.slice(2);
const userId = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const skipDownload = args.includes('--skip-download');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

if (!SERVICE_KEY || !userId) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/enrich-track-tags.mjs <userId> [--limit N] [--dry-run] [--skip-download]');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false }
});

const storage = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/** @typedef {{ slug: string, confidence: number, source: string }} TagHit */

const K_POP_SOLO = new Set([
  'jennie', 'lisa', 'rosé', 'rose', 'jisoo', 'iu', 'taeyeon', 'sunmi', 'hwasa', 'chung ha', 'chungha'
]);

const K_POP_GROUPS = new Set([
  'blackpink', 'aespa', 'ive', 'itzy', 'newjeans', 'le sserafim', 'gidle', '(g)i-dle', 'twice', 'red velvet',
  'xg', 'babymonster', 'illit', 'kepler', 'fromis_9', 'stayc'
]);

const WESTERN_POP_CLUB = new Set([
  'dua lipa', 'charli xcx', 'doja cat', 'tate mcrae', 'raye', 'ariana grande', 'madison beer', 'sabrina carpenter',
  'miley cyrus', 'lady gaga', 'britney spears', 'kylie minogue'
]);

const EDM = new Set(['tiësto', 'tiesto', 'alan walker', 'calvin harris', 'david guetta', 'anyma', 'skrillex']);

const DRAMATIC_POP = new Set(['halsey', 'raye', 'ariana grande', 'demi lovato', 'sia']);

const QUIRKY_RAP = new Set(['bbno$', 'bbno', 'connor price', 'tom macdonald', 'lil nas x']);

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

/** 短 token（如 iu）用词边界，避免 boygenius → iu 误匹配 */
function textHasToken(text, token) {
  const t = norm(text);
  const k = norm(token);
  if (!t || !k) return false;
  if (k.length <= 3) {
    return new RegExp(`(?:^|[\\s(,;\\[\\/])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s),;\\]\\/])`).test(` ${t} `);
  }
  return t.includes(k);
}

function artistMatches(artist, title, token) {
  return textHasToken(artist, token) || textHasToken(title, token);
}

function addTag(map, slug, confidence, source) {
  const prev = map.get(slug);
  if (!prev || prev.confidence < confidence) {
    map.set(slug, { slug, confidence, source });
  }
}

function inferFromText(map, text, source, confidence = 0.65) {
  const t = norm(text);
  if (!t) return;

  if (/k-pop|kpop|blackpink|girl crush|女团|成员/.test(t)) {
    addTag(map, 'k-pop', confidence, source);
    addTag(map, 'girl-crush', confidence - 0.05, source);
    addTag(map, 'baddie', confidence - 0.08, source);
  }
  if (/dua lipa/.test(t)) {
    addTag(map, 'dance-pop', confidence, source);
    addTag(map, 'pop', confidence - 0.05, source);
    addTag(map, 'club', confidence - 0.05, source);
    addTag(map, 'playlist-continue-good', confidence - 0.1, source);
  }
  if (/raye|tate|doja|ariana|halsey/.test(t)) {
    addTag(map, 'pop', confidence, source);
    addTag(map, 'dance-pop', confidence - 0.05, source);
    addTag(map, 'dramatic', confidence - 0.05, source);
    addTag(map, 'confident', confidence - 0.08, source);
  }
  if (/怪可爱|tiktok|rap|meme|魔性/.test(t)) {
    addTag(map, 'hip-hop', confidence - 0.05, source);
    addTag(map, 'rap', confidence - 0.05, source);
    addTag(map, 'quirky', confidence, source);
    addTag(map, 'meme', confidence - 0.05, source);
    addTag(map, 'playful', confidence - 0.08, source);
  }
  if (/edm|techno|trance|walker|tiësto|tiesto/.test(t)) {
    addTag(map, 'edm', confidence, source);
    addTag(map, 'euphoric', confidence - 0.05, source);
    addTag(map, 'gym', confidence - 0.1, source);
  }
  if (/night|drive|weeknd|neon/.test(t)) {
    addTag(map, 'night-drive', confidence - 0.05, source);
    addTag(map, 'neon', confidence - 0.08, source);
  }
  if (/game|ost|anime|boss/.test(t)) {
    addTag(map, 'game-ost', confidence - 0.05, source);
    addTag(map, 'game', confidence - 0.05, source);
    addTag(map, 'boss-fight', confidence - 0.08, source);
  }
}

function inferTags(track) {
  /** @type {Map<string, TagHit>} */
  const map = new Map();
  const artist = norm(track.artist);
  const title = norm(track.title);
  const album = norm(track.album);
  const combined = `${artist} ${title} ${album}`;

  inferFromText(map, album, 'filename', 0.68);
  inferFromText(map, combined, 'heuristic', 0.62);

  for (const a of K_POP_SOLO) {
    if (artistMatches(artist, title, a)) {
      addTag(map, 'k-pop', 0.82, 'heuristic');
      addTag(map, 'k-pop-solo', 0.85, 'heuristic');
      addTag(map, 'girl-crush', 0.78, 'heuristic');
      addTag(map, 'baddie', 0.75, 'heuristic');
      addTag(map, 'confident', 0.7, 'heuristic');
      addTag(map, 'club', 0.65, 'heuristic');
      addTag(map, 'gym', 0.6, 'heuristic');
      addTag(map, 'lang-ko', 0.7, 'heuristic');
    }
  }

  for (const g of K_POP_GROUPS) {
    if (artistMatches(artist, album, g) || textHasToken(album, g)) {
      addTag(map, 'k-pop', 0.85, 'heuristic');
      addTag(map, 'girl-group', 0.82, 'heuristic');
      addTag(map, 'girl-crush', 0.8, 'heuristic');
      addTag(map, 'baddie', 0.72, 'heuristic');
      addTag(map, 'lang-ko', 0.65, 'heuristic');
    }
  }

  for (const w of WESTERN_POP_CLUB) {
    if (artistMatches(artist, title, w)) {
      addTag(map, 'pop', 0.85, 'heuristic');
      addTag(map, 'dance-pop', 0.82, 'heuristic');
      addTag(map, 'club', 0.75, 'heuristic');
      addTag(map, 'playlist-continue-good', 0.7, 'heuristic');
      addTag(map, 'homepage-safe', 0.68, 'heuristic');
      addTag(map, 'lang-en', 0.8, 'heuristic');
    }
  }

  for (const e of EDM) {
    if (artistMatches(artist, title, e) || textHasToken(combined, e)) {
      addTag(map, 'edm', 0.88, 'heuristic');
      addTag(map, 'euphoric', 0.8, 'heuristic');
      addTag(map, 'gym', 0.72, 'heuristic');
      addTag(map, 'transition-safe', 0.65, 'heuristic');
    }
  }

  for (const d of DRAMATIC_POP) {
    if (artistMatches(artist, title, d)) {
      addTag(map, 'pop', 0.82, 'heuristic');
      addTag(map, 'dramatic', 0.78, 'heuristic');
      addTag(map, 'confident', 0.7, 'heuristic');
    }
  }

  for (const q of QUIRKY_RAP) {
    if (artistMatches(artist, title, q)) {
      addTag(map, 'hip-hop', 0.8, 'heuristic');
      addTag(map, 'quirky', 0.85, 'heuristic');
      addTag(map, 'meme', 0.7, 'heuristic');
      addTag(map, 'playful', 0.75, 'heuristic');
    }
  }

  if (/remix|mix|edit/i.test(combined)) addTag(map, 'remix', 0.75, 'heuristic');
  if (/live/i.test(combined)) addTag(map, 'live', 0.8, 'heuristic');
  if (/sped|speed up/i.test(combined)) addTag(map, 'sped-up', 0.85, 'heuristic');
  if (/slowed|slow version/i.test(combined)) addTag(map, 'slowed', 0.85, 'heuristic');
  if (/instrumental|karaoke|off vocal/i.test(combined)) addTag(map, 'instrumental', 0.85, 'heuristic');

  if (map.size === 0) {
    addTag(map, 'pop', 0.55, 'heuristic');
    addTag(map, 'needs-review', 0.9, 'heuristic');
  } else {
    addTag(map, 'playlist-continue-good', 0.62, 'heuristic');
    addTag(map, 'transition-safe', 0.58, 'heuristic');
  }

  return [...map.values()].filter((t) => t.confidence >= 0.55);
}

function qualityFromProbe(probe, sizeBytes, durationSec) {
  const bitrate = probe?.bitrate_kbps ?? (durationSec > 0 ? Math.round((sizeBytes * 8) / durationSec / 1000) : null);
  let sourceQuality = 'standard-quality';
  let qualityTag = 'standard-quality';
  if (bitrate != null) {
    if (bitrate >= 256) {
      sourceQuality = probe?.codec === 'flac' ? 'lossless' : 'high-compressed';
      qualityTag = sourceQuality;
    } else if (bitrate < 128) {
      sourceQuality = 'low-quality';
      qualityTag = 'low-quality';
    }
  }
  if (!probe?.title && !probe?.artist) {
    qualityTag = 'bad-metadata';
  }
  return { bitrate_kbps: bitrate, sourceQuality, qualityTag };
}

function audioFromProbe(probe, tags) {
  const vibeSet = new Set(tags.map((t) => t.slug));
  let energy = 3;
  let danceability = 3;
  let valence = 3;

  if (vibeSet.has('gym') || vibeSet.has('edm') || vibeSet.has('club')) {
    energy = 5;
    danceability = 5;
    valence = 4;
  } else if (vibeSet.has('baddie') || vibeSet.has('girl-crush')) {
    energy = 4;
    danceability = 4;
    valence = 3;
  } else if (vibeSet.has('quirky') || vibeSet.has('meme')) {
    energy = 4;
    danceability = 3;
    valence = 4;
  } else if (vibeSet.has('night-drive') || vibeSet.has('sexy')) {
    energy = 3;
    danceability = 3;
    valence = 2;
  } else if (vibeSet.has('cute') || vibeSet.has('soft')) {
    energy = 2;
    danceability = 3;
    valence = 4;
  }

  if (probe?.duration_sec && probe.duration_sec < 90) {
    energy = Math.min(5, energy + 1);
  }

  return {
    bpm: probe?.bpm ?? null,
    energy,
    danceability,
    valence,
    vocal_presence: vibeSet.has('instrumental') ? 1 : 4,
    analyzed_at: new Date().toISOString()
  };
}

function ffprobeFile(filePath) {
  try {
    const raw = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const data = JSON.parse(raw);
    const audio = (data.streams || []).find((s) => s.codec_type === 'audio');
    const fmt = data.format || {};
    const duration = Number(fmt.duration || 0);
    const bitrate = audio?.bit_rate ? Math.round(Number(audio.bit_rate) / 1000) : fmt.bit_rate ? Math.round(Number(fmt.bit_rate) / 1000) : null;
    return {
      duration_sec: duration,
      bitrate_kbps: bitrate,
      codec: audio?.codec_name || null,
      sample_rate: audio?.sample_rate ? Number(audio.sample_rate) : null,
      title: fmt.tags?.title || audio?.tags?.title || null,
      artist: fmt.tags?.artist || fmt.tags?.album_artist || audio?.tags?.artist || null
    };
  } catch {
    return null;
  }
}

async function fetchTracks() {
  const { data, error } = await db
    .from('music_track_meta')
    .select('track_id, title, artist, album, duration, storage_path, size_bytes')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return (data || []).slice(0, limit);
}

async function downloadToTemp(storagePath) {
  const { data, error } = await storage.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  const dir = mkdtempSync(join(tmpdir(), 'music-enrich-'));
  const file = join(dir, basename(storagePath));
  const buf = Buffer.from(await data.arrayBuffer());
  writeFileSync(file, buf);
  return { file, dir };
}

async function enrichOne(track) {
  let probe = null;
  let tmpDir = null;
  const sizeBytes = Number(track.size_bytes || 0);
  const storagePath = track.storage_path || `${userId}/${track.track_id}.mp3`;

  if (!skipDownload && storagePath) {
    try {
      const { file, dir } = await downloadToTemp(storagePath);
      tmpDir = dir;
      probe = ffprobeFile(file);
    } catch (err) {
      console.warn(`  ffprobe skip ${track.track_id}: ${err.message || err}`);
    } finally {
      if (tmpDir) {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  }

  const durationSec = probe?.duration_sec || Number(track.duration) || 0;
  const tags = inferTags(track);
  const { bitrate_kbps, sourceQuality, qualityTag } = qualityFromProbe(probe, sizeBytes, durationSec);
  tags.push({ slug: qualityTag, confidence: 0.85, source: 'heuristic' });
  if (qualityTag !== 'bad-metadata') {
    tags.push({ slug: 'original', confidence: 0.7, source: 'heuristic' });
  }

  const avgConf = tags.length
    ? tags.reduce((s, t) => s + t.confidence, 0) / tags.length
    : 0;
  const taggingStatus = avgConf >= 0.7 && !tags.some((t) => t.slug === 'needs-review') ? 'ready' : avgConf >= 0.55 ? 'partial' : 'needs_review';

  const enrichment = {
    user_id: userId,
    track_id: track.track_id,
    file_hash: track.track_id,
    codec: probe?.codec || 'mp3',
    bitrate_kbps,
    sample_rate: probe?.sample_rate || null,
    source_quality: sourceQuality,
    version_type: tags.some((t) => t.slug === 'remix') ? 'remix' : tags.some((t) => t.slug === 'live') ? 'live' : 'original',
    is_live: tags.some((t) => t.slug === 'live'),
    is_remix: tags.some((t) => t.slug === 'remix'),
    is_cover: tags.some((t) => t.slug === 'cover'),
    tagging_status: taggingStatus,
    tag_confidence_avg: Number(avgConf.toFixed(3)),
    analyzed_at: new Date().toISOString()
  };

  const audio = audioFromProbe({ ...probe, duration_sec: durationSec }, tags);

  return { tags, enrichment, audio, durationSec };
}

async function persist(result, track) {
  const { tags, enrichment, audio, durationSec } = result;

  if (dryRun) {
    console.log(`  tags: ${tags.map((t) => `${t.slug}(${t.confidence})`).join(', ')}`);
    return;
  }

  const { error: e1 } = await db.from('track_enrichment').upsert(enrichment);
  if (e1) throw e1;

  const { error: delErr } = await db.from('track_tags').delete().eq('user_id', userId).eq('track_id', track.track_id).in('source', ['heuristic', 'filename']);
  if (delErr) throw delErr;

  if (tags.length) {
    const { error: e2 } = await db.from('track_tags').upsert(
      tags.map((t) => ({
        user_id: userId,
        track_id: track.track_id,
        tag_slug: t.slug,
        confidence: t.confidence,
        source: t.source,
        locked: false
      }))
    );
    if (e2) throw e2;
  }

  const { error: e3 } = await db.from('track_audio_features').upsert({
    user_id: userId,
    track_id: track.track_id,
    ...audio
  });
  if (e3) throw e3;

  if (durationSec > 0 && Number(track.duration) !== durationSec) {
    await db.from('music_track_meta').update({ duration: durationSec }).eq('user_id', userId).eq('track_id', track.track_id);
  }

  if (enrichment.tagging_status === 'needs_review') {
    const { data: existing } = await db
      .from('tag_review_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('track_id', track.track_id)
      .eq('status', 'pending')
      .maybeSingle();
    if (!existing) {
      await db.from('tag_review_queue').insert({
        user_id: userId,
        track_id: track.track_id,
        reason: 'low_confidence_or_unknown',
        confidence: enrichment.tag_confidence_avg,
        proposed_tags: tags,
        status: 'pending'
      });
    }
  }
}

async function processTrack(track) {
  const result = await enrichOne(track);
  await persist(result, track);
  return result;
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  let done = 0;
  let ok = 0;
  let fail = 0;

  async function next() {
    while (index < items.length) {
      const i = index++;
      const track = items[i];
      try {
        const result = await enrichOne(track);
        await persist(result, track);
        ok += 1;
        console.log(`[${++done}/${items.length}] ${track.title} — ${track.artist} (${result.enrichment.tagging_status}, ${result.tags.length} tags)`);
      } catch (err) {
        fail += 1;
        done += 1;
        console.error(`[${done}/${items.length}] FAIL ${track.title}: ${err.message || err}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => next()));
  return { ok, fail };
}

const tracks = await fetchTracks();
console.log(`Enriching ${tracks.length} tracks for ${userId}${dryRun ? ' (dry-run)' : ''}...`);
const started = Date.now();
const { ok, fail } = await runPool(tracks, processTrack, CONCURRENCY);
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ok=${ok} fail=${fail}`);
if (fail) process.exit(1);
