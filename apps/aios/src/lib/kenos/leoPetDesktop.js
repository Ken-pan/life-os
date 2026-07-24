/**
 * Tauri Leo 桌宠置顶窗桥接。
 * 非 Tauri 环境全部 no-op；pet 窗自身不创建自己。
 * 行业惯例：显式 opt-in、记住位置、全工作区可见。
 */
import { browser } from '$app/environment'
import { leoPetDesktopShouldOpen } from './leoPet.core.js'
import { readLeoPetWindowPos } from './leoPet.svelte.js'

const PET_LABEL = 'pet'
const PET_URL = '/pet'

/** @type {Promise<void> | null} */
let syncing = null

export function isTauriRuntime() {
  if (!browser) return false
  return Boolean(
    /** @type {{ __TAURI_INTERNALS__?: unknown }} */ (window).__TAURI_INTERNALS__ ||
      /** @type {{ __TAURI__?: unknown }} */ (window).__TAURI__,
  )
}

/** 当前是否已在 pet 小窗里 */
export async function isLeoPetWindow() {
  if (!isTauriRuntime()) return false
  try {
    const { getCurrentWebviewWindow } = await import(
      '@tauri-apps/api/webviewWindow'
    )
    return getCurrentWebviewWindow().label === PET_LABEL
  } catch {
    return false
  }
}

/**
 * @param {{ assistantPersona?: unknown, leoPetEnabled?: unknown, leoPetDesktop?: unknown } | null | undefined} settings
 */
export async function syncLeoPetDesktopWindow(settings) {
  if (!isTauriRuntime()) return
  if (await isLeoPetWindow()) return
  if (syncing) return syncing
  syncing = syncLeoPetDesktopWindowInner(settings).finally(() => {
    syncing = null
  })
  return syncing
}

/**
 * @param {{ assistantPersona?: unknown, leoPetEnabled?: unknown, leoPetDesktop?: unknown } | null | undefined} settings
 */
async function syncLeoPetDesktopWindowInner(settings) {
  const want = leoPetDesktopShouldOpen(settings)
  try {
    const { WebviewWindow, getCurrentWebviewWindow } = await import(
      '@tauri-apps/api/webviewWindow'
    )
    const existing = await WebviewWindow.getByLabel(PET_LABEL)
    if (!want) {
      if (existing) await existing.close()
      return
    }
    if (existing) {
      try {
        await existing.show()
        await existing.setAlwaysOnTop(true)
        await existing.setVisibleOnAllWorkspaces?.(true)
      } catch {
        /* window may be closing */
      }
      return
    }

    let x = 40
    let y = 80
    const saved = readLeoPetWindowPos()
    if (saved) {
      x = saved.x
      y = saved.y
    } else {
      try {
        const main = getCurrentWebviewWindow()
        const outer = await main.outerPosition()
        const size = await main.outerSize()
        const scale = await main.scaleFactor()
        const w = size.width / scale
        const h = size.height / scale
        x = Math.max(8, outer.x / scale + w - 260)
        y = Math.max(8, outer.y / scale + h - 340)
      } catch {
        /* defaults */
      }
    }

    const pet = new WebviewWindow(PET_LABEL, {
      url: PET_URL,
      title: 'Leo',
      // 窗口给气泡留出上方空间(桌宠放窗口下部,气泡向上不越界被裁)
      width: 240,
      height: 320,
      x: Math.round(x),
      y: Math.round(y),
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: true,
      focus: false,
      shadow: false,
    })
    pet.once('tauri://created', () => {
      void (async () => {
        try {
          await pet.setAlwaysOnTop(true)
          await pet.setVisibleOnAllWorkspaces?.(true)
        } catch {
          /* optional APIs */
        }
      })()
    })
    pet.once('tauri://error', (e) => {
      console.warn('[leo-pet] window error', e)
    })
  } catch (err) {
    console.warn('[leo-pet] desktop window unavailable', err)
  }
}

export async function closeLeoPetDesktopWindow() {
  if (!isTauriRuntime()) return
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel(PET_LABEL)
    if (existing) await existing.close()
  } catch {
    /* ignore */
  }
}

/**
 * 透明区点击穿透：默认穿透，指针进入 pet 命中区时关闭穿透。
 * @param {boolean} ignore
 */
export async function setLeoPetIgnoreCursor(ignore) {
  if (!isTauriRuntime()) return
  try {
    const { getCurrentWebviewWindow } = await import(
      '@tauri-apps/api/webviewWindow'
    )
    const win = getCurrentWebviewWindow()
    if (win.label !== PET_LABEL) return
    await win.setIgnoreCursorEvents(Boolean(ignore))
  } catch {
    /* ignore */
  }
}

/** 绑定 pet 窗位置持久化（拖动后记住） */
export async function bindLeoPetWindowPosPersistence() {
  if (!isTauriRuntime()) return () => {}
  try {
    const { getCurrentWebviewWindow } = await import(
      '@tauri-apps/api/webviewWindow'
    )
    const { writeLeoPetWindowPos } = await import('./leoPet.svelte.js')
    const win = getCurrentWebviewWindow()
    if (win.label !== PET_LABEL) return () => {}
    let timer = null
    const unlisten = await win.onMoved(async () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          const pos = await win.outerPosition()
          const scale = await win.scaleFactor()
          writeLeoPetWindowPos({
            x: pos.x / scale,
            y: pos.y / scale,
          })
        } catch {
          /* ignore */
        }
      }, 200)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unlisten()
    }
  } catch {
    return () => {}
  }
}
