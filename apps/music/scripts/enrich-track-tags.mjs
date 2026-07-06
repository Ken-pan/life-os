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
import {
  inferTags,
  qualityFromProbe,
  audioFromVibes,
  taggingStatusFromTags,
  versionFlagsFromTags,
} from '../src/lib/tagHeuristics.js';

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
  const { bitrate_kbps, sourceQuality, qualityTag } = qualityFromProbe(probe, sizeBytes, durationSec, track);
  tags.push({ slug: qualityTag, confidence: 0.85, source: 'heuristic' });
  if (qualityTag !== 'bad-metadata') {
    tags.push({ slug: 'original', confidence: 0.7, source: 'heuristic' });
  }

  const { taggingStatus, tagConfidenceAvg } = taggingStatusFromTags(tags);
  const versionFlags = versionFlagsFromTags(tags);

  const enrichment = {
    user_id: userId,
    track_id: track.track_id,
    file_hash: track.track_id,
    codec: probe?.codec || 'mp3',
    bitrate_kbps,
    sample_rate: probe?.sample_rate || null,
    source_quality: sourceQuality,
    ...versionFlags,
    tagging_status: taggingStatus,
    tag_confidence_avg: tagConfidenceAvg,
    analyzed_at: new Date().toISOString()
  };

  const audio = audioFromVibes(tags, { ...probe, duration_sec: durationSec });

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
