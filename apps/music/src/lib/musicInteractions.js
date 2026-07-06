import { db } from './db.js';
import {
  interactionToPlayEvent,
  playSourceToContext,
  recordPlayEvent
} from './playEvents.js';

/** @typedef {'track' | 'artist' | 'album' | 'playlist' | 'collection' | 'mix'} EntityType */

/** @typedef {'open' | 'play' | 'skip' | 'complete' | 'pin_speed_dial' | 'unpin_speed_dial' | 'hide_speed_dial'} InteractionAction */

/** @typedef {'morning' | 'work' | 'evening' | 'late_night'} SessionTimeBucket */

/**
 * @typedef {'home'
 *   | 'speed_dial'
 *   | 'quick_picks'
 *   | 'search'
 *   | 'library'
 *   | 'artist_page'
 *   | 'album_page'
 *   | 'playlist_page'
 *   | 'now_playing'
 *   | 'mini_player'
 *   | 'queue'
 *   | 'unknown'} PlaySource
 */

/**
 * @typedef {object} RecordInteractionInput
 * @property {EntityType} entityType
 * @property {string} entityId
 * @property {InteractionAction} action
 * @property {PlaySource} source
 * @property {boolean} [passive]
 * @property {number} [playedMs]
 * @property {number} [durationMs]
 * @property {string} [trackId] — 用于 Supabase play_events（默认 entityId）
 */

/** @typedef {{ activeLaunches: number, passivePlays: number, skips: number, completes: number, timeMatches: number }} EntityPlaybackStats */

export const SKIP_THRESHOLD_MS = 30_000;

const INTERACTION_CAP = 2000;

/** @param {number} [hour] */
export function getTimeContextBucket(hour = new Date().getHours()) {
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 18) return 'work';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'late_night';
}

/** @param {number} hour @param {SessionTimeBucket} bucket */
function hourMatchesBucket(hour, bucket) {
  return getTimeContextBucket(hour) === bucket;
}

/** @param {RecordInteractionInput} input */
export async function recordMusicInteraction(input) {
  const now = Date.now();
  const created = new Date(now);
  await db.interactions.add({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    source: input.source,
    passive: Boolean(input.passive),
    playedMs: input.playedMs,
    durationMs: input.durationMs,
    createdAt: now,
    hourOfDay: created.getHours(),
    dayOfWeek: created.getDay()
  });

  const count = await db.interactions.count();
  if (count > INTERACTION_CAP) {
    const excess = count - INTERACTION_CAP;
    const stale = await db.interactions.orderBy('createdAt').limit(excess).primaryKeys();
    await db.interactions.bulkDelete(stale);
  }

  if (input.entityType === 'track' || input.trackId) {
    const eventType = interactionToPlayEvent(input.action);
    if (eventType) {
      const durationMs = input.durationMs ?? 0;
      const playedMs = input.playedMs ?? 0;
      const trackId = input.trackId ?? (input.entityType === 'track' ? input.entityId : null);
      if (trackId) {
        void recordPlayEvent({
          trackId,
          eventType,
          positionSec: playedMs > 0 ? Math.round(playedMs / 1000) : undefined,
          playedRatio: durationMs > 0 && playedMs > 0 ? playedMs / durationMs : undefined,
          context: playSourceToContext(input.source)
        });
      }
    }
  }
}

/** @param {number} [days] */
export async function getEntityPlaybackStats(days = 14) {
  const since = Date.now() - days * 86_400_000;
  const rows = await db.interactions.where('createdAt').above(since).toArray();
  const bucket = getTimeContextBucket();
  /** @type {Map<string, EntityPlaybackStats>} */
  const stats = new Map();

  for (const row of rows) {
    const key = `${row.entityType}:${row.entityId}`;
    const cur = stats.get(key) || {
      activeLaunches: 0,
      passivePlays: 0,
      skips: 0,
      completes: 0,
      timeMatches: 0
    };

    if (row.action === 'play') {
      if (row.passive) cur.passivePlays += 1;
      else cur.activeLaunches += 1;
      if (hourMatchesBucket(row.hourOfDay, bucket)) cur.timeMatches += 1;
    } else if (row.action === 'open' && !row.passive) {
      cur.activeLaunches += 0.65;
      if (hourMatchesBucket(row.hourOfDay, bucket)) cur.timeMatches += 0.5;
    } else if (row.action === 'skip' && !row.passive) {
      cur.skips += 1;
    } else if (row.action === 'complete') {
      cur.completes += 1;
    }

    stats.set(key, cur);
  }

  return stats;
}

/** @param {number} [days] */
export async function getEntityLaunchScores(days = 14) {
  const stats = await getEntityPlaybackStats(days);
  /** @type {Map<string, number>} */
  const scores = new Map();

  for (const [key, s] of stats.entries()) {
    const score =
      s.activeLaunches * 0.35 +
      s.timeMatches * 0.15 +
      s.completes * 0.1 -
      s.skips * 0.25 -
      s.passivePlays * 0.05;
    if (score > 0) scores.set(key, score);
  }

  return scores;
}

/** @param {EntityType} entityType @param {string} entityId */
export function entityKey(entityType, entityId) {
  return `${entityType}:${entityId}`;
}

/** @param {string} key @param {Map<string, EntityPlaybackStats>} stats */
export function scoreFromStats(key, stats) {
  const s = stats.get(key);
  if (!s) return 0;
  return (
    s.activeLaunches * 0.35 +
    s.timeMatches * 0.15 +
    s.completes * 0.1 -
    s.skips * 0.25 -
    s.passivePlays * 0.05
  );
}
