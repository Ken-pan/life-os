import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveContinueOverlayMode,
  readPointerCapability,
  resolveContinueOverlayModeFromWindow,
} from './continueOverlayMode.core.js'

describe('continueOverlayMode.core', () => {
  it('maps width bands for mobile and tablet', () => {
    assert.equal(resolveContinueOverlayMode({ width: 390 }), 'mobile')
    assert.equal(resolveContinueOverlayMode({ width: 599 }), 'mobile')
    assert.equal(resolveContinueOverlayMode({ width: 600 }), 'tablet')
    assert.equal(resolveContinueOverlayMode({ width: 768 }), 'tablet')
    assert.equal(resolveContinueOverlayMode({ width: 899 }), 'tablet')
  })

  it('uses tablet-lg for ≥900 touch-first / coarse pointer', () => {
    assert.equal(
      resolveContinueOverlayMode({
        width: 1024,
        finePointer: false,
        canHover: false,
      }),
      'tablet-lg',
    )
    assert.equal(
      resolveContinueOverlayMode({
        width: 1180,
        finePointer: false,
        canHover: true,
      }),
      'tablet-lg',
    )
    assert.equal(
      resolveContinueOverlayMode({
        width: 1366,
        finePointer: true,
        canHover: false,
      }),
      'tablet-lg',
    )
  })

  it('uses desktop anchored only when fine pointer AND hover', () => {
    assert.equal(
      resolveContinueOverlayMode({
        width: 1024,
        finePointer: true,
        canHover: true,
      }),
      'desktop',
    )
    assert.equal(
      resolveContinueOverlayMode({
        width: 1440,
        finePointer: true,
        canHover: true,
      }),
      'desktop',
    )
  })

  it('reads matchMedia pointer capability without UA', () => {
    /** @type {Record<string, boolean>} */
    const map = {
      '(pointer: fine)': false,
      '(hover: hover)': false,
    }
    const win = {
      matchMedia: (q) => ({ matches: Boolean(map[q]) }),
    }
    assert.deepEqual(readPointerCapability(win), {
      finePointer: false,
      canHover: false,
    })
    map['(pointer: fine)'] = true
    map['(hover: hover)'] = true
    assert.deepEqual(readPointerCapability(win), {
      finePointer: true,
      canHover: true,
    })
  })

  it('resolves from window width + pointer media', () => {
    const touchPad = {
      innerWidth: 1024,
      matchMedia: (q) => ({
        matches: q === '(pointer: fine)' || q === '(hover: hover)' ? false : false,
      }),
    }
    assert.equal(resolveContinueOverlayModeFromWindow(touchPad), 'tablet-lg')

    const desktop = {
      innerWidth: 1440,
      matchMedia: (q) => ({
        matches: q === '(pointer: fine)' || q === '(hover: hover)',
      }),
    }
    assert.equal(resolveContinueOverlayModeFromWindow(desktop), 'desktop')
  })
})
