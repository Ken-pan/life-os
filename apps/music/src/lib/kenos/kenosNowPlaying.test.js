import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'kenosNowPlaying.js'), 'utf8')

test('kenosNowPlaying exposes Continuity bridge helpers', () => {
  assert.match(src, /export function kenosUpdateMediaSession/)
  assert.match(src, /export function kenosUpdatePosition/)
  assert.match(src, /export function bindKenosMediaHandlers/)
  assert.match(src, /nowPlayingUpdate/)
  assert.match(src, /__KENOS_NOW_PLAYING_HANDLERS__/)
})

test('kenosNowPlaying compresses artwork before bridge post', () => {
  assert.match(src, /compressArtwork/)
  assert.match(src, /createImageBitmap/)
  assert.match(src, /image\/jpeg/)
  assert.match(src, /ARTWORK_MAX_EDGE/)
  assert.match(src, /ARTWORK_MAX_DATA_URL_CHARS/)
  assert.match(src, /withinBridgeArtworkBudget/)
  // Never fall back to raw full-res blob data URLs (WKScriptMessage kill).
  assert.doesNotMatch(src, /return await blobToDataUrl\(blob\)/)
})

test('kenosNowPlaying clears local caches on clear', () => {
  assert.match(src, /artworkCache = \{ id: null, dataUrl: null \}/)
  assert.match(src, /lastSent = \{ at: 0, position: 0, rate: 1 \}/)
})

test('kenosNowPlaying dedupes metadata updates and aborts artwork', () => {
  assert.match(src, /lastMetaKey/)
  assert.match(src, /artworkAbort/)
  assert.match(src, /artworkInflight/)
  assert.match(src, /signal\.aborted/)
})
