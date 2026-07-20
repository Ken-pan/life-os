/**
 * Music Space read — reuses portal_today_summary.music (no Music writer).
 * Flag default Off.
 */

import { isProdMusicReadEnabled } from './prodReadFlags.core.js'
import { classifyReadError, sourceState } from './readProjections.core.js'

export { isProdMusicReadEnabled }

export const CANONICAL_MUSIC_READ_SOURCE = 'public.portal_today_summary.music'

/**
 * @param {object | null | undefined} musicBlock
 */
export function projectMusicFromTodayMusic(musicBlock) {
  if (!musicBlock || typeof musicBlock !== 'object') {
    return {
      trackTitle: null,
      trackArtist: null,
      playedAt: null,
      deepLink: 'https://music.kenos.space',
    }
  }
  return {
    trackTitle: musicBlock.trackTitle || musicBlock.track_title || null,
    trackArtist: musicBlock.trackArtist || musicBlock.track_artist || null,
    playedAt: musicBlock.playedAt || musicBlock.played_at || null,
    deepLink: 'https://music.kenos.space',
  }
}

/**
 * @param {{ client: any, authorized?: boolean, online?: boolean, timezone?: string }} opts
 */
export async function readMusicSpaceSource({
  client,
  authorized = true,
  online = true,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
} = {}) {
  if (!authorized) {
    return {
      music: null,
      state: sourceState('permission_denied', {
        source: CANONICAL_MUSIC_READ_SOURCE,
        message: '登录后才能读取 Music 摘要。',
      }),
    }
  }
  if (!online) {
    return {
      music: null,
      state: sourceState('offline', {
        source: CANONICAL_MUSIC_READ_SOURCE,
        message: '离线时不显示假播放记录；联网后可重试。',
        retryable: true,
      }),
    }
  }
  if (!client) {
    return {
      music: null,
      state: sourceState('unavailable', {
        source: CANONICAL_MUSIC_READ_SOURCE,
        message: 'Music 读取未配置。',
      }),
    }
  }
  try {
    const { data, error } = await client.rpc('portal_today_summary', { p_timezone: timezone })
    if (error) throw error
    if (!data || data.ok === false) {
      return {
        music: null,
        state: sourceState('unavailable', {
          source: CANONICAL_MUSIC_READ_SOURCE,
          message: '暂时无法读取 Music 摘要。',
          retryable: true,
        }),
      }
    }
    const music = projectMusicFromTodayMusic(data.music)
    return {
      music,
      state: sourceState('ready', {
        source: CANONICAL_MUSIC_READ_SOURCE,
        lastUpdated: music.playedAt,
        availableCount: music.trackTitle ? 1 : 0,
      }),
    }
  } catch (error) {
    return {
      music: null,
      state: classifyReadError(error, {
        online,
        source: CANONICAL_MUSIC_READ_SOURCE,
      }),
    }
  }
}
