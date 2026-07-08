/**
 * Life OS 备份导出/导入骨架（planner / fitness 共用）。
 * data 的组装（含深拷贝方式）与 applyState 落地留在 app；
 * 本模块只负责 envelope、下载与解析校验。
 */

/**
 * 组装备份 envelope（纯函数，可测）。
 *
 * @param {{
 *   app: string;
 *   schemaVersion: number | string;
 *   data: Record<string, unknown>;
 *   exportedAt?: string;
 * }} options
 */
export function buildBackupPayload(options) {
  return {
    schemaVersion: options.schemaVersion,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    app: options.app,
    data: options.data,
  }
}

/**
 * 触发浏览器下载（与原 planner/fitness 实现一致：Blob + 临时 <a>）。
 *
 * @param {Record<string, unknown>} payload
 * @param {string} filename
 */
export function downloadBackupFile(payload, filename) {
  if (typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 校验并解析备份 JSON（纯函数，可测）。
 * 兼容两种形态：带 envelope（{ data: {...} }）与裸数据（直接 {...}）。
 *
 * @param {string} text
 * @param {{ invalidMessage?: string }} [options]
 * @returns {{ meta: Record<string, unknown>, data: Record<string, unknown> }}
 */
export function parseBackup(text, options = {}) {
  const raw = JSON.parse(text)
  const data = raw.data ?? raw
  if (!data || typeof data !== 'object' || !data.settings) {
    throw new Error(options.invalidMessage ?? 'invalid backup')
  }
  return { meta: raw, data }
}
