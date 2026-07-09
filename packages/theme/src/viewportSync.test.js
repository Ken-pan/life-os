import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAppVhCSSValue } from './viewportSync.js'

/** @param {{ standalone?: boolean; innerHeight?: number; visualHeight?: number }} opts */
function stubViewport(opts) {
  const innerHeight = opts.innerHeight ?? 852
  const visualHeight = opts.visualHeight ?? innerHeight

  Object.defineProperty(globalThis, 'window', {
    value: {
      innerHeight,
      matchMedia: () => ({ matches: Boolean(opts.standalone) }),
      visualViewport: {
        height: visualHeight,
        width: 393,
        offsetTop: 0,
        offsetLeft: 0,
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'navigator', {
    value: { standalone: Boolean(opts.standalone) },
    configurable: true,
  })
}

test('resolveAppVhCSSValue uses 100vh in standalone PWA cold start', () => {
  stubViewport({ standalone: true, innerHeight: 852, visualHeight: 793 })
  assert.equal(resolveAppVhCSSValue(), '100vh')
})

test('resolveAppVhCSSValue tracks visual viewport when keyboard shrinks standalone', () => {
  stubViewport({ standalone: true, innerHeight: 852, visualHeight: 420 })
  assert.equal(resolveAppVhCSSValue(), '420px')
})

test('resolveAppVhCSSValue uses visual viewport px in browser mode', () => {
  stubViewport({ standalone: false, innerHeight: 800, visualHeight: 720 })
  assert.equal(resolveAppVhCSSValue(), '720px')
})
