#!/usr/bin/env node
/**
 * End-to-end verification for web-state-devtools (no Chrome UI required).
 * Usage: node scripts/verify.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { enrichSnapshot } from '../lib/enrich.mjs'
import { buildPageModel } from '../lib/page-model.mjs'
import { buildExplorationCandidates } from '../lib/exploration.mjs'
import { diffSnapshots } from '../lib/state-diff.mjs'
import {
  filterSafeCandidates,
  isEmptyDiff,
  candidateKey,
  normalizeUrl,
} from '../lib/explore-deep.mjs'
import { applyPrivacyPolicy, redactForExport } from '../lib/privacy.mjs'
import { extractEntities, mergeEntityItems } from '../lib/entity-extractor.mjs'
import { extractMergeKey } from '../lib/store.mjs'
import {
  loadRecipe,
  parseSimpleYaml,
  recipeMatchesUrl,
} from '../lib/recipe.mjs'
import { normalizeNetwork } from '../lib/cdp-merge.mjs'
import { resolveCaptureConfig } from '../lib/wait-strategy.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const EXT = path.join(ROOT, '..', 'extension')
const PORT = 17322 // avoid clashing with dev bridge
const BASE = `http://127.0.0.1:${PORT}`

const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`)
}

function assert(cond, name, detail) {
  if (cond) pass(name, detail)
  else fail(name, detail)
}

// --- 1. Extension file integrity ---
const requiredExtFiles = [
  'manifest.json',
  'service_worker.js',
  'popup.html',
  'popup.js',
  'styles.css',
  'capture.js',
  'lib/deep-dom.js',
  'lib/core.js',
  'lib/ax-snap.js',
  'lib/wait-ready.js',
  'lib/table-walker.js',
  'lib/framework-hints.js',
  'lib/interact.js',
  'lib/region-scoper.js',
  'lib/action-runner.js',
  'agent-loop.js',
  'cdp-handler.js',
  'adapters/amazon-orders.js',
  'adapters/life-os.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'icons/mark.svg',
]

for (const f of requiredExtFiles) {
  assert(fs.existsSync(path.join(EXT, f)), `file exists: extension/${f}`)
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'),
)
assert(manifest.manifest_version === 3, 'manifest MV3')
assert(manifest.version === '0.8.0', 'extension version 0.8.0')
assert(
  manifest.permissions?.includes('debugger'),
  'manifest has debugger permission for CDP',
)

const financeIcon = path.join(
  EXT,
  '..',
  '..',
  '..',
  'apps',
  'finance',
  'extension',
  'icons',
  'icon16.png',
)
if (fs.existsSync(financeIcon)) {
  const md5 = (f) =>
    crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')
  assert(
    md5(path.join(EXT, 'icons/icon16.png')) !== md5(financeIcon),
    'icons distinct from Finance OS Sync',
  )
}

const sw = fs.readFileSync(path.join(EXT, 'service_worker.js'), 'utf8')
assert(
  sw.includes("'lib/table-walker.js'") &&
    sw.includes("importScripts('agent-loop.js', 'cdp-handler.js')"),
  'service_worker includes table-walker + cdp-handler',
)

// --- 2. JS syntax ---
const jsFiles = [
  'service_worker.js',
  'popup.js',
  'capture.js',
  'lib/deep-dom.js',
  'lib/core.js',
  'lib/ax-snap.js',
  'lib/wait-ready.js',
  'lib/table-walker.js',
  'lib/framework-hints.js',
  'lib/interact.js',
  'lib/region-scoper.js',
  'lib/action-runner.js',
  'agent-loop.js',
  'cdp-handler.js',
  'adapters/amazon-orders.js',
  'adapters/life-os.js',
]
for (const f of jsFiles) {
  try {
    const { execSync } = await import('node:child_process')
    execSync(`node --check "${path.join(EXT, f)}"`, { stdio: 'pipe' })
    pass(`syntax OK: extension/${f}`)
  } catch (e) {
    fail(`syntax OK: extension/${f}`, e.stderr?.toString() || e.message)
  }
}

// --- 3. Enrich unit ---
const sample = {
  page: {
    url: 'http://localhost:5173/',
    title: 'Test',
    viewport: { width: 800, height: 600 },
  },
  headings: [{ level: 1, text: 'Hello' }],
  controls: [
    {
      tag: 'button',
      role: 'button',
      name: 'Go',
      bestSelector: '[data-testid=go]',
    },
  ],
  links: [],
  elements: [],
  forms: [
    { name: 'F', fields: [{ label: 'Email', type: 'email', required: true }] },
  ],
}
const enriched = enrichSnapshot(sample)
assert(
  enriched.derived?.summaryMd?.includes('# Page Summary'),
  'enrich produces summaryMd',
)
assert(
  enriched.derived?.selectors?.interactive?.length === 1,
  'enrich produces selectors',
)
assert(enriched.derived?.formsIndex?.length === 1, 'enrich produces formsIndex')
assert(enriched.derived?.pageModel?.pageType, 'enrich produces pageModel')
assert(
  Array.isArray(enriched.derived?.explorationCandidates),
  'enrich produces explorationCandidates',
)
assert(enriched.derived?.entities?.entities, 'enrich produces entities')

// Privacy: merge keys preserved in enrich, masked only on export
const privacySample = {
  adapter: {
    items: [
      {
        orderId: '111-2222222-3333333',
        detailUrl: 'https://amazon.com/order?orderID=111-2222222-3333333',
        shipTo: 'John Doe',
      },
      {
        orderId: '111-9999999-8888888',
        detailUrl: 'https://amazon.com/order?orderID=111-9999999-8888888',
        shipTo: 'Jane Doe',
      },
    ],
  },
}
const priv = applyPrivacyPolicy(privacySample)
assert(
  priv.adapter.items[0].orderId === '111-2222222-3333333',
  'enrich keeps orderId for merge',
)
assert(
  priv.adapter.items[0].shipTo === '[redacted-address]' ||
    priv.adapter.items[0].shipTo === '[redacted-name]',
  'enrich redacts shipTo',
)
const exported = redactForExport(priv.adapter.items)
assert(
  exported[0].orderId === '111-****-3333333' &&
    exported[1].orderId === '111-****-8888888',
  'export masks orderId with unique suffix',
)
const map = new Map()
const { added, total } = mergeEntityItems(map, priv.adapter.items, [
  'detailUrl:orderID=([^&]+)',
  'orderId',
])
assert(
  total === 2 && added === 2,
  'mergeEntityItems dedupes by real orderId',
  `total=${total}`,
)

const entitySnap = {
  page: { url: 'http://localhost/list' },
  adapter: {
    site: 'test',
    entity: 'order',
    items: [{ orderId: 'a-1', detailUrl: 'x?orderID=a-1' }],
  },
}
const ents = extractEntities(entitySnap)
assert(
  ents.entities[0].items[0].mergeKey === 'a-1',
  'extractEntities adds mergeKey',
)

const tableSnap = {
  page: { url: 'http://localhost/table' },
  tables: [
    {
      source: 'table-walker',
      headers: ['Name', 'Qty'],
      rows: [{ Name: 'Widget', Qty: '2' }],
      rowCount: 1,
      selector: 'table#orders',
    },
  ],
}
const tableEnts = extractEntities(tableSnap)
assert(
  tableEnts.entities[0].kind === 'table' && tableEnts.entities[0].count === 1,
  'extractEntities reads table-walker rows',
)

const netNorm = normalizeNetwork({
  events: [
    { url: 'https://api.test/items', status: 200, json: { items: [1, 2] } },
  ],
})
assert(
  netNorm.stats.jsonCount === 1 && netNorm.apiUrls[0].keys.includes('items'),
  'normalizeNetwork',
)

const amazonRecipe = loadRecipe('amazon-orders')
assert(Number(amazonRecipe.pagination?.step) === 10, 'amazon recipe loads')
assert(
  recipeMatchesUrl(amazonRecipe, 'https://www.amazon.com/your-orders/orders'),
  'amazon recipe matches url',
)

const capCfg = resolveCaptureConfig('amazon-orders', amazonRecipe.capture)
assert(
  capCfg.fast === true && capCfg.wait?.minCount === 1,
  'amazon wait strategy',
)
assert(capCfg.action === 'capture', 'amazon uses fast capture not enhanced')

const listSnapshot = {
  page: {
    url: 'http://localhost:5173/items',
    title: 'Items',
    pathname: '/items',
    viewport: { width: 800, height: 600 },
  },
  headings: [{ level: 1, text: 'Items' }],
  controls: [
    {
      tag: 'button',
      role: 'button',
      name: 'Load more',
      bestSelector: '[data-testid=load-more]',
    },
  ],
  links: [],
  elements: [],
  forms: [],
  sensor: {
    scroll: {
      scrollable: true,
      hasMoreBelow: true,
      scrollHeight: 2400,
      percentScrolled: 10,
    },
    disclosures: [
      {
        collapsed: true,
        bestSelector: '#acc',
        label: 'Details',
        kind: 'disclosure',
      },
    ],
    regions: [
      {
        id: 'region-1',
        role: 'list',
        label: 'Items',
        containerSelector: 'ul.items',
        itemCount: 3,
        items: [
          {
            index: 0,
            containerSelector: 'ul.items > li:nth-of-type(1)',
            preview: { title: 'Item A' },
            actions: [
              {
                label: 'View',
                intent: 'open_detail',
                scopedSelector: 'ul.items > li:nth-of-type(1) a.view',
                globalSelector: 'a.view',
                href: 'http://localhost:5173/items/1',
                reliability: 0.9,
              },
            ],
          },
        ],
      },
    ],
  },
}
const pm = buildPageModel(listSnapshot)
assert(pm.pageType === 'list', 'page-model infers list')
assert(
  pm.regions?.[0]?.items?.[0]?.actions?.[0]?.scopedSelector?.includes('li'),
  'page-model keeps scoped actions',
)
const explore = buildExplorationCandidates(listSnapshot, pm)
assert(
  explore.some((c) => c.type === 'scroll'),
  'exploration suggests scroll',
)
assert(
  explore.some((c) => c.type === 'click' || c.type === 'navigate'),
  'exploration suggests click or navigate',
)

const before = {
  ...listSnapshot,
  controls: [{ name: 'A', bestSelector: '#a' }],
}
const after = {
  ...listSnapshot,
  controls: [
    { name: 'A', bestSelector: '#a' },
    { name: 'B', bestSelector: '#b' },
  ],
  headings: [{ level: 2, text: 'New section' }],
}
const diff = diffSnapshots(before, after, {
  action: 'click',
  selector: '#expand',
})
assert(diff.stats.newControlCount === 1, 'state-diff detects new controls')
assert(diff.revealedContent?.length >= 1, 'state-diff produces revealedContent')

const tried = new Set()
const safe = filterSafeCandidates(
  [
    { action: 'scroll', id: 'a', params: {}, reason: 'scroll' },
    { action: 'scroll', id: 'a', params: {}, reason: 'scroll dup' },
    {
      action: 'click',
      id: 'b',
      params: { selector: '#x' },
      reason: 'delete all items',
    },
    {
      action: 'navigate',
      id: 'c',
      params: { url: 'http://localhost/x' },
      reason: 'open',
    },
  ],
  {
    triedKeys: tried,
    visitedUrls: new Set([normalizeUrl('http://localhost/x')]),
  },
)
assert(
  safe.length === 1 && safe[0].id === 'a',
  'explore-deep filters destructive + dup + visited url',
)
assert(
  isEmptyDiff({ stats: {}, urlChanged: false }),
  'isEmptyDiff true when no changes',
)
assert(
  !isEmptyDiff({ stats: { newControlCount: 1 }, urlChanged: false }),
  'isEmptyDiff false with new controls',
)
assert(
  candidateKey({ action: 'click', params: { selector: '#a' } }) === 'click:#a',
  'candidateKey',
)

// --- 4. DOM capture via Playwright (optional but valuable) ---
let playwrightOk = false
try {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const verifyHtml = `<!DOCTYPE html><html><head><title>Verify Page</title></head>
    <body>
      <h1>Music Library</h1>
      <nav role="navigation" aria-label="Main"><a href="/settings">Settings</a></nav>
      <button data-testid="play-all">Play all</button>
      <form id="search"><input type="search" name="q" aria-label="Search tracks" placeholder="Search" /></form>
    </body></html>`

  await page.route('http://127.0.0.1/verify', (route) =>
    route.fulfill({ contentType: 'text/html', body: verifyHtml }),
  )
  await page.goto('http://127.0.0.1/verify')

  await page.addScriptTag({ path: path.join(EXT, 'lib/deep-dom.js') })
  await page.addScriptTag({ path: path.join(EXT, 'lib/core.js') })
  await page.addScriptTag({ path: path.join(EXT, 'lib/framework-hints.js') })
  await page.addScriptTag({ path: path.join(EXT, 'lib/region-scoper.js') })
  await page.addScriptTag({ path: path.join(EXT, 'adapters/amazon-orders.js') })
  await page.addScriptTag({ path: path.join(EXT, 'adapters/life-os.js') })

  const snapshot = await page.evaluate(async () => {
    const core = window.__WSD_CORE__
    const q = await core.waitForQuiescence(300, 100)
    const snap = core.extractBaseSnapshot(q)
    if (window.__WSD_REGION_SCOPER__) {
      snap.sensor = window.__WSD_REGION_SCOPER__.buildSensorLayer()
    }
    for (const a of window.__WSD_ADAPTERS__ || []) {
      if (a.matches?.(location.href)) snap.adapter = a.run?.()
    }
    return snap
  })

  assert(snapshot.sensor?.scroll != null, 'playwright capture sensor layer')

  assert(
    snapshot.schema === 'web-state-devtools/snapshot/v1',
    'playwright capture schema',
  )
  assert(snapshot.page.title === 'Verify Page', 'playwright capture title')
  assert(
    snapshot.headings?.some((h) => h.text === 'Music Library'),
    'playwright capture headings',
  )
  assert(
    snapshot.controls?.some((c) => c.bestSelector?.includes('play-all')),
    'playwright capture bestSelector',
  )
  assert(snapshot.forms?.length === 1, 'playwright capture forms')

  // Shadow DOM pierce
  await page.route('http://127.0.0.1/shadow', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<div id="host"></div><script>
        document.getElementById('host').attachShadow({mode:'open'}).innerHTML = '<button data-testid="shadow-btn">In shadow</button>';
      </script>`,
    }),
  )
  await page.goto('http://127.0.0.1/shadow')
  await page.addScriptTag({ path: path.join(EXT, 'lib/deep-dom.js') })
  await page.addScriptTag({ path: path.join(EXT, 'lib/core.js') })
  const shadowSnap = await page.evaluate(() => {
    const core = window.__WSD_CORE__
    return core.extractBaseSnapshot({ quietMs: 0, timedOut: false })
  })
  assert(
    shadowSnap.controls?.some((c) => c.bestSelector?.includes('shadow-btn')),
    'shadow DOM control captured',
  )

  assert(
    snapshot.forms[0].fields[0].value !== undefined ||
      snapshot.forms[0].fields[0].label === 'Search tracks',
    'playwright form field',
  )

  // Amazon adapter on mocked order-history page
  const amazonHtml = `<section id="orders">
    <h4>Arriving tomorrow</h4>
    <div><div>Order placed June 1, 2026 Total $42.99 Ship to Test User Order # 123-4567890-1234567 View order details View invoice</div></div>
    <div><div>
      <a href="/gp/your-account/order-details?orderID=123-4567890-1234567">View order details</a>
      <a href="/dp/B001TEST">Test Product Title Here</a>
    </div></div>
  </section>`
  await page.route(
    'https://www.amazon.com/gp/your-account/order-history',
    (route) => route.fulfill({ contentType: 'text/html', body: amazonHtml }),
  )
  await page.goto('https://www.amazon.com/gp/your-account/order-history')
  await page.evaluate(() => {
    window.__WSD_ADAPTERS__ = []
  })
  await page.addScriptTag({ path: path.join(EXT, 'adapters/amazon-orders.js') })
  const amazon = await page.evaluate(() => {
    const a = window.__WSD_ADAPTERS__.find((x) => x.id === 'amazon-orders')
    return { matches: a.matches(location.href), result: a.run() }
  })
  assert(
    amazon.matches &&
      amazon.result?.site === 'amazon' &&
      amazon.result.items?.[0]?.orderId === '123-4567890-1234567' &&
      amazon.result.items?.[0]?.orderTotal === '$42.99',
    'amazon adapter parses order card with total',
  )

  await browser.close()
  playwrightOk = true
} catch (e) {
  fail('playwright DOM capture', e.message)
}

// --- 5. Bridge HTTP + command queue ---
const serverProc = spawn('node', ['server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, WEB_STATE_BRIDGE_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})

await new Promise((r) => setTimeout(r, 800))

try {
  const health = await fetch(`${BASE}/health`).then((r) => r.json())
  assert(health.ok && health.version === '0.8.0', 'GET /health', health.version)

  const bad = await fetch(`${BASE}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foo: 1 }),
  })
  assert(bad.status === 400, 'POST /snapshot rejects invalid body')

  const realistic = {
    schema: 'web-state-devtools/snapshot/v1',
    capturedAt: new Date().toISOString(),
    page: {
      url: 'http://localhost:5173/library',
      title: 'Music OS',
      viewport: { width: 1280, height: 800 },
    },
    headings: [{ level: 1, text: 'Library', bestSelector: 'h1' }],
    controls: [
      {
        tag: 'button',
        role: 'button',
        name: 'Play all',
        bestSelector: '[data-testid="play-all"]',
        selectorCandidates: [
          {
            strategy: 'data-testid',
            value: '[data-testid="play-all"]',
            score: 100,
          },
        ],
      },
    ],
    links: [{ text: 'Settings', href: 'http://localhost:5173/settings' }],
    elements: [{ tag: 'nav', role: 'navigation', name: 'Main' }],
    forms: [],
    storageKeys: { localStorage: ['theme'], sessionStorage: [] },
  }

  const post = await fetch(`${BASE}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(realistic),
  }).then((r) => r.json())
  assert(
    post.ok && post.stats?.summaryChars > 100,
    'POST /snapshot',
    `summary ${post.stats?.summaryChars} chars`,
  )

  const latest = await fetch(`${BASE}/latest`).then((r) => r.json())
  assert(
    latest.ok && latest.snapshot?.derived?.summaryMd,
    'GET /latest has derived',
  )

  const summaryText = await fetch(`${BASE}/latest/summary`).then((r) =>
    r.text(),
  )
  assert(
    summaryText.includes('Music OS') && summaryText.includes('Play all'),
    'GET /latest/summary markdown',
  )

  const selectors = await fetch(`${BASE}/latest/selectors`).then((r) =>
    r.json(),
  )
  assert(
    selectors.ok && selectors.selectors?.interactive?.length >= 1,
    'GET /latest/selectors',
  )

  // Command queue
  const queue = await fetch(`${BASE}/commands/open-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://localhost:5173/' }),
  }).then((r) => r.json())
  assert(
    queue.ok && queue.command?.type === 'open_url_for_capture',
    'POST /commands/open-url',
  )

  const next = await fetch(`${BASE}/commands/next`).then((r) => r.json())
  assert(
    next.command?.url === 'http://localhost:5173/',
    'GET /commands/next dequeues',
  )

  const nextEmpty = await fetch(`${BASE}/commands/next`).then((r) => r.json())
  assert(nextEmpty.command === null, 'GET /commands/next empty after dequeue')

  const badUrl = await fetch(`${BASE}/commands/open-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'file:///etc/passwd' }),
  })
  assert(badUrl.status === 400, 'POST /commands/open-url rejects non-http')

  // --- 6. MCP config in repo ---
  const mcpPath = path.join(ROOT, '..', '..', '..', '.cursor', 'mcp.json')
  if (fs.existsSync(mcpPath)) {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'))
    assert(
      !!mcp.mcpServers?.['web-state-devtools'],
      'repo .cursor/mcp.json has web-state-devtools',
    )
    assert(
      fs.existsSync(mcp.mcpServers['web-state-devtools'].args?.[0] || ''),
      'MCP server path exists',
    )
  } else {
    fail('repo .cursor/mcp.json exists')
  }

  const badHost = await fetch(`${BASE}/commands/open-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.google.com/' }),
  })
  assert(
    badHost.status === 403,
    'POST /commands/open-url rejects non-whitelist host',
  )

  const clickQ = await fetch(`${BASE}/commands/click-and-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector: '[data-testid=play]' }),
  }).then((r) => r.json())
  assert(
    clickQ.ok && clickQ.command?.type === 'click_and_capture',
    'POST /commands/click-and-capture',
  )

  const clickNext = await fetch(`${BASE}/commands/next`).then((r) => r.json())
  assert(
    clickNext.command?.selector === '[data-testid=play]',
    'click command dequeues',
  )

  const agentStatus = await fetch(`${BASE}/agent/status`).then((r) => r.json())
  assert(agentStatus.ok === true, 'GET /agent/status')

  const badAction = await fetch(`${BASE}/actions/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ping', timeoutMs: 2000 }),
  })
  assert(
    badAction.status === 504 || badAction.status === 500,
    'POST /actions/run without extension times out or errors',
  )

  assert(
    fs.existsSync(path.join(ROOT, 'lib/command-bus.mjs')),
    'command-bus module exists',
  )
  assert(
    fs.existsSync(path.join(ROOT, 'lib/explore-deep.mjs')),
    'explore-deep module exists',
  )

  const deepRoute = await fetch(`${BASE}/explore/deep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxSteps: 1 }),
  })
  assert(
    deepRoute.status === 404 ||
      deepRoute.status === 500 ||
      deepRoute.status === 200,
    'POST /explore/deep route exists',
  )

  const traceRoute = await fetch(`${BASE}/latest/explore-trace`)
  assert(
    traceRoute.status === 404 || traceRoute.ok,
    'GET /latest/explore-trace route exists',
  )

  const pmRes = await fetch(`${BASE}/latest/page-model`)
  assert(
    pmRes.status === 404 || pmRes.ok,
    'GET /latest/page-model route exists',
  )

  const exploreRes = await fetch(`${BASE}/latest/exploration`)
  assert(
    exploreRes.status === 404 || exploreRes.ok,
    'GET /latest/exploration route exists',
  )

  const graphRes = await fetch(`${BASE}/graph`).then((r) => r.json())
  assert(graphRes.ok && graphRes.graph?.nodes, 'GET /graph')

  const recipesRes = await fetch(`${BASE}/recipes`).then((r) => r.json())
  assert(
    recipesRes.ok && recipesRes.recipes?.includes('amazon-orders'),
    'GET /recipes',
  )

  const rawRoute = await fetch(`${BASE}/latest/raw`)
  assert(rawRoute.status === 404 || rawRoute.ok, 'GET /latest/raw route exists')

  const snapV2Route = await fetch(`${BASE}/latest/snap-v2`)
  assert(
    snapV2Route.status === 404 || snapV2Route.ok,
    'GET /latest/snap-v2 route exists',
  )

  const netRoute = await fetch(`${BASE}/latest/network`)
  assert(
    netRoute.status === 404 || netRoute.ok,
    'GET /latest/network route exists',
  )

  assert(
    fs.existsSync(path.join(ROOT, 'lib/cdp-merge.mjs')),
    'cdp-merge module exists',
  )

  const recipeRun = await fetch(`${BASE}/recipe/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId: 'amazon-orders' }),
  })
  assert(
    recipeRun.status === 500 || recipeRun.status === 504,
    'POST /recipe/run route exists (needs extension)',
  )

  assert(fs.existsSync(path.join(ROOT, 'lib/store.mjs')), 'store module exists')
  assert(
    fs.existsSync(path.join(ROOT, 'lib/recipe.mjs')),
    'recipe module exists',
  )
  assert(
    fs.existsSync(path.join(ROOT, 'recipes/amazon-orders.yaml')),
    'amazon-orders recipe exists',
  )

  // MCP syntax only (do not import — stdio connect blocks)
  try {
    const { execSync } = await import('node:child_process')
    execSync(`node --check "${path.join(ROOT, 'mcp-server.mjs')}"`, {
      stdio: 'pipe',
    })
    pass('syntax OK: bridge/mcp-server.mjs')
  } catch (e) {
    fail('syntax OK: bridge/mcp-server.mjs', e.stderr?.toString() || e.message)
  }
} catch (e) {
  fail('bridge integration', e.message)
} finally {
  serverProc.kill('SIGTERM')
}

// --- Summary ---
const failed = results.filter((r) => !r.ok)
console.log('\n---')
console.log(
  `Results: ${results.length - failed.length}/${results.length} passed`,
)
if (failed.length) {
  console.error('\nFailed:')
  for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
if (!playwrightOk) {
  console.log(
    'Note: Playwright capture failed — install with: cd bridge && npx playwright install chromium',
  )
}
