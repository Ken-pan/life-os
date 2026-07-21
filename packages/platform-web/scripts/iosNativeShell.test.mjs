import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import {
  IOS_NATIVE_SHELL_BOTTOM_PAD_PX,
  IOS_NATIVE_SHELL_TOP_PAD_PX,
  ensureIosNativeShellChromeCss,
  isIosNativeShell,
  markIosNativeShellDom,
} from '../src/iosNativeShell.js'

describe('iosNativeShell chrome CSS', () => {
  /** @type {typeof globalThis.document | undefined} */
  let prevDocument
  /** @type {typeof globalThis.window | undefined} */
  let prevWindow

  beforeEach(() => {
    prevDocument = globalThis.document
    prevWindow = globalThis.window
    const html = { dataset: {} }
    const head = {
      children: [],
      appendChild(node) {
        this.children.push(node)
        return node
      },
    }
    const doc = {
      documentElement: html,
      head,
      getElementById(id) {
        return head.children.find((n) => n.id === id) || null
      },
      createElement(tag) {
        return {
          tagName: tag,
          id: '',
          textContent: '',
        }
      },
    }
    globalThis.document = doc
    globalThis.window = {
      __KENOS_IOS_NATIVE_SHELL__: true,
      location: { search: '' },
      sessionStorage: {
        store: {},
        getItem(k) {
          return this.store[k] ?? null
        },
        setItem(k, v) {
          this.store[k] = String(v)
        },
      },
    }
  })

  afterEach(() => {
    globalThis.document = prevDocument
    globalThis.window = prevWindow
  })

  it('exports dock pad constants matching native KenosWebChrome', () => {
    assert.equal(IOS_NATIVE_SHELL_TOP_PAD_PX, 54)
    assert.equal(IOS_NATIVE_SHELL_BOTTOM_PAD_PX, 80)
  })

  it('detects shell from window flag', () => {
    assert.equal(isIosNativeShell(), true)
  })

  it('injects fallback chrome CSS once', () => {
    assert.equal(ensureIosNativeShellChromeCss(), true)
    const style = document.getElementById('kenos-ios-native-shell-css')
    assert.ok(style)
    assert.match(style.textContent, /padding-top:54px/)
    assert.match(style.textContent, /80px/)
    assert.match(style.textContent, /\.fab/)
    assert.match(style.textContent, /data-immersive-route/)
    assert.match(style.textContent, /data-kenos-web-chrome='none'/)
    assert.match(
      style.textContent,
      /--safe-top-effective:env\(safe-area-inset-top/,
    )
    assert.equal(ensureIosNativeShellChromeCss(), false)
  })

  it('markIosNativeShellDom does not overwrite existing native stylesheet', () => {
    const existing = document.createElement('style')
    existing.id = 'kenos-ios-native-shell-css'
    existing.textContent = '/* native */'
    document.head.appendChild(existing)
    markIosNativeShellDom()
    assert.equal(
      document.getElementById('kenos-ios-native-shell-css').textContent,
      '/* native */',
    )
  })
})
