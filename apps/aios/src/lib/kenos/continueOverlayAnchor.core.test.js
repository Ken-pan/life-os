import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anchoredContinuePanelStyle,
  computeAnchoredContinuePanel,
  readContinueChromeLeftInset,
} from './continueOverlayAnchor.core.js'

describe('continueOverlayAnchor.core', () => {
  it('places panel to the right of a left-rail trigger and clears chrome', () => {
    const rect = computeAnchoredContinuePanel({
      trigger: { left: 16, right: 200, top: 120, bottom: 156, height: 36 },
      viewport: { width: 1440, height: 900 },
      chromeLeft: 240,
    })
    assert.ok(rect.left >= 240 + 8, `left ${rect.left} should clear sidebar`)
    assert.equal(rect.width, 440)
    assert.ok(rect.left + rect.width <= 1440 - 12)
  })

  it('flips inline when right placement would overflow', () => {
    const rect = computeAnchoredContinuePanel({
      trigger: { left: 1100, right: 1280, top: 40, bottom: 76, height: 36 },
      viewport: { width: 1440, height: 900 },
      chromeLeft: 0,
    })
    assert.ok(rect.left + rect.width <= 1440 - 12)
    assert.ok(rect.left >= 12)
  })

  it('end-aligns when trigger is in the right half', () => {
    const rect = computeAnchoredContinuePanel({
      trigger: { left: 900, right: 1000, top: 40, bottom: 76, height: 36 },
      viewport: { width: 1440, height: 900 },
    })
    assert.equal(rect.left, 1000 - 440)
  })

  it('serializes fixed sheetStyle', () => {
    const style = anchoredContinuePanelStyle({
      top: 10,
      left: 248,
      width: 440,
      maxHeight: 666,
    })
    assert.match(style, /position:fixed/)
    assert.match(style, /left:248px/)
    assert.match(style, /max-height:666px/)
  })

  it('reads chrome inset from visible sidebar rect', () => {
    const sidebar = {
      getBoundingClientRect: () => ({
        width: 240,
        left: 0,
        right: 240,
        top: 0,
        bottom: 900,
      }),
    }
    const doc = {
      documentElement: {},
      defaultView: { innerWidth: 1440 },
      querySelector: () => sidebar,
    }
    assert.equal(readContinueChromeLeftInset(doc, 1440), 240)
    assert.equal(readContinueChromeLeftInset(doc, 768), 0)
  })
})
