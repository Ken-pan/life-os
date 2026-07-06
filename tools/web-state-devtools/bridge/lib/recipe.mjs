/**
 * Recipe engine — YAML-driven harvest (pagination, capture, merge, export).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractEntities, mergeEntityItems } from './entity-extractor.mjs'
import { redactForExport } from './privacy.mjs'
import { extractMergeKey } from './store.mjs'
import { resolveCaptureConfig } from './wait-strategy.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECIPES_DIR = path.join(__dirname, '..', 'recipes')

/**
 * Minimal YAML parser for recipe files (maps + scalars + inline lists only).
 * @param {string} text
 */
export function parseSimpleYaml(text) {
  /** @type {Record<string, unknown>} */
  const root = {}
  /** @type {Record<string, unknown>[]} */
  const stack = [root]
  /** @type {number[]} */
  const indentStack = [-1]

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line.trim() || line.trim().startsWith('#')) continue

    const listMatch = line.match(/^(\s*)-\s+(.*)$/)
    if (listMatch) {
      const indent = listMatch[1].length
      const item = parseYamlValue(listMatch[2])
      while (
        indentStack.length > 1 &&
        indent <= indentStack[indentStack.length - 1]
      ) {
        stack.pop()
        indentStack.pop()
      }
      const parent = stack[stack.length - 1]
      const lastKey = parent.__lastKey
      if (typeof lastKey === 'string') {
        if (!Array.isArray(parent[lastKey]))
          parent[lastKey] = [](/** @type {unknown[]} */ parent[lastKey]).push(
            item,
          )
      }
      continue
    }

    const m = line.match(/^(\s*)([\w.-]+):\s*(.*)$/)
    if (!m) continue
    const indent = m[1].length
    const key = m[2]
    const rest = m[3]

    while (
      indentStack.length > 1 &&
      indent <= indentStack[indentStack.length - 1]
    ) {
      stack.pop()
      indentStack.pop()
    }

    const parent = stack[stack.length - 1]
    const value = parseYamlValue(rest)

    if (value === null && rest.trim() === '') {
      /** @type {Record<string, unknown>} */
      const obj = {}
      parent[key] = obj
      stack.push(obj)
      indentStack.push(indent)
      obj.__lastKey = undefined
    } else {
      parent[key] = value
      parent.__lastKey = key
    }
  }

  function stripMeta(obj) {
    if (!obj || typeof obj !== 'object') return
    delete obj.__lastKey
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) stripMeta(v)
    }
  }
  stripMeta(root)
  return root
}

/**
 * @param {string} s
 */
function parseYamlValue(s) {
  const t = s.trim()
  if (t === '' || t === '|') return null
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^\d+$/.test(t)) return Number(t)
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  )
    return t.slice(1, -1)
  if (t.startsWith('[') && t.endsWith(']')) {
    return t
      .slice(1, -1)
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  return t
}

/**
 * @param {string} recipeId
 */
export function loadRecipe(recipeId) {
  const file = path.join(RECIPES_DIR, `${recipeId}.yaml`)
  if (!fs.existsSync(file)) throw new Error(`Recipe not found: ${recipeId}`)
  const text = fs.readFileSync(file, 'utf8')
  const recipe = parseSimpleYaml(text)
  recipe.id = recipeId
  return recipe
}

/**
 * @param {Record<string, unknown>} recipe
 * @param {string} url
 */
export function recipeMatchesUrl(recipe, url) {
  const pattern = recipe.match?.urlPattern || recipe.match?.url
  if (!pattern) return true
  try {
    return new RegExp(String(pattern), 'i').test(url)
  } catch {
    return url.includes(String(pattern))
  }
}

/**
 * @param {string} template
 * @param {Record<string, string | number>} vars
 */
export function interpolate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  )
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function asStringArray(value, fallback) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return [value]
  return fallback
}

/**
 * @param {Record<string, unknown>} deps
 * @param {string} recipeId
 * @param {Record<string, unknown>} [options]
 */
export async function runRecipe(deps, recipeId, options = {}) {
  const recipe = loadRecipe(recipeId)
  const vars = { ...(recipe.vars || {}), ...(options.vars || {}) }
  const mergeKeyRules = asStringArray(recipe.entities?.mergeKey, [
    'detailUrl:orderID=([^&]+)',
    'orderId',
  ])

  const captureCfg = resolveCaptureConfig(recipeId, recipe.capture || {})

  /** @type {Map<string, Record<string, unknown>>} */
  const merged = new Map()
  const steps = []
  let tabId = options.tabId ?? null

  async function capturePage(label) {
    const t0 = Date.now()
    await deps.runAction(
      captureCfg.action,
      {
        send: true,
        tabId: tabId ?? undefined,
        wait: captureCfg.wait,
        fast: captureCfg.fast,
      },
      captureCfg.captureTimeoutMs,
    )
    const snap = await deps.getLatestSnapshot()
    const entityBundle = extractEntities(snap, { mergeKeyRules })
    const adapterItems = snap?.adapter?.items || []
    const items =
      adapterItems.length > 0
        ? adapterItems
        : entityBundle.entities.find((e) => e.kind === 'list')?.items || []
    const m = mergeEntityItems(merged, items, mergeKeyRules)
    const waitMs = snap.captureMeta?.waitReady?.waitedMs
    steps.push({
      step: label,
      pageItems: items.length,
      waitedMs: waitMs,
      captureMs: Date.now() - t0,
      ...m,
    })
    return { snap, m, items }
  }

  async function boundAction(action, params = {}, timeoutMs = 120000) {
    return deps.runAction(
      action,
      { ...params, tabId: tabId ?? undefined },
      timeoutMs,
    )
  }

  if (options.resolveTab) {
    tabId = await options.resolveTab(recipe, vars)
  }

  const pagination = recipe.pagination
  if (pagination?.baseUrlTemplate) {
    const baseUrl = interpolate(String(pagination.baseUrlTemplate), vars)
    const step = Number(pagination.step) || 10
    const max = Number(pagination.max) || 220
    const target =
      Number(vars.targetCount) || Number(recipe.vars?.targetCount) || 9999
    const param = pagination.param || 'startIndex'

    for (let start = 0; start <= max && merged.size < target; start += step) {
      const url =
        start > 0
          ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${param}=${start}`
          : baseUrl
      if (start === 0 || merged.size > 0) {
        await boundAction('navigate', { url }, captureCfg.navigateTimeoutMs)
        let result = await capturePage(`startIndex=${start}`)
        if (result.items.length < captureCfg.minItemsPerPage) {
          await sleep(300)
          result = await capturePage(`startIndex=${start}-retry`)
        }
        const { m } = result
        if (start > 0 && m.added === 0) {
          steps.push({
            step: 'pagination-stop',
            reason: 'no new items',
            startIndex: start,
          })
          break
        }
      }
      if (merged.size >= target) break
    }
  } else {
    await capturePage('single')
  }

  // Optional: follow detail pages for missing total / lineItems
  const follow = recipe.follow
  if (follow?.enabled) {
    const PRICE_RE = /\$[\d,]+\.\d{2}/
    const detailUrlFor = (o) =>
      o.detailUrl ||
      (o.orderId
        ? `https://www.amazon.com/gp/your-account/order-details?orderID=${encodeURIComponent(o.orderId)}`
        : null)
    const needFollow = (o) => {
      if (!detailUrlFor(o)) return false
      if (follow.whenMissing?.length) {
        return follow.whenMissing.some((f) => {
          if (f === 'orderTotal')
            return !o.orderTotal || !PRICE_RE.test(String(o.orderTotal))
          if (f === 'lineItems')
            return !Array.isArray(o.lineItems) || o.lineItems.length === 0
          if (f === 'status') return !o.status
          return !o[f]
        })
      }
      return !o.orderTotal || !o.lineItems?.length
    }

    const maxFollow = Number(follow.max) || 9999
    let followed = 0

    for (const item of [...merged.values()]) {
      if (followed >= maxFollow) break
      if (!needFollow(item)) continue

      const t0 = Date.now()
      const detailUrl = detailUrlFor(item)
      await boundAction(
        'navigate',
        { url: detailUrl },
        captureCfg.navigateTimeoutMs,
      )
      await deps.runAction(
        captureCfg.action,
        {
          send: true,
          tabId: tabId ?? undefined,
          wait: follow.wait || {
            selectors: [
              'a[href*="/dp/"]',
              '.yohtmlc-item',
              '.item-view',
              '[data-component="itemRow"]',
            ],
            minCount: 1,
            stableMs: 200,
            timeoutMs: 8000,
          },
          fast: true,
        },
        captureCfg.captureTimeoutMs,
      )
      const snap = await deps.getLatestSnapshot()
      const detail = snap?.adapter?.items?.[0]
      if (detail) {
        const key = extractMergeKey(item, mergeKeyRules) || item.orderId
        const cleanStatus = (s) =>
          s &&
          s.length <= 80 &&
          !/[{;=]|uet\(|function|Continue shopping/i.test(String(s))
            ? s
            : undefined
        merged.set(key, {
          ...item,
          ...detail,
          orderId: item.orderId || detail.orderId,
          detailUrl: detailUrl || item.detailUrl,
          orderTotal: detail.orderTotal || item.orderTotal,
          orderDate: detail.orderDate || item.orderDate,
          status:
            cleanStatus(detail.status) ||
            cleanStatus(item.status) ||
            item.status,
          lineItems: detail.lineItems?.length
            ? detail.lineItems
            : item.lineItems,
        })
      }
      followed++
      steps.push({
        step: `follow:${item.orderId}`,
        captureMs: Date.now() - t0,
        enriched: !!detail,
      })
    }
  }

  const list = [...merged.values()].sort((a, b) => {
    const da = Date.parse(String(a.orderDate || '')) || 0
    const db = Date.parse(String(b.orderDate || '')) || 0
    return db - da
  })

  const exportItems = list.map((o) => redactForExport(o))
  const summary = {
    recipeId,
    harvestedAt: new Date().toISOString(),
    targetCount: Number(vars.targetCount) || null,
    harvestedCount: list.length,
    complete:
      vars.targetCount != null ? list.length >= Number(vars.targetCount) : true,
    steps,
  }

  let outPaths = {}
  if (recipe.export?.outDir && deps.writeExport) {
    outPaths = deps.writeExport(recipe, summary, list, exportItems)
  }

  return { summary, items: list, exportItems, outPaths, steps }
}

export { extractMergeKey, RECIPES_DIR }
