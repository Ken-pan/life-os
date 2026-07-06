import { fetchRemoteLyrics } from './lyricsFetch.mjs';

/**
 * @param {unknown} payload
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleLyricsFetch(payload) {
  const title = String(payload?.title ?? '').trim();
  const artist = String(payload?.artist ?? '').trim();
  const durationRaw = Number(payload?.duration);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined;

  if (!title || !artist) {
    return { status: 400, body: { error: 'missing_fields' } };
  }

  const result = await fetchRemoteLyrics(title, artist, duration);
  if (!result?.text) {
    return { status: 404, body: { text: null, source: null } };
  }

  return {
    status: 200,
    body: {
      text: result.text,
      source: result.source,
      syncedLyrics: result.syncedLyrics ?? null,
      plainLyrics: result.plainLyrics ?? null,
      instrumental: Boolean(result.instrumental)
    }
  };
}
