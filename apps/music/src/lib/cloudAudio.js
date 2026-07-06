import * as tus from 'tus-js-client';
import { browser } from '$app/environment';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase.js';
import { MUSIC_TABLES as T } from './supabaseTables.js';
import { db, getAllTracks } from './db.js';
import { t } from './i18n/index.js';

export const MUSIC_BUCKET = 'music';

/** Files above this use TUS resumable upload (Supabase recommendation). */
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;

const SIGNED_TTL_SEC = 3600;

/** @type {Map<string, { url: string, expiresAt: number }>} */
const signedUrlCache = new Map();

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(t('sync.notSignedIn'));
  return data.user;
}

/**
 * @param {Pick<import('./types.js').Track, 'mime' | 'fileName' | 'id'>} track
 */
export function storagePathForTrack(userId, track) {
  return `${userId}/${track.id}.${extForTrack(track)}`;
}

/** @param {Pick<import('./types.js').Track, 'mime' | 'fileName'>} track */
function extForTrack(track) {
  const name = track.fileName || '';
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  /** @type {Record<string, string>} */
  const mimeMap = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/webm': 'webm'
  };
  return mimeMap[track.mime || ''] || 'mp3';
}

/**
 * @param {string} path
 * @returns {string | null}
 */
export function peekSignedAudioUrl(path) {
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.url;
  return null;
}

/**
 * @param {string} path
 * @param {number} [ttlSec]
 * @returns {Promise<string>}
 */
export async function getSignedAudioUrl(path, ttlSec = SIGNED_TTL_SEC) {
  if (!path) throw new Error(t('cloudAudio.noPath'));
  const hit = peekSignedAudioUrl(path);
  if (hit) return hit;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) throw new Error(t('sync.notSignedIn'));

  const { data, error } = await supabase.storage.from(MUSIC_BUCKET).createSignedUrl(path, ttlSec);
  if (error || !data?.signedUrl) throw error || new Error(t('cloudAudio.signedFailed'));

  const now = Date.now();
  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: now + ttlSec * 1000
  });
  return data.signedUrl;
}

/**
 * Synchronous URL when already cached or local — keeps iOS user-gesture chain when possible.
 * @param {import('./types.js').Track} track
 * @returns {string}
 */
/** @param {import('./types.js').Track | null | undefined} track */
export function hasPlayableSource(track) {
  if (!track) return false;
  if (track.audioBlob instanceof Blob) return true;
  if (typeof track.objectUrl === 'string' && track.objectUrl) return true;
  if (typeof track.storagePath === 'string' && track.storagePath) return true;
  return false;
}

export function resolvePlayUrlSync(track) {
  if (!track) return '';
  if (track.objectUrl) return track.objectUrl;
  if (track.audioBlob && browser) {
    track.objectUrl = URL.createObjectURL(track.audioBlob);
    return track.objectUrl;
  }
  if (track.storagePath) return peekSignedAudioUrl(track.storagePath) || '';
  return '';
}

/**
 * Resolve a playable URL: prefer local blob, else signed cloud URL.
 * @param {import('./types.js').Track} track
 * @returns {Promise<string>}
 */
export async function resolvePlayUrl(track) {
  const sync = resolvePlayUrlSync(track);
  if (sync) return sync;
  if (track?.storagePath) return getSignedAudioUrl(track.storagePath);
  return '';
}

/**
 * Warm signed URL cache for cloud tracks (call after sync).
 * @param {string[]} paths
 * @param {number} [limit]
 */
export async function prefetchSignedUrls(paths, limit = 24) {
  const unique = [...new Set(paths.filter(Boolean))];
  const pending = unique.filter((p) => !peekSignedAudioUrl(p)).slice(0, limit);
  if (!pending.length) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await Promise.all(pending.map((p) => getSignedAudioUrl(p).catch(() => {})));
}

/**
 * @param {Blob | File} blob
 * @param {string} path
 * @param {string} contentType
 * @param {(ratio: number) => void} [onProgress]
 */
async function uploadBlob(blob, path, contentType, onProgress) {
  if (blob.size > RESUMABLE_THRESHOLD) {
    await uploadResumable(blob, path, contentType, onProgress);
    return;
  }

  const { error } = await supabase.storage.from(MUSIC_BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: contentType || 'application/octet-stream'
  });
  if (error) throw error;
  onProgress?.(1);
}

/**
 * @param {Blob | File} blob
 * @param {string} path
 * @param {string} contentType
 * @param {(ratio: number) => void} [onProgress]
 */
async function uploadResumable(blob, path, contentType, onProgress) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error(t('sync.notSignedIn'));
  }

  const endpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`;

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'x-upsert': 'true'
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: MUSIC_BUCKET,
        objectName: path,
        contentType: contentType || 'application/octet-stream',
        cacheControl: '3600'
      },
      chunkSize: RESUMABLE_THRESHOLD,
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesTotal > 0) onProgress?.(bytesUploaded / bytesTotal);
      },
      onSuccess: () => {
        onProgress?.(1);
        resolve(undefined);
      }
    });

    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, reject);
  });
}

/**
 * Upload one local track's audio to private Storage and persist storage_path.
 * @param {import('./types.js').Track & { audioBlob?: Blob }} track
 * @param {(ratio: number) => void} [onProgress]
 */
export async function uploadTrackAudio(track, onProgress) {
  const user = await requireUser();
  const blob = track.audioBlob;
  if (!blob) throw new Error(t('cloudAudio.noLocalAudio'));

  const path = storagePathForTrack(user.id, track);
  const contentType = track.mime || blob.type || 'application/octet-stream';
  await uploadBlob(blob, path, contentType, onProgress);

  const { error } = await supabase.from(T.trackMeta).upsert({
    user_id: user.id,
    track_id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    album_key: track.albumKey,
    artist_key: track.artistKey,
    duration: track.duration,
    liked: track.liked,
    play_count: track.playCount,
    added_at: track.addedAt,
    lyrics: track.lyrics || '',
    storage_path: path,
    mime_type: contentType,
    size_bytes: blob.size
  });
  if (error) throw error;

  await db.tracks.update(track.id, {
    storagePath: path,
    mime: contentType,
    size: blob.size
  });

  return path;
}

/**
 * Upload all local tracks that have audio but no storagePath yet.
 * @param {(info: { done: number, total: number, title: string }) => void} [onProgress]
 * @returns {Promise<{ uploaded: number, skipped: number, failed: number, totalBytes: number }>}
 */
export async function uploadPendingAudio(onProgress) {
  const tracks = await getAllTracks();
  const pending = tracks.filter((tr) => tr.audioBlob && !tr.storagePath);
  let uploaded = 0;
  let failed = 0;
  let totalBytes = 0;

  for (let i = 0; i < pending.length; i++) {
    const track = pending[i];
    onProgress?.({ done: i, total: pending.length, title: track.title });
    try {
      await uploadTrackAudio(track);
      uploaded += 1;
      totalBytes += track.size || track.audioBlob?.size || 0;
    } catch {
      failed += 1;
    }
  }

  onProgress?.({ done: pending.length, total: pending.length, title: '' });
  return {
    uploaded,
    skipped: tracks.length - pending.length,
    failed,
    totalBytes
  };
}

/**
 * Count tracks ready to upload vs already on cloud.
 * @returns {Promise<{ pending: number, cloud: number, localAudio: number, localOnly: number, pendingBytes: number }>}
 */
export async function cloudAudioStats() {
  const tracks = await getAllTracks();
  let pending = 0;
  let cloud = 0;
  let localAudio = 0;
  let localOnly = 0;
  let pendingBytes = 0;
  for (const tr of tracks) {
    if (tr.audioBlob) localAudio += 1;
    if (tr.storagePath) cloud += 1;
    if (tr.audioBlob && !tr.storagePath) {
      pending += 1;
      pendingBytes += tr.size || tr.audioBlob.size || 0;
    } else if (!tr.audioBlob && !tr.storagePath) localOnly += 1;
  }
  return { pending, cloud, localAudio, localOnly, pendingBytes };
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
