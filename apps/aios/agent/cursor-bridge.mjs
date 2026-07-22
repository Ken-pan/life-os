#!/usr/bin/env node
/**
 * Kenos cursor-bridge — 局域网桥:让 iPhone(Kenos iOS 壳)远程读/发本机 Cursor。
 *
 * 只读 Cursor 本地 SQLite(mode=ro 打开,读 WAL 不锁不写),发送经 osascript ⌘L 注入。
 * 数据只在局域网内流动,绝不上云;所有数据端点都要 token(~/.kenos/cursor-bridge.token,
 * 首次启动自动生成并打印,填进 iOS 端「连接 Mac」卡即可)。
 *
 * 启动:node apps/aios/agent/cursor-bridge.mjs   (或 npm run agent:cursor-bridge)
 * 端口:5273(KENOS_CURSOR_BRIDGE_PORT 可覆盖),绑 0.0.0.0。
 * mDNS:自动用系统 dns-sd 广播 _kenos-cursor._tcp,便于 iOS 发现(失败不影响服务)。
 */

import http from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import {
  buildCursorSendScript,
  corsHeadersFor,
  extractToken,
  isLoopbackAddress,
  isSafeBubbleId,
  isSafeComposerId,
  jwtExpiryMs,
  looksLikeJwt,
  parseConsoleLocked,
  pickBubbleFetch,
} from '../server/cursorBridge.core.mjs'
import { LIFE_OS_PERSONAL_OWNER_EMAIL } from '../../../packages/sync/src/constants.js'
import { extractComposerMeta, extractToolSummary } from '../src/lib/kenos/codeReadSource.core.js'

const execFileAsync = promisify(execFile)

const PORT = Number(process.env.KENOS_CURSOR_BRIDGE_PORT) || 5273
const VERSION = '1.0.0'
const CURSOR_HOME = join(homedir(), 'Library/Application Support/Cursor/User/globalStorage')
const STATE_DB = join(CURSOR_HOME, 'state.vscdb')
const SEARCH_DB = join(CURSOR_HOME, 'conversation-search.db')

/* —— token —— */
const TOKEN_DIR = join(homedir(), '.kenos')
const TOKEN_FILE = join(TOKEN_DIR, 'cursor-bridge.token')
function loadToken() {
  mkdirSync(TOKEN_DIR, { recursive: true })
  if (!existsSync(TOKEN_FILE)) {
    writeFileSync(TOKEN_FILE, randomBytes(24).toString('hex'))
    chmodSync(TOKEN_FILE, 0o600)
  }
  return readFileSync(TOKEN_FILE, 'utf8').trim()
}
const TOKEN = loadToken()

/* —— Supabase 会话验证(Owner Device Lock 信任模型的延伸) ——
 * 项目 JWT 是 HS256(对称),本机不能离线验签(secret 不可下发),
 * 走在线验:/auth/v1/user 有效 + email = owner 即放行;按 JWT exp 缓存。
 * 公开常量与 packages/sync/src/supabaseClient.js 同源。 */
const SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL'
const jwtCache = new Map()
async function verifySupabaseJwt(jwt) {
  const now = Date.now()
  const hit = jwtCache.get(jwt)
  if (hit && hit.until > now) return hit.ok
  if (jwtCache.size > 100) jwtCache.clear()
  let ok = false
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const user = await res.json()
      ok = String(user?.email || '').toLowerCase() === LIFE_OS_PERSONAL_OWNER_EMAIL.toLowerCase()
    }
  } catch {
    ok = false
  }
  const exp = jwtExpiryMs(jwt)
  // 成功缓存到 exp(至多 10 分钟);失败短缓存 30s 防打爆 Supabase。
  const until = ok ? Math.min(exp || now + 600_000, now + 600_000) : now + 30_000
  jwtCache.set(jwt, { ok, until })
  return ok
}

/** 静态配对码(快路径)或 Supabase 会话 JWT(在线验)。 */
async function isAuthorized(headers) {
  const presented = extractToken(headers)
  if (!presented) return false
  if (presented === TOKEN) return true
  if (looksLikeJwt(presented)) return verifySupabaseJwt(presented)
  return false
}

/* —— sqlite:node:sqlite 常驻只读连接(mode=ro,正确读 WAL)。
 * 实测 0.01ms/查询 vs CLI spawn ~25ms;WAL 模式下读不阻塞 Cursor 写。
 * 每条语句是独立隐式事务,读完即释放 read mark,不 pin WAL。
 * 出错(库轮转/损坏)时销毁连接,下次请求重建。 —— */
const dbPool = new Map()
function getDb(dbPath) {
  let db = dbPool.get(dbPath)
  if (!db) {
    db = new DatabaseSync(`file:${encodeURI(dbPath)}?mode=ro`, { readOnly: true })
    dbPool.set(dbPath, db)
  }
  return db
}
function dropDb(dbPath) {
  try {
    dbPool.get(dbPath)?.close()
  } catch {
    /* 已坏 */
  }
  dbPool.delete(dbPath)
}
async function sqliteJson(dbPath, query) {
  try {
    return { rows: getDb(dbPath).prepare(query).all() }
  } catch (err) {
    dropDb(dbPath)
    return { error: String(err?.message || err).trim() }
  }
}
const sq = (s) => `'${String(s).replaceAll("'", "''")}'`

/**
 * 变更戳:db 主文件 + WAL 的 mtime 最大值。空闲期一次 stat(微秒级)即可断定
 * 「自上个戳以来没有任何写入」,短路掉查询/解析/传输(实测 Cursor 空闲时纹丝不动)。
 */
function dbStamp(dbPath) {
  let m = 0
  for (const p of [dbPath, `${dbPath}-wal`]) {
    try {
      const t = statSync(p).mtimeMs
      if (t > m) m = t
    } catch {
      /* wal 可能不存在 */
    }
  }
  return m
}

/* —— 端点实现(桥只回原始行,投影在客户端,契约单一真源) —— */

async function handleSessions(url) {
  const stamp = dbStamp(SEARCH_DB)
  const ifStamp = Number(url.searchParams.get('ifStamp')) || 0
  if (ifStamp && ifStamp === stamp) return { unchanged: true, stamp }
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 60, 1), 200)
  const res = await sqliteJson(
    SEARCH_DB,
    `SELECT id, title, updated_at, is_archived, source FROM conversations ORDER BY updated_at DESC LIMIT ${limit}`,
  )
  return res.error ? res : { ...res, stamp }
}

async function handleSearch(url) {
  const q0 = String(url.searchParams.get('q') || '').trim()
  if (!q0) return { rows: [] }
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 100)
  const phrase = `"${q0.replaceAll('"', '""')}"`
  return sqliteJson(
    SEARCH_DB,
    `SELECT c.id AS id, c.title AS title, c.updated_at AS updated_at, c.is_archived AS is_archived, c.source AS source
     FROM conversation_fts f JOIN conversations c ON c.fts_rowid = f.rowid
     WHERE conversation_fts MATCH ${sq(phrase)} ORDER BY c.updated_at DESC LIMIT ${limit}`,
  )
}

/**
 * POST /thread {id, seenCount?, lastSeenId?, refetchId?}
 * → {composer, bubbles:{id:json}, headerIds:[...]}(增量:基线对上只回新增+尾)
 */
async function handleThread(body) {
  const id = body?.id
  if (!isSafeComposerId(id)) return { error: 'composerId 非法', status: 400 }
  const stamp = dbStamp(STATE_DB)
  const ifStamp = Number(body?.ifStamp) || 0
  if (ifStamp && ifStamp === stamp) return { unchanged: true, stamp }
  const head = await sqliteJson(STATE_DB, `SELECT value FROM cursorDiskKV WHERE key=${sq(`composerData:${id}`)}`)
  if (head.error) return { error: head.error }
  if (!head.rows.length) return { error: '找不到该会话', status: 404 }
  let composer
  try {
    composer = JSON.parse(head.rows[0].value)
  } catch {
    return { error: '会话数据解析失败' }
  }
  const rawHeaders = Array.isArray(composer.fullConversationHeadersOnly)
    ? composer.fullConversationHeadersOnly
    : Object.keys(composer.conversationMap || {}).map((bubbleId) => ({ bubbleId }))
  const headers = rawHeaders.filter((h) => isSafeBubbleId(h?.bubbleId))
  const pick = pickBubbleFetch({
    headers,
    seenCount: body?.seenCount,
    lastSeenId: body?.lastSeenId,
    refetchId: body?.refetchId,
  })
  /** @type {Record<string, any>} */
  const bubbles = {}
  if (headers.length) {
    const query =
      pick.mode === 'all'
        ? `SELECT key, value FROM cursorDiskKV WHERE key GLOB 'bubbleId:${id}:*'`
        : pick.ids.length
          ? `SELECT key, value FROM cursorDiskKV WHERE key IN (${pick.ids.map((b) => sq(`bubbleId:${id}:${b}`)).join(',')})`
          : null
    if (query) {
      const res = await sqliteJson(STATE_DB, query)
      if (res.error) return { error: res.error }
      for (const row of res.rows) {
        const bid = String(row.key).split(':').pop()
        try {
          const raw = JSON.parse(row.value)
          // 精简行:只留渲染需要的字段。原始 bubble 99.9% 是工具调用元数据
          // (实测 575 气泡 7.83MB 里有效 text 仅 10KB),全量传给手机纯属浪费。
          // tool/arg/failed = agent 工作步骤摘要(rawArgs 全文不外传)。
          bubbles[bid] = { type: raw.type, text: raw.text, ...(extractToolSummary(raw.toolFormerData) || {}) }
        } catch {
          /* 跳过坏气泡 */
        }
      }
    }
  }
  // composer 同样精简(原始 250KB;客户端只消费头列表与元信息)。
  const slimComposer = {
    composerId: composer.composerId,
    id: composer.id,
    name: composer.name,
    status: composer.status,
    createdAt: composer.createdAt,
    // 模型/模式/上下文用量等只读元信息(桥侧提取,原始 modelConfig 不外传)。
    meta: extractComposerMeta(composer),
    fullConversationHeadersOnly: Array.isArray(composer.fullConversationHeadersOnly)
      ? composer.fullConversationHeadersOnly.map((h) => ({
          bubbleId: h?.bubbleId,
          type: h?.type,
          createdAt: h?.createdAt,
        }))
      : undefined,
    conversationMap: composer.fullConversationHeadersOnly
      ? undefined
      : composer.conversationMap &&
        Object.fromEntries(
          Object.entries(composer.conversationMap).map(([k, v]) => [k, { type: v?.type }]),
        ),
  }
  return { composer: slimComposer, bubbles, headerIds: headers.map((h) => h.bubbleId), stamp }
}

/**
 * GET /events — 长轮询变化信号:挂住请求直到任一库的变更戳变化或超时。
 * 服务端 250ms 一次 stat(微秒级),客户端从 1.5s 定时轮询变成变化驱动:
 * 延迟 1.5s → ~0.25s,空闲期请求数降 ~90%。wait 上限 12s(iOS 原生桥 15s 超时)。
 */
async function handleEvents(url) {
  const wait = Math.min(Math.max(Number(url.searchParams.get('wait')) || 10000, 1000), 12000)
  const stateStamp = Number(url.searchParams.get('stateStamp')) || 0
  const searchStamp = Number(url.searchParams.get('searchStamp')) || 0
  const deadline = Date.now() + wait
  for (;;) {
    const s1 = dbStamp(STATE_DB)
    const s2 = dbStamp(SEARCH_DB)
    const changed = s1 !== stateStamp || s2 !== searchStamp
    if (changed || Date.now() >= deadline) {
      return { changed, stateStamp: s1, searchStamp: s2 }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** 注入前置检查:锁屏时键击会打进登录框(危险且必失败),Cursor 没跑注入无意义。 */
async function sendPreflight() {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/ioreg', ['-n', 'Root', '-d1', '-a'], {
      timeout: 3000,
    })
    if (parseConsoleLocked(stdout)) {
      return 'Mac 已锁屏 —— 请先解锁 Mac 再发送(锁屏下无法把消息注入 Cursor)。'
    }
  } catch {
    /* 检测失败按未锁处理(fail-open) */
  }
  try {
    await execFileAsync('/usr/bin/pgrep', ['-x', 'Cursor'], { timeout: 3000 })
  } catch {
    return 'Cursor 没有在 Mac 上运行 —— 请先打开 Cursor。'
  }
  return null
}

async function handleSend(body, url) {
  const message = String(body?.message || '').trim()
  if (!message) return { error: 'message 为空', status: 400 }
  if (message.length > 20000) return { error: 'message 过长', status: 400 }
  const script = buildCursorSendScript(message, { newChat: Boolean(body?.newChat) })
  if (url.searchParams.get('dry') === '1') return { ok: true, dry: true }
  const blocked = await sendPreflight()
  if (blocked) return { error: blocked, status: 409 }
  try {
    await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 30_000 })
    return { ok: true }
  } catch (err) {
    return {
      error: `注入失败:${String(err?.stderr || err?.message || err).trim()}。请确认 Mac 未锁屏、Cursor 已打开,且本进程的宿主(终端/launchd)已授权「辅助功能」。`,
    }
  }
}

/* —— HTTP 壳 —— */

function send(res, status, data, cors) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...(cors || {}),
  })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (req, res) => {
  const cors = corsHeadersFor(req.headers.origin)
  if (req.headers.origin && !cors) return send(res, 403, { error: 'origin not allowed' })
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors || {})
    return res.end()
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/health') {
    return send(res, 200, { ok: true, service: 'kenos-cursor-bridge', version: VERSION, host: hostname() }, cors)
  }
  // 本机进程专用:Mac 上的 aios app 读取配对信息后用登录态上报云端(配对分发)。
  // 只对回环地址开放 —— 本机同用户进程本就能读 ~/.kenos 下的 token 文件,不降低安全性。
  if (url.pathname === '/pairing-info') {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      return send(res, 403, { error: 'loopback only' }, cors)
    }
    return send(
      res,
      200,
      { hostname: hostname(), host: `${hostname()}:${PORT}`, port: PORT, token: TOKEN },
      cors,
    )
  }
  if (!(await isAuthorized(req.headers))) {
    return send(res, 401, { error: '配对码或登录态无效' }, cors)
  }

  try {
    if (req.method === 'GET' && url.pathname === '/events') {
      const r = await handleEvents(url)
      return send(res, 200, r, cors)
    }
    if (req.method === 'GET' && url.pathname === '/sessions') {
      const r = await handleSessions(url)
      return send(res, r.error ? 500 : 200, r, cors)
    }
    if (req.method === 'GET' && url.pathname === '/search') {
      const r = await handleSearch(url)
      return send(res, r.error ? 500 : 200, r, cors)
    }
    if (req.method === 'POST' && url.pathname === '/thread') {
      const r = await handleThread(await readBody(req))
      return send(res, r.status || (r.error ? 500 : 200), r, cors)
    }
    if (req.method === 'POST' && url.pathname === '/send') {
      const r = await handleSend(await readBody(req), url)
      return send(res, r.status || (r.error ? 500 : 200), r, cors)
    }
    return send(res, 404, { error: 'not found' }, cors)
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) }, cors)
  }
})

// 双栈监听(IPv4 + IPv6):localhost 可能先解析到 ::1,单绑 0.0.0.0 会逼客户端走回退。
server.listen(PORT, '::', () => {
  console.log(`kenos-cursor-bridge v${VERSION}`)
  console.log(`  listening  http://0.0.0.0:${PORT}  (LAN: http://${hostname()}:${PORT})`)
  console.log(`  token      ${TOKEN}`)
  console.log(`  token file ${TOKEN_FILE}`)
})

/* —— mDNS 广播(可选,失败不影响) —— */
try {
  const ad = spawn('dns-sd', ['-R', 'Kenos Cursor Bridge', '_kenos-cursor._tcp', '.', String(PORT)], {
    stdio: 'ignore',
  })
  ad.on('error', () => {})
  process.on('exit', () => ad.kill())
} catch {
  /* dns-sd 不可用就算了 */
}
