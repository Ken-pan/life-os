import {
  normalizeTrack,
  normalizeArtist,
  normalizeTrackForSearch,
  primaryArtist,
  similarity,
  bestArtistMatch,
  lyricsCacheKey
} from '../src/lib/trackNormalizer.js';

const USER_AGENT = 'MusicOS/1.0 (life-os)';
const MAX_WAIT_MS = 12_000;

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 */
async function fetchJson(url, init = {}, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, ...init.headers }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {() => Promise<T | null>} fn @param {number} [attempts] @template T */
async function withRetry(fn, attempts = 2) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

/** @param {{ syncedLyrics?: string | null, plainLyrics?: string | null, instrumental?: boolean }} result */
export function lyricsText(result) {
  if (!result || result.instrumental) return '';
  if (result.syncedLyrics?.trim()) return result.syncedLyrics.trim();
  if (result.plainLyrics?.trim()) return result.plainLyrics.trim();
  return '';
}

/** @param {string} [lrc] */
function lrcDuration(lrc) {
  if (!lrc?.trim()) return null;
  const pattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  let maxTime = 0;
  let match;
  while ((match = pattern.exec(lrc)) !== null) {
    const m = Number(match[1]);
    const s = Number(match[2]);
    let ms = 0;
    if (match[3]) {
      const raw = match[3];
      ms = raw.length === 2 ? (Number(raw) * 10) / 1000 : raw.length === 1 ? Number(raw) / 10 : Number(raw) / 1000;
    }
    const t = m * 60 + s + ms;
    if (t > maxTime) maxTime = t;
  }
  return maxTime > 0 ? maxTime : null;
}

/** @param {{ result: object, source: string }[]} candidates @param {number} [trackDuration] */
function pickBestMatch(candidates, trackDuration) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const sourceScore = { lrclib: 8, netease: 6, qqmusic: 4, lyricsovh: 2 };
  let best = null;
  let bestScore = -Infinity;

  for (const { result, source } of candidates) {
    let score = 0;
    const hasSynced = Boolean(result.syncedLyrics?.trim());

    if (hasSynced) score += 50;

    if (trackDuration && trackDuration > 0 && hasSynced) {
      const lrcDur = lrcDuration(result.syncedLyrics);
      if (lrcDur != null) {
        const diff = Math.abs(lrcDur - trackDuration);
        if (diff <= 3) score += 35;
        else if (diff <= 10) score += 28;
        else if (diff <= 20) score += 18;
        else if (diff <= 40) score += 5;
        if (diff > 60) score -= 30;
      } else {
        score += 10;
      }
    }

    score += sourceScore[source] ?? 0;

    if (hasSynced && result.syncedLyrics) {
      const lineCount = result.syncedLyrics
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean).length;
      if (lineCount >= 10) score += 5;
      if (lineCount >= 25) score += 3;
      if (lineCount <= 3) score -= 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = { result, source };
    }
  }

  return best;
}

/** @param {string} url @param {string} trackName @param {string} artistName @param {number} duration */
async function fetchLrclibGet(url, trackName, artistName, duration) {
  const params = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
    album_name: '',
    duration: String(Math.round(duration))
  });
  const data = await fetchJson(`${url}?${params}`);
  if (!data) return null;
  return {
    syncedLyrics: data.syncedLyrics ?? null,
    plainLyrics: data.plainLyrics ?? null,
    instrumental: Boolean(data.instrumental)
  };
}

/** @param {string} trackName @param {string} artistName */
async function fetchLrclibDirect(trackName, artistName) {
  const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });
  const data = await fetchJson(`https://lrclib.net/api/get?${params}`);
  if (!data) return null;
  return {
    syncedLyrics: data.syncedLyrics ?? null,
    plainLyrics: data.plainLyrics ?? null,
    instrumental: Boolean(data.instrumental)
  };
}

/** @param {string} query @param {string} trackName @param {string} artistName @param {number} [duration] */
async function searchLrclib(query, trackName, artistName, duration) {
  const data = await fetchJson(`https://lrclib.net/api/search?${new URLSearchParams({ q: query })}`);
  if (!Array.isArray(data) || !data.length) return null;

  const searchTrack = normalizeTrackForSearch(trackName);
  const primary = primaryArtist(artistName);
  let best = null;
  let bestScore = 0;

  for (const result of data) {
    let score = 0;
    const resultTrack = result.trackName ?? '';
    const resultTrackClean = normalizeTrackForSearch(resultTrack);
    score += Math.max(similarity(resultTrackClean, searchTrack), similarity(resultTrack, trackName)) * 40;

    const resultArtist = result.artistName ?? '';
    score +=
      Math.max(bestArtistMatch(resultArtist, artistName), bestArtistMatch(resultArtist, primary)) * 30;

    if (duration && duration > 0 && result.duration > 0) {
      const diff = Math.abs(result.duration - duration);
      if (diff <= 3) score += 20;
      else if (diff <= 10) score += 15;
      else if (diff <= 20) score += 8;
      else if (diff <= 40) score += 2;
    }

    if (result.syncedLyrics?.trim()) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  }

  if (!best || bestScore < 25) return null;
  return {
    syncedLyrics: best.syncedLyrics ?? null,
    plainLyrics: best.plainLyrics ?? null,
    instrumental: Boolean(best.instrumental)
  };
}

/** @param {string} trackName @param {string} artistName @param {string} searchTrack @param {string} primary */
function buildSearchQueries(trackName, artistName, searchTrack, primary) {
  const queries = [`${trackName} ${artistName}`];
  if (searchTrack !== trackName) queries.push(`${searchTrack} ${artistName}`);
  if (primary !== artistName) queries.push(`${searchTrack} ${primary}`);
  queries.push(searchTrack);

  const seen = new Set();
  return queries.filter((q) => {
    const key = q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {string} trackName @param {string} artistName @param {number} [duration] */
async function fetchFromLrclib(trackName, artistName, duration) {
  if (!trackName || !artistName) return null;

  const searchTrack = normalizeTrackForSearch(trackName);
  const primary = primaryArtist(artistName);

  if (duration && duration > 0) {
    for (const url of ['https://lrclib.net/api/get-cached', 'https://lrclib.net/api/get']) {
      const hit = await fetchLrclibGet(url, trackName, artistName, duration);
      if (hit && lyricsText(hit)) return hit;
    }
    if (searchTrack !== trackName) {
      const alt = await fetchLrclibGet('https://lrclib.net/api/get', searchTrack, artistName, duration);
      if (alt && lyricsText(alt)) return alt;
    }
    if (primary !== artistName) {
      const alt = await fetchLrclibGet('https://lrclib.net/api/get', searchTrack, primary, duration);
      if (alt && lyricsText(alt)) return alt;
    }
  }

  const direct = await fetchLrclibDirect(trackName, artistName);
  if (direct && lyricsText(direct)) return direct;

  if (searchTrack !== trackName || primary !== artistName) {
    const alt = await fetchLrclibDirect(searchTrack, primary);
    if (alt && lyricsText(alt)) return alt;
  }

  for (const query of buildSearchQueries(trackName, artistName, searchTrack, primary)) {
    const found = await searchLrclib(query, trackName, artistName, duration);
    if (found && lyricsText(found)) return found;
  }
  return null;
}

/** @param {string} lrc */
function stripTimestamps(lrc) {
  return lrc
    .split('\n')
    .map((line) => line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** @param {string} lrc */
function cleanSyncedLyrics(lrc) {
  const metadataPattern = /^\[(ti|ar|al|by|id|au|la|length|re|ve):.*\]$/i;
  return lrc
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !metadataPattern.test(trimmed);
    })
    .join('\n');
}

/** @param {string} trackName @param {string} artistName */
async function fetchFromQQMusic(trackName, artistName) {
  const searchTrack = normalizeTrackForSearch(trackName);
  const query = artistName ? `${searchTrack} ${artistName}` : searchTrack;
  const data = await fetchJson(
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${new URLSearchParams({
      format: 'json',
      n: '10',
      w: query
    })}`
  );
  const songs = data?.data?.song?.list;
  if (!Array.isArray(songs) || !songs.length) return null;

  const primary = primaryArtist(artistName);
  let bestMid = null;
  let bestScore = 0;

  for (const song of songs) {
    const songNameClean = normalizeTrackForSearch(song.songname ?? '');
    const trackSim = Math.max(similarity(songNameClean, searchTrack), similarity(song.songname ?? '', trackName));
    let artistSim = 0;
    if (artistName && Array.isArray(song.singer)) {
      for (const singer of song.singer) {
        artistSim = Math.max(
          artistSim,
          bestArtistMatch(singer.name ?? '', artistName),
          bestArtistMatch(singer.name ?? '', primary)
        );
      }
    }
    const score = trackSim * 50 + artistSim * 50;
    if (score > bestScore) {
      bestScore = score;
      bestMid = song.songmid;
    }
  }

  if (!bestMid || bestScore < 30) return null;

  const lyricData = await fetchJson(
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${new URLSearchParams({
      songmid: bestMid,
      format: 'json',
      nobase64: '1'
    })}`
  );

  const syncedRaw = lyricData?.lyric;
  if (!syncedRaw?.trim()) return null;

  const cleanedSynced = cleanSyncedLyrics(syncedRaw);
  const plain = stripTimestamps(cleanedSynced);
  const trimmed = plain.trim();
  const instrumental =
    !trimmed || trimmed === '纯音乐，请欣赏' || trimmed === '此歌曲为没有填词的纯音乐，请您欣赏';

  return { syncedLyrics: cleanedSynced || null, plainLyrics: plain || null, instrumental };
}

/** @param {string} trackName @param {string} artistName */
async function fetchFromNetEase(trackName, artistName) {
  const searchTrack = normalizeTrackForSearch(trackName);
  const query = artistName ? `${searchTrack} ${artistName}` : searchTrack;
  const data = await fetchJson(`https://api.no0a.cn/api/cloudmusic/search/${encodeURIComponent(query)}`);
  if (data?.status !== 1 || !Array.isArray(data.results) || !data.results.length) return null;

  const primary = primaryArtist(artistName);
  let bestId = null;
  let bestScore = 0;

  for (const song of data.results) {
    const songNameClean = normalizeTrackForSearch(song.name ?? '');
    const trackSim = Math.max(similarity(songNameClean, searchTrack), similarity(song.name ?? '', trackName));
    let artistSim = 0;
    if (artistName && Array.isArray(song.artist)) {
      for (const a of song.artist) {
        artistSim = Math.max(
          artistSim,
          bestArtistMatch(a.name ?? '', artistName),
          bestArtistMatch(a.name ?? '', primary)
        );
      }
    }
    const score = trackSim * 50 + artistSim * 50;
    if (score > bestScore) {
      bestScore = score;
      bestId = song.id;
    }
  }

  if (!bestId || bestScore < 30) return null;

  const lyricData = await fetchJson(`https://api.no0a.cn/api/cloudmusic/lyric/${bestId}`);
  if (lyricData?.status !== 1 || !lyricData.musiclyric?.trim()) return null;

  const cleaned = cleanSyncedLyrics(lyricData.musiclyric);
  const plain = stripTimestamps(cleaned);
  const trimmed = plain.trim();
  const instrumental =
    !trimmed || trimmed === '纯音乐，请欣赏' || trimmed === '此歌曲为没有填词的纯音乐，请您欣赏';

  return { syncedLyrics: cleaned || null, plainLyrics: plain || null, instrumental };
}

/** @param {string} trackName @param {string} artistName */
async function fetchFromLyricsOVH(trackName, artistName) {
  if (!artistName) return null;
  const artist = encodeURIComponent(artistName);
  const title = encodeURIComponent(trackName);
  const data = await fetchJson(`https://api.lyrics.ovh/v1/${artist}/${title}`, {}, 5000);
  if (!data?.lyrics?.trim()) return null;
  return { syncedLyrics: null, plainLyrics: data.lyrics.trim(), instrumental: false };
}

const SOURCES = [
  { name: 'lrclib', fetch: (t, a, d) => fetchFromLrclib(t, a, d) },
  { name: 'qqmusic', fetch: (t, a) => fetchFromQQMusic(t, a) },
  { name: 'netease', fetch: (t, a) => fetchFromNetEase(t, a) },
  { name: 'lyricsovh', fetch: (t, a) => fetchFromLyricsOVH(t, a) }
];

/**
 * @param {string} trackName
 * @param {string} artistName
 * @param {number} [duration]
 */
export async function fetchRemoteLyrics(trackName, artistName, duration) {
  const normTrack = normalizeTrack(trackName);
  const normArtist = normalizeArtist(artistName);
  if (!normTrack || !normArtist) return null;

  /** @type {{ result: object, source: string }[]} */
  const candidates = [];

  const tasks = SOURCES.map(async ({ name, fetch }) => {
    try {
      const result = await withRetry(() => fetch(normTrack, normArtist, duration), 2);
      if (result && lyricsText(result)) candidates.push({ result, source: name });
    } catch {
      /* skip */
    }
  });

  await Promise.race([Promise.allSettled(tasks), new Promise((r) => setTimeout(r, MAX_WAIT_MS))]);

  const best = pickBestMatch(candidates, duration);
  if (!best) return null;

  const text = lyricsText(best.result);
  if (!text) return null;

  return { ...best.result, source: best.source, text };
}

/** @param {{ title: string, artist: string, duration?: number }} track */
export function fetchLyricsForTrack(track) {
  return fetchRemoteLyrics(track.title, track.artist, track.duration);
}

export { lyricsCacheKey };
