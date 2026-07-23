// Finance OS Sync — 直连 Supabase 会话与传输层(FINC.DIRECT.1)。
// 扩展持有**自己的** Supabase 会话(popup 登录),refresh token 家族独立,
// 与网页端会话互不干扰(共享 refresh token 会触发 GoTrue 轮换重用检测,双双掉线)。
// 只用 fetch 走 GoTrue/PostgREST REST,不引 supabase-js。
// 队列编排在 background.js(directDrainTransactions);本文件只管:登录/登出/
// 刷新/取有效 token/调 finalize_extension_sync_v1。

/* global self */

const FOS_DIRECT_CONFIG = {
  // Life OS 共享 Supabase 项目(anon key 是设计公开的客户端凭据,RLS 兜底)。
  url: 'https://iueozzuctstwvzbcxcyh.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZW96enVjdHN0d3Z6YmN4Y3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTAwOTYsImV4cCI6MjA5NTcyNjA5Nn0.QCY16N0J7BO6-sbb53MCcQmIuW-ejiH4MHp-5pwbTQE',
}

const DIRECT_SESSION_KEY = 'fos_direct_session'
// token 剩余有效期低于此值就先刷新,避免请求半路过期。
const TOKEN_REFRESH_MARGIN_MS = 120_000

function authHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    apikey: FOS_DIRECT_CONFIG.anonKey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

async function loadDirectSession() {
  const obj = await chrome.storage.local.get(DIRECT_SESSION_KEY)
  const s = obj[DIRECT_SESSION_KEY]
  return s && typeof s === 'object' && s.refresh_token ? s : null
}

async function saveDirectSession(session) {
  await chrome.storage.local.set({ [DIRECT_SESSION_KEY]: session })
}

async function clearDirectSession() {
  await chrome.storage.local.remove(DIRECT_SESSION_KEY)
}

function sessionFromTokenResponse(body) {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    // GoTrue 返回 expires_in(秒);留出本地时钟余量。
    expires_at: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    user_id: body.user?.id ?? null,
    email: body.user?.email ?? null,
  }
}

/** popup 登录:email + password(与 Life OS 网页端同一套账号)。 */
async function directLogin(email, password) {
  const res = await fetch(
    `${FOS_DIRECT_CONFIG.url}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    },
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    const msg = body.error_description ?? body.msg ?? `登录失败(${res.status})`
    return { ok: false, error: msg }
  }
  const session = sessionFromTokenResponse(body)
  await saveDirectSession(session)
  return { ok: true, email: session.email }
}

async function directLogout() {
  const session = await loadDirectSession()
  if (session?.access_token) {
    // 尽力撤销;失败也照样清本地。
    await fetch(`${FOS_DIRECT_CONFIG.url}/auth/v1/logout`, {
      method: 'POST',
      headers: authHeaders(session.access_token),
    }).catch(() => {})
  }
  await clearDirectSession()
  return { ok: true }
}

/** 并发去重:同一时刻只跑一次刷新,避免 refresh token 旋转竞态。 */
let refreshInflight = null

async function refreshDirectSession(session) {
  if (refreshInflight) return refreshInflight
  refreshInflight = (async () => {
    try {
      const res = await fetch(
        `${FOS_DIRECT_CONFIG.url}/auth/v1/token?grant_type=refresh_token`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.access_token) {
        // refresh 失效(撤销/过期):清会话,popup 显示需要重新登录。
        await clearDirectSession()
        return null
      }
      const next = sessionFromTokenResponse(body)
      await saveDirectSession(next)
      return next
    } finally {
      refreshInflight = null
    }
  })()
  return refreshInflight
}

/** 取有效 access token;无会话/刷新失败返回 null(调用方回退 bridge)。 */
async function getDirectAccessToken() {
  let session = await loadDirectSession()
  if (!session) return null
  if (Date.now() >= session.expires_at - TOKEN_REFRESH_MARGIN_MS) {
    session = await refreshDirectSession(session)
    if (!session) return null
  }
  return session.access_token
}

async function directAuthStatus() {
  const session = await loadDirectSession()
  if (!session) return { signedIn: false }
  return {
    signedIn: true,
    email: session.email,
    tokenFresh: Date.now() < session.expires_at - TOKEN_REFRESH_MARGIN_MS,
  }
}

/**
 * 调 finalize_extension_sync_v1(与页面同一个幂等 RPC)。
 * 返回 { ok, result?, status?, permanent?, error? }:
 * - permanent=true 表示数据坏了(22P02 等),该进 DLQ 而不是重试。
 * - status 401 时调用方可在 getDirectAccessToken 重新拿 token 后重试一次。
 */
async function directFinalizeRpc(accessToken, payload) {
  let res
  try {
    res = await fetch(
      `${FOS_DIRECT_CONFIG.url}/rest/v1/rpc/finalize_extension_sync_v1`,
      {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({ payload }),
      },
    )
  } catch (e) {
    return { ok: false, error: `网络错误:${e?.message ?? e}` }
  }
  const body = await res.json().catch(() => null)
  if (res.ok) return { ok: true, result: body }
  const code = body?.code
  const permanent =
    code === '22P02' ||
    code === '22007' ||
    code === '22008' ||
    // envelope 同 id 不同 hash:重放不可能成功,属数据级冲突
    /payload mismatch/i.test(body?.message ?? '')
  return {
    ok: false,
    status: res.status,
    permanent,
    error: body?.message ?? `RPC 失败(${res.status})`,
  }
}

self.FOS_DIRECT = {
  directLogin,
  directLogout,
  directAuthStatus,
  getDirectAccessToken,
  directFinalizeRpc,
}
