import { browser } from '$app/environment'
import { embed, cosine, tinyComplete } from '$lib/localai.js'
import { SEED_MEMORIES } from '$lib/profile.js'
import { dataChanged } from '$lib/syncBus.js'

/**
 * 持久记忆(ChatGPT memory 风格):
 * - 模型经工具 save_memory 写入,或用户在设置页管理
 * - 首次启动种入用户资料(profile.js),之后由对话增量积累
 * - Qwen3-Embedding 语义召回,每轮把最相关的记忆注入 system prompt
 * - 全部存 localStorage,不出设备;向量截断 512 维控制体积
 */

const STORAGE_KEY = 'aios_memory_v1'
const SEED_FLAG_KEY = 'aios_memory_seeded_v1'
const MAX_MEMORIES = 200
/** 新记忆与旧记忆余弦相似度达到该值视为同一事实的新版本,替换而非并存 */
const DUP_THRESHOLD = 0.92

/** @typedef {{ id: string, text: string, vector: number[] | null, createdAt: number }} MemoryItem */

function load() {
  if (!browser) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const M = $state({
  /** @type {MemoryItem[]} */
  items: load(),
})

function persist() {
  if (!browser) return
  dataChanged() // 云同步(若已登录)防抖跟进
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(M.items.slice(0, MAX_MEMORIES)))
  } catch {
    /* 超限时丢弃最旧向量再试一次 */
    try {
      const slim = M.items.slice(0, MAX_MEMORIES).map((m, i) =>
        i > 80 ? { ...m, vector: null } : m,
      )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
    } catch {
      /* 放弃,不打断对话 */
    }
  }
}

/**
 * 新增一条记忆(嵌入失败时降级为无向量,之后仍可子串匹配)。
 * @returns {Promise<MemoryItem>}
 */
export async function addMemory(text) {
  const trimmed = text.trim().slice(0, 500)
  const existing = M.items.find((m) => m.text === trimmed)
  if (existing) return existing
  const item = {
    id: crypto.randomUUID(),
    text: trimmed,
    vector: null,
    createdAt: Date.now(),
  }
  M.items = [item, ...M.items].slice(0, MAX_MEMORIES)
  persist()
  try {
    const [vector] = await embed([trimmed])
    item.vector = vector
    // 同一事实的新版本:删掉近重复的旧条目,避免过时信息与新信息并存互相矛盾
    const stale = M.items.filter(
      (m) => m.id !== item.id && m.vector && cosine(vector, m.vector) >= DUP_THRESHOLD,
    )
    if (stale.length) {
      const staleIds = new Set(stale.map((m) => m.id))
      M.items = M.items.filter((m) => !staleIds.has(m.id))
    }
    persist()
  } catch {
    /* embeddings 不可用时保持 null */
  }
  return item
}

/** 首次启动把用户资料种入记忆(只跑一次;用户清空后不会复活) */
export function seedDefaultMemories() {
  if (!browser) return
  if (localStorage.getItem(SEED_FLAG_KEY)) return
  localStorage.setItem(SEED_FLAG_KEY, '1')
  const existing = new Set(M.items.map((m) => m.text))
  const seeds = SEED_MEMORIES.filter((text) => !existing.has(text)).map((text) => ({
    id: crypto.randomUUID(),
    text,
    vector: null,
    createdAt: Date.now(),
  }))
  if (!seeds.length) return
  M.items = [...M.items, ...seeds].slice(0, MAX_MEMORIES)
  persist()
}

/** 给缺向量的记忆补嵌入(app 启动时调用,静默自愈) */
export async function backfillVectors() {
  const missing = M.items.filter((m) => !m.vector)
  if (!missing.length) return
  try {
    const vectors = await embed(missing.map((m) => m.text))
    missing.forEach((m, i) => {
      m.vector = vectors[i] ?? null
    })
    persist()
  } catch {
    /* 网关不可用时下次启动再试 */
  }
}

/* —— 记忆 dreaming(ChatGPT memory dreaming 风格) —— */

const DREAM_AT_KEY = 'aios_memory_dreamed_at_v1'
const DREAM_BACKUP_KEY = 'aios_memory_backup_v1'
const DREAM_INTERVAL_MS = 24 * 3600 * 1000
const DREAM_MIN_ITEMS = 8

/**
 * 空闲时用常驻小模型整理记忆:合并重复、给相对时间补记录日期、删除已被
 * 明确新事实取代的旧条目。绝不把“计划过期”推断成“已经完成”。
 * 24h 至多一次;替换前整体备份,解析失败不动原数据。
 * @returns {Promise<boolean>} 是否执行了整理
 */
export async function dreamMemories() {
  if (!browser) return false
  const lastRun = Number(localStorage.getItem(DREAM_AT_KEY) ?? 0)
  if (Date.now() - lastRun < DREAM_INTERVAL_MS) return false
  if (M.items.length < DREAM_MIN_ITEMS) return false
  // 先记时间戳:失败也不在同一天反复重试
  localStorage.setItem(DREAM_AT_KEY, String(Date.now()))

  const items = M.items.slice(0, 120)
  const listing = items
    .map((m, i) => `${i + 1}. [${new Date(m.createdAt).toISOString().slice(0, 10)}] ${m.text}`)
    .join('\n')
  const today = new Date().toISOString().slice(0, 10)
  const raw = await tinyComplete(
    `今天是 ${today}。下面是关于用户的记忆列表(带记录日期)。请整理:\n` +
      '1. 说同一件事的条目合并为一条(以最新明确事实为准)\n' +
      '2. “近期/正在/计划”等相对说法要保留为当时状态并补记录日期,例如 [2026-03-01]“7月计划去X”→“截至2026-03-01,用户计划2026年7月去X”\n' +
      '3. 只有较新的条目明确确认完成/取消/改变时,才删除与它直接矛盾的旧条目\n' +
      '严禁因为计划日期已过去就推断事情已完成(“计划去X”不能改成“去过X”)。不要发明新信息,不要丢掉仍然有效的信息。输出 JSON 字符串数组(不要对象、不要日期字段),每条一句第三人称,不超过 80 字。格式示例:["记忆一","记忆二"]。只输出 JSON,不要解释。\n\n' +
      listing,
    { maxTokens: 2048, temperature: 0.2, timeoutMs: 120000 },
  )
  if (!raw) return false

  let texts
  try {
    const jsonText = raw.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/, '$1')
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) return false
    // 兼容小模型偶尔输出 {text, date} 对象数组
    texts = parsed
      .map((t) => (typeof t === 'string' ? t : typeof t?.text === 'string' ? t.text : null))
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim().slice(0, 500))
      .filter(Boolean)
  } catch {
    return false
  }
  // 防呆:整理结果条数异常(丢了大半或凭空暴涨)时放弃
  if (texts.length < Math.max(3, Math.floor(items.length / 3))) return false
  if (texts.length > items.length + 2) return false

  try {
    localStorage.setItem(DREAM_BACKUP_KEY, JSON.stringify(M.items))
  } catch {
    /* 备份失败不阻断 */
  }
  const byText = new Map(items.map((m) => [m.text, m]))
  const untouched = M.items.slice(120)
  M.items = [
    ...texts.map((text) => {
      const old = byText.get(text)
      // 原文未变的保留 id/向量;改写过的重建,向量由 backfillVectors 补
      return old ?? { id: crypto.randomUUID(), text, vector: null, createdAt: Date.now() }
    }),
    ...untouched,
  ].slice(0, MAX_MEMORIES)
  persist()
  backfillVectors()
  return true
}

/**
 * 云同步用:并入其他设备新增的记忆、移除云端已删的(cloud.svelte.js 调用)。
 * @param {MemoryItem[]} additions
 * @param {Set<string>} removals
 */
export function mergeRemoteMemories(additions, removals) {
  let items = M.items.filter((m) => !removals.has(m.id))
  const existing = new Set(items.map((m) => m.id))
  const texts = new Set(items.map((m) => m.text))
  for (const a of additions) {
    if (existing.has(a.id) || texts.has(a.text)) continue
    items.push(a)
  }
  items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  M.items = items.slice(0, MAX_MEMORIES)
  persist()
  backfillVectors()
}

export function deleteMemory(id) {
  M.items = M.items.filter((m) => m.id !== id)
  persist()
}

export function clearMemories() {
  M.items = []
  persist()
}

/**
 * 语义检索记忆。
 * @returns {Promise<Array<{ item: MemoryItem, score: number }>>}
 */
export async function searchMemories(query, k = 5) {
  if (!M.items.length) return []
  let queryVector = null
  try {
    ;[queryVector] = await embed([query])
  } catch {
    /* 降级为子串匹配 */
  }
  const q = query.toLowerCase()
  const scored = M.items.map((item) => {
    let score = 0
    if (queryVector && item.vector) {
      score = cosine(queryVector, item.vector)
    } else if (item.text.toLowerCase().includes(q) || q.includes(item.text.toLowerCase())) {
      score = 0.5
    }
    return { item, score }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, k)
}

/**
 * 为本轮对话召回相关记忆(注入 system prompt 用)。
 * 注入端阈值偏高(重精度):无关记忆混进 prompt 会误导小模型;
 * 需要广召回时模型自己会调 search_memory(工具端阈值 0.2,重召回)。
 * 0.5 来自实测:无关问题对记忆库的相似度上限 ~0.45,相关记忆下限 ~0.53。
 * @returns {Promise<string[]>}
 */
export async function recallRelevant(query, k = 4, threshold = 0.5) {
  if (!M.items.length) return []
  try {
    const results = await searchMemories(query, k)
    return results.filter((r) => r.score >= threshold).map((r) => r.item.text)
  } catch {
    return []
  }
}
