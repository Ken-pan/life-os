#!/usr/bin/env node
/**
 * Local bridge: snapshots + WebSocket agent bus for synchronous browser control.
 */
import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { enrichSnapshot } from './lib/enrich.mjs'
import { createGraphStore } from './lib/interaction-graph.mjs'
import { runExploreStep, runExploreDeep } from './lib/explore-deep.mjs'
import { createDataStore } from './lib/store.mjs'
import { runRecipe, loadRecipe, RECIPES_DIR } from './lib/recipe.mjs'
import { normalizeNetwork } from './lib/cdp-merge.mjs'
import {
  setExtensionSocket,
  runAction,
  completeAction,
  pullPollCommand,
  enqueuePollCommand,
  getAgentStatus,
} from './lib/command-bus.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.WEB_STATE_BRIDGE_PORT || 17321)
const HOST = '127.0.0.1'
const DATA_DIR = path.join(__dirname, 'data')
const store = createDataStore(DATA_DIR)
const {
  paths: STORE_PATHS,
  writeRaw,
  readRaw,
  writeEnriched,
  stampedSnapshot,
} = store
const LATEST_PATH = STORE_PATHS.latestSnap
const SUMMARY_PATH = STORE_PATHS.latestSummary
const SELECTORS_PATH = STORE_PATHS.latestSelectors
const PAGE_MODEL_PATH = STORE_PATHS.latestPageModel
const EXPLORATION_PATH = STORE_PATHS.latestExploration
const EXPLORE_TRACE_PATH = STORE_PATHS.latestExploreTrace
const ALLOW_ANY = process.env.WEB_STATE_ALLOW_ANY === '1'
const ALLOW_AMAZON = process.env.WEB_STATE_ALLOW_AMAZON === '1' || ALLOW_ANY
const ALLOW_BESTBUY = process.env.WEB_STATE_ALLOW_BESTBUY === '1' || ALLOW_ANY
const ALLOW_TARGET = process.env.WEB_STATE_ALLOW_TARGET === '1' || ALLOW_ANY
const ALLOW_ROCKETMONEY =
  process.env.WEB_STATE_ALLOW_ROCKETMONEY === '1' || ALLOW_ANY
const ALLOW_ROBINHOOD =
  process.env.WEB_STATE_ALLOW_ROBINHOOD === '1' || ALLOW_ANY

fs.mkdirSync(DATA_DIR, { recursive: true })

const graphStore = createGraphStore(DATA_DIR)
/** @type {Record<string, unknown> | null} */
let previousSnapshot = null

const exploreDeps = () => ({
  latestPath: LATEST_PATH,
  runAction,
  graphStore,
  isUrlAllowed,
})

const app = express()
app.use(
  cors({
    origin: [`http://${HOST}:${PORT}`, 'chrome-extension://*'],
    credentials: false,
  }),
)
app.use(express.json({ limit: '12mb' }))

function isUrlAllowed(urlString) {
  if (ALLOW_ANY) return { ok: true }
  let u
  try {
    u = new URL(urlString)
  } catch {
    return { ok: false, error: 'Invalid URL' }
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    return { ok: false, error: 'Only http/https URLs allowed', status: 400 }
  }
  const host = u.hostname
  if (host === 'localhost' || host === '127.0.0.1') return { ok: true }
  if (host.endsWith('.netlify.app')) return { ok: true }
  if (ALLOW_AMAZON && (host === 'amazon.com' || host.endsWith('.amazon.com')))
    return { ok: true }
  if (
    ALLOW_BESTBUY &&
    (host === 'bestbuy.com' || host.endsWith('.bestbuy.com'))
  )
    return { ok: true }
  if (ALLOW_TARGET && (host === 'target.com' || host.endsWith('.target.com')))
    return { ok: true }
  if (
    ALLOW_ROCKETMONEY &&
    (host === 'rocketmoney.com' || host.endsWith('.rocketmoney.com'))
  )
    return { ok: true }
  if (
    ALLOW_ROBINHOOD &&
    (host === 'robinhood.com' || host.endsWith('.robinhood.com'))
  )
    return { ok: true }
  return {
    ok: false,
    error: `Host not in dev whitelist: ${host}. Set WEB_STATE_ALLOW_ANY=1 to override.`,
    status: 403,
  }
}

function saveSnapshot(raw) {
  writeRaw(raw)
  const enriched = enrichSnapshot(raw)
  writeEnriched(enriched)
  const stamped = stampedSnapshot(enriched)

  const node = graphStore.ensureNode(enriched, {
    pageType: enriched.derived.pageModel?.pageType,
    label: 'captured',
  })
  if (previousSnapshot?.page?.url) {
    const prevNode = graphStore
      .loadGraph()
      .nodes.find((n) => n.url === previousSnapshot.page.url)
    if (
      prevNode &&
      prevNode.id !== node.id &&
      previousSnapshot.page.url !== enriched.page?.url
    ) {
      graphStore.addEdge(prevNode.id, node.id, {
        action: 'navigate',
        url: enriched.page?.url,
      })
    }
  }
  previousSnapshot = enriched

  return { enriched, stamped, nodeId: node.id }
}

function getLatestSnapshot() {
  if (!fs.existsSync(LATEST_PATH)) return null
  return JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'))
}

function resolveRef(ref) {
  const snap = getLatestSnapshot()
  const entry = snap?.snapV2?.refs?.[ref] || snap?.derived?.snapV2?.refs?.[ref]
  if (!entry?.scopedSelector) {
    throw new Error(
      `Unknown or stale ref: ${ref}. Run browser_snap / capture first.`,
    )
  }
  return entry
}

function writeRecipeExport(recipe, summary, rawItems, exportItems) {
  const year = recipe.vars?.year || 'data'
  const outDir = path.join(DATA_DIR, recipe.export?.outDir || 'export')
  fs.mkdirSync(outDir, { recursive: true })
  const base = (recipe.export?.basename || recipe.id || 'export').replace(
    '{year}',
    String(year),
  )
  const paths = {}
  const formats = recipe.export?.formats || ['json']

  if (formats.includes('json')) {
    const jsonPath = path.join(outDir, `${base}.json`)
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ summary, orders: exportItems }, null, 2),
    )
    fs.writeFileSync(
      path.join(outDir, `${base}-raw.json`),
      JSON.stringify({ summary, orders: rawItems }, null, 2),
    )
    paths.json = jsonPath
    paths.jsonRaw = path.join(outDir, `${base}-raw.json`)
  }
  if (formats.includes('csv')) {
    const csvPath = path.join(outDir, `${base}.csv`)
    fs.writeFileSync(csvPath, entitiesToCsv(exportItems))
    paths.csv = csvPath
  }
  return paths
}

function entitiesToCsv(rows) {
  const headers = [
    'orderId',
    'orderDate',
    'orderTotal',
    'status',
    'lineItemCount',
    'lineItemTitles',
    'detailUrl',
  ]
  const lines = [headers.join(',')]
  for (const o of rows) {
    const titles = (o.lineItems || []).map((li) => li.title).join(' | ')
    lines.push(
      [
        csvCell(o.orderId),
        csvCell(o.orderDate),
        csvCell(o.orderTotal),
        csvCell(o.status),
        Array.isArray(o.lineItems) ? o.lineItems.length : 0,
        csvCell(titles),
        csvCell(o.detailUrl),
      ].join(','),
    )
  }
  return lines.join('\n')
}

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const recipeDeps = () => ({
  runAction,
  getLatestSnapshot,
  isUrlAllowed,
  writeExport: writeRecipeExport,
})

function queueLegacyCommand(command) {
  const cmd = enqueuePollCommand(command)
  console.log(
    `[bridge] queued: ${command.type}`,
    command.url || command.selector || '',
  )
  return cmd
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'web-state-bridge',
    version: '0.8.0',
    port: PORT,
    allowAny: ALLOW_ANY,
    agent: getAgentStatus(),
  })
})

app.get('/agent/status', (_req, res) => {
  res.json({ ok: true, ...getAgentStatus() })
})

app.get('/latest/raw', (_req, res) => {
  const raw = readRaw()
  if (!raw)
    return res.status(404).json({ ok: false, error: 'No raw snapshot yet' })
  res.json({ ok: true, snapshot: raw })
})

app.get('/latest/snap-v2', (_req, res) => {
  if (!fs.existsSync(STORE_PATHS.latestSnapV2)) {
    return res.status(404).json({ ok: false, error: 'No snap v2 yet' })
  }
  res.json({
    ok: true,
    snapV2: JSON.parse(fs.readFileSync(STORE_PATHS.latestSnapV2, 'utf8')),
  })
})

app.get('/latest/entities', (_req, res) => {
  if (!fs.existsSync(STORE_PATHS.rawEntities)) {
    return res.status(404).json({ ok: false, error: 'No entities yet' })
  }
  res.json({
    ok: true,
    entities: JSON.parse(fs.readFileSync(STORE_PATHS.rawEntities, 'utf8')),
  })
})

app.get('/latest/export', (_req, res) => {
  if (!fs.existsSync(STORE_PATHS.exportSnap)) {
    return res.status(404).json({ ok: false, error: 'No export snapshot yet' })
  }
  res.json({
    ok: true,
    snapshot: JSON.parse(fs.readFileSync(STORE_PATHS.exportSnap, 'utf8')),
  })
})

app.get('/recipes', (_req, res) => {
  const files = fs.existsSync(RECIPES_DIR)
    ? fs.readdirSync(RECIPES_DIR).filter((f) => f.endsWith('.yaml'))
    : []
  res.json({ ok: true, recipes: files.map((f) => f.replace(/\.yaml$/, '')) })
})

app.get('/recipes/:id', (req, res) => {
  try {
    res.json({ ok: true, recipe: loadRecipe(req.params.id) })
  } catch (err) {
    res.status(404).json({ ok: false, error: String(err.message) })
  }
})

app.post('/recipe/run', async (req, res) => {
  const { recipeId, tabId, vars = {} } = req.body || {}
  if (!recipeId) {
    return res.status(400).json({ ok: false, error: 'recipeId required' })
  }
  try {
    const result = await runRecipe(recipeDeps(), recipeId, {
      tabId,
      vars,
      resolveTab: async () => {
        if (tabId) return tabId
        const tabs = await runAction('list_tabs', {}, 30000)
        const recipe = loadRecipe(recipeId)
        const tab = tabs.find(
          (t) =>
            t.url &&
            (recipe.match?.urlPattern
              ? new RegExp(String(recipe.match.urlPattern), 'i').test(t.url)
              : /amazon/.test(t.url)),
        )
        if (!tab?.id)
          throw new Error('No matching tab — open target page in Chrome first')
        return tab.id
      },
    })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) })
  }
})

app.post('/act/ref', async (req, res) => {
  const { ref, action = 'click', tabId, text } = req.body || {}
  if (!ref) return res.status(400).json({ ok: false, error: 'ref required' })
  try {
    const entry = resolveRef(ref)
    const selector = entry.scopedSelector
    let result
    if (action === 'click') {
      result = await runAction('click', { selector, tabId }, 60000)
    } else if (action === 'fill') {
      result = await runAction(
        'fill',
        { selector, tabId, text: text ?? '' },
        30000,
      )
    } else {
      return res
        .status(400)
        .json({ ok: false, error: `Unsupported action: ${action}` })
    }
    res.json({ ok: true, ref, entry, result })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) })
  }
})

app.get('/latest/network', (_req, res) => {
  if (!fs.existsSync(STORE_PATHS.latestNetwork)) {
    return res.status(404).json({ ok: false, error: 'No network capture yet' })
  }
  res.json({
    ok: true,
    network: JSON.parse(fs.readFileSync(STORE_PATHS.latestNetwork, 'utf8')),
  })
})

app.get('/latest', (_req, res) => {
  if (!fs.existsSync(LATEST_PATH)) {
    return res.status(404).json({ ok: false, error: 'No snapshot yet' })
  }
  const snapshot = JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'))
  res.json({ ok: true, snapshot })
})

app.get('/latest/summary', (_req, res) => {
  if (!fs.existsSync(SUMMARY_PATH)) {
    return res.status(404).json({ ok: false, error: 'No summary yet' })
  }
  res.type('text/markdown').send(fs.readFileSync(SUMMARY_PATH, 'utf8'))
})

app.get('/latest/selectors', (_req, res) => {
  if (!fs.existsSync(SELECTORS_PATH)) {
    return res.status(404).json({ ok: false, error: 'No selectors yet' })
  }
  res.json({
    ok: true,
    selectors: JSON.parse(fs.readFileSync(SELECTORS_PATH, 'utf8')),
  })
})

app.get('/latest/page-model', (_req, res) => {
  if (!fs.existsSync(PAGE_MODEL_PATH)) {
    return res.status(404).json({ ok: false, error: 'No page model yet' })
  }
  res.json({
    ok: true,
    pageModel: JSON.parse(fs.readFileSync(PAGE_MODEL_PATH, 'utf8')),
  })
})

app.get('/latest/exploration', (_req, res) => {
  if (!fs.existsSync(EXPLORATION_PATH)) {
    return res
      .status(404)
      .json({ ok: false, error: 'No exploration candidates yet' })
  }
  res.json({
    ok: true,
    candidates: JSON.parse(fs.readFileSync(EXPLORATION_PATH, 'utf8')),
  })
})

app.get('/latest/explore-trace', (_req, res) => {
  if (!fs.existsSync(EXPLORE_TRACE_PATH)) {
    return res.status(404).json({ ok: false, error: 'No explore trace yet' })
  }
  res.json({
    ok: true,
    trace: JSON.parse(fs.readFileSync(EXPLORE_TRACE_PATH, 'utf8')),
  })
})

app.get('/graph', (_req, res) => {
  res.json({ ok: true, graph: graphStore.loadGraph() })
})

app.get('/action-log', (_req, res) => {
  res.json({ ok: true, log: graphStore.loadLog() })
})

app.post('/snapshot', (req, res) => {
  const snapshot = req.body
  if (!snapshot?.page?.url) {
    return res
      .status(400)
      .json({ ok: false, error: 'Invalid snapshot: missing page.url' })
  }
  const { enriched, stamped } = saveSnapshot(snapshot)
  console.log(
    `[bridge] saved ${snapshot.page.url} | summary ${enriched.derived.stats.summaryChars} chars`,
  )
  res.json({
    ok: true,
    path: LATEST_PATH,
    summaryPath: SUMMARY_PATH,
    stamped,
    stats: enriched.derived.stats,
  })
})

/** Synchronous action — MCP waits for extension result */
app.post('/actions/run', async (req, res) => {
  const { action, params = {}, timeoutMs } = req.body || {}
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ ok: false, error: 'action required' })
  }
  if (params.url) {
    const allowed = isUrlAllowed(params.url)
    if (!allowed.ok) {
      return res
        .status(allowed.status || 403)
        .json({ ok: false, error: allowed.error })
    }
  }
  try {
    const result = await runAction(action, params, timeoutMs || 90000)
    graphStore.logAction({ action, params, result, ok: true })
    res.json({ ok: true, result })
  } catch (err) {
    graphStore.logAction({
      action,
      params,
      error: String(err.message),
      ok: false,
    })
    const status = /timeout/i.test(String(err.message)) ? 504 : 500
    res.status(status).json({ ok: false, error: String(err.message) })
  }
})

/** Run top exploration candidate (or by index), capture before/after, return diff */
app.post('/explore/next', async (req, res) => {
  const { index = 0, waitMs = 800 } = req.body || {}
  if (!fs.existsSync(LATEST_PATH)) {
    return res
      .status(404)
      .json({ ok: false, error: 'No snapshot — capture a page first' })
  }
  const before = JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'))
  const candidates = before.derived?.explorationCandidates || []
  if (!candidates.length) {
    return res
      .status(400)
      .json({ ok: false, error: 'No exploration candidates for this page' })
  }
  const candidate = candidates[index]
  if (!candidate) {
    return res.status(400).json({
      ok: false,
      error: `Candidate index ${index} out of range (${candidates.length})`,
    })
  }

  try {
    const result = await runExploreStep(exploreDeps(), candidate, waitMs)
    const after = JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'))
    graphStore.logAction({
      explore: candidate.id,
      diff: result.diff.stats,
      ok: true,
    })
    res.json({
      ok: true,
      candidate,
      actionResult: result.actionResult,
      diff: result.diff,
      explorationCandidates: after.derived?.explorationCandidates?.slice(0, 8),
    })
  } catch (err) {
    graphStore.logAction({
      explore: candidate.id,
      error: String(err.message),
      ok: false,
    })
    res.status(500).json({ ok: false, error: String(err.message), candidate })
  }
})

/** Multi-round explore until empty diff, no candidates, max depth/steps, or error */
app.post('/explore/deep', async (req, res) => {
  const {
    maxSteps = 10,
    maxDepth = 5,
    stopOnEmptyDiff = true,
    waitMs = 800,
    skipNavigate = false,
  } = req.body || {}

  try {
    console.log(
      `[bridge] explore/deep maxSteps=${maxSteps} maxDepth=${maxDepth}`,
    )
    const trace = await runExploreDeep(exploreDeps(), {
      maxSteps: Math.min(Number(maxSteps) || 10, 25),
      maxDepth: Math.min(Number(maxDepth) || 5, 10),
      stopOnEmptyDiff: stopOnEmptyDiff !== false,
      waitMs: Number(waitMs) || 800,
      skipNavigate: !!skipNavigate,
    })
    fs.writeFileSync(EXPLORE_TRACE_PATH, JSON.stringify(trace, null, 2))
    console.log(
      `[bridge] explore/deep done: ${trace.stepsCompleted} steps, stop=${trace.stopReason}`,
    )
    res.json({ ok: true, trace })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) })
  }
})

app.post('/actions/complete', (req, res) => {
  const { id, ok, result, error } = req.body || {}
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })
  const done = completeAction(
    id,
    result,
    ok === false ? error || 'action failed' : undefined,
  )
  res.json({ ok: done })
})

app.post('/commands/open-url', (req, res) => {
  const { url } = req.body || {}
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, error: 'url required' })
  }
  const allowed = isUrlAllowed(url)
  if (!allowed.ok) {
    return res
      .status(allowed.status || 403)
      .json({ ok: false, error: allowed.error })
  }
  const command = queueLegacyCommand({ type: 'open_url_for_capture', url })
  res.json({ ok: true, command })
})

app.post('/commands/click-and-capture', (req, res) => {
  const { selector, url } = req.body || {}
  if (!selector || typeof selector !== 'string') {
    return res.status(400).json({ ok: false, error: 'selector required' })
  }
  if (url) {
    const allowed = isUrlAllowed(url)
    if (!allowed.ok) {
      return res
        .status(allowed.status || 403)
        .json({ ok: false, error: allowed.error })
    }
  }
  const command = queueLegacyCommand({
    type: 'click_and_capture',
    selector,
    url: url || null,
  })
  res.json({ ok: true, command })
})

app.get('/commands/next', (_req, res) => {
  const cmd = pullPollCommand()
  res.json({ ok: true, command: cmd })
})

app.post('/commands/ack', (req, res) => {
  console.log('[bridge] command ack:', req.body)
  res.json({ ok: true })
})

const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer, path: '/agent' })

wss.on('connection', (ws) => {
  console.log('[bridge] extension agent connected (WebSocket)')
  setExtensionSocket(ws)

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(String(data))
    } catch {
      return
    }
    if (msg.type === 'hello') {
      ws.send(JSON.stringify({ type: 'welcome', version: '0.8.0' }))
      return
    }
    if (msg.type === 'complete' && msg.id) {
      completeAction(
        msg.id,
        msg.result,
        msg.ok === false ? msg.error : undefined,
      )
    }
  })

  ws.on('close', () => {
    console.log('[bridge] extension agent disconnected')
    setExtensionSocket(null)
  })
})

httpServer.listen(PORT, HOST, () => {
  console.log(`Web State Bridge v0.8 listening on http://${HOST}:${PORT}`)
  console.log(`WebSocket agent: ws://${HOST}:${PORT}/agent`)
  console.log(
    `Dev whitelist: localhost, 127.0.0.1, *.netlify.app (ALLOW_ANY=${ALLOW_ANY}, ALLOW_AMAZON=${ALLOW_AMAZON}, ALLOW_BESTBUY=${ALLOW_BESTBUY}, ALLOW_TARGET=${ALLOW_TARGET}, ALLOW_ROCKETMONEY=${ALLOW_ROCKETMONEY}, ALLOW_ROBINHOOD=${ALLOW_ROBINHOOD})`,
  )
})
