import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isEditableFocusTarget,
  isKeyboardOpen,
  resolveAppVhCSSValue,
  resolveKeyboardInset,
} from './viewportSync.js'

/** @param {{ standalone?: boolean; mobile?: boolean; innerHeight?: number; visualHeight?: number; offsetTop?: number; scrollY?: number }} opts */
function stubViewport(opts) {
  const innerHeight = opts.innerHeight ?? 852
  const visualHeight = opts.visualHeight ?? innerHeight
  const mobile = opts.mobile ?? true

  Object.defineProperty(globalThis, 'window', {
    value: {
      innerHeight,
      scrollY: opts.scrollY ?? 0,
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
        offsetTop: opts.offsetTop ?? 0,
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
          toggle: () => {},
        },
        style: { setProperty: () => {} },
        dataset: {},
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

test('resolveKeyboardInset ignores URL-bar jitter under floor', () => {
  stubViewport({
    standalone: true,
    innerHeight: 852,
    visualHeight: 800,
    offsetTop: 0,
  })
  assert.equal(resolveKeyboardInset(), 0)
  assert.equal(isKeyboardOpen(), false)
})

test('resolveKeyboardInset reports real keyboard height', () => {
  stubViewport({
    standalone: true,
    innerHeight: 852,
    visualHeight: 420,
    offsetTop: 0,
  })
  assert.equal(resolveKeyboardInset(), 432)
  assert.equal(isKeyboardOpen(), true)
})

test('resolveKeyboardInset subtracts iOS focus-scroll offsetTop', () => {
  stubViewport({
    standalone: true,
    innerHeight: 852,
    visualHeight: 420,
    offsetTop: 40,
  })
  // layoutGap = 852 - 420 - 40 = 392; scrollGap = 0 + 40 → max = 392
  assert.equal(resolveKeyboardInset(), 392)
})

test('resolveKeyboardInset uses scrollY+offsetTop when standalone vv.height does not shrink', () => {
  stubViewport({
    standalone: true,
    innerHeight: 852,
    visualHeight: 852,
    offsetTop: 120,
    scrollY: 280,
  })
  // layoutGap = 852 - 852 - 120 = -120 → max with scrollGap 400
  assert.equal(resolveKeyboardInset(), 400)
  assert.equal(isKeyboardOpen(), true)
})

test('resolveKeyboardInset ignores scrollY fallback outside standalone PWA', () => {
  stubViewport({
    standalone: false,
    mobile: true,
    innerHeight: 852,
    visualHeight: 852,
    offsetTop: 120,
    scrollY: 280,
  })
  assert.equal(resolveKeyboardInset(), 0)
  assert.equal(isKeyboardOpen(), false)
})

test('isEditableFocusTarget rejects null and non-elements', () => {
  assert.equal(isEditableFocusTarget(null), false)
  assert.equal(isEditableFocusTarget(undefined), false)
})
