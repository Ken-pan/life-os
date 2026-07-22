import { browser } from '$app/environment'
import {
  mapAuthErrorMessage,
  LIFE_OS_PERSONAL_OWNER_EMAIL,
  ensureLifeOsSsoReady,
} from '@life-os/sync'
import { t } from '$lib/i18n/index.js'
import {
  S,
  applyCloudSettings,
  applyDeviceOnlySettings,
} from '$lib/state.svelte.js'
import { supabase as sb, isSupabaseConfigured } from '$lib/supabase.js'
import {
  C,
  clearConversationClientState,
  persist as persistChats,
} from '$lib/chat.svelte.js'
import {
  M,
  hydrateMemoryFromLocalStorage,
  mergeRemoteMemories,
  resetMemoryClientState,
} from '$lib/memory.svelte.js'
import { onDataChanged } from '$lib/syncBus.js'
import {
  planConversationSync,
  planMemorySync,
  planSettingsLww,
} from '$lib/cloud-sync.core.js'
import { isConversationPersistenceBlocked } from '$lib/kenos/conversationPersist.core.js'
import { clearAssistantContext } from '$lib/kenos/assistantContext.svelte.js'
import {
  clearUserScopedClientStorage,
  stripUserFieldsFromSettings,
} from '$lib/kenos/clientSessionCleanup.core.js'
import { resetFocusStore } from '$lib/kenos/focusStore.svelte.js'
import { clearSpaceSwitcherState } from '$lib/kenos/spaceSwitcher.core.js'
import { CLOUD_BUILD } from '$lib/env.js'
/**
 * 云端同步:Life OS 统一 Supabase 账户,登录即用,零配置。
 * - 登录:邮箱 + 密码(与 home/portal/music 同一账户体系,共享登录态);
 *   注册走 Portal/Fitness,AIOS 不开注册。刻意不接 app_memberships 门禁——
 *   AIOS 是本地优先的个人 app,未登录一切照常,登录只是加同步。
 * - 合并:按客户端毫秒时间戳 LWW;删除靠云端墓碑 + 本地快照对账
 *   (上次同步时有、现在本地没有 = 本地删了 → 推墓碑;
 *    云端有、快照里没有 = 别的设备新增 → 拉下来)
 * - 会话 payload 上云前瘦身:图片 dataURL 不上传(体积/隐私),文本全保留
 * - 表结构与 RLS 见 supabase/migrations/*_aios_cloud_sync.sql(aios schema)
 */

const SNAP_KEY = 'aios_cloud_snapshot_v1'
const PUSH_DEBOUNCE_MS = 8000
const PULL_CHUNK = 50

/** @type {string | null} */
let lastAuthUserId = null

export const CLOUD = $state({
  configured: isSupabaseConfigured,
  /** 登录态是否已从 Supabase 恢复完毕(避免刷新瞬间误判未登录、闪现登录门禁) */
  ready: false,
  /** @type {{ id: string, email: string } | null} */
  user: null,
  /** 登录/登出请求进行中 */
  busy: false,
  syncing: false,
  /** @type {number} 上次成功同步的时间戳(ms),0 = 从未 */
  lastSyncAt: 0,
  error: '',
})

/**
 * Clear user-scoped client state (memory/chats/focus/context/caches).
 * Fail-closed: in-memory stores cleared even if storage throws.
 */
export function clearUserScopedSessionState() {
  clearConversationClientState()
  clearAssistantContext()
  resetMemoryClientState()
  try {
    resetFocusStore()
  } catch {
    /* ignore */
  }
  try {
    clearSpaceSwitcherState(browser ? localStorage : undefined)
  } catch {
    /* ignore */
  }
  // Dynamic import avoids static cycle with spaceSwitcher.svelte.js (which reads CLOUD).
  if (browser) {
    void import('$lib/kenos/spaceSwitcher.svelte.js')
      .then((m) => m.clearSpaceSwitcherOnLogout())
      .catch(() => {})
  }
  const result = clearUserScopedClientStorage({
    localStorage: browser ? localStorage : undefined,
    sessionStorage: browser ? sessionStorage : undefined,
    stripAiososUserFields: stripUserFieldsFromSettings,
  })
  try {
    applyDeviceOnlySettings(stripUserFieldsFromSettings(S.settings))
  } catch {
    /* ignore */
  }
  return result
}

/**
 * 云端版访问门禁:AIOS 是个人工具(含私人对话/记忆/画像),云端只对本人开放。
 * @returns {boolean} 当前登录用户是否是 Life OS 个人所有者
 */
export function isCloudAuthorized() {
  return (
    !!CLOUD.user &&
    CLOUD.user.email.toLowerCase() ===
      LIFE_OS_PERSONAL_OWNER_EMAIL.toLowerCase()
  )
}

let pushTimer = null
let pendingResync = false
let unsubscribeBus = null

/* —— 快照:上次同步成功时的本地数据形状,用于识别本地删除 —— */

function loadSnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAP_KEY) ?? 'null')
    if (parsed && typeof parsed === 'object') {
      return { convs: parsed.convs ?? {}, mems: parsed.mems ?? [] }
    }
  } catch {
    /* 损坏则当作首次同步 */
  }
  return { convs: {}, mems: [] }
}

function saveSnapshot(snap) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap))
  } catch {
    /* 存不下就下次全量对账,不致错 */
  }
}

/* —— 会话与登录 —— */

/**
 * 登录后自动并入 Life OS MCP 四站 + 刷新 Bearer。
 * 失败静默：MCP 是增强能力，不应拖垮云同步启动。
 * @param {string | undefined | null} accessToken
 */
async function syncLifeOsMcpFleet(accessToken) {
  const token = String(accessToken || '').trim()
  if (!token) return
  try {
    const { loadServers, saveServers, ensureLifeOsMcpFleet } =
      await import('$lib/mcp.js')
    const { servers, added, updated } = ensureLifeOsMcpFleet(
      loadServers(),
      token,
    )
    if (added.length > 0 || updated > 0) saveServers(servers)
  } catch {
    /* MCP 配置损坏或 localStorage 不可用时忽略 */
  }
}

/** app 启动时调用:恢复共享登录态、订阅变更、拉一次云端 */
/**
 * Auth restore lands after route mounts fire their first control-center read
 * (which fails closed as permission_denied). Force one refresh so cold boot
 * doesn't sit on the signed-out projection until the 30s throttle expires.
 * Dynamic import avoids a cloud ↔ readSources module cycle.
 */
function refreshReadProjectionsAfterAuth() {
  console.info('[kenos-auth] owner session restored — refreshing read projections')
  void import('$lib/kenos/controlCenter.svelte.js')
    .then((m) => m.refreshControlCenter({ force: true }))
    .catch(() => {})
}

export async function initCloud() {
  if (!browser || !CLOUD.configured) {
    CLOUD.ready = true
    if (!CLOUD_BUILD) hydrateMemoryFromLocalStorage()
    return
  }
  sb.auth.onAuthStateChange((event, session) => {
    const u = session?.user
    const nextId = u?.id ?? null
    const prevId = lastAuthUserId
    // Sign-out or account switch: drop prior user local state fail-closed.
    if (
      event === 'SIGNED_OUT' ||
      (prevId && !nextId) ||
      (prevId && nextId && prevId !== nextId)
    ) {
      clearUserScopedSessionState()
    }
    lastAuthUserId = nextId
    CLOUD.user = u ? { id: u.id, email: u.email ?? '' } : null
    // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED：补齐舰队 + 刷新 JWT
    void syncLifeOsMcpFleet(session?.access_token)
    if (nextId && isCloudAuthorized()) {
      hydrateMemoryFromLocalStorage()
      if (!prevId || prevId !== nextId) refreshReadProjectionsAfterAuth()
    }
  })
  // Wait for Cookie / iOS Keychain vault restore before first getSession.
  await ensureLifeOsSsoReady(sb)
  const { data } = await sb.auth.getSession()
  const u = data?.session?.user
  lastAuthUserId = u?.id ?? null
  CLOUD.user = u ? { id: u.id, email: u.email ?? '' } : null
  CLOUD.ready = true
  if (!CLOUD.user && CLOUD_BUILD) {
    // Auth wall: ensure prior user memory never sits in memory/storage before login.
    clearUserScopedSessionState()
  } else if (CLOUD.user && isCloudAuthorized()) {
    hydrateMemoryFromLocalStorage()
    refreshReadProjectionsAfterAuth()
  }
  await syncLifeOsMcpFleet(data?.session?.access_token)
  if (unsubscribeBus) unsubscribeBus()
  unsubscribeBus = onDataChanged(schedulePush)
  if (CLOUD.user) syncNow()
}

/** 当前 Life OS access_token（给 MCP Bearer 用）；未登录返回空串。 */
export async function getCloudAccessToken() {
  if (!browser || !CLOUD.configured) return ''
  try {
    const { data } = await sb.auth.getSession()
    return data?.session?.access_token || ''
  } catch {
    return ''
  }
}

function schedulePush() {
  if (!CLOUD.user) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => syncNow(), PUSH_DEBOUNCE_MS)
}

export async function signInCloud(email, password) {
  CLOUD.busy = true
  CLOUD.error = ''
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (isCloudAuthorized()) {
      hydrateMemoryFromLocalStorage()
      try {
        const { seedDefaultMemories, backfillVectors } =
          await import('$lib/memory.svelte.js')
        seedDefaultMemories()
        void backfillVectors()
      } catch {
        /* ignore */
      }
    }
    // 登录即同步:把这台设备的数据和云端汇合
    syncNow()
    return true
  } catch (err) {
    CLOUD.error = mapAuthErrorMessage(err, {
      invalidCredentials: t('auth.errInvalidCredentials'),
      emailNotConfirmed: t('auth.errEmailNotConfirmed'),
      alreadyRegistered: t('auth.errAlreadyRegistered'),
      passwordShort: t('auth.errPasswordShort'),
      invalidEmail: t('auth.errInvalidEmail'),
      rateLimit: t('auth.errRateLimit'),
      network: t('auth.errNetwork'),
      generic: t('auth.errGeneric'),
    })
    return false
  } finally {
    CLOUD.busy = false
  }
}

export async function signOutCloud() {
  CLOUD.busy = true
  try {
    await sb.auth.signOut()
  } finally {
    CLOUD.busy = false
    CLOUD.user = null
    lastAuthUserId = null
    // 快照属于这个账号的同步历史,登出即作废
    try {
      localStorage.removeItem(SNAP_KEY)
    } catch {
      /* 忽略 */
    }
    clearUserScopedSessionState()
  }
}

/* —— payload 瘦身:图片 dataURL 不上云 —— */

function slimMessage(m) {
  return {
    ...m,
    images: undefined,
    toolCalls: m.toolCalls?.map((tc) => ({ ...tc, images: undefined })),
    branches: m.branches?.map((tail) => tail.map(slimMessage)),
  }
}

function slimConversation(c) {
  return { ...c, messages: c.messages.map(slimMessage) }
}

/* —— 同步主流程 —— */

export async function syncNow() {
  if (!CLOUD.configured || !CLOUD.user || CLOUD.syncing) {
    pendingResync = CLOUD.syncing
    return
  }
  // 生成中不动会话数组,稍后重试
  if (C.streaming) {
    schedulePush()
    return
  }
  CLOUD.syncing = true
  CLOUD.error = ''
  try {
    const snap = loadSnapshot()
    await syncUserState()
    await syncConversations(snap)
    await syncMemories(snap)
    saveSnapshot(snap)
    CLOUD.lastSyncAt = Date.now()
  } catch (err) {
    CLOUD.error = String(err?.message ?? err)
  } finally {
    CLOUD.syncing = false
    if (pendingResync) {
      pendingResync = false
      schedulePush()
    }
  }
}

/**
 * 设置 + 用户画像单例同步(整包 LWW)。
 * 时间戳只在用户主动改设置时 bump(state.save),新设备默认设置 updatedAt=0,
 * 云端有真实时间戳时云端赢,不会用默认覆盖云端画像。
 */
async function syncUserState() {
  const localAt = Number(S.settings.settingsUpdatedAt ?? 0)
  const { data: remote, error } = await sb
    .from('user_state')
    .select('settings, updated_at')
    .maybeSingle()
  if (error) throw error

  const remoteAt = Number(remote?.updated_at ?? 0)
  const action = planSettingsLww(localAt, remoteAt, !!remote)
  if (action === 'pull') {
    applyCloudSettings(remote.settings ?? {}, remoteAt)
  } else if (action === 'push') {
    if (isConversationPersistenceBlocked()) return
    const { error: e } = await sb
      .from('user_state')
      .upsert(
        { settings: $state.snapshot(S.settings), updated_at: localAt },
        { onConflict: 'user_id' },
      )
    if (e) throw e
  }
}

async function syncConversations(snap) {
  const { data: remote, error } = await sb
    .from('conversations')
    .select('id, updated_at, deleted')
  if (error) throw error

  const { toPush, toTombstone, toPull, dropLocal } = planConversationSync(
    C.conversations,
    remote,
    snap.convs,
  )

  // Read-only: pull is ok; never upsert / tombstone conversations.
  if (!isConversationPersistenceBlocked() && toPush.length) {
    const rows = toPush.map((c) => ({
      id: c.id,
      updated_at: c.updatedAt,
      deleted: false,
      payload: slimConversation($state.snapshot(c)),
    }))
    const { error: e } = await sb
      .from('conversations')
      .upsert(rows, { onConflict: 'user_id,id' })
    if (e) throw e
  }
  if (!isConversationPersistenceBlocked() && toTombstone.length) {
    const rows = toTombstone.map((id) => ({
      id,
      updated_at: Date.now(),
      deleted: true,
      payload: null,
    }))
    const { error: e } = await sb
      .from('conversations')
      .upsert(rows, { onConflict: 'user_id,id' })
    if (e) throw e
  }

  const pulled = []
  for (let i = 0; i < toPull.length; i += PULL_CHUNK) {
    const { data, error: e } = await sb
      .from('conversations')
      .select('id, updated_at, payload')
      .in('id', toPull.slice(i, i + PULL_CHUNK))
    if (e) throw e
    pulled.push(...data)
  }

  if (pulled.length || dropLocal.size) {
    let list = C.conversations.filter((c) => !dropLocal.has(c.id))
    for (const row of pulled) {
      if (!row.payload) continue
      list = list.filter((c) => c.id !== row.id)
      list.push(row.payload)
    }
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    C.conversations = list
    if (C.activeId && !list.some((c) => c.id === C.activeId)) C.activeId = null
    persistChats()
  }

  snap.convs = Object.fromEntries(
    C.conversations.map((c) => [c.id, c.updatedAt]),
  )
}

async function syncMemories(snap) {
  const { data: remote, error } = await sb
    .from('memories')
    .select('id, text, created_at, deleted')
  if (error) throw error

  const { toPush, toTombstone, toAdd, dropLocal } = planMemorySync(
    M.items,
    remote,
    snap.mems,
  )

  if (!isConversationPersistenceBlocked() && toPush.length) {
    const rows = toPush.map((m) => ({
      id: m.id,
      text: m.text,
      created_at: m.createdAt,
      deleted: false,
    }))
    const { error: e } = await sb
      .from('memories')
      .upsert(rows, { onConflict: 'user_id,id' })
    if (e) throw e
  }
  if (!isConversationPersistenceBlocked() && toTombstone.length) {
    const rows = toTombstone.map((id) => ({ id, deleted: true }))
    const { error: e } = await sb
      .from('memories')
      .upsert(rows, { onConflict: 'user_id,id' })
    if (e) throw e
  }
  if (toAdd.length || dropLocal.size) {
    mergeRemoteMemories(toAdd, dropLocal)
  }

  snap.mems = M.items.map((m) => m.id)
}

/* —— 按需图片同步(私有 Storage bucket `aios-images`)——
   生成图默认只在本机(内联 dataURL)。用户在查看器主动「上传到云」时才存云,
   路径记在工具调用的 imagePaths[](随对话 payload 同步);别的设备本地无图但
   有 path 时,imageUrlFromPath 取一个带签名的临时 URL 懒加载显示。 */

const BUCKET = 'aios-images'
/** @type {Map<string, { url: string, exp: number }>} 签名 URL 缓存(按 path) */
const signedUrlCache = new Map()

/** dataURL(WebP)→ Blob,供上传 */
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return res.blob()
}

/**
 * 把某条工具调用里第 index 张生成图上传到云端,路径写回 tc.imagePaths[index]。
 * @returns {Promise<string>} 云端对象路径
 */
export async function uploadConversationImage(
  conversationId,
  tcId,
  index,
  dataUrl,
) {
  if (isConversationPersistenceBlocked()) {
    throw new Error('Image upload blocked (read canary / writes fail-closed)')
  }
  if (!CLOUD.user) throw new Error(t('settings.cloudNeedSignIn'))
  const conv = C.conversations.find((c) => c.id === conversationId)
  const tc = conv?.messages
    .flatMap((m) => m.toolCalls ?? [])
    .find((t) => t.id === tcId)
  if (!tc) throw new Error('image not found')
  if (tc.imagePaths?.[index]) return tc.imagePaths[index] // 已上传过

  const path = `${CLOUD.user.id}/${crypto.randomUUID()}.webp`
  const blob = await dataUrlToBlob(dataUrl)
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: true })
  if (error) throw error

  if (!Array.isArray(tc.imagePaths)) tc.imagePaths = []
  tc.imagePaths[index] = path
  // 让对话标记为更新并同步(payload 里会带上 imagePaths)
  conv.updatedAt = Date.now()
  persistChats()
  schedulePush()
  return path
}

/** 取生成图的带签名临时 URL(懒加载显示用);缓存到过期前复用。 */
export async function imageUrlFromPath(path) {
  if (!sb || !path) return null
  const cached = signedUrlCache.get(path)
  if (cached && cached.exp > Date.now() + 30000) return cached.url
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  signedUrlCache.set(path, {
    url: data.signedUrl,
    exp: Date.now() + 3600 * 1000,
  })
  return data.signedUrl
}
