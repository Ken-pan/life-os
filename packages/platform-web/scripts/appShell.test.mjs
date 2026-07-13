import assert from 'node:assert/strict'
import { getPersistentOverlayInset } from '../src/svelte/app-shell/appShell.js'

assert.equal(getPersistentOverlayInset(852, []), 0)
assert.equal(
  getPersistentOverlayInset(852, [{ top: 640.2, width: 220, height: 160 }]),
  212,
)
assert.equal(
  getPersistentOverlayInset(852, [
    { top: 700, width: 0, height: 100 },
    { top: 620, width: 220, height: 180 },
    { top: 680, width: 160, height: 100 },
  ]),
  232,
)
assert.equal(
  getPersistentOverlayInset(852, [{ top: 900, width: 100, height: 40 }]),
  0,
)

console.log('app shell tests passed')
