// KnowledgeOS 联通 —— planner 侧的 Vault 检索客户端。
//
// 直连 local-ai 网关的 vault 检索服务(与 KnowledgeOS 同一后端:
// services/knowledge/vault_server.py,经网关 /upstream/vault),让项目详情
// 能看到该项目在 Vault/KnowledgeOS 里的相关知识笔记(语义检索,非关键词)。
//
// 仅在本机 + 网关运行时可用;网关未起 / CORS / 超时一律优雅降级(返回 [] / null),
// 绝不影响 planner 主流程。localStorage key 与 KnowledgeOS 共用,跟随其网关设置。
import { browser } from '$app/environment'

const GATEWAY_KEY = 'knowledgeos_gateway_url_v1'
const DEFAULT_GATEWAY = 'http://127.0.0.1:18888'
const BASE = '/upstream/vault'

function getGateway() {
  if (!browser) return DEFAULT_GATEWAY
  try {
    return localStorage.getItem(GATEWAY_KEY) || DEFAULT_GATEWAY
  } catch {
    return DEFAULT_GATEWAY
  }
}

/**
 * 检索服务是否可达(网关 + vault 服务已起)。用于 UI 决定是否显示知识区块。
 * @returns {Promise<boolean>}
 */
export async function knowledgeAvailable() {
  if (!browser) return false
  try {
    const res = await fetch(`${getGateway()}${BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 语义检索该项目相关的 Vault 知识笔记。网关不可达/出错时返回 []。
 * @param {string} query 通常传项目标题(+ 一句话说明)
 * @param {{ k?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<Array<{ vault: string, path: string, title: string, breadcrumb?: string, snippet?: string, obsidianUrl?: string }>>}
 */
export async function searchProjectKnowledge(query, { k = 5, signal } = {}) {
  const q = (query || '').trim()
  if (!browser || !q) return []
  try {
    const timeout = AbortSignal.timeout(8000)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    const res = await fetch(`${getGateway()}${BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, k, vault: 'vault' }),
      signal: combined,
    })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json.results) ? json.results : []
  } catch {
    return [] // 网关未起 / CORS / 超时 → 优雅降级
  }
}
