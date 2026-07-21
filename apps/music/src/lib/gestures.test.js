/**
 * Music gesture token contract — mirrors KenosShelfGesture / kenos-motion.css.
 * Runtime CSS reads are covered indirectly; this locks the documented defaults.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'gestures.js'), 'utf8')
const motionCss = readFileSync(
  join(dir, '../../../../packages/theme/src/kenos-motion.css'),
  'utf8',
)

test('gestures.js reads KenosMotion CSS gesture tokens', () => {
  assert.match(src, /--kenos-gesture-dismiss-distance/)
  assert.match(src, /--kenos-gesture-dismiss-velocity/)
  assert.match(src, /--kenos-motion-sheet/)
  assert.match(src, /--kenos-ease-page/)
  assert.match(src, /prefers-reduced-motion/)
  assert.match(src, /--kenos-gesture-edge-strip/)
})

test('kenos-motion.css exposes gesture SSOT defaults', () => {
  assert.match(motionCss, /--kenos-gesture-edge-strip:\s*28px/)
  assert.match(motionCss, /--kenos-gesture-dismiss-distance:\s*64px/)
  assert.match(motionCss, /--kenos-gesture-dismiss-velocity:\s*0\.32/)
  assert.match(motionCss, /\.kenos-anim-title-crossfade/)
  assert.match(motionCss, /\.kenos-anim-focus-enter/)
  assert.match(motionCss, /\.kenos-drawer-panel--leading/)
})
