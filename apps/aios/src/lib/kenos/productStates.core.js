/**
 * Kenos product-state copy — loading / empty / error / offline / Continuity edges.
 * Presentation only; does not change Continuity contracts.
 */

export const PRODUCT_COPY = Object.freeze({
  continueEmptyRecent: Object.freeze({
    title: '还没有可以继续的内容',
    body: '这是正常的。进入任一 Space 后，会在这里出现。',
    action: '浏览全部 Spaces',
  }),
  continueSearchEmpty: Object.freeze({
    title: '没有匹配的 Space',
    body: '保留搜索词，或清除后重试。',
    action: '清除搜索',
  }),
  continueExpired: Object.freeze({
    badge: '已过期',
    detail: '位置已过期 · 将打开 Space 入口',
    actionOpen: '打开入口',
    actionRemove: '移除记录',
  }),
  continueMissing: Object.freeze({
    badge: '已不存在',
    detail: '该内容已不存在 · 可打开 Space 或移除记录',
    actionOpen: '打开 Space',
    actionRemove: '移除记录',
  }),
  todayEmptyUrgent: Object.freeze({
    title: '今天没有需要立即处理的事',
    body: '这是正常状态。可以从 Inbox 整理，或继续刚才的工作。',
    actionContinue: '继续刚才的事',
    actionAssistant: '问 Assistant',
  }),
  todayNeedSignIn: Object.freeze({
    title: '登录后查看今日摘要',
    body: '云端 Today / Inbox 需要 Life OS 账户。Spaces 仍可先打开使用。',
    actionContinue: '继续刚才的事',
    actionSettings: '去设置登录',
  }),
  todayLoading: Object.freeze({
    label: '正在汇总各 Space 状态…',
  }),
  todayPartialError: Object.freeze({
    title: '部分内容暂时无法更新',
    body: '已保留上次可用数据。可重试该区域。',
    action: '重试',
  }),
  offlineBanner: Object.freeze({
    title: '当前离线',
    body: '显示已缓存内容；恢复网络后将自动重试',
  }),
  staleHint: Object.freeze({
    label: '内容可能不是最新',
  }),
  authExpired: Object.freeze({
    title: '需要重新登录',
    body: '登录过期后无法读取你的数据。',
    action: '重新登录',
  }),
  permissionDenied: Object.freeze({
    title: '没有访问权限',
    body: '这不是网络问题，重试不会改变结果。',
  }),
  domainUnavailable: Object.freeze({
    title: '该 Space 暂时不可用',
    body: '可稍后再试，或从 Spaces 进入其他领域。',
    action: '返回 Spaces',
  }),
})

/**
 * Safe secondary line for Continue — never leak entity ids / routes / demo tokens.
 * @param {string | null | undefined} raw
 */
export function sanitizeContinueDetail(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^demo[-_]/i.test(text) || /descriptor/i.test(text)) return ''
  if (/^[0-9a-f]{8}-[0-9a-f-]{12,}$/i.test(text)) return ''
  if (/^c_[a-z0-9_]+$/i.test(text)) return '有未完成项'
  if (text.startsWith('已选 ·')) return '有未完成项'
  if (/^https?:\/\//i.test(text) || text.includes('://')) return '继续上次位置'
  return text
}

/**
 * @param {number | string | null | undefined} updatedAt
 * @param {number} [now]
 */
export function formatLastSyncedLabel(updatedAt, now = Date.now()) {
  if (updatedAt == null || updatedAt === '') return ''
  const ts =
    typeof updatedAt === 'string' ? Date.parse(updatedAt) : Number(updatedAt)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const deltaMin = Math.max(0, Math.floor((now - ts) / 60_000))
  if (deltaMin < 1) return '最后更新：刚刚'
  if (deltaMin < 60) return `最后更新：${deltaMin} 分钟前`
  const hours = Math.floor(deltaMin / 60)
  if (hours < 24) return `最后更新：${hours} 小时前`
  return `最后更新：${Math.floor(hours / 24)} 天前`
}
