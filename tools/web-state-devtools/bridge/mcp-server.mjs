#!/usr/bin/env node
/**
 * Cursor MCP server — snapshot read + synchronous browser control via bridge.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BRIDGE_URL = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'

const server = new McpServer({
  name: 'web-state-devtools',
  version: '0.8.0',
})

async function runAction(action, params = {}, timeoutMs = 90000) {
  const res = await fetch(`${BRIDGE_URL}/actions/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params, timeoutMs }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data.result
}

async function fetchLatest() {
  const res = await fetch(`${BRIDGE_URL}/latest`)
  if (!res.ok)
    throw new Error(
      `No snapshot (${res.status}). Capture a page first, then Send to localhost.`,
    )
  const data = await res.json()
  return data.snapshot
}

async function fetchSummaryText() {
  const res = await fetch(`${BRIDGE_URL}/latest/summary`)
  if (!res.ok)
    throw new Error(
      `No summary (${res.status}). Send a capture to bridge first.`,
    )
  return res.text()
}

function jsonResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] }
}

function errResult(err) {
  return {
    content: [{ type: 'text', text: String(err.message || err) }],
    isError: true,
  }
}

// --- Snapshot tools ---

server.tool(
  'get_web_snapshot_summary',
  'Read the AI-optimized markdown summary of the latest captured page (preferred — much smaller than full JSON).',
  {},
  async () => {
    try {
      const md = await fetchSummaryText()
      return { content: [{ type: 'text', text: md }] }
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'get_latest_web_snapshot',
  'Read the latest page snapshot. Default format=summary returns markdown; use json for full structure; compact returns stats + adapter only.',
  {
    format: z
      .enum(['summary', 'json', 'compact'])
      .optional()
      .describe('summary (default) | json | compact'),
  },
  async ({ format = 'summary' }) => {
    try {
      if (format === 'summary') {
        const md = await fetchSummaryText()
        return { content: [{ type: 'text', text: md }] }
      }
      const snapshot = await fetchLatest()
      if (format === 'compact') {
        const compact = {
          schema: snapshot.schema,
          capturedAt: snapshot.capturedAt,
          page: snapshot.page,
          stats: snapshot.derived?.stats,
          headings: snapshot.headings?.slice(0, 15),
          controls: snapshot.controls?.slice(0, 25).map((c) => ({
            role: c.role,
            name: c.name,
            bestSelector: c.bestSelector,
          })),
          adapter: snapshot.adapter,
          summaryMd: snapshot.derived?.summaryMd,
        }
        return jsonResult(compact)
      }
      return jsonResult(snapshot)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'get_web_selectors',
  'Read ranked stable selector candidates (scoped per region item + global).',
  {},
  async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/latest/selectors`)
      if (!res.ok) throw new Error(`No selectors (${res.status})`)
      const data = await res.json()
      const lines = [
        '# Selectors',
        '',
        `Priority: ${data.selectors.priority.join(' > ')}`,
        '',
        '## Interactive',
        ...data.selectors.interactive
          .slice(0, 40)
          .map(
            (s) =>
              `- **${s.label}**${s.scope ? ` (${s.scope})` : ''} → \`${s.best}\``,
          ),
      ]
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'get_web_page_model',
  'Read the universal page model: pageType, regions, scoped item actions, scroll/disclosure hints.',
  {},
  async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/latest/page-model`)
      if (!res.ok)
        throw new Error(`No page model (${res.status}). Capture a page first.`)
      const data = await res.json()
      return jsonResult(data.pageModel)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'get_exploration_candidates',
  'Suggested next exploration steps (scroll, expand collapsed, open detail links) — site-agnostic.',
  {},
  async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/latest/exploration`)
      if (!res.ok) throw new Error(`No exploration data (${res.status})`)
      const data = await res.json()
      const lines = [
        '# Exploration Candidates',
        '',
        ...data.candidates.map(
          (c, i) =>
            `${i}. **[${c.priority}]** ${c.type} \`${c.action}\` — ${c.reason}`,
        ),
      ]
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'get_interaction_graph',
  'Read interaction graph (visited page states + actions taken) and recent action log.',
  {},
  async () => {
    try {
      const [graph, logRes] = await Promise.all([
        fetch(`${BRIDGE_URL}/graph`).then((r) => r.json()),
        fetch(`${BRIDGE_URL}/action-log`).then((r) => r.json()),
      ])
      return jsonResult({
        graph: graph.graph,
        recentActions: (logRes.log || []).slice(-15),
      })
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_explore',
  'Execute one exploration candidate (default: highest priority), capture after, return state diff.',
  {
    index: z.number().optional().describe('Candidate index (default 0)'),
    waitMs: z
      .number()
      .optional()
      .describe('Wait after action before capture (default 800)'),
  },
  async ({ index = 0, waitMs = 800 }) => {
    try {
      const res = await fetch(`${BRIDGE_URL}/explore/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, waitMs }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      return jsonResult(data)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_explore_deep',
  'Multi-round auto explore: scroll, expand, navigate — until empty diff, no candidates, or limits. Requires Dev Agent Mode + initial capture.',
  {
    maxSteps: z
      .number()
      .optional()
      .describe('Max explore steps (default 10, max 25)'),
    maxDepth: z
      .number()
      .optional()
      .describe('Max navigation depth (default 5)'),
    stopOnEmptyDiff: z
      .boolean()
      .optional()
      .describe('Stop when a step reveals nothing (default true)'),
    waitMs: z
      .number()
      .optional()
      .describe('Wait after each action (default 800ms)'),
    skipNavigate: z
      .boolean()
      .optional()
      .describe('Only scroll/expand on same page, no detail navigation'),
  },
  async ({ maxSteps, maxDepth, stopOnEmptyDiff, waitMs, skipNavigate }) => {
    try {
      const res = await fetch(`${BRIDGE_URL}/explore/deep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxSteps,
          maxDepth,
          stopOnEmptyDiff,
          waitMs,
          skipNavigate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)

      const t = data.trace
      const summary = [
        `# Explore Deep Complete`,
        '',
        `- **Stop reason:** ${t.stopReason}`,
        `- **Steps:** ${t.stepsCompleted}`,
        `- **Revealed:** ${t.totalRevealed.newControlCount} controls, ${t.totalRevealed.newLinkCount} links, ${t.totalRevealed.newHeadingCount} headings`,
        `- **Final page:** ${t.finalPage?.title || t.finalPage?.url}`,
        '',
        '## Steps',
        ...t.steps.map(
          (s) =>
            `${s.step}. ${s.ok ? '✓' : '✗'} ${s.candidate?.reason || s.candidate?.id || '?'} → +${s.diff?.stats?.newControlCount ?? 0} controls`,
        ),
      ].join('\n')

      return {
        content: [
          { type: 'text', text: summary },
          { type: 'text', text: JSON.stringify(t, null, 2) },
        ],
      }
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'get_explore_trace',
  'Read the latest multi-round explore trace (from browser_explore_deep).',
  {},
  async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/latest/explore-trace`)
      if (!res.ok) throw new Error(`No explore trace (${res.status})`)
      const data = await res.json()
      return jsonResult(data.trace)
    } catch (err) {
      return errResult(err)
    }
  },
)

// --- Snap v2 + Recipe (v0.7) ---

server.tool(
  'browser_snap',
  'Accessibility snap v2 (CDP AX tree + refs). Use capture=true for fresh enhanced capture.',
  {
    tabId: z.number().optional(),
    capture: z
      .boolean()
      .optional()
      .describe('Run capture_enhanced before snap (default true)'),
    format: z.enum(['tree', 'json', 'compact']).optional(),
    network: z.boolean().optional().describe('Include network when capturing'),
  },
  async ({ tabId, capture = true, format = 'tree', network = true }) => {
    try {
      if (capture) {
        await runAction(
          'capture_enhanced',
          { tabId, send: true, cdp: true, network, waitNetworkIdle: true },
          120000,
        )
      }
      const res = await fetch(`${BRIDGE_URL}/latest/snap-v2`)
      if (!res.ok)
        throw new Error('No snap v2 — reload extension v0.8+ and capture again')
      const data = await res.json()
      const out = formatSnapV2(data.snapV2, format)
      if (format === 'tree' && network) {
        const net = await fetch(`${BRIDGE_URL}/latest/network`).then((r) =>
          r.ok ? r.json() : null,
        )
        if (net?.network?.stats) {
          out.content[0].text += `\n\n## Network\n- ${net.network.stats.total} responses (${net.network.stats.jsonCount} JSON)`
        }
      }
      return out
    } catch (err) {
      return errResult(err)
    }
  },
)

function formatSnapV2(snapV2, format) {
  if (format === 'json') return jsonResult(snapV2)
  if (format === 'compact') {
    return jsonResult({
      schema: snapV2.schema,
      stats: snapV2.stats,
      refCount: Object.keys(snapV2.refs || {}).length,
      axTreePreview: String(snapV2.axTree).split('\n').slice(0, 40).join('\n'),
    })
  }
  return {
    content: [
      {
        type: 'text',
        text: `# Snap v2\n\nRefs: ${snapV2.stats?.refCount ?? '?'}\n\n\`\`\`\n${snapV2.axTree}\n\`\`\``,
      },
    ],
  }
}

server.tool(
  'browser_capture_enhanced',
  'CDP-enhanced capture: DOM + table walker + AX tree + network JSON. Shows debugger bar while attached.',
  {
    tabId: z.number().optional(),
    cdp: z.boolean().optional(),
    network: z.boolean().optional(),
    waitNetworkIdle: z.boolean().optional(),
    detachCdp: z.boolean().optional(),
  },
  async ({ tabId, cdp, network, waitNetworkIdle, detachCdp }) => {
    try {
      return jsonResult(
        await runAction(
          'capture_enhanced',
          {
            tabId,
            send: true,
            cdp: cdp !== false,
            network: network !== false,
            waitNetworkIdle: waitNetworkIdle !== false,
            detachCdp: !!detachCdp,
          },
          120000,
        ),
      )
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_network',
  'Control CDP network capture on attached tab.',
  {
    action: z.enum(['start', 'stop', 'get', 'wait_idle']),
    tabId: z.number().optional(),
    quietMs: z.number().optional(),
    timeoutMs: z.number().optional(),
  },
  async ({ action, tabId, quietMs, timeoutMs }) => {
    try {
      const map = {
        start: 'network_start',
        stop: 'network_stop',
        get: 'network_get',
        wait_idle: 'network_wait_idle',
      }
      return jsonResult(
        await runAction(
          map[action],
          { tabId, quietMs, timeoutMs, startCapture: true },
          60000,
        ),
      )
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_act',
  'Act on element by snap v2 ref (click or fill). Refs valid only for latest snap.',
  {
    ref: z.string().min(1).describe('Ref from browser_snap, e.g. e12'),
    action: z.enum(['click', 'fill']).optional(),
    text: z.string().optional(),
    tabId: z.number().optional(),
    capture: z.boolean().optional(),
  },
  async ({ ref, action = 'click', text, tabId, capture }) => {
    try {
      const res = await fetch(`${BRIDGE_URL}/act/ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, action, text, tabId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      if (capture) {
        await runAction('capture', { tabId, send: true }, 60000)
      }
      return jsonResult(data)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_run_recipe',
  'Run a YAML recipe (pagination + capture + merge + export). E.g. recipeId=amazon-orders.',
  {
    recipeId: z.string().min(1),
    tabId: z.number().optional(),
    vars: z.record(z.union([z.string(), z.number()])).optional(),
  },
  async ({ recipeId, tabId, vars }) => {
    try {
      const res = await fetch(`${BRIDGE_URL}/recipe/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, tabId, vars }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      const s = data.summary
      const summary = [
        `# Recipe: ${recipeId}`,
        '',
        `- Harvested: **${s.harvestedCount}**${s.targetCount ? ` / ${s.targetCount}` : ''}`,
        `- Complete: ${s.complete ? 'yes' : 'no'}`,
        `- Output: ${JSON.stringify(data.outPaths || {})}`,
      ].join('\n')
      return {
        content: [
          { type: 'text', text: summary },
          { type: 'text', text: JSON.stringify(data, null, 2) },
        ],
      }
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_export',
  'Export latest entities or recipe output. format=summary|entities|redacted',
  {
    format: z.enum(['summary', 'entities', 'redacted']).optional(),
  },
  async ({ format = 'entities' }) => {
    try {
      if (format === 'summary') {
        const md = await fetchSummaryText()
        return { content: [{ type: 'text', text: md }] }
      }
      const path = format === 'redacted' ? '/latest/export' : '/latest/entities'
      const res = await fetch(`${BRIDGE_URL}${path}`)
      if (!res.ok) throw new Error(`No export data (${res.status})`)
      const data = await res.json()
      return jsonResult(format === 'redacted' ? data.snapshot : data.entities)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'list_recipes',
  'List available YAML harvest recipes.',
  {},
  async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/recipes`)
      const data = await res.json()
      return jsonResult(data)
    } catch (err) {
      return errResult(err)
    }
  },
)

// --- Browser control (v0.4+) ---

server.tool(
  'browser_status',
  'Check if Chrome extension agent is connected and Dev Agent Mode is ready.',
  {},
  async () => {
    try {
      const health = await fetch(`${BRIDGE_URL}/health`).then((r) => r.json())
      const ping = await runAction('ping', {}, 15000).catch((e) => ({
        error: e.message,
      }))
      return jsonResult({ bridge: health, agent: ping })
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_list_tabs',
  'List open Chrome tabs (id, url, title, active). Requires Dev Agent Mode ON in extension.',
  {},
  async () => {
    try {
      return jsonResult(await runAction('list_tabs', {}, 30000))
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_navigate',
  'Navigate Chrome to a URL. Optionally capture page after load.',
  {
    url: z.string().url(),
    capture: z
      .boolean()
      .optional()
      .describe('If true, capture & send snapshot after navigation'),
    tabId: z.number().optional(),
    waitMs: z
      .number()
      .optional()
      .describe('Extra wait after load (default 800ms when capturing)'),
  },
  async ({ url, capture, tabId, waitMs }) => {
    try {
      const action = capture ? 'navigate_and_capture' : 'navigate'
      const result = await runAction(action, { url, tabId, waitMs }, 120000)
      return jsonResult(result)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_click',
  'Click an element by CSS selector in the active tab (or tabId). Supports shadow DOM pierce.',
  {
    selector: z.string().min(1),
    tabId: z.number().optional(),
    capture: z.boolean().optional().describe('Capture page after click'),
  },
  async ({ selector, tabId, capture }) => {
    try {
      const action = capture ? 'click_and_capture' : 'click'
      const result = await runAction(action, { selector, tabId }, 60000)
      return jsonResult(result)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_fill',
  'Fill an input/textarea by CSS selector.',
  {
    selector: z.string().min(1),
    text: z.string(),
    tabId: z.number().optional(),
    clear: z.boolean().optional(),
  },
  async ({ selector, text, tabId, clear }) => {
    try {
      return jsonResult(
        await runAction('fill', { selector, text, tabId, clear }, 30000),
      )
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_scroll',
  'Scroll the page. Use preset=bottom or y pixels (default 800).',
  {
    preset: z.enum(['bottom', 'down']).optional(),
    y: z.number().optional(),
    tabId: z.number().optional(),
  },
  async ({ preset, y, tabId }) => {
    try {
      return jsonResult(await runAction('scroll', { preset, y, tabId }, 30000))
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_wait_for',
  'Wait until a CSS selector appears in the page.',
  {
    selector: z.string().min(1),
    timeoutMs: z.number().optional(),
    tabId: z.number().optional(),
  },
  async ({ selector, timeoutMs, tabId }) => {
    try {
      return jsonResult(
        await runAction(
          'wait_for',
          { selector, timeoutMs, tabId },
          (timeoutMs || 10000) + 5000,
        ),
      )
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_capture',
  'Capture DOM structure of active tab (or tabId) and send to bridge.',
  {
    tabId: z.number().optional(),
    send: z.boolean().optional().describe('Send to bridge (default true)'),
  },
  async ({ tabId, send }) => {
    try {
      return jsonResult(await runAction('capture', { tabId, send }, 60000))
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_run_preset',
  'Run a safe preset script in the page: scroll_to_bottom, scroll_down, page_title, page_text_sample.',
  {
    preset: z.enum([
      'scroll_to_bottom',
      'scroll_down',
      'page_title',
      'page_text_sample',
    ]),
    tabId: z.number().optional(),
  },
  async ({ preset, tabId }) => {
    try {
      return jsonResult(await runAction('run_preset', { preset, tabId }, 30000))
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'browser_run_steps',
  'Run a sequence of browser actions. Each step: { action, params?, delayMs?, tabId? }.',
  {
    tabId: z.number().optional().describe('Default tab for all steps'),
    steps: z
      .array(
        z.object({
          action: z.string(),
          params: z.record(z.unknown()).optional(),
          delayMs: z.number().optional(),
          tabId: z.number().optional(),
        }),
      )
      .min(1),
  },
  async ({ steps, tabId }) => {
    try {
      return jsonResult(await runAction('run_steps', { steps, tabId }, 180000))
    } catch (err) {
      return errResult(err)
    }
  },
)

// Legacy async queue tools (still work via poll fallback)

server.tool(
  'open_url_for_capture',
  'Open URL and capture (synchronous if extension connected). Enable Dev Agent Mode in extension.',
  { url: z.string().url() },
  async ({ url }) => {
    try {
      const result = await runAction('navigate_and_capture', { url }, 120000)
      return jsonResult(result)
    } catch (err) {
      return errResult(err)
    }
  },
)

server.tool(
  'click_and_capture',
  'Click selector and capture (synchronous if extension connected). Enable Dev Agent Mode.',
  { selector: z.string().min(1), tabId: z.number().optional() },
  async ({ selector, tabId }) => {
    try {
      const result = await runAction(
        'click_and_capture',
        { selector, tabId },
        60000,
      )
      return jsonResult(result)
    } catch (err) {
      return errResult(err)
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
