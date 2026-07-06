/**
 * Single explore step + deep multi-round exploration loop.
 */
import fs from 'node:fs'
import { diffSnapshots } from './state-diff.mjs'

const DESTRUCTIVE_RE =
  /delete|remove|cancel|sign out|log out|logout|unsubscribe|destructive/i

/**
 * @param {Record<string, unknown>} candidate
 */
export function candidateKey(candidate) {
  const p = candidate.params || {}
  return `${candidate.action}:${p.selector || p.url || candidate.id || candidate.type}`
}

/**
 * @param {Record<string, unknown>} diff
 */
export function isEmptyDiff(diff) {
  const s = diff.stats || {}
  return (
    !diff.urlChanged &&
    !diff.titleChanged &&
    (s.newControlCount || 0) === 0 &&
    (s.newLinkCount || 0) === 0 &&
    (s.newHeadingCount || 0) === 0 &&
    (s.regionCountDelta || 0) === 0 &&
    (s.adapterItemsDelta || 0) === 0
  )
}

/**
 * @param {Array<Record<string, unknown>>} candidates
 * @param {{ triedKeys: Set<string>, visitedUrls: Set<string>, skipNavigate?: boolean }} ctx
 */
export function filterSafeCandidates(candidates, ctx) {
  const seen = new Set()
  return candidates.filter((c) => {
    const key = candidateKey(c)
    if (ctx.triedKeys.has(key) || seen.has(key)) return false
    seen.add(key)

    const reason = String(c.reason || '')
    if (DESTRUCTIVE_RE.test(reason)) return false

    if (ctx.skipNavigate && (c.type === 'navigate' || c.action === 'navigate'))
      return false

    const url = c.params?.url
    if (url && ctx.visitedUrls.has(normalizeUrl(url))) return false

    if (c.type === 'policy' && c.action === 'run_steps') {
      const steps = c.params?.steps || []
      if (steps.every((s) => s.action === 'capture')) return false
    }

    return true
  })
}

/**
 * @param {string} url
 */
export function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.href
  } catch {
    return url
  }
}

/**
 * @param {Record<string, unknown>} total
 * @param {Record<string, unknown>} stats
 */
function addStats(total, stats) {
  return {
    newControlCount: total.newControlCount + (stats.newControlCount || 0),
    newLinkCount: total.newLinkCount + (stats.newLinkCount || 0),
    newHeadingCount: total.newHeadingCount + (stats.newHeadingCount || 0),
    regionCountDelta: total.regionCountDelta + (stats.regionCountDelta || 0),
    adapterItemsDelta: total.adapterItemsDelta + (stats.adapterItemsDelta || 0),
    urlChanges: total.urlChanges + (stats.urlChanged ? 1 : 0),
  }
}

/**
 * @param {object} deps
 * @param {Record<string, unknown>} candidate
 * @param {number} [waitMs]
 */
export async function runExploreStep(deps, candidate, waitMs = 800) {
  const { latestPath, runAction, graphStore, isUrlAllowed } = deps
  const before = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
  const beforeNode = graphStore.ensureNode(before, {
    pageType: before.derived?.pageModel?.pageType,
  })

  const action = candidate.action
  const params = { ...(candidate.params || {}) }

  if (params.url) {
    const allowed = isUrlAllowed(params.url)
    if (!allowed.ok) throw new Error(allowed.error)
  }

  const actionResult = await runAction(action, params, 120000)
  await sleep(waitMs)

  if (action !== 'capture') {
    await runAction('capture', { send: true }, 60000)
  }

  const after = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
  const afterNode = graphStore.ensureNode(after, {
    pageType: after.derived?.pageModel?.pageType,
  })

  graphStore.addEdge(beforeNode.id, afterNode.id, {
    action,
    selector: params.selector,
    url: params.url,
    candidateId: candidate.id,
    reason: candidate.reason,
  })

  const diff = diffSnapshots(before, after, {
    action,
    params,
    candidateId: candidate.id,
    candidateReason: candidate.reason,
  })

  return {
    candidate,
    actionResult,
    diff,
    beforeNodeId: beforeNode.id,
    afterNodeId: afterNode.id,
  }
}

/**
 * @param {object} deps
 * @param {object} options
 */
export async function runExploreDeep(deps, options = {}) {
  const {
    maxSteps = 10,
    maxDepth = 5,
    stopOnEmptyDiff = true,
    waitMs = 800,
    skipNavigate = false,
  } = options

  const { latestPath } = deps

  if (!fs.existsSync(latestPath)) {
    throw new Error('No snapshot — capture a page first')
  }

  const triedKeys = new Set()
  const visitedUrls = new Set()
  const steps = []
  let totalRevealed = {
    newControlCount: 0,
    newLinkCount: 0,
    newHeadingCount: 0,
    regionCountDelta: 0,
    adapterItemsDelta: 0,
    urlChanges: 0,
  }
  let depth = 0
  let stopReason = 'max_steps'

  const startUrl = normalizeUrl(
    JSON.parse(fs.readFileSync(latestPath, 'utf8')).page?.url || '',
  )
  if (startUrl) visitedUrls.add(startUrl)

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    const snapshot = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
    const currentUrl = normalizeUrl(snapshot.page?.url || '')
    if (currentUrl) visitedUrls.add(currentUrl)

    const allCandidates = snapshot.derived?.explorationCandidates || []
    let candidates = filterSafeCandidates(allCandidates, {
      triedKeys,
      visitedUrls,
      skipNavigate,
    })

    if (depth >= maxDepth) {
      candidates = candidates.filter(
        (c) => c.type !== 'navigate' && c.action !== 'navigate',
      )
    }

    if (!candidates.length) {
      stopReason = depth >= maxDepth ? 'max_depth' : 'no_candidates'
      break
    }

    const candidate = candidates[0]
    triedKeys.add(candidateKey(candidate))

    try {
      const result = await runExploreStep(deps, candidate, waitMs)
      const { diff } = result

      if (diff.urlChanged) depth += 1
      if (diff.afterUrl) visitedUrls.add(normalizeUrl(diff.afterUrl))

      totalRevealed = addStats(totalRevealed, {
        ...diff.stats,
        urlChanged: diff.urlChanged,
      })

      steps.push({
        step: stepIndex + 1,
        depth,
        candidate: {
          id: candidate.id,
          type: candidate.type,
          action: candidate.action,
          reason: candidate.reason,
          params: candidate.params,
        },
        diff: {
          stats: diff.stats,
          urlChanged: diff.urlChanged,
          beforeUrl: diff.beforeUrl,
          afterUrl: diff.afterUrl,
          revealedContent: diff.revealedContent,
        },
        ok: true,
      })

      deps.graphStore.logAction({
        exploreDeep: true,
        step: stepIndex + 1,
        candidateId: candidate.id,
        diff: diff.stats,
        ok: true,
      })

      if (stopOnEmptyDiff && isEmptyDiff(diff)) {
        stopReason = 'empty_diff'
        break
      }
    } catch (err) {
      steps.push({
        step: stepIndex + 1,
        depth,
        candidate: { id: candidate.id, reason: candidate.reason },
        ok: false,
        error: String(err.message || err),
      })
      deps.graphStore.logAction({
        exploreDeep: true,
        step: stepIndex + 1,
        candidateId: candidate.id,
        error: String(err.message),
        ok: false,
      })
      stopReason = 'error'
      break
    }
  }

  if (!steps.length && stopReason === 'max_steps') {
    stopReason = 'no_candidates'
  }

  const finalSnapshot = JSON.parse(fs.readFileSync(latestPath, 'utf8'))

  return {
    schema: 'web-state-devtools/explore-trace/v1',
    startedAt: new Date().toISOString(),
    stopReason,
    options: { maxSteps, maxDepth, stopOnEmptyDiff, waitMs, skipNavigate },
    stepsCompleted: steps.length,
    totalRevealed,
    steps,
    finalPage: {
      url: finalSnapshot.page?.url,
      title: finalSnapshot.page?.title,
      pageType: finalSnapshot.derived?.pageModel?.pageType,
    },
    finalPageModel: finalSnapshot.derived?.pageModel,
    remainingCandidates: (
      finalSnapshot.derived?.explorationCandidates || []
    ).slice(0, 8),
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
