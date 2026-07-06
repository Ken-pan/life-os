/**
 * Merge local track fields with cloud snapshot — prefer richer / non-placeholder values.
 * @param {import('./types.js').Track} local
 * @param {Record<string, unknown> | null | undefined} cloud
 * @param {{ slugKey: (s: string) => string, trackWords: (t: import('./types.js').Track) => string[] }} helpers
 */
export function mergeTrackMetaForPush(local, cloud, helpers) {
  if (!cloud) return { ...local }

  const cloudTitle = String(cloud.title || '').trim()
  const cloudAlbum = String(cloud.album || '').trim()
  const cloudLyrics = typeof cloud.lyrics === 'string' ? cloud.lyrics : ''
  const cloudArt = typeof cloud.art_remote_url === 'string' ? cloud.art_remote_url : ''

  const localAlbumBad = !local.album || local.album === '未知专辑'
  const cloudAlbumGood = cloudAlbum && cloudAlbum !== '未知专辑'
  const localTitleShorter =
    cloudTitle.length > (local.title?.length || 0) + 3 &&
    local.title &&
    cloudTitle.toLowerCase().includes(local.title.toLowerCase())

  /** @type {import('./types.js').Track} */
  const merged = { ...local }

  if (cloudAlbumGood && localAlbumBad) merged.album = cloudAlbum
  if (localTitleShorter && cloudTitle) merged.title = cloudTitle
  if (!local.lyrics?.trim() && cloudLyrics.trim()) merged.lyrics = cloudLyrics

  if (merged.album !== local.album || merged.title !== local.title) {
    merged.albumKey = helpers.slugKey(`${merged.artist}::${merged.album}`)
    merged.words = helpers.trackWords(merged)
  }

  return { merged, cloudArt }
}

/** @param {Record<string, unknown>} row */
export function cloudMetaQuality(row) {
  let score = 0
  if (row.title && row.title !== '未命名') score += 2
  if (row.album && row.album !== '未知专辑') score += 3
  if (typeof row.lyrics === 'string' && row.lyrics.trim()) score += 2
  if (typeof row.art_remote_url === 'string' && row.art_remote_url.startsWith('https://'))
    score += 2
  if (row.storage_path) score += 1
  return score
}
