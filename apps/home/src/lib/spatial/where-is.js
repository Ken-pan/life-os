/**
 * HOME.MCP.13 — where_is 纯格式化 / 快照瘦身（零 IO，可 node --test）。
 */

import { searchStorageItems } from './storage-items.js'

/** MCP / AIOS 展示上限（比 UI 搜索更短） */
export const WHERE_IS_DISPLAY_CAP = 20

/**
 * 上云快照只留可检索字段，避免把户型几何塞进 jsonb。
 * @param {import('./types.js').SpatialStorageZone[] | null | undefined} zones
 */
export function slimStorageZonesForSnapshot(zones) {
  return (zones ?? []).map((z) => ({
    id: z.id,
    code: z.code,
    nameZh: z.nameZh,
    items: (z.items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      tags: i.tags?.length ? [...i.tags] : undefined,
      note: i.note || undefined,
      level: i.level ?? undefined,
      purchase: i.purchase?.title ? { title: i.purchase.title } : undefined,
    })),
  }))
}

/**
 * @param {{ hits: Array<{ item: { name: string }, zoneCode: string, zoneNameZh: string }>, total: number }} result
 * @param {string} query
 */
export function formatWhereIsResult(result, query) {
  const q = String(query ?? '').trim()
  if (!q) return '请提供要查找的物品名称（例如：登山包、磨豆机）。'
  if (!result?.total) return `没有找到与「${q}」匹配的物品。`

  const shown = result.hits.slice(0, WHERE_IS_DISPLAY_CAP)
  const truncated =
    result.total > shown.length
      ? `找到 ${shown.length} 件（共 ${result.total} 件，已截断）：`
      : `找到 ${result.total} 件：`
  const lines = [truncated]
  for (const h of shown) {
    const qty = h.item.qty && h.item.qty !== 1 ? ` ×${h.item.qty}` : ''
    lines.push(`- ${h.item.name}${qty} → ${h.zoneCode} ${h.zoneNameZh}`)
  }
  return lines.join('\n')
}

/**
 * 搜索 + 格式化一条龙（MCP handler / 单测共用）。
 * @param {import('./types.js').SpatialStorageZone[]} zones
 * @param {string} query
 */
export function whereIs(zones, query) {
  const result = searchStorageItems(zones, query)
  return formatWhereIsResult(result, query)
}
