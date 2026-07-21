/**
 * Runtime simulation: pull/push/bind with a fake native bridge.
 */
import assert from 'node:assert/strict'

globalThis.window = globalThis
globalThis.document = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
  documentElement: { dataset: { iosNativeShell: 'true' } },
}
window.addEventListener = () => {}
window.removeEventListener = () => {}
window.__KENOS_IOS_NATIVE_SHELL__ = true
window.__KENOS_NATIVE_BRIDGE_BOOT__ = true

let store = {
  theme: 'auto',
  locale: 'system',
  resolvedLocale: 'zh',
  hasTheme: false,
  hasLocale: false,
}
const pending = new Map()

window.webkit = {
  messageHandlers: {
    kenosNative: {
      postMessage(body) {
        const id = body.id
        const method = body.method
        const params = body.params || {}
        queueMicrotask(() => {
          if (method === 'shellSettingsGet') {
            window.__KENOS_NATIVE_BRIDGE__.resolve(id, {
              ok: true,
              settings: { ...store },
            })
            return
          }
          if (method === 'shellSettingsSet') {
            if (params.theme) {
              store.theme = params.theme
              store.hasTheme = true
            }
            if (params.locale) {
              store.locale = params.locale
              store.hasLocale = true
              store.resolvedLocale =
                params.locale === 'system' ? 'zh' : params.locale
            }
            window.__KENOS_NATIVE_BRIDGE__.resolve(id, {
              ok: true,
              settings: { ...store },
            })
            return
          }
          window.__KENOS_NATIVE_BRIDGE__.reject(id, {
            code: 'unknown',
            message: method,
          })
        })
      },
    },
  },
}

window.__KENOS_NATIVE_BRIDGE__ = {
  call(method, params = {}) {
    const id = `t_${Math.random().toString(36).slice(2)}`
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      window.webkit.messageHandlers.kenosNative.postMessage({
        id,
        method,
        params,
      })
    })
  },
  resolve(id, result) {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    p.resolve(result)
  },
  reject(id, error) {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    p.reject(error)
  },
}

window.kenosNative = {
  shellSettings: {
    get: () => window.__KENOS_NATIVE_BRIDGE__.call('shellSettingsGet'),
    set: (p) => window.__KENOS_NATIVE_BRIDGE__.call('shellSettingsSet', p || {}),
  },
}

const { isNativeBridgeAvailable } = await import('../src/kenosNativeBridge.js')
const {
  pullKenosShellSettings,
  pushKenosShellSettings,
  bindKenosShellSettings,
} = await import('../src/kenosShellSettings.js')

assert.equal(isNativeBridgeAvailable(), true)

const pulled = await pullKenosShellSettings()
assert.equal(pulled.ok, true)
assert.equal(pulled.theme, 'auto')
assert.equal(pulled.resolvedLocale, 'zh')

const pushed = await pushKenosShellSettings({ theme: 'dark', locale: 'en' })
assert.equal(pushed.ok, true)
assert.equal(store.theme, 'dark')
assert.equal(store.locale, 'en')

let theme = 'auto'
let locale = 'zh'
const dispose = bindKenosShellSettings({
  getTheme: () => theme,
  setTheme: (t) => {
    theme = t
  },
  getLocale: () => locale,
  setLocale: (l) => {
    locale = l
  },
})
await new Promise((r) => setTimeout(r, 30))
assert.equal(theme, 'dark')
assert.equal(locale, 'en')
dispose()

console.log('kenosShellSettings.runtime.test.mjs: ok')
