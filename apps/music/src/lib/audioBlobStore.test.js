import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'audioBlobStore.js'), 'utf8')
const dbSrc = readFileSync(join(dir, 'db.js'), 'utf8')

test('audioBlobStore caps full-cache concurrency and queue', () => {
  assert.match(src, /MAX_FULL_CACHE_CONCURRENT\s*=\s*2/)
  assert.match(src, /fullCacheQueue/)
  assert.match(src, /pumpFullAudioBlobCache/)
  assert.match(src, /isQueuedFullCache/)
})

test('audioBlobStore skips opportunistic prefetch when cache is full', () => {
  assert.match(src, /keepTrackIds\.length === 0/)
  assert.match(src, /count >= MAX_AUDIO_BLOB_CACHE/)
})

test('getTopArtists aggregates without getAllTracks hydrate', () => {
  const start = dbSrc.indexOf('export async function getTopArtists')
  const end = dbSrc.indexOf('\nconst RECENT_SEARCH_KEY', start + 1)
  const fn = dbSrc.slice(start, end > start ? end : undefined)
  assert.match(fn, /orderBy\('artistKey'\)\.each/)
  assert.doesNotMatch(fn, /getAllTracks/)
  assert.doesNotMatch(fn, /ensureAlbumArtCache/)
})

test('getLikedTracks uses liked index and optional limit', () => {
  assert.match(dbSrc, /where\('liked'\)\.equals\(1\)/)
  assert.match(dbSrc, /export async function getLikedTracks\(limit\)/)
  assert.match(dbSrc, /rows\.slice\(0, limit\)/)
})
