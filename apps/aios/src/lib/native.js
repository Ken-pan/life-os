/**
 * 原生壳(Tauri)专属能力层。
 * 设计原则:web 与 app 一份代码 —— 本模块在浏览器里 isNative=false,
 * 原生工具不注册、不加载 @tauri-apps 依赖(动态 import);在 Tauri 壳里
 * 经 plugin-shell 白名单(src-tauri/capabilities/default.json)执行命令。
 * 以后加原生能力:白名单加一行 + 这里加一个工具,不碰 Rust。
 */

import { GATEWAY } from '$lib/localai.js'
import {
  clampThreadMessages,
  extractBubbleHeaders,
  mergeThreadDelta,
  projectCodeSessionsResult,
  projectCursorSessions,
  projectCursorThread,
} from '$lib/kenos/codeReadSource.core.js'

export const isNative = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

// 白名单命令在 Finder 启动的 app 里 PATH 极小,给被委派的 agent 补全
const AGENT_PATH =
  '/opt/homebrew/bin:/Users/kenpan/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

async function shell() {
  return await import('@tauri-apps/plugin-shell')
}

// 执行前预检权限;缺权限返回引导语,有权限返回 null。动态引入避免与 permissions 循环依赖。
async function preflight(key) {
  const { ensurePermission } = await import('$lib/permissions.svelte.js')
  return await ensurePermission(key)
}

/* —— 委派任务注册表(随 app 生命周期,重启即清) —— */

let nextId = 1
/** @type {Map<string, any>} */
const tasks = new Map()

const AGENTS = {
  claude: {
    cmd: 'claude',
    args: (prompt) => ['-p', prompt, '--permission-mode', 'acceptEdits'],
  },
  cursor: {
    cmd: 'cursor-agent',
    args: (prompt) => ['-p', prompt],
  },
}

const MAX_BUF = 200_000

async function delegateTask({ agent = 'claude', prompt, cwd }) {
  const spec = AGENTS[agent]
  if (!spec) return `错误:未知 agent "${agent}"(支持: ${Object.keys(AGENTS).join('/')})`
  if (!prompt?.trim()) return '错误:prompt 为空'
  if (!cwd?.trim()) return '错误:必须指定 cwd(agent 的工作目录,通常是项目根目录)'

  const { Command } = await shell()
  const id = `t${nextId++}`
  const task = {
    id,
    agent,
    prompt: prompt.slice(0, 200),
    cwd,
    status: 'running',
    out: '',
    code: null,
    child: null,
    startedAt: Date.now(),
  }
  const append = (chunk) => {
    task.out = (task.out + chunk).slice(-MAX_BUF)
  }

  try {
    const cmd = Command.create(spec.cmd, spec.args(prompt), {
      cwd,
      env: { PATH: AGENT_PATH },
    })
    cmd.stdout.on('data', (line) => append(`${line}\n`))
    cmd.stderr.on('data', (line) => append(`[stderr] ${line}\n`))
    cmd.on('close', ({ code }) => {
      task.status = code === 0 ? 'done' : 'failed'
      task.code = code
      task.child = null
    })
    cmd.on('error', (err) => {
      append(`[error] ${err}\n`)
      task.status = 'failed'
      task.child = null
    })
    task.child = await cmd.spawn()
  } catch (err) {
    return `派发失败:${err?.message ?? err}`
  }

  tasks.set(id, task)
  return `已派发任务 ${id} 给 ${agent}(cwd: ${cwd})。任务在后台运行,用 check_task 查看进展;不要原地等待,可先回复用户。`
}

function fmtElapsed(ms) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`
}

function checkTask({ task_id } = {}) {
  if (!tasks.size) return '当前没有委派过任务。'
  if (!task_id) {
    return [...tasks.values()]
      .map(
        (t) =>
          `${t.id} [${t.status}] ${t.agent} · ${fmtElapsed(Date.now() - t.startedAt)} · ${t.prompt}`
      )
      .join('\n')
  }
  const t = tasks.get(task_id)
  if (!t) return `没有任务 ${task_id}。用不带参数的 check_task 列出全部。`
  const tail = t.out.length > 4000 ? `…(截断)\n${t.out.slice(-4000)}` : t.out || '(暂无输出)'
  const head = `任务 ${t.id} [${t.status}]${t.code != null ? ` exit=${t.code}` : ''} · ${t.agent} · 已运行 ${fmtElapsed(Date.now() - t.startedAt)} · cwd: ${t.cwd}`
  return `${head}\n——输出——\n${tail}`
}

async function cancelTask({ task_id }) {
  const t = tasks.get(task_id)
  if (!t) return `没有任务 ${task_id}。`
  if (!t.child) return `任务 ${task_id} 已经结束(${t.status})。`
  try {
    await t.child.kill()
    t.status = 'cancelled'
    t.child = null
    return `已取消任务 ${task_id}。`
  } catch (err) {
    return `取消失败:${err?.message ?? err}`
  }
}

async function runAppleScript({ script }) {
  if (!script?.trim()) return '错误:script 为空'
  const denied = await preflight('automation')
  if (denied) return denied
  const { Command } = await shell()
  const out = await Command.create('osascript', ['-e', script]).execute()
  if (out.code !== 0) return `AppleScript 失败(exit=${out.code}):\n${out.stderr || out.stdout}`
  return out.stdout.trim() || '(执行成功,无输出)'
}

/* —— macOS GUI 观测/操控:打开 app、输入文字、看屏幕 —— */

// AppleScript 字符串字面量转义
const q = (s) => `"${String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function osa(script) {
  const { Command } = await shell()
  return await Command.create('osascript', ['-e', script]).execute()
}

/* —— Cursor 对话监控(只读本机 SQLite) ——
 * state.vscdb(27GB)禁全表扫:列表走小库 conversation-search.db,详情按 key 主键点查/前缀 GLOB。
 * 一律 file:...?mode=ro 只读打开:两库都是 WAL 模式,ro 能读到未 checkpoint 的最新数据,
 * 且 WAL 下读不阻塞 Cursor 写(immutable=1 会忽略 WAL,流式新气泡要等 checkpoint 才可见)。
 * 不写库、绝不上云。 */

const CURSOR_HOME = '/Users/kenpan/Library/Application Support/Cursor/User/globalStorage'
const CURSOR_STATE_DB = `${CURSOR_HOME}/state.vscdb`
const CURSOR_SEARCH_DB = `${CURSOR_HOME}/conversation-search.db`

/** 本机路径 → sqlite3 可用的只读 file: URI(空格等需百分号编码)。 */
function readonlyUri(path) {
  return `file:${encodeURI(path)}?mode=ro`
}

/** composerId 白名单校验:只允许 uuid 类字符,挡住 SQL/GLOB 注入。 */
function isSafeComposerId(id) {
  return typeof id === 'string' && /^[0-9a-zA-Z-]{8,64}$/.test(id)
}

/** bubbleId 同款白名单(允许更短的 id)。 */
function isSafeBubbleId(id) {
  return typeof id === 'string' && /^[0-9a-zA-Z-]{1,64}$/.test(id)
}

/** 跑一条只读查询,-json 输出 → 解析成行数组;失败返回 {error}。 */
async function sqliteJson(dbPath, query) {
  const { Command } = await shell()
  const out = await Command.create('sqlite3', ['-json', readonlyUri(dbPath), query], {
    env: { PATH: AGENT_PATH },
  }).execute()
  if (out.code !== 0) return { error: (out.stderr || out.stdout || '').trim() || `exit ${out.code}` }
  const text = (out.stdout || '').trim()
  if (!text) return { rows: [] }
  try {
    return { rows: JSON.parse(text) }
  } catch (err) {
    return { error: `解析失败:${err?.message ?? err}` }
  }
}

/**
 * 读最近的 Cursor 会话列表 → {items,state}。UI 直连用。
 * @param {{ limit?: number }} [opts]
 */
async function readCursorSessions({ limit = 40 } = {}) {
  if (!isNative) return projectCodeSessionsResult({ native: false })
  const n = Math.min(Math.max(Number(limit) || 40, 1), 200)
  const res = await sqliteJson(
    CURSOR_SEARCH_DB,
    `SELECT id, title, updated_at, is_archived, source FROM conversations ORDER BY updated_at DESC LIMIT ${n}`,
  )
  if (res.error) return projectCodeSessionsResult({ native: true, error: res.error })
  return projectCodeSessionsResult({ native: true, sessions: res.rows })
}

/**
 * 读单个会话的完整消息流 → thread 对象 或 {error}。UI 直连用。
 * @param {{ composerId?: string }} opts
 */
async function readCursorThread({ composerId } = {}) {
  if (!isNative) return { error: '此功能仅在 Mac app 内可用。' }
  if (!isSafeComposerId(composerId)) return { error: 'composerId 非法。' }
  const head = await sqliteJson(
    CURSOR_STATE_DB,
    `SELECT value FROM cursorDiskKV WHERE key='composerData:${composerId}'`,
  )
  if (head.error) return { error: head.error }
  if (!head.rows?.length) return { error: '找不到该会话。' }
  let composerJson
  try {
    composerJson = JSON.parse(head.rows[0].value)
  } catch {
    return { error: '会话数据解析失败。' }
  }
  const headers = extractBubbleHeaders(composerJson)
  if (!headers.length) {
    return projectCursorThread(composerJson, {})
  }
  // 前缀 GLOB → PK 范围扫,只命中本会话的气泡(不全表扫)。
  const bubbleRes = await sqliteJson(
    CURSOR_STATE_DB,
    `SELECT key, value FROM cursorDiskKV WHERE key GLOB 'bubbleId:${composerId}:*'`,
  )
  if (bubbleRes.error) return { error: bubbleRes.error }
  /** @type {Record<string, any>} */
  const bubbles = {}
  for (const row of bubbleRes.rows || []) {
    const bid = String(row.key).split(':').pop()
    try {
      bubbles[bid] = JSON.parse(row.value)
    } catch {
      /* 跳过坏气泡 */
    }
  }
  return projectCursorThread(composerJson, bubbles)
}

/**
 * 增量读取会话消息流:只拉「新出现的气泡 + 可能还在流式增长的尾气泡」。
 * 空闲 tick = 1 次 spawn(会话头 + 尾气泡,两个主键点查);有新气泡才发第二条 IN 点查。
 * prevThread/seenBubbleIds 传空 = 全量首载(前缀 GLOB 一把抓)。UI 高频轮询用。
 * @param {{ composerId?: string, prevThread?: any, seenBubbleIds?: string[] }} opts
 * @returns {Promise<{ thread?: any, bubbleIds?: string[], error?: string }>}
 */
async function readCursorThreadDelta({ composerId, prevThread = null, seenBubbleIds = [] } = {}) {
  if (!isNative) return { error: '此功能仅在 Mac app 内可用。' }
  if (!isSafeComposerId(composerId)) return { error: 'composerId 非法。' }
  const tailId = prevThread?.messages?.at?.(-1)?.bubbleId
  const headKeys = [`composerData:${composerId}`]
  if (isSafeBubbleId(tailId)) headKeys.push(`bubbleId:${composerId}:${tailId}`)
  const head = await sqliteJson(
    CURSOR_STATE_DB,
    `SELECT key, value FROM cursorDiskKV WHERE key IN (${headKeys.map(sqlQuote).join(',')})`,
  )
  if (head.error) return { error: head.error }
  let composerJson = null
  /** @type {Record<string, any>} */
  const bubbles = {}
  const takeBubbleRow = (row) => {
    const bid = String(row.key).split(':').pop()
    try {
      bubbles[bid] = JSON.parse(row.value)
    } catch {
      /* 跳过坏气泡 */
    }
  }
  for (const row of head.rows || []) {
    if (String(row.key).startsWith('composerData:')) {
      try {
        composerJson = JSON.parse(row.value)
      } catch {
        return { error: '会话数据解析失败。' }
      }
    } else {
      takeBubbleRow(row)
    }
  }
  if (!composerJson) return { error: '找不到该会话。' }
  const headers = extractBubbleHeaders(composerJson)
  const seen = new Set(seenBubbleIds)
  const newIds = headers
    .map((h) => h.bubbleId)
    .filter((id) => !seen.has(id) && id !== tailId && isSafeBubbleId(id))
  if (newIds.length) {
    // 首载或缺口太大 → 前缀 GLOB(PK 范围扫)一把抓;正常增量 → IN 主键点查。
    const query =
      !seen.size || newIds.length > 40
        ? `SELECT key, value FROM cursorDiskKV WHERE key GLOB 'bubbleId:${composerId}:*'`
        : `SELECT key, value FROM cursorDiskKV WHERE key IN (${newIds
            .map((id) => sqlQuote(`bubbleId:${composerId}:${id}`))
            .join(',')})`
    const res = await sqliteJson(CURSOR_STATE_DB, query)
    if (res.error) return { error: res.error }
    for (const row of res.rows || []) takeBubbleRow(row)
  }
  return {
    thread: mergeThreadDelta(prevThread, composerJson, bubbles),
    bubbleIds: headers.map((h) => h.bubbleId),
  }
}

/**
 * 全文搜索 Cursor 会话标题/正文 → 会话摘要数组。UI 直连用。
 * @param {{ query?: string, limit?: number }} opts
 */
async function searchCursor({ query, limit = 30 } = {}) {
  if (!isNative) return []
  const q0 = String(query || '').trim()
  if (!q0) return []
  const n = Math.min(Math.max(Number(limit) || 30, 1), 100)
  // FTS MATCH 用参数化不便,转义双引号后作短语查询,避免语法字符炸掉。
  const phrase = `"${q0.replaceAll('"', '""')}"`
  const res = await sqliteJson(
    CURSOR_SEARCH_DB,
    `SELECT c.id AS id, c.title AS title, c.updated_at AS updated_at, c.is_archived AS is_archived, c.source AS source
     FROM conversation_fts f JOIN conversations c ON c.fts_rowid = f.rowid
     WHERE conversation_fts MATCH ${sqlQuote(phrase)} ORDER BY c.updated_at DESC LIMIT ${n}`,
  )
  if (res.error) return []
  return projectCursorSessions(res.rows)
}

/** SQL 字符串字面量转义(单引号加倍)。仅用于已受控的短语。 */
function sqlQuote(s) {
  return `'${String(s).replaceAll("'", "''")}'`
}

/**
 * 发一条 macOS 原生通知(经 osascript display notification)。
 * 不控制其它 app,不需要 automation 权限;浏览器里静默 no-op。
 * @param {string} title @param {string} body @param {string} [subtitle]
 * @returns {Promise<boolean>} 是否成功送出
 */
export async function notify(title, body, subtitle = '') {
  if (!isNative) return false
  try {
    const parts = [`display notification ${q(body || '')} with title ${q(title || 'AI.OS')}`]
    if (subtitle) parts.push(`subtitle ${q(subtitle)}`)
    const out = await osa(parts.join(' '))
    return out.code === 0
  } catch {
    return false
  }
}

/**
 * best-effort 后台唤起用户的 Google Chrome —— 让 Web State DevTools 扩展重连,
 * 使 browse 工具在 Chrome 没开着时自愈,而不是报错甩给用户。
 * 用 `open -a … -g`:走 LaunchServices(不触发自动化权限弹窗)、-g 后台启动不抢焦点;
 * Chrome 已在运行时near-no-op。web 端 / 失败静默返回 false。
 * @returns {Promise<boolean>}
 */
export async function wakeChrome() {
  if (!isNative) return false
  try {
    const { Command } = await shell()
    const out = await Command.create('open', ['-g', '-a', 'Google Chrome']).execute()
    return out.code === 0
  } catch {
    return false
  }
}

async function openMacApp({ name }) {
  if (!name?.trim()) return '错误:name 为空'
  const denied = await preflight('automation')
  if (denied) return denied
  const out = await osa(`tell application ${q(name)} to activate`)
  if (out.code !== 0) return `打开失败:${out.stderr || out.stdout}`
  return `已打开并前置「${name}」。可以用 type_into_app 输入,或 look_at_screen 查看它的界面。`
}

async function typeIntoApp({ app, text, submit = true }) {
  if (!app?.trim() || !text?.trim()) return '错误:app 和 text 都必填'
  const denied = await preflight('accessibility')
  if (denied) return denied
  const lines = [
    `set the clipboard to ${q(text)}`,
    `tell application ${q(app)} to activate`,
    'delay 0.8',
    'tell application "System Events"',
    '  keystroke "v" using command down',
    ...(submit ? ['  delay 0.4', '  key code 36'] : []),
    'end tell',
  ]
  const out = await osa(lines.join('\n'))
  if (out.code !== 0) {
    return `输入失败(exit=${out.code}):${out.stderr || out.stdout}\n到 设置 → 权限 里授权「辅助功能」后重试。`
  }
  return `已把文字粘贴进「${app}」${submit ? '并按下回车' : '(未按回车)'}。稍等片刻后用 look_at_screen 查看它的反应。`
}

/** 截主屏 → 1280px jpg → base64;失败返回 {error} */
async function captureScreenB64() {
  // 预检屏幕录制:screencapture 缺权限时仍返回 exit 0(只截到壁纸),必须靠系统 API 判断
  const denied = await preflight('screen')
  if (denied) return { error: denied }
  const { Command } = await shell()
  const file = '/tmp/aios-look.jpg'
  let out = await Command.create('screencapture', ['-x', '-t', 'jpg', file]).execute()
  if (out.code !== 0) {
    return {
      error: `截屏失败:${out.stderr}\n到 设置 → 权限 里授权「屏幕录制」并按提示重启 AIOS。`,
    }
  }
  await Command.create('sips', ['-Z', '1280', file]).execute()
  out = await Command.create('base64', ['-i', file]).execute()
  const b64 = out.stdout?.replace(/\s+/g, '')
  if (out.code !== 0 || !b64) return { error: '错误:截屏文件读取失败' }
  return { b64 }
}

async function vlmAsk(prompt, b64) {
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'vlm-fast',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      max_tokens: 1200,
      temperature: 0.7,
      stream: false,
    }),
    signal: AbortSignal.timeout(300000),
  })
  if (!res.ok) return `错误:视觉模型调用失败 HTTP ${res.status}`
  const json = await res.json()
  return json.choices?.[0]?.message?.content?.trim() || '视觉模型没有返回内容。'
}

async function lookAtScreen({ question, app }) {
  if (!question?.trim()) return '错误:question 为空'
  if (app?.trim()) {
    await osa(`tell application ${q(app)} to activate`)
    await sleep(900)
  }
  const shot = await captureScreenB64()
  if (shot.error) return shot.error
  return await vlmAsk(
    `这是 Mac 屏幕当前的截图${app ? `(应看到应用「${app}」)` : ''}。${question}\n\n请具体描述看到的内容;如果整屏只有壁纸或纯黑,说明截屏权限未授予,请直说。`,
    shot.b64,
  )
}

/* —— AI 应用专属适配器:Claude / Cursor / ChatGPT ——
 * 每个适配器固化该 app 的激活方式、新建对话快捷键、composer 聚焦方式、
 * 以及读屏时给视觉模型的布局知识,让"发任务/读回复"对这三个 app 开箱即稳。 */

// 用 bundle id 定位,显示名不可靠:这台机器上叫 "ChatGPT" 的 app 其实是 Codex 工作台
const AI_APPS = {
  claude: {
    appId: 'com.anthropic.claudefordesktop',
    short: 'Claude',
    icon: 'brain',
    desc: '通用问答 · 写作 · 分析',
    label: 'Claude 桌面应用',
    // ⌘N 新对话(composer 自动聚焦);不新建时直接粘贴进当前对话输入框
    newChatKeys: 'keystroke "n" using command down',
    focusKeys: null,
    readHint:
      '屏幕上是 Claude 桌面应用(AI 对话界面,消息流居中)。请完整转录对话中最新一条 Claude 的回复;如果它还在生成(有停止按钮/光标在闪),说明"仍在生成中"并转录已有部分。',
  },
  cursor: {
    appId: 'com.todesktop.230313mzl4w4u92',
    short: 'Cursor',
    icon: 'code',
    desc: '编辑器内改代码',
    label: 'Cursor 编辑器',
    // ⌘L 打开/聚焦右侧 AI 聊天面板
    newChatKeys: null,
    focusKeys: 'keystroke "l" using command down',
    readHint:
      '屏幕上是 Cursor 代码编辑器,AI 聊天/Agent 面板通常在右侧。请转录面板中最新的 AI 回复与任务状态:它是否还在运行、正在改哪些文件、有没有等待确认的操作(如 Accept/Reject 按钮)。',
  },
  chatgpt: {
    appId: 'com.openai.chat',
    short: 'ChatGPT',
    icon: 'chat',
    desc: '通用问答 · 联网搜索',
    label: 'ChatGPT 聊天应用(ChatGPT Classic)',
    newChatKeys: 'keystroke "n" using command down',
    focusKeys: null,
    readHint:
      '屏幕上是 ChatGPT 聊天应用(AI 对话界面)。请完整转录最新一条 ChatGPT 的回复;如果还在生成中,说明"仍在生成中"并转录已有部分。',
  },
  codex: {
    appId: 'com.openai.codex',
    short: 'Codex',
    icon: 'terminal',
    desc: '云端编码任务',
    label: 'Codex 编码工作台',
    // Codex 里当前任务的输入框在底部("要求后续变更");新任务用 ⌘N
    newChatKeys: 'keystroke "n" using command down',
    focusKeys: null,
    readHint:
      '屏幕上是 OpenAI Codex 编码工作台(左侧项目/任务列表,中间是任务对话流)。请转录当前任务的最新进展:agent 说了什么、是否还在运行(有无计时/停止按钮)、改了哪些文件(右侧变更统计)、有没有等待用户确认的内容。',
  },
}

async function aiAppSend({ app, message, new_chat = false }) {
  const a = AI_APPS[app]
  if (!a) return `错误:未知 app "${app}"(支持: ${Object.keys(AI_APPS).join('/')})`
  if (!message?.trim()) return '错误:message 为空'
  const denied = await preflight('accessibility')
  if (denied) return denied

  const lines = [
    `set the clipboard to ${q(message)}`,
    `tell application id ${q(a.appId)} to activate`,
    'delay 1.0',
    'tell application "System Events"',
    ...(new_chat && a.newChatKeys ? [`  ${a.newChatKeys}`, '  delay 0.6'] : []),
    ...(a.focusKeys ? [`  ${a.focusKeys}`, '  delay 0.6'] : []),
    '  keystroke "v" using command down',
    '  delay 0.4',
    '  key code 36',
    'end tell',
  ]
  const out = await osa(lines.join('\n'))
  if (out.code !== 0) {
    return `发送失败(exit=${out.code}):${out.stderr || out.stdout}\n到 设置 → 权限 里授权「辅助功能」和「自动化」后重试。`
  }
  return `已把任务发送给${a.label}${new_chat ? '(新对话)' : ''}。AI 应用生成回复需要时间,建议等 15-60 秒后用 ai_app_read 查看;复杂任务(如 Cursor 改代码)可多次轮询。`
}

async function aiAppRead({ app, question }) {
  const a = AI_APPS[app]
  if (!a) return `错误:未知 app "${app}"(支持: ${Object.keys(AI_APPS).join('/')})`
  await osa(`tell application id ${q(a.appId)} to activate`)
  await sleep(1000)
  const shot = await captureScreenB64()
  if (shot.error) return shot.error
  return await vlmAsk(
    `${a.readHint}\n${question?.trim() ? `\n额外关注:${question}` : ''}\n\n如果整屏只有壁纸或纯黑,说明截屏权限未授予,请直说。`,
    shot.b64,
  )
}

async function githubCli({ args }) {
  if (!Array.isArray(args) || !args.length) return '错误:args 必须是非空字符串数组,如 ["pr","list"]'
  const { Command } = await shell()
  const out = await Command.create('gh', args.map(String), { env: { PATH: AGENT_PATH } }).execute()
  const text = [out.stdout, out.stderr].filter(Boolean).join('\n').trim()
  return out.code === 0 ? text || '(成功,无输出)' : `gh 失败(exit=${out.code}):\n${text}`
}

/* —— 工具定义(与 tools.js 的 DEFS 同形) —— */

export const NATIVE_DEFS = [
  {
    key: 'delegate_task',
    icon: 'terminal',
    def: {
      type: 'function',
      function: {
        name: 'delegate_task',
        description:
          '把一个编码/研究任务委派给本机的 CLI coding agent(Claude Code 或 Cursor)后台执行。适合改代码、修 bug、写脚本、跑测试等需要动文件的工作。任务是异步的:派发后立即返回任务 id,用 check_task 跟进,不要阻塞对话。',
        parameters: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              enum: ['claude', 'cursor'],
              description: '用哪个 agent,默认 claude(Claude Code)',
            },
            prompt: { type: 'string', description: '给 agent 的完整任务描述,自包含、具体' },
            cwd: {
              type: 'string',
              description: '工作目录(绝对路径,通常是目标项目根目录),必填',
            },
          },
          required: ['prompt', 'cwd'],
        },
      },
    },
  },
  {
    key: 'check_task',
    icon: 'terminal',
    def: {
      type: 'function',
      function: {
        name: 'check_task',
        description: '查看委派任务的状态和输出。不带 task_id 列出全部任务;带 task_id 看该任务详情和输出尾部。',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: '任务 id,如 "t1";省略则列出全部' },
          },
        },
      },
    },
  },
  {
    key: 'cancel_task',
    icon: 'x',
    def: {
      type: 'function',
      function: {
        name: 'cancel_task',
        description: '取消一个还在运行的委派任务。',
        parameters: {
          type: 'object',
          properties: { task_id: { type: 'string', description: '任务 id' } },
          required: ['task_id'],
        },
      },
    },
  },
  {
    key: 'read_cursor_sessions',
    icon: 'code',
    def: {
      type: 'function',
      function: {
        name: 'read_cursor_sessions',
        description:
          '读取本机 Cursor 编辑器最近的对话会话列表(标题 + 最近时间),只读、不打扰 Cursor。用于监控用户在 Cursor 里都开了哪些 AI 对话。返回会话 id 可交给 read_cursor_thread 看完整消息。',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '最多返回几条,默认 40' },
          },
        },
      },
    },
  },
  {
    key: 'read_cursor_thread',
    icon: 'code',
    def: {
      type: 'function',
      function: {
        name: 'read_cursor_thread',
        description:
          '读取本机 Cursor 某个对话的完整消息流(用户发的 + agent 回复的),只读。composerId 来自 read_cursor_sessions。用于查看某段 Cursor 对话的历史与 agent 说了什么。',
        parameters: {
          type: 'object',
          properties: {
            composerId: { type: 'string', description: '会话 id(来自 read_cursor_sessions)' },
          },
          required: ['composerId'],
        },
      },
    },
  },
  {
    key: 'search_cursor_sessions',
    icon: 'code',
    def: {
      type: 'function',
      function: {
        name: 'search_cursor_sessions',
        description:
          '按关键词全文搜索本机 Cursor 的对话(标题 + 正文),返回匹配的会话列表。用于找到「那个聊过 X 的对话」;返回的会话 id 可交给 read_cursor_thread 看完整消息。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            limit: { type: 'number', description: '最多返回几条,默认 30' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    key: 'run_applescript',
    icon: 'monitor',
    def: {
      type: 'function',
      function: {
        name: 'run_applescript',
        description:
          '在 Mac 上执行一段 AppleScript,用于查看和操控其他应用(打开 app、读窗口、操作 Finder/备忘录/音乐等可脚本化应用)。首次操控某个 app 时系统可能弹权限确认。返回脚本输出。',
        parameters: {
          type: 'object',
          properties: { script: { type: 'string', description: 'AppleScript 源码' } },
          required: ['script'],
        },
      },
    },
  },
  {
    key: 'ai_app_send',
    icon: 'chat',
    def: {
      type: 'function',
      function: {
        name: 'ai_app_send',
        description:
          '把一个任务/问题发送给 Mac 上的 AI 应用(Claude / Cursor / ChatGPT / Codex)——针对这几个应用优化过的专用通道:自动激活、聚焦输入框、粘贴并发送。改代码的任务优先发给 cursor 或 codex(编码工作台),通用问答/写作发给 claude 或 chatgpt。发送后用 ai_app_read 读它的回复。注意 codex 里的任务是真实在改用户的项目代码,派任务前应确认用户意图明确。',
        parameters: {
          type: 'object',
          properties: {
            app: { type: 'string', enum: ['claude', 'cursor', 'chatgpt', 'codex'], description: '目标 AI 应用' },
            message: { type: 'string', description: '发给它的完整任务描述或问题' },
            new_chat: { type: 'boolean', description: '是否先新建对话(默认 false,续用当前对话)' },
          },
          required: ['app', 'message'],
        },
      },
    },
  },
  {
    key: 'ai_app_read',
    icon: 'eye',
    def: {
      type: 'function',
      function: {
        name: 'ai_app_read',
        description:
          '读取 Claude / Cursor / ChatGPT / Codex 应用当前的回复内容和任务状态(自动前置应用+截屏+视觉模型转录,带各应用的界面布局知识)。用于查看 ai_app_send 发出的任务进展;回复未生成完可稍后再读。',
        parameters: {
          type: 'object',
          properties: {
            app: { type: 'string', enum: ['claude', 'cursor', 'chatgpt', 'codex'], description: '要读取的 AI 应用' },
            question: { type: 'string', description: '额外想了解的点(可选),如 "它改了哪些文件"' },
          },
          required: ['app'],
        },
      },
    },
  },
  {
    key: 'open_mac_app',
    icon: 'monitor',
    def: {
      type: 'function',
      function: {
        name: 'open_mac_app',
        description:
          '打开(或前置)Mac 上的一个应用,如 "Claude"、"Cursor"、"ChatGPT"、"Antigravity"、"Finder"、"备忘录"。这是操控其他 app 的第一步。',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string', description: '应用名称' } },
          required: ['name'],
        },
      },
    },
  },
  {
    key: 'type_into_app',
    icon: 'monitor',
    def: {
      type: 'function',
      function: {
        name: 'type_into_app',
        description:
          '把一段文字输入到指定 Mac 应用的当前输入框(经剪贴板粘贴,支持中文),默认随后按回车发送。适合给 Claude、Cursor、ChatGPT 等 AI 应用派任务:先 open_mac_app,再用本工具把任务描述发进去,稍后用 look_at_screen 看它的回复。注意会覆盖剪贴板。',
        parameters: {
          type: 'object',
          properties: {
            app: { type: 'string', description: '目标应用名称,如 "Claude"' },
            text: { type: 'string', description: '要输入的文字' },
            submit: { type: 'boolean', description: '输入后是否按回车,默认 true' },
          },
          required: ['app', 'text'],
        },
      },
    },
  },
  {
    key: 'look_at_screen',
    icon: 'eye',
    def: {
      type: 'function',
      function: {
        name: 'look_at_screen',
        description:
          '截取 Mac 屏幕(主显示器)并用本地视觉模型观察,回答关于屏幕内容的问题:某个 app 显示了什么、AI 应用回复了什么、任务进展如何。指定 app 会先把它前置再截图。',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: '想了解屏幕上的什么,如 "Claude 回复了什么内容"' },
            app: { type: 'string', description: '先前置这个应用再截图(可选)' },
          },
          required: ['question'],
        },
      },
    },
  },
  {
    key: 'github_cli',
    icon: 'github',
    def: {
      type: 'function',
      function: {
        name: 'github_cli',
        description:
          '运行 GitHub CLI(gh)查询或操作 GitHub:PR、issue、repo、CI 状态等。args 是参数数组,如 ["pr","list","--repo","owner/name"]。',
        parameters: {
          type: 'object',
          properties: {
            args: { type: 'array', items: { type: 'string' }, description: 'gh 的参数数组' },
          },
          required: ['args'],
        },
      },
    },
  },
]

/** 供 UI 的代理列表(代理会话侧栏用) */
export const AI_APP_LIST = Object.entries(AI_APPS).map(([key, a]) => ({
  key,
  short: a.short,
  icon: a.icon,
  desc: a.desc,
  label: a.label,
}))

/** 直连管道(代理会话用,不经过模型工具调用) */
export { aiAppSend as aiAppSendDirect, aiAppRead as aiAppReadDirect }

/** Code 域(/code 操控台)直连读源,返回结构化数据而非模型字符串。 */
export {
  readCursorSessions as readCursorSessionsDirect,
  readCursorThread as readCursorThreadDirect,
  readCursorThreadDelta as readCursorThreadDeltaDirect,
  searchCursor as searchCursorDirect,
}

export function isNativeTool(name) {
  return isNative && NATIVE_DEFS.some((t) => t.key === name)
}

export async function executeNativeTool(name, args) {
  switch (name) {
    case 'delegate_task':
      return await delegateTask(args)
    case 'check_task':
      return checkTask(args)
    case 'cancel_task':
      return await cancelTask(args)
    case 'read_cursor_sessions': {
      const { items, state } = await readCursorSessions(args)
      if (state.status === 'unsupported') return state.message
      if (state.status === 'unavailable') return state.message
      if (!items.length) return '当前没有读到 Cursor 会话。'
      return items
        .slice(0, args?.limit || 40)
        .map(
          (s) =>
            `${s.id} · ${s.title}${s.archived ? '(已归档)' : ''} · ${new Date(s.updatedAt).toLocaleString('zh-CN')}`,
        )
        .join('\n')
    }
    case 'read_cursor_thread': {
      const thread = await readCursorThread(args)
      if (thread?.error) return `读取失败:${thread.error}`
      const textCount = thread.messages.filter((m) => m.text).length
      if (!textCount) return `会话「${thread.title}」暂无可读消息。`
      // 模型上下文有限:只喂最近的文本消息(工具步骤不进上下文),超长会话截尾。
      const { messages, dropped } = clampThreadMessages(thread.messages)
      const head = `会话「${thread.title}」[${thread.status}] · 共 ${textCount} 条${
        dropped ? `(仅展示最近 ${messages.length} 条)` : ''
      }`
      const body = messages
        .map((m) => `【${m.role === 'user' ? '我' : 'Agent'}】${m.text}`)
        .join('\n\n')
      return `${head}\n——\n${body}`
    }
    case 'search_cursor_sessions': {
      if (!isNative) return '此功能仅在 Mac app 内可用。'
      const items = await searchCursor(args)
      if (!items.length) return '没有匹配的 Cursor 会话。'
      return items
        .map(
          (s) =>
            `${s.id} · ${s.title}${s.archived ? '(已归档)' : ''} · ${new Date(s.updatedAt).toLocaleString('zh-CN')}`,
        )
        .join('\n')
    }
    case 'run_applescript':
      return await runAppleScript(args)
    case 'open_mac_app':
      return await openMacApp(args)
    case 'type_into_app':
      return await typeIntoApp(args)
    case 'look_at_screen':
      return await lookAtScreen(args)
    case 'ai_app_send':
      return await aiAppSend(args)
    case 'ai_app_read':
      return await aiAppRead(args)
    case 'github_cli':
      return await githubCli(args)
    default:
      return `未知原生工具:${name}`
  }
}
