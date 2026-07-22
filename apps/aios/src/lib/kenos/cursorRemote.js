/**
 * Code 域远程读源 —— 经局域网 cursor-bridge(apps/aios/agent/cursor-bridge.mjs)
 * 读/发 Mac 上的 Cursor。两条通道:
 *   - Kenos iOS 壳:window.webkit.messageHandlers.kenosCursorBridge 原生转发
 *     (https 页面 fetch http://LAN 会被 mixed-content 拦,必须借原生 URLSession)。
 *   - 普通浏览器(localhost dev):直接 fetch。
 * 返回形状与 native.js 的 *Direct 系列完全同形,页面用一个 adapter 切换。
 * 投影一律走 codeReadSource.core.js,与 Tauri 直读单一真源。
 */

import { mergeThreadDelta, projectCursorSessions, projectCodeSessionsResult } from './codeReadSource.core.js'
import { supabase, isSupabaseConfigured } from '$lib/supabase.js'
import { getCloudAccessToken } from '$lib/cloud.svelte.js'

const CFG_KEY = 'kenos.code.bridge'
const BRIDGE_TABLE = 'code_bridge_endpoints'
const BRIDGE_PORT = 5273

/* 变更戳:桥用 db+wal mtime 做戳;带上次戳请求,没变回 {unchanged}。
 * 换桥(不同 Mac)时必须清零,否则陈旧戳会让新桥的首帧被误判「无变化」而短路。 */
let sessionsStamp = 0
let threadStamp = 0
function resetStamps() {
  sessionsStamp = 0
  threadStamp = 0
}

/** @returns {{ host: string, token: string } | null} */
export function getBridgeConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw)
    return cfg?.host && cfg?.token ? { host: String(cfg.host), token: String(cfg.token) } : null
  } catch {
    return null
  }
}

export function setBridgeConfig({ host, token }) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ host: host.trim(), token: token.trim() }))
  resetStamps() // 换桥:清零陈旧变更戳,新桥首帧走全量。
}

export function clearBridgeConfig() {
  localStorage.removeItem(CFG_KEY)
  resetStamps()
}

/**
 * Kenos iOS 壳的原生 HTTP 桥是否可用(KenosNativeCapabilityBridge 的 httpFetchLocal)。
 * https 页面 fetch http://LAN 会被 mixed-content 拦,必须由原生 URLSession 代发。
 */
export function hasNativeHttpBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.__KENOS_NATIVE_BRIDGE__?.call === 'function' &&
    !!window.webkit?.messageHandlers?.kenosNative
  )
}

async function nativeBridgeFetch(url, { method = 'GET', headers = {}, body = null } = {}) {
  try {
    const res = await window.__KENOS_NATIVE_BRIDGE__.call('httpFetchLocal', {
      url,
      method,
      headers,
      body,
    })
    if (!res?.ok) throw new Error(res?.message || res?.code || '原生桥请求失败')
    return { status: Number(res.status) || 0, json: res.body ?? null }
  } catch (err) {
    throw new Error(String(err?.message || err?.code || err))
  }
}

async function browserFetch(url, { method = 'GET', headers = {}, body = null } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/**
 * 统一请求入口。host 形如 "kens-mac.local:5273"(不带协议)。
 * 凭证双通道:静态配对码(X-Kenos-Token,快路径)+ Supabase 登录态(Bearer,
 * 桥在线验;跟随会话过期/设备撤销,配对码轮转后仍可访问并重新发现)。
 * @returns {Promise<{ status: number, json: any }>}
 */
async function bridgeRequest(host, path, { method = 'GET', token = '', body = null } = {}) {
  const url = `http://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}${path}`
  const headers = {}
  if (token) headers['X-Kenos-Token'] = token
  try {
    const jwt = await getCloudAccessToken()
    if (jwt && !token) headers['Authorization'] = `Bearer ${jwt}`
  } catch {
    /* 未登录就只靠配对码 */
  }
  const doFetch = hasNativeHttpBridge() ? nativeBridgeFetch : browserFetch
  return doFetch(url, { method, headers, body })
}

/* —— 配对分发(经 Life OS 云,RLS owner-only;上云的是凭证,不是对话内容) —— */

/**
 * Mac(native 模式)把本机桥的配对信息上报云端,手机端零手输自动发现。
 * 桥没起 / 未登录都静默跳过。幂等,可反复调。
 */
export async function publishBridgeEndpoint() {
  if (!isSupabaseConfigured) return { skipped: true }
  try {
    const res = await fetch(`http://localhost:${BRIDGE_PORT}/pairing-info`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return { skipped: true }
    const info = await res.json()
    if (!info?.host || !info?.token) return { skipped: true }
    const { data } = await supabase.auth.getSession()
    const userId = data?.session?.user?.id
    if (!userId) return { skipped: true }
    const { error } = await supabase.from(BRIDGE_TABLE).upsert(
      {
        user_id: userId,
        hostname: String(info.hostname || info.host),
        host: String(info.host),
        token: String(info.token),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,hostname' },
    )
    return error ? { error: error.message } : { ok: true }
  } catch {
    return { skipped: true }
  }
}

/**
 * 远端(iOS/浏览器)从云端拉桥端点,逐个探活,通了就自动配对。
 * @returns {Promise<{ ok: boolean, host?: string }>}
 */
export async function discoverBridge() {
  if (!isSupabaseConfigured) return { ok: false }
  try {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess?.session) return { ok: false }
    const { data, error } = await supabase
      .from(BRIDGE_TABLE)
      .select('hostname,host,token,updated_at')
      .order('updated_at', { ascending: false })
    if (error || !data?.length) return { ok: false }
    for (const row of data) {
      const health = await bridgeHealth(row.host)
      if (health.ok) {
        setBridgeConfig({ host: row.host, token: row.token })
        return { ok: true, host: row.host }
      }
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

/** 探活(不需要 token)。@returns {Promise<{ ok: boolean, host?: string, error?: string }>} */
export async function bridgeHealth(host) {
  try {
    const { status, json } = await bridgeRequest(host, '/health')
    if (status === 200 && json?.ok) return { ok: true, host: json.host }
    return { ok: false, error: `探活失败(${status})` }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

/**
 * 会话列表(与 readCursorSessionsDirect 同形:{items, state};无变化时 {unchanged: true})。
 */
export async function remoteSessions({ limit = 60 } = {}) {
  const cfg = getBridgeConfig()
  if (!cfg) return projectCodeSessionsResult({ native: false })
  try {
    const { status, json } = await bridgeRequest(
      cfg.host,
      `/sessions?limit=${limit}&ifStamp=${sessionsStamp}`,
      { token: cfg.token },
    )
    if (status !== 200 || json?.error) {
      return projectCodeSessionsResult({ native: true, error: json?.error || `HTTP ${status}` })
    }
    if (json.unchanged) {
      sessionsStamp = json.stamp || sessionsStamp
      return { unchanged: true }
    }
    sessionsStamp = json.stamp || 0
    return projectCodeSessionsResult({ native: true, sessions: json.rows })
  } catch (err) {
    return projectCodeSessionsResult({ native: true, error: String(err?.message || err) })
  }
}

/** 全文搜索(与 searchCursorDirect 同形:会话摘要数组)。 */
export async function remoteSearch({ query, limit = 30 } = {}) {
  const cfg = getBridgeConfig()
  const q = String(query || '').trim()
  if (!cfg || !q) return []
  try {
    const { status, json } = await bridgeRequest(
      cfg.host,
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { token: cfg.token },
    )
    if (status !== 200 || json?.error) return []
    return projectCursorSessions(json.rows)
  } catch {
    return []
  }
}

/**
 * 增量读会话消息流(与 readCursorThreadDeltaDirect 同形:{thread, bubbleIds} | {error})。
 * @param {{ composerId?: string, prevThread?: any, seenBubbleIds?: string[] }} opts
 */
export async function remoteThreadDelta({ composerId, prevThread = null, seenBubbleIds = [] } = {}) {
  const cfg = getBridgeConfig()
  if (!cfg) return { error: '未连接 Mac。' }
  try {
    const { status, json } = await bridgeRequest(cfg.host, '/thread', {
      method: 'POST',
      token: cfg.token,
      body: {
        id: composerId,
        seenCount: seenBubbleIds.length,
        lastSeenId: seenBubbleIds.at(-1) || '',
        refetchId: prevThread?.messages?.at?.(-1)?.bubbleId || '',
        // 只有「已有基线的静默轮询」才带戳短路;首载/换会话必须全量。
        ifStamp: prevThread && seenBubbleIds.length ? threadStamp : 0,
      },
    })
    if (status !== 200 || json?.error) return { error: json?.error || `HTTP ${status}` }
    if (json.unchanged) {
      threadStamp = json.stamp || threadStamp
      return { unchanged: true }
    }
    threadStamp = json.stamp || 0
    return {
      thread: mergeThreadDelta(prevThread, json.composer, json.bubbles),
      bubbleIds: Array.isArray(json.headerIds) ? json.headerIds : [],
    }
  } catch (err) {
    return { error: String(err?.message || err) }
  }
}

/**
 * 长轮询变化信号:挂在桥上等库变化(≤waitMs),变了立即返回。
 * 只作信号用 —— 数据仍由 /sessions、/thread 拉(它们负责更新 stamps)。
 * @returns {Promise<{ changed?: boolean, error?: string }>}
 */
export async function remoteWaitChange({ waitMs = 10000 } = {}) {
  const cfg = getBridgeConfig()
  if (!cfg) return { error: '未连接 Mac。' }
  try {
    const { status, json } = await bridgeRequest(
      cfg.host,
      `/events?wait=${waitMs}&stateStamp=${threadStamp}&searchStamp=${sessionsStamp}`,
      { token: cfg.token },
    )
    if (status !== 200 || json?.error) return { error: json?.error || `HTTP ${status}` }
    return { changed: Boolean(json.changed) }
  } catch (err) {
    return { error: String(err?.message || err) }
  }
}

/** 发消息到 Mac 上的 Cursor。@returns {Promise<{ ok?: boolean, error?: string }>} */
export async function remoteSend({ message, newChat = false } = {}) {
  const cfg = getBridgeConfig()
  if (!cfg) return { error: '未连接 Mac。' }
  try {
    const { status, json } = await bridgeRequest(cfg.host, '/send', {
      method: 'POST',
      token: cfg.token,
      body: { message, newChat },
    })
    if (status !== 200 || json?.error) return { error: json?.error || `HTTP ${status}` }
    return { ok: true }
  } catch (err) {
    return { error: String(err?.message || err) }
  }
}
