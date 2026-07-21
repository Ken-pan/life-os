/**
 * Single presentation SSOT for Kenos account / sync surfaces.
 * Today, Inbox, Ask, and Settings must read this — never invent conflicting copy.
 *
 * States (product-facing, not raw source enums):
 * - authenticationState: unknown | signed_out | signed_in
 * - accountSyncState: unknown | disconnected | syncing | synced | partial | error | offline
 * - inboxSyncState / crossSpaceSummaryState:
 *     unknown | syncing | locked | ready | empty | unavailable | error | offline
 */

const READABLE = new Set(['ready', 'empty', 'partial', 'stale'])

/**
 * @param {string | undefined} status
 * @returns {'unknown'|'syncing'|'locked'|'ready'|'empty'|'unavailable'|'error'|'offline'}
 */
export function mapSourceToSurfaceState(status) {
  switch (status) {
    case 'loading':
      return 'syncing'
    case 'permission_denied':
      return 'locked'
    case 'offline':
      return 'offline'
    case 'unavailable':
    case 'unsupported':
      return 'unavailable'
    case 'error':
      return 'error'
    case 'empty':
      return 'empty'
    case 'ready':
    case 'stale':
    case 'partial':
      return 'ready'
    default:
      return 'unknown'
  }
}

/**
 * @param {{
 *   cloudReady?: boolean,
 *   cloudUser?: { id?: string, email?: string } | null,
 *   cloudAuthorized?: boolean,
 *   cloudSyncing?: boolean,
 *   cloudLastSyncAt?: number,
 *   controlLoading?: boolean,
 *   sources?: Record<string, { status?: string } | null | undefined>,
 * }} input
 */
export function resolveProductSessionState({
  cloudReady = false,
  cloudUser = null,
  cloudAuthorized = false,
  cloudSyncing = false,
  cloudLastSyncAt = 0,
  controlLoading = false,
  sources = {},
} = {}) {
  /** @type {'unknown'|'signed_out'|'signed_in'} */
  let authenticationState = 'unknown'
  if (cloudReady) {
    authenticationState = cloudUser ? 'signed_in' : 'signed_out'
  } else if (
    sources.today?.status === 'permission_denied' ||
    sources.inbox?.status === 'permission_denied'
  ) {
    authenticationState = 'signed_out'
  }

  const todayStatus =
    sources.today?.status || (controlLoading ? 'loading' : undefined)
  const inboxStatus =
    sources.inbox?.status || (controlLoading ? 'loading' : undefined)

  let crossSpaceSummaryState = mapSourceToSurfaceState(todayStatus)
  let inboxSyncState = mapSourceToSurfaceState(inboxStatus)

  // Signed out: never show syncing / empty as if data were readable.
  if (authenticationState === 'signed_out') {
    crossSpaceSummaryState = 'locked'
    inboxSyncState = 'locked'
  }

  // Signed-in but not owner-authorized: control reads stay locked.
  // Do not pretend the account is fully synced.
  if (
    authenticationState === 'signed_in' &&
    !cloudAuthorized &&
    cloudReady
  ) {
    if (
      crossSpaceSummaryState === 'unknown' ||
      crossSpaceSummaryState === 'unavailable' ||
      crossSpaceSummaryState === 'syncing'
    ) {
      crossSpaceSummaryState = 'locked'
    }
    if (
      inboxSyncState === 'unknown' ||
      inboxSyncState === 'unavailable' ||
      inboxSyncState === 'syncing'
    ) {
      inboxSyncState = 'locked'
    }
  }

  /** @type {'unknown'|'disconnected'|'syncing'|'synced'|'partial'|'error'|'offline'} */
  let accountSyncState = 'unknown'
  if (authenticationState === 'signed_out') {
    accountSyncState = 'disconnected'
  } else if (authenticationState === 'unknown') {
    accountSyncState =
      controlLoading || cloudSyncing || crossSpaceSummaryState === 'syncing'
        ? 'syncing'
        : 'unknown'
  } else if (
    cloudSyncing ||
    crossSpaceSummaryState === 'syncing' ||
    inboxSyncState === 'syncing'
  ) {
    accountSyncState = 'syncing'
  } else if (
    crossSpaceSummaryState === 'offline' ||
    inboxSyncState === 'offline'
  ) {
    accountSyncState = 'offline'
  } else if (
    crossSpaceSummaryState === 'error' ||
    inboxSyncState === 'error'
  ) {
    accountSyncState = 'error'
  } else if (!cloudAuthorized) {
    // Logged in at SSO layer, but Continuity reads are not enabled for this account.
    accountSyncState = 'partial'
  } else if (
    crossSpaceSummaryState === 'locked' ||
    inboxSyncState === 'locked'
  ) {
    accountSyncState = 'partial'
  } else if (
    (crossSpaceSummaryState === 'ready' ||
      crossSpaceSummaryState === 'empty') &&
    (inboxSyncState === 'ready' || inboxSyncState === 'empty')
  ) {
    accountSyncState = 'synced'
  } else if (
    cloudAuthorized &&
    (cloudLastSyncAt > 0 ||
      READABLE.has(sources.today?.status || '') ||
      READABLE.has(sources.inbox?.status || ''))
  ) {
    accountSyncState =
      inboxSyncState === 'unavailable' ||
      crossSpaceSummaryState === 'unavailable'
        ? 'partial'
        : 'synced'
  } else {
    accountSyncState = 'partial'
  }

  const needsSignIn =
    authenticationState === 'signed_out' ||
    crossSpaceSummaryState === 'locked' ||
    inboxSyncState === 'locked'

  const showTodaySkeleton =
    crossSpaceSummaryState === 'syncing' &&
    authenticationState !== 'signed_out' &&
    !needsSignIn

  return Object.freeze({
    authenticationState,
    accountSyncState,
    inboxSyncState,
    crossSpaceSummaryState,
    needsSignIn,
    showTodaySkeleton,
    cloudAuthorized: Boolean(cloudAuthorized),
  })
}

export const ASK_SESSION_COPY = Object.freeze({
  unavailable: '连接 Kenos 账户后，我可以汇总各空间中需要处理的事项。',
  syncing: '正在检查各空间的最新状态。',
  empty: '今天没有需要立即处理的事项。',
})

/**
 * User-facing labels from the shared session state.
 * @param {ReturnType<typeof resolveProductSessionState>} session
 */
export function productSessionLabels(session) {
  const accountStatus = {
    disconnected: '未连接',
    syncing: '正在同步',
    synced: '已同步',
    partial:
      session.authenticationState === 'signed_in' && !session.cloudAuthorized
        ? '已登录'
        : session.inboxSyncState === 'locked' ||
            session.inboxSyncState === 'unavailable'
          ? '账户已同步；收件箱未启用'
          : '已登录',
    error: '同步异常',
    offline: '离线',
    unknown: '…',
  }[session.accountSyncState]

  const todayOverview = {
    syncing: '正在同步今天的计划…',
    locked: '连接 Kenos 账户后即可同步今日摘要、收件箱与跨设备状态。',
    unavailable: '今日摘要暂不可用。各空间仍可独立使用。',
    offline: '当前离线。恢复网络后将自动重试。',
    error: '暂时无法更新今日摘要。可重试。',
    empty: '',
    ready: '',
    unknown: '',
  }[session.crossSpaceSummaryState]

  return Object.freeze({
    accountStatus,
    todayOverview,
    askUnavailable: ASK_SESSION_COPY.unavailable,
    askSyncing: ASK_SESSION_COPY.syncing,
    askEmpty: ASK_SESSION_COPY.empty,
  })
}

/**
 * Whether cross-space / inbox data is readable enough to claim "nothing urgent".
 * @param {{ summary?: object|null, queue?: { inboxOpen?: number|null, approvalsOpen?: number|null }|null, session?: ReturnType<typeof resolveProductSessionState>|null }} input
 */
export function canClaimEmptyAttention({
  summary = null,
  queue = null,
  session = null,
} = {}) {
  if (session) {
    const summaryState = session.crossSpaceSummaryState
    const inboxState = session.inboxSyncState
    if (
      summaryState === 'locked' ||
      summaryState === 'syncing' ||
      summaryState === 'unavailable' ||
      summaryState === 'offline' ||
      summaryState === 'error' ||
      summaryState === 'unknown'
    ) {
      return false
    }
    if (
      inboxState === 'locked' ||
      inboxState === 'syncing' ||
      inboxState === 'offline' ||
      inboxState === 'error'
    ) {
      return false
    }
    return true
  }
  const summaryOk = Boolean(summary && summary.ok !== false)
  const hasQueueNumber =
    typeof queue?.inboxOpen === 'number' ||
    typeof queue?.approvalsOpen === 'number'
  return summaryOk || hasQueueNumber
}
