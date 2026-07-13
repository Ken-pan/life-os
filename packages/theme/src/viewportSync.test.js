import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAppVhCSSValue } from './viewportSync.js'

/** @param {{ standalone?: boolean; mobile?: boolean; innerHeight?: number; visualHeight?: number }} opts */
function stubViewport(opts) {
  const innerHeight = opts.innerHeight ?? 852
  const visualHeight = opts.visualHeight ?? innerHeight
  const mobile = opts.mobile ?? true

  Object.defineProperty(globalThis, 'window', {
    value: {
      innerHeight,
      location: { search: '' },
      /** @param {string} query */
      matchMedia: (query) => ({
        matches: query.includes('display-mode')
          ? Boolean(opts.standalone)
          : mobile,
      }),
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
  Object.defineProperty(globalThis, 'document', {
    value: {
      documentElement: {
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {},
        },
        style: { setProperty: () => {} },
      },
    },
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

test('resolveAppVhCSSValue uses 100vh when standalone-pwa class is set', () => {
  stubViewport({ standalone: false, innerHeight: 852, visualHeight: 793 })
  // @ts-expect-error test stub
  globalThis.document.documentElement.classList.contains = () => true
  assert.equal(resolveAppVhCSSValue(), '100vh')
})

test('resolveAppVhCSSValue uses visual viewport px in mobile browser mode', () => {
  stubViewport({
    standalone: false,
    mobile: true,
    innerHeight: 800,
    visualHeight: 720,
  })
  assert.equal(resolveAppVhCSSValue(), '720px')
})

test('resolveAppVhCSSValue uses 100dvh in desktop browser mode', () => {
  stubViewport({
    standalone: false,
    mobile: false,
    innerHeight: 800,
    visualHeight: 720,
  })
  assert.equal(resolveAppVhCSSValue(), '100dvh')
})
