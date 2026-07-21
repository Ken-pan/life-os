#!/usr/bin/env node
/**
 * Kenos iPhone Ask — 12 核心 AI 能力真机路径打分
 *
 * 通道：MagicDNS Daily Beta `/__localai`（与 iPhone WKWebView 同源反代一致）
 * 前置：iPhone Kenos 已打开 /assistant；Mac LocalAI + Daily Beta 在跑
 *
 * Usage:
 *   node scripts/qa/kenos-phone-ai-12-core.mjs
 *   GATEWAY=http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5219/__localai \
 *     node scripts/qa/kenos-phone-ai-12-core.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT_DIR = join(
  ROOT,
  'docs/qa/evidence/kenos-phone-ai-12-core-2026-07-21',
  'logs',
  STAMP,
)
const GATEWAY = (
  process.env.GATEWAY ||
  'http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5219/__localai'
).replace(/\/$/, '')
const MODEL = process.env.MODEL || 'llm-fast'
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 90_000)
const PHONE_IP = process.env.KENOS_PHONE_IP || '100.116.58.83'
const AIOS_LOG = join(homedir(), 'Library/Logs/KenosDailyBeta/aios.stderr.log')
const DEVICE = process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const BUNDLE = 'space.kenos.app.ios'

const SYSTEM = [
  '你是 AI.OS,运行在用户本机上的私人 AI 助手。推理、记忆和数据全部在这台设备本地完成。',
  '回复优先级:安全与合法 > 用户当轮硬约束 > 诚实(无数据不编造) > 完成目标 > 文采克制。',
  '回答使用 Markdown。代码放在带语言标注的代码块里。保持直接、具体。',
  '你的知识有截止日期；涉及今天/最新/价格/天气等时效信息，不能联网时要说明局限。',
].join('\n\n')

const CALC_TOOL = {
  type: 'function',
  function: {
    name: 'calculate',
    description: '精确计算数学表达式',
    parameters: {
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    },
  },
}

function scoreFrom(verdict, latencyMs, soft = {}) {
  // 10 = excellent, 0 = fail
  let s =
    verdict === 'pass' ? 9 : verdict === 'partial' ? 6 : verdict === 'na' ? null : 2
  if (s == null) return null
  if (latencyMs != null) {
    if (latencyMs < 4000) s = Math.min(10, s + 1)
    else if (latencyMs > 25000) s = Math.max(0, s - 2)
    else if (latencyMs > 15000) s = Math.max(0, s - 1)
  }
  if (soft.bonus) s = Math.min(10, s + soft.bonus)
  if (soft.penalty) s = Math.max(0, s - soft.penalty)
  return s
}

async function chat({
  messages,
  maxTokens = 400,
  tools,
  stream = false,
  temperature = 0.3,
}) {
  const t0 = Date.now()
  const body = {
    model: MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream,
    chat_template_kwargs: { enable_thinking: false },
  }
  if (tools?.length) body.tools = tools
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify(body),
  })
  const latencyMs = Date.now() - t0
  const textRaw = await res.text()
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      latencyMs,
      text: '',
      raw: textRaw.slice(0, 400),
      toolCalls: [],
    }
  }
  if (stream) {
    // Count SSE chunks + extract content
    let content = ''
    let chunks = 0
    for (const line of textRaw.split('\n')) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      chunks += 1
      try {
        const j = JSON.parse(payload)
        content += j.choices?.[0]?.delta?.content || ''
      } catch {
        /* ignore */
      }
    }
    return {
      ok: true,
      status: res.status,
      latencyMs,
      text: content,
      chunks,
      toolCalls: [],
    }
  }
  let json
  try {
    json = JSON.parse(textRaw)
  } catch {
    return {
      ok: false,
      status: res.status,
      latencyMs,
      text: '',
      raw: textRaw.slice(0, 400),
      toolCalls: [],
    }
  }
  const msg = json.choices?.[0]?.message || {}
  return {
    ok: true,
    status: res.status,
    latencyMs,
    text: String(msg.content || '').trim(),
    toolCalls: msg.tool_calls || [],
    finishReason: json.choices?.[0]?.finish_reason,
  }
}

async function tinyTitle(user, assistant) {
  const t0 = Date.now()
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      model: 'llm-tiny',
      messages: [
        {
          role: 'user',
          content: `用不超过 12 个字概括这段对话的主题,只输出标题本身,不要标点和引号。\n\n用户: ${user.slice(0, 200)}\n助手: ${assistant.slice(0, 200)}`,
        },
      ],
      max_tokens: 32,
      temperature: 0.3,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
  })
  const latencyMs = Date.now() - t0
  const json = await res.json().catch(() => ({}))
  const title = json.choices?.[0]?.message?.content?.trim() || ''
  return { ok: res.ok && Boolean(title), title, latencyMs, status: res.status }
}

function countPhoneLocalAiSince(markerLine) {
  if (!existsSync(AIOS_LOG)) return { models: 0, chat: 0, lines: [] }
  const all = readFileSync(AIOS_LOG, 'utf8').split('\n')
  const start = markerLine >= 0 ? markerLine : Math.max(0, all.length - 200)
  const slice = all.slice(start)
  const phone = slice.filter((l) => l.includes(PHONE_IP) && l.includes('/__localai'))
  return {
    models: phone.filter((l) => l.includes('/v1/models')).length,
    chat: phone.filter((l) => l.includes('/chat/completions')).length,
    lines: phone.slice(-12),
  }
}

function logLineCount() {
  if (!existsSync(AIOS_LOG)) return 0
  return readFileSync(AIOS_LOG, 'utf8').split('\n').length
}

/** @type {Array<{id:string,name:string,run:()=>Promise<any>}>} */
const CASES = [
  {
    id: 'C01',
    name: '身份介绍与能力边界',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: '你好，你是谁？用两三句话介绍你能帮我做什么。',
          },
        ],
        maxTokens: 220,
      })
      const ok = r.ok && /AI\.?OS|助手|本地|帮/.test(r.text) && r.text.length > 20
      return {
        verdict: ok ? 'pass' : 'fail',
        score: scoreFrom(ok ? 'pass' : 'fail', r.latencyMs),
        latencyMs: r.latencyMs,
        note: ok ? '身份与本地助手定位清晰' : '介绍不清或失败',
        sample: r.text.slice(0, 160),
      }
    },
  },
  {
    id: 'C02',
    name: '多轮会话记忆',
    run: async () => {
      const m = [{ role: 'system', content: SYSTEM }]
      const a = await chat({
        messages: [
          ...m,
          {
            role: 'user',
            content: '请记住：我的项目代号是「北极星」，截止日期是下周五。只回复「已记下」。',
          },
        ],
        maxTokens: 40,
      })
      m.push({
        role: 'user',
        content: '请记住：我的项目代号是「北极星」，截止日期是下周五。只回复「已记下」。',
      })
      m.push({ role: 'assistant', content: a.text || '已记下' })
      const b = await chat({
        messages: [
          ...m,
          {
            role: 'user',
            content: '我刚才说的项目代号和截止日期分别是什么？只回答代号与日期，不要解释。',
          },
        ],
        maxTokens: 80,
      })
      const hasCode = /北极星/.test(b.text)
      const hasDate = /下周五|周五/.test(b.text)
      const verdict =
        hasCode && hasDate ? 'pass' : hasCode || hasDate ? 'partial' : 'fail'
      return {
        verdict,
        score: scoreFrom(verdict, b.latencyMs),
        latencyMs: b.latencyMs,
        note:
          verdict === 'pass'
            ? '准确召回代号与日期'
            : verdict === 'partial'
              ? '仅部分召回'
              : '未召回关键事实',
        sample: b.text.slice(0, 120),
      }
    },
  },
  {
    id: 'C03',
    name: '硬约束 / 严格格式',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content:
              '只输出一个 JSON 对象，不要 Markdown 代码围栏，不要其它文字。字段：{"ok":true,"n":3,"items":["a","b","c"]}',
          },
        ],
        maxTokens: 80,
      })
      let parsed = null
      try {
        parsed = JSON.parse(r.text)
      } catch {
        /* ignore */
      }
      const ok =
        parsed &&
        parsed.ok === true &&
        parsed.n === 3 &&
        Array.isArray(parsed.items) &&
        parsed.items.length === 3
      return {
        verdict: ok ? 'pass' : /ok|items/.test(r.text) ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : /ok|items/.test(r.text) ? 'partial' : 'fail', r.latencyMs),
        latencyMs: r.latencyMs,
        note: ok ? '严格 JSON 无前后缀' : '格式有偏差',
        sample: r.text.slice(0, 120),
      }
    },
  },
  {
    id: 'C04',
    name: '中文写作成稿',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: '把「本地 AI 助手让隐私更可控」扩写成约 80 字短文，不要用列表，不要开场白。',
          },
        ],
        maxTokens: 220,
      })
      const len = r.text.length
      const ok =
        r.ok &&
        len >= 60 &&
        len <= 220 &&
        /本地|隐私|助手/.test(r.text) &&
        !/^好的|^当然|^没问题/.test(r.text)
      return {
        verdict: ok ? 'pass' : r.ok && len > 40 ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : r.ok ? 'partial' : 'fail', r.latencyMs),
        latencyMs: r.latencyMs,
        note: `成稿约 ${len} 字`,
        sample: r.text.slice(0, 140),
      }
    },
  },
  {
    id: 'C05',
    name: '代码生成（可运行片段）',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content:
              '写一个 JavaScript 函数 `sum(a,b)` 返回两数之和。只要一个 fenced code block（js），不要解释。',
          },
        ],
        maxTokens: 160,
      })
      const hasFence = /```(?:js|javascript)?[\s\S]*sum[\s\S]*```/i.test(r.text)
      const hasFn = /function\s+sum|const\s+sum\s*=|sum\s*\(/.test(r.text)
      const ok = hasFence && hasFn
      return {
        verdict: ok ? 'pass' : hasFn ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : hasFn ? 'partial' : 'fail', r.latencyMs),
        latencyMs: r.latencyMs,
        note: ok ? '带语言标注代码块' : '代码形态不完整',
        sample: r.text.slice(0, 160),
      }
    },
  },
  {
    id: 'C06',
    name: '工具调用 · calculate',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: '用工具精确计算 17*19+3，不要心算。',
          },
        ],
        tools: [CALC_TOOL],
        maxTokens: 200,
      })
      const called = (r.toolCalls || []).some((t) => t.function?.name === 'calculate')
      let expr = ''
      try {
        expr = JSON.parse(r.toolCalls?.[0]?.function?.arguments || '{}').expression || ''
      } catch {
        /* ignore */
      }
      const ok = called && /17|19/.test(expr)
      return {
        verdict: ok ? 'pass' : called ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : called ? 'partial' : 'fail', r.latencyMs),
        latencyMs: r.latencyMs,
        note: ok ? `tool args=${expr}` : called ? '调了工具但参数弱' : '未发起 tool_calls',
        sample: JSON.stringify(r.toolCalls || []).slice(0, 180),
      }
    },
  },
  {
    id: 'C07',
    name: '流式输出（SSE）',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: '用一句话解释什么是向量数据库。' },
        ],
        stream: true,
        maxTokens: 120,
      })
      const ok = r.ok && (r.chunks || 0) >= 2 && r.text.length > 10
      return {
        verdict: ok ? 'pass' : r.ok && r.text ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : r.text ? 'partial' : 'fail', r.latencyMs, {
          bonus: (r.chunks || 0) >= 5 ? 0 : 0,
        }),
        latencyMs: r.latencyMs,
        note: `chunks=${r.chunks || 0} chars=${r.text.length}`,
        sample: r.text.slice(0, 120),
      }
    },
  },
  {
    id: 'C08',
    name: 'Tiny 辅助标题（llm-tiny）',
    run: async () => {
      const r = await tinyTitle(
        '帮我写一封催稿邮件',
        '可以先说明截止日期，再礼貌请求对方尽快回复附件。',
      )
      const ok = r.ok && r.title.length >= 2 && r.title.length <= 24
      return {
        verdict: ok ? 'pass' : r.ok ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : r.ok ? 'partial' : 'fail', r.latencyMs, {
          bonus: r.latencyMs < 3000 ? 1 : 0,
        }),
        latencyMs: r.latencyMs,
        note: ok ? `title=${r.title}` : `tiny status=${r.status}`,
        sample: r.title,
      }
    },
  },
  {
    id: 'C09',
    name: '时效问题诚实降级',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: '今天纳斯达克收盘点位是多少？给我一个精确数字。',
          },
        ],
        maxTokens: 200,
      })
      const hedges =
        /无法|不能|不知道|没有|截止|过时|不能联网|实时|查证|不确定|抱歉/.test(
          r.text,
        )
      const inventsPrecise = /\d{4,5}\.?\d*/.test(r.text) && !hedges
      const ok = r.ok && hedges && !inventsPrecise
      return {
        verdict: ok ? 'pass' : hedges ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : hedges ? 'partial' : 'fail', r.latencyMs, {
          penalty: inventsPrecise ? 3 : 0,
        }),
        latencyMs: r.latencyMs,
        note: ok ? '正确拒绝编造实时行情' : inventsPrecise ? '疑似编造精确点位' : '降级不足',
        sample: r.text.slice(0, 160),
      }
    },
  },
  {
    id: 'C10',
    name: '结构化 Markdown 列表',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: '列出早上高效工作的 3 个习惯，必须用 Markdown 有序列表，正好 3 条，不要前言后语。',
          },
        ],
        maxTokens: 200,
      })
      const lines = r.text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const numbered = lines.filter((l) => /^\d+[\.\、)]/.test(l) || /^[-*]\s/.test(l))
      const ok = numbered.length >= 3 && lines.length <= 6
      return {
        verdict: ok ? 'pass' : numbered.length >= 2 ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : numbered.length >= 2 ? 'partial' : 'fail', r.latencyMs),
        latencyMs: r.latencyMs,
        note: `listItems=${numbered.length}`,
        sample: r.text.slice(0, 160),
      }
    },
  },
  {
    id: 'C11',
    name: '规划且先别写代码',
    run: async () => {
      const r = await chat({
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content:
              '我想两周内做一个个人仪表盘看今日任务。先别写代码，只给阶段与验收标准。',
          },
        ],
        maxTokens: 450,
      })
      const hasPlan = /周|阶段|验收|里程碑|第.?[12]/.test(r.text)
      const hasCode =
        /```/.test(r.text) || /function\s|const\s+\w+\s*=|import\s+|localStorage/.test(r.text)
      const ok = r.ok && hasPlan && !hasCode
      return {
        verdict: ok ? 'pass' : hasPlan ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : hasPlan ? 'partial' : 'fail', r.latencyMs, {
          penalty: hasCode ? 2 : 0,
        }),
        latencyMs: r.latencyMs,
        note: ok ? '规划到位且无代码' : hasCode ? '泄漏了代码' : '计划结构弱',
        sample: r.text.slice(0, 160),
      }
    },
  },
  {
    id: 'C12',
    name: '话题中断后再恢复',
    run: async () => {
      const m = [{ role: 'system', content: SYSTEM }]
      const a1 = await chat({
        messages: [
          ...m,
          {
            role: 'user',
            content: '给我 3 个产品更新邮件标题，主题是「本地助手更快了」。只要 3 行标题。',
          },
        ],
        maxTokens: 160,
      })
      m.push({
        role: 'user',
        content: '给我 3 个产品更新邮件标题，主题是「本地助手更快了」。只要 3 行标题。',
      })
      m.push({ role: 'assistant', content: a1.text })
      const a2 = await chat({
        messages: [...m, { role: 'user', content: '对了今天天气怎么样？随便聊聊。' }],
        maxTokens: 120,
      })
      m.push({ role: 'user', content: '对了今天天气怎么样？随便聊聊。' })
      m.push({ role: 'assistant', content: a2.text })
      const a3 = await chat({
        messages: [
          ...m,
          {
            role: 'user',
            content: '打住，回到邮件。把刚才标题再列一遍，只要 3 行。',
          },
        ],
        maxTokens: 160,
      })
      const recovered = /本地|助手|更快|邮件|标题/.test(a3.text)
      const lines = a3.text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const ok = recovered && lines.length >= 3
      return {
        verdict: ok ? 'pass' : recovered ? 'partial' : 'fail',
        score: scoreFrom(ok ? 'pass' : recovered ? 'partial' : 'fail', a3.latencyMs),
        latencyMs: a3.latencyMs,
        note: ok ? '跑题后回到邮件标题任务' : '恢复弱或漂移',
        sample: a3.text.slice(0, 160),
      }
    },
  },
]

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // Ensure Ask is foreground on device
  spawnSync(
    'xcrun',
    [
      'devicectl',
      'device',
      'process',
      'launch',
      '--device',
      DEVICE,
      '--terminate-existing',
      '--payload-url',
      'http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5219/assistant?iosNativeShell=1',
      BUNDLE,
    ],
    { encoding: 'utf8' },
  )
  await new Promise((r) => setTimeout(r, 2500))

  const logStart = logLineCount()
  const preflight = await fetch(`${GATEWAY}/v1/models`, {
    signal: AbortSignal.timeout(8000),
  })
    .then(async (r) => ({
      ok: r.ok,
      status: r.status,
      count: ((await r.json())?.data || []).length,
    }))
    .catch((e) => ({ ok: false, error: String(e) }))

  const results = []
  for (const c of CASES) {
    process.stdout.write(`→ ${c.id} ${c.name} … `)
    try {
      const out = await c.run()
      results.push({ id: c.id, name: c.name, ...out })
      console.log(`${out.verdict} score=${out.score} ${out.latencyMs}ms — ${out.note}`)
    } catch (err) {
      results.push({
        id: c.id,
        name: c.name,
        verdict: 'fail',
        score: 0,
        latencyMs: null,
        note: String(err?.message || err),
        sample: '',
      })
      console.log(`fail — ${err?.message || err}`)
    }
  }

  const phone = countPhoneLocalAiSince(logStart - 5)
  const scored = results.filter((r) => typeof r.score === 'number')
  const avg =
    scored.reduce((a, b) => a + b.score, 0) / Math.max(1, scored.length)
  const pass = results.filter((r) => r.verdict === 'pass').length
  const partial = results.filter((r) => r.verdict === 'partial').length
  const fail = results.filter((r) => r.verdict === 'fail').length

  const report = {
    at: new Date().toISOString(),
    device: DEVICE,
    gateway: GATEWAY,
    model: MODEL,
    preflight,
    phoneTraffic: phone,
    summary: {
      pass,
      partial,
      fail,
      avgScore: Number(avg.toFixed(2)),
      grade:
        avg >= 8.5 ? 'A' : avg >= 7 ? 'B' : avg >= 5.5 ? 'C' : avg >= 4 ? 'D' : 'F',
    },
    results,
  }

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const md = [
    `# Kenos Phone AI · 12 核心能力打分`,
    ``,
    `- 时间: ${report.at}`,
    `- 设备: iPhone 17 Pro (${DEVICE})`,
    `- 通道: \`${GATEWAY}\` (MagicDNS /__localai)`,
    `- 模型: ${MODEL}`,
    `- 预检 models: ${JSON.stringify(preflight)}`,
    `- 手机 IP 流量(同期日志): models=${phone.models} chat=${phone.chat}`,
    `- **总分: ${report.summary.avgScore}/10 · 等级 ${report.summary.grade}** (pass ${pass} / partial ${partial} / fail ${fail})`,
    ``,
    `| ID | 能力 | 判定 | 分 | 延迟 | 备注 |`,
    `|----|------|------|----|------|------|`,
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.name} | ${r.verdict} | ${r.score ?? '—'} | ${r.latencyMs ?? '—'}ms | ${r.note} |`,
    ),
    ``,
  ].join('\n')
  writeFileSync(join(OUT_DIR, 'SCORECARD.md'), md)

  console.log('\n' + md)
  console.log(`\nWrote ${join(OUT_DIR, 'report.json')}`)
  process.exit(fail > 3 ? 2 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
