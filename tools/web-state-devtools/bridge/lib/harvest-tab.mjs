/**
 * Reuse an already-logged-in Chrome tab for merchant harvest (avoid blank auth tabs).
 */

/**
 * @param {(action: string, params?: object, timeoutMs?: number) => Promise<any>} runAction
 * @param {{ hostRe: RegExp, pathRe?: RegExp, targetUrl: string, log?: (msg: string) => void }} opts
 */
export async function resolveHarvestTabId(runAction, opts) {
  const { hostRe, pathRe, targetUrl, log = () => {} } = opts
  const tabs = await runAction('list_tabs', {}, 15000)

  const onTarget = tabs.find((t) => {
    const u = t.url || ''
    if (!hostRe.test(u)) return false
    return pathRe ? pathRe.test(u) : true
  })

  if (onTarget?.id) {
    log(`reusing tab ${onTarget.id} (${onTarget.url})`)
    return onTarget.id
  }

  const sameHost = tabs.find((t) => hostRe.test(t.url || ''))
  if (sameHost?.id) {
    log(`navigating logged-in tab ${sameHost.id} → ${targetUrl}`)
    const nav = await runAction(
      'navigate',
      { url: targetUrl, tabId: sameHost.id },
      90000,
    )
    return nav?.tabId ?? sameHost.id
  }

  log(`opening new tab → ${targetUrl}`)
  const nav = await runAction('navigate', { url: targetUrl }, 90000)
  if (!nav?.tabId) throw new Error('Navigate did not return tabId')
  return nav.tabId
}

/** Best Buy / Target use identity/signin/refresh as a token hop — not "logged out". */
export function isAuthIntermediateUrl(url) {
  return /signin\/refresh|identity\/signin\/refresh/i.test(url || '')
}

export function isHardSignInUrl(url) {
  if (!url) return false
  if (isAuthIntermediateUrl(url)) return false
  return /signin|identity\/signin|\/login(?:\?|$)/i.test(url)
}

/**
 * Poll tab list until harvest page is ready (past auth refresh redirect).
 * @param {(action: string, params?: object, timeoutMs?: number) => Promise<any>} runAction
 */
export async function waitForHarvestReady(
  runAction,
  tabId,
  { readyRe, log = () => {} },
  timeoutMs = 60000,
) {
  const start = Date.now()
  let lastUrl = ''

  while (Date.now() - start < timeoutMs) {
    const tabs = await runAction('list_tabs', {}, 10000)
    const tab = tabs.find((t) => t.id === tabId)
    const url = tab?.url || ''
    if (url !== lastUrl) {
      lastUrl = url
      if (url) log(`tab url: ${url}`)
    }
    if (readyRe.test(url) && !isAuthIntermediateUrl(url)) return url
    if (isHardSignInUrl(url)) {
      throw new Error(
        `Still on sign-in page (${url}) — complete login in Chrome, then retry`,
      )
    }
    await new Promise((r) => setTimeout(r, 800))
  }

  throw new Error(
    `Timed out waiting for harvest page (last: ${lastUrl || 'unknown'})`,
  )
}

/** Wait until tab shows an order detail URL (after navigate). */
export async function waitForDetailPage(
  runAction,
  tabId,
  timeoutMs = 45000,
) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = await getTabUrl(runAction, tabId)
    if (/order-details\/[^/]+|target\.com\/orders\/\d{12}/i.test(url)) {
      return url
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  return getTabUrl(runAction, tabId)
}

/** @param {(action: string, params?: object, timeoutMs?: number) => Promise<any>} runAction */
export async function getTabUrl(runAction, tabId) {
  const tabs = await runAction('list_tabs', {}, 10000)
  return tabs.find((t) => t.id === tabId)?.url || ''
}

/**
 * Ensure tab is on harvest list page; navigate only when needed.
 * @param {(action: string, params?: object, timeoutMs?: number) => Promise<any>} runAction
 */
export async function ensureHarvestListPage(
  runAction,
  tabId,
  { targetUrl, readyRe, log = () => {} },
) {
  let url = await getTabUrl(runAction, tabId)
  if (readyRe.test(url) && !isAuthIntermediateUrl(url)) return url

  if (isAuthIntermediateUrl(url)) {
    log(`waiting through auth refresh (${url})`)
    return waitForHarvestReady(runAction, tabId, { readyRe, log }, 60000)
  }

  log(`navigating to list → ${targetUrl}`)
  await runAction('navigate', { url: targetUrl, tabId }, 90000)
  return waitForHarvestReady(runAction, tabId, { readyRe, log }, 60000)
}
