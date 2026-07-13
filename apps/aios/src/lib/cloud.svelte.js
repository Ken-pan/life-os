import { browser } from '$app/environment'
import { mapAuthErrorMessage } from '@life-os/sync'
import { t } from '$lib/i18n/index.js'
import { supabase as sb, isSupabaseConfigured } from '$lib/supabase.js'
import { C, persist as persistChats } from '$lib/chat.svelte.js'
import { M, mergeRemoteMemories } from '$lib/memory.svelte.js'
import { onDataChanged } from '$lib/syncBus.js'

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

export const CLOUD = $state({
  configured: isSupabaseConfigured,
  /** @type {{ id: string, email: string } | null} */
  user: null,
  /** 登录/登出请求进行中 */
  busy: false,
  syncing: false,
  /** @type {number} 上次成功同步的时间戳(ms),0 = 从未 */
  lastSyncAt: 0,
  error: '',
})

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

/** app 启动时调用:恢复共享登录态、订阅变更、拉一次云端 */
export async function initCloud() {
  if (!browser || !CLOUD.configured) return
  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user
    CLOUD.user = u ? { id: u.id, email: u.email ?? '' } : null
  })
  const { data } = await sb.auth.getSession()
  const u = data?.session?.user
  CLOUD.user = u ? { id: u.id, email: u.email ?? '' } : null
  if (unsubscribeBus) unsubscribeBus()
  unsubscribeBus = onDataChanged(schedulePush)
  if (CLOUD.user) syncNow()
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
    // 快照属于这个账号的同步历史,登出即作废
    try {
      localStorage.removeItem(SNAP_KEY)
    } catch {
      /* 忽略 */
    }
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

async function syncConversations(snap) {
  const { data: remote, error } = await sb
    .from('conversations')
    .select('id, updated_at, deleted')
  if (error) throw error

  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localById = new Map(C.conversations.map((c) => [c.id, c]))

  const toPush = [] // 本地更新(含新建/复活)
  const toTombstone = [] // 本地已删,推墓碑
  const toPull = [] // 云端更新,拉 payload
  const dropLocal = new Set() // 云端墓碑,删本地

  for (const c of C.conversations) {
    const r = remoteById.get(c.id)
    if (!r) {
      toPush.push(c)
    } else if (r.deleted) {
      if (c.updatedAt > r.updated_at) toPush.push(c)
      else dropLocal.add(c.id)
    } else if (c.updatedAt > r.updated_at) {
      toPush.push(c)
    } else if (r.updated_at > c.updatedAt) {
      toPull.push(c.id)
    }
  }
  for (const r of remote) {
    if (localById.has(r.id) || r.deleted) continue
    if (snap.convs[r.id] !== undefined) toTombstone.push(r.id)
    else toPull.push(r.id)
  }

  if (toPush.length) {
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
  if (toTombstone.length) {
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

  snap.convs = Object.fromEntries(C.conversations.map((c) => [c.id, c.updatedAt]))
}

async function syncMemories(snap) {
  const { data: remote, error } = await sb
    .from('memories')
    .select('id, text, created_at, deleted')
  if (error) throw error

  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localIds = new Set(M.items.map((m) => m.id))
  const snapIds = new Set(snap.mems)

  const toPush = []
  const toTombstone = []
  const toAdd = []
  const dropLocal = new Set()

  for (const m of M.items) {
    const r = remoteById.get(m.id)
    if (!r) toPush.push(m)
    else if (r.deleted) dropLocal.add(m.id)
  }
  for (const r of remote) {
    if (localIds.has(r.id) || r.deleted) continue
    if (snapIds.has(r.id)) toTombstone.push(r.id)
    else toAdd.push({ id: r.id, text: r.text ?? '', vector: null, createdAt: r.created_at })
  }

  if (toPush.length) {
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
  if (toTombstone.length) {
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
