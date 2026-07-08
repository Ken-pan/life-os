import { createToastDeduper, resolveToastDuration } from '@life-os/theme'
import { normalizeToastArgs, resolveToastKey } from './toastCore.js'

/**
 * Life OS 统一 toast store（单槽：新 toast 覆盖旧的并重置计时器）。
 * 各 app 在自己的 ui.svelte.js 里实例化并 re-export，保持既有 import 路径。
 *
 * 行为与三 app 原实现一致：
 * - 去重：默认 3000ms 窗口，key 规则见 toastCore
 * - 时长：options.duration 优先，否则 resolveDuration（默认 toastPolicy；
 *   app 可注入自定义策略，如 Music 的更紧 min/max）
 * - action 按钮（planner）：actionLabel + onAction
 * - dismiss：清计时器并隐藏
 *
 * @param {{
 *   resolveDuration?: (msg: string, ctx: { tone: string, actionLabel: string }) => number
 * }} [storeOptions]
 */
export function createToastStore(storeOptions = {}) {
  const resolveDuration =
    storeOptions.resolveDuration ??
    ((msg, ctx) => resolveToastDuration(msg, ctx))
  const toastState = $state({
    msg: '',
    show: false,
    tone: 'success',
    /** @type {string} 可选操作按钮文案（如「撤销」） */
    actionLabel: '',
    /** @type {(() => void) | null} */
    onAction: null,
  })

  /** @type {ReturnType<typeof setTimeout> | null} */
  let toastTimer = null
  const shouldShowToast = createToastDeduper()

  /**
   * @param {string} msg
   * @param {'success' | 'error' | 'warn' | { error?: boolean, warn?: boolean, actionLabel?: string, onAction?: () => void, duration?: number, key?: string, dedupeMs?: number }} [toneOrOptions]
   * @param {{ actionLabel?: string, onAction?: () => void, duration?: number, key?: string, dedupeMs?: number }} [maybeOptions]
   */
  function toast(msg, toneOrOptions = 'success', maybeOptions = {}) {
    const { tone, options } = normalizeToastArgs(toneOrOptions, maybeOptions)
    const key = resolveToastKey(msg, tone, options)
    if (!shouldShowToast(key, options.dedupeMs ?? 3000)) return

    toastState.msg = msg
    toastState.tone = tone
    toastState.actionLabel = options.actionLabel ?? ''
    toastState.onAction = options.onAction ?? null
    toastState.show = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(
      () => {
        toastState.show = false
      },
      options.duration ??
        resolveDuration(msg, { tone, actionLabel: toastState.actionLabel }),
    )
  }

  function dismissToast() {
    if (toastTimer) clearTimeout(toastTimer)
    toastState.show = false
  }

  /** 卸载清理：仅清计时器，不重置状态 */
  function destroy() {
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = null
  }

  return { toastState, toast, dismissToast, destroy }
}
