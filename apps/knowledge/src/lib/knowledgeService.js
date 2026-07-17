import { browser } from '$app/environment'

/**
 * KnowledgeOS 检索后端客户端 —— 直连 local-ai 的 vault 检索服务
 * （services/knowledge/vault_server.py，经网关 127.0.0.1:18888/upstream/vault）。
 *
 * 为什么不在客户端做向量索引：服务端已有完整混合 RAG（BM25 + 向量 + RRF 融合 +
 * 交叉编码器重排 + 上下文分块 + 90s 自动增量扫描 + SQLite 索引），远强于客户端
 * 余弦。KnowledgeOS 只当前端消费，索引/嵌入/重排全在本地服务里、数据不出机器。
 * 这是 KnowledgeOS 相对 Obsidian 的核心差异。
 */

const GATEWAY_KEY = 'knowledgeos_gateway_url_v1'
export const DEFAULT_GATEWAY = 'http://127.0.0.1:18888'
const BASE = '/upstream/vault'

export function getGateway() {
  if (!browser) return DEFAULT_GATEWAY
  try {
    return localStorage.getItem(GATEWAY_KEY) || DEFAULT_GATEWAY
  } catch {
    return DEFAULT_GATEWAY
  }
}

export function setGateway(url) {
  if (!browser) return
  const v = (url ?? '').trim()
  if (!v || v === DEFAULT_GATEWAY) localStorage.removeItem(GATEWAY_KEY)
  else localStorage.setItem(GATEWAY_KEY, v)
}

/** 检索服务健康 + 索引状态。失败返回 null（网关/服务未起）。 */
export async function vaultHealth() {
  try {
    const res = await fetch(`${getGateway()}${BASE}/health`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * 混合语义检索。默认限定主 Vault（vault="vault"），path 直接对应 KnowledgeOS item.id。
 * @returns {Promise<Array<{ vault, path, title, breadcrumb, snippet, obsidianUrl }>>}
 */
export async function vaultSearch(query, { k = 8, vault = 'vault', signal } = {}) {
  // 调用方传 signal（切条目中止）时与 60s 超时二者取先到者。
  const timeout = AbortSignal.timeout(60000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const res = await fetch(`${getGateway()}${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, k, vault }),
    signal: combined,
  })
  if (!res.ok) throw new Error(`search ${res.status}`)
  const json = await res.json()
  return json.results ?? []
}

/**
 * RAG 问答：服务端混合检索 → 带编号资料 → LLM 引用作答。
 * @returns {Promise<{ answer: string, citations: Array<{n, vault, path, title, breadcrumb}> }>}
 */
export async function vaultAsk(query, { k = 6, vault = 'vault', model = 'llm-fast' } = {}) {
  const res = await fetch(`${getGateway()}${BASE}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, k, vault, model }),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`ask ${res.status}`)
  return await res.json()
}
