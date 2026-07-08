/**
 * Toast store 的纯逻辑核心（无 runes / 无 DOM），供 toast.svelte.js 与测试复用。
 * 展示策略（去重窗口、时长计算）在 @life-os/theme 的 toastPolicy。
 */

/**
 * 归一化 toast() 的两种签名：
 * - toast(msg, 'error', { duration })          — planner / fitness 形式
 * - toast(msg, { error: true, duration })      — music 对象形式
 *
 * @param {'success' | 'error' | 'warn' | Record<string, unknown>} [toneOrOptions]
 * @param {Record<string, unknown>} [maybeOptions]
 * @returns {{ tone: 'success' | 'error' | 'warn', options: Record<string, unknown> }}
 */
export function normalizeToastArgs(toneOrOptions = 'success', maybeOptions = {}) {
  if (typeof toneOrOptions === 'object' && toneOrOptions !== null) {
    return {
      tone: toneOrOptions.error ? 'error' : toneOrOptions.warn ? 'warn' : 'success',
      options: toneOrOptions,
    }
  }
  return { tone: toneOrOptions, options: maybeOptions }
}

/**
 * 去重 key：success 用消息本身，error/warn 加 tone 前缀（与三 app 原实现一致）。
 *
 * @param {string} msg
 * @param {'success' | 'error' | 'warn'} tone
 * @param {{ key?: string }} [options]
 */
export function resolveToastKey(msg, tone, options = {}) {
  return options.key ?? (tone === 'success' ? msg : `${tone}:${msg}`)
}
