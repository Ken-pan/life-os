import { browser } from '$app/environment'
import { embed, cosine } from '$lib/localai.js'

/**
 * 持久记忆(ChatGPT memory 风格):
 * - 模型经工具 save_memory 写入,或用户在设置页管理
 * - Qwen3-Embedding 语义召回,每轮把最相关的记忆注入 system prompt
 * - 全部存 localStorage,不出设备;向量截断 512 维控制体积
 */

const STORAGE_KEY = 'aios_memory_v1'
const MAX_MEMORIES = 200

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
    persist()
  } catch {
    /* embeddings 不可用时保持 null */
  }
  return item
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
 * @returns {Promise<string[]>}
 */
export async function recallRelevant(query, k = 4, threshold = 0.3) {
  if (!M.items.length) return []
  try {
    const results = await searchMemories(query, k)
    return results.filter((r) => r.score >= threshold).map((r) => r.item.text)
  } catch {
    return []
  }
}
