/** @typedef {'all' | 'recent' | 'liked' | 'chinese' | 'lateNight' | 'offline'} HomeFilter */

export const HOME_FILTERS = /** @type {const} */ ([
  'all',
  'recent',
  'liked',
  'chinese',
  'lateNight',
  'offline'
]);

/** @param {string} text */
export function hasCJK(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text || '');
}

/** @param {import('./types.js').Track & { audioBlob?: Blob }} track */
export function hasLocalAudio(track) {
  return track.audioBlob instanceof Blob;
}

/** @param {HomeFilter} filter @param {'now' | 'speedDial' | 'quickPicks' | 'recentAdded' | 'recent' | 'topArtists'} section */
export function shouldShowSection(filter, section) {
  const visibility = {
    all: ['now', 'speedDial', 'quickPicks', 'recentAdded', 'recent', 'topArtists'],
    recent: ['now', 'speedDial', 'quickPicks', 'recent'],
    liked: ['now', 'speedDial', 'quickPicks', 'recent'],
    chinese: ['now', 'speedDial', 'quickPicks', 'recent', 'recentAdded', 'topArtists'],
    lateNight: ['now', 'speedDial', 'quickPicks', 'recent'],
    offline: ['now', 'speedDial', 'quickPicks', 'recentAdded', 'topArtists']
  };
  return visibility[filter]?.includes(section) ?? true;
}

/** @param {import('./types.js').Track[]} tracks @param {HomeFilter} filter */
export function filterTracks(tracks, filter) {
  switch (filter) {
    case 'liked':
      return tracks.filter((t) => t.liked === 1);
    case 'chinese':
      return tracks.filter((t) => hasCJK(t.title) || hasCJK(t.artist) || hasCJK(t.album));
    case 'lateNight':
      return tracks.filter((t) => (t.duration || 0) >= 200);
    case 'offline':
      return tracks.filter(hasLocalAudio);
    default:
      return tracks;
  }
}

/**
 * Quick picks respect chip filters; "recent" narrows to the recent-play pool.
 * @param {import('./types.js').Track[]} quickPicks
 * @param {HomeFilter} filter
 * @param {import('./types.js').Track[]} recentTracks
 */
export function filterQuickPicks(quickPicks, filter, recentTracks) {
  let picks = filterTracks(quickPicks, filter);
  if (filter === 'recent') {
    const recentIds = new Set(recentTracks.map((t) => t.id));
    picks = picks.filter((t) => recentIds.has(t.id));
  }
  return picks;
}

/** @param {import('./speedDial.js').SpeedDialPage[]} pages @param {HomeFilter} filter */
export function filterSpeedDialPages(pages, _filter) {
  return pages;
}

/** @param {import('./speedDial.js').SpeedDialCell[]} items @param {HomeFilter} filter */
export function filterSpeedDial(items, filter) {
  switch (filter) {
    case 'liked':
      return items.filter((item) => item.id.includes(':liked') || item.tracks.some((t) => t.liked === 1));
    case 'chinese':
      return items.filter((item) =>
        item.tracks.some((t) => hasCJK(t.title) || hasCJK(t.artist))
      );
    case 'lateNight':
      return items.filter((item) => item.tracks.some((t) => (t.duration || 0) >= 200));
    case 'offline':
      return items;
    default:
      return items;
  }
}
