/**
 * cursor-bridge 纯逻辑核心(无 I/O)。
 * 守护进程在 apps/aios/agent/cursor-bridge.mjs,经此模块决策;
 * 查询/投影契约与 apps/aios/src/lib/kenos/codeReadSource.core.js 同源:
 * 桥只回「原始行/原始 JSON」,投影一律在客户端做,保证单一真源。
 */

/** composerId 白名单:只允许 uuid 类字符,挡 SQL/GLOB 注入。 */
export function isSafeComposerId(id) {
  return typeof id === 'string' && /^[0-9a-zA-Z-]{8,64}$/.test(id)
}

/** bubbleId 同款白名单(允许更短)。 */
export function isSafeBubbleId(id) {
  return typeof id === 'string' && /^[0-9a-zA-Z-]{1,64}$/.test(id)
}

/**
 * 增量拉取决策:客户端报「我见过 seenCount 个 header,最后一个是 lastSeenId,
 * 想重拉 refetchId(流式尾)」;基线对得上 → 只拉新增+尾,不然全量。
 * @param {{ headers: Array<{bubbleId: string}>, seenCount?: number, lastSeenId?: string, refetchId?: string }} opts
 * @returns {{ mode: 'all' } | { mode: 'ids', ids: string[] }}
 */
export function pickBubbleFetch({ headers, seenCount = 0, lastSeenId = '', refetchId = '' }) {
  const n = Math.max(0, Math.min(Number(seenCount) || 0, headers.length))
  const baselineOk = n > 0 && headers[n - 1]?.bubbleId === lastSeenId
  if (!baselineOk) return { mode: 'all' }
  const ids = headers
    .slice(n)
    .map((h) => h.bubbleId)
    .filter(isSafeBubbleId)
  if (isSafeBubbleId(refetchId) && !ids.includes(refetchId)) ids.unshift(refetchId)
  // 缺口太大时 IN 列表不划算,退全量(前缀 GLOB 是 PK 范围扫)。
  if (ids.length > 40) return { mode: 'all' }
  return { mode: 'ids', ids }
}

/** AppleScript 字符串字面量转义。 */
const q = (s) => `"${String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

/**
 * 构建把消息注入 Cursor 的 AppleScript(与 native.js 的 aiAppSend cursor 分支同形:
 * 激活 → ⌘L 聚焦聊天面板 → 粘贴 → 回车)。注入前保存文本剪贴板、注入后恢复
 * (远程发消息不打劫 Mac 上正在用的剪贴板;非文本内容如图片无法恢复,保持现状)。
 * 纯函数,便于单测。
 * @param {string} message
 * @param {{ newChat?: boolean }} [opts]
 */
export function buildCursorSendScript(message, { newChat = false } = {}) {
  const lines = [
    'set savedClipboard to missing value',
    'try',
    '  set savedClipboard to (the clipboard as text)',
    'end try',
    `set the clipboard to ${q(message)}`,
    `tell application id ${q('com.todesktop.230313mzl4w4u92')} to activate`,
    'delay 1.0',
    'tell application "System Events"',
    // Cursor 没有独立的新对话快捷键面;⌘L 聚焦面板后 ⌘N 开新聊天。
    ...(newChat ? ['  keystroke "l" using command down', '  delay 0.6', '  keystroke "n" using command down', '  delay 0.6'] : ['  keystroke "l" using command down', '  delay 0.6']),
    '  keystroke "v" using command down',
    '  delay 0.4',
    '  key code 36',
    'end tell',
    // 粘贴已完成(回车都敲了),安全恢复原剪贴板。
    'if savedClipboard is not missing value then',
    '  delay 0.2',
    '  set the clipboard to savedClipboard',
    'end if',
  ]
  return lines.join('\n')
}

/**
 * 解析 `ioreg -n Root -d1 -a` 输出里的 IOConsoleLocked(macOS 锁屏态)。
 * 解析不到按未锁处理(fail-open:宁可试着发,也别把没锁的机器误报成锁)。
 * @param {string} ioregXml
 */
export function parseConsoleLocked(ioregXml) {
  const m = /<key>IOConsoleLocked<\/key>\s*<(true|false)\/>/.exec(String(ioregXml || ''))
  return m ? m[1] === 'true' : false
}

/** 桥允许的浏览器来源(iOS 原生桥走 URLSession,不经 CORS)。 */
const ORIGIN_ALLOW = [
  /^https:\/\/(www\.)?kenos\.space$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  // 生产 Mac Tauri 壳(打包资源)的页面 origin——不加会把配对上报 403 掉。
  /^tauri:\/\/localhost$/,
  /^http:\/\/tauri\.localhost$/,
]

/**
 * @param {string | undefined} origin
 * @returns {Record<string, string> | null} CORS 响应头;来源不允许返回 null。
 */
export function corsHeadersFor(origin) {
  if (!origin || !ORIGIN_ALLOW.some((re) => re.test(origin))) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Kenos-Token, Authorization',
    'Access-Control-Max-Age': '7200',
    Vary: 'Origin',
  }
}

/**
 * 从请求头里取 token(X-Kenos-Token 或 Bearer)。
 * @param {Record<string, string | string[] | undefined>} headers
 */
export function extractToken(headers) {
  const direct = headers['x-kenos-token']
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const auth = headers['authorization']
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

/** 凭证看起来是不是 JWT(三段式)——决定走静态配对码还是在线验 Supabase 会话。 */
export function looksLikeJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3 && token.length > 40
}

/**
 * 解 JWT payload 的 exp(毫秒);不验签——签名验证走 Supabase /auth/v1/user,
 * 这里只为验证结果的缓存 TTL 服务。解不出返回 0。
 */
export function jwtExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    const exp = Number(payload?.exp)
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0
  } catch {
    return 0
  }
}

/** 请求是否来自本机回环(/pairing-info 只对本机进程开放)。 */
export function isLoopbackAddress(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}
