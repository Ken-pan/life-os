import { browser } from '$app/environment';
import { supabase } from './supabase.js';
import { MUSIC_TABLES as T } from './supabaseTables.js';

/** @typedef {'play' | 'complete' | 'skip' | 'like' | 'dislike' | 'replay' | 'add_to_playlist' | 'remove_from_playlist' | 'search_play'} PlayEventType */

/**
 * @typedef {object} RecordPlayEventInput
 * @property {string} trackId
 * @property {PlayEventType} eventType
 * @property {number} [positionSec]
 * @property {number} [playedRatio]
 * @property {string} [context]
 */

/** Fire-and-forget Supabase play_events（需登录；失败静默） */
export async function recordPlayEvent(input) {
  if (!browser || !input.trackId) return;

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from(T.playEvents).insert({
      user_id: user.id,
      track_id: input.trackId,
      event_type: input.eventType,
      position_sec: input.positionSec ?? null,
      played_ratio: input.playedRatio ?? null,
      context: input.context ?? null
    });
    if (error) console.warn('[playEvents]', error.message);
  } catch (err) {
    console.warn('[playEvents]', err);
  }
}

/** @param {import('./musicInteractions.js').InteractionAction} action */
export function interactionToPlayEvent(action) {
  if (action === 'play') return 'play';
  if (action === 'skip') return 'skip';
  if (action === 'complete') return 'complete';
  return null;
}

/** @param {import('./musicInteractions.js').PlaySource} source */
export function playSourceToContext(source) {
  return source || 'unknown';
}
