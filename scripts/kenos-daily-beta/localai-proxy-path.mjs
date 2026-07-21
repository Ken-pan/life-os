/**
 * Shared LocalAI proxy path guards (Node serve-static + tests).
 * Keep host/port fixed on upstream; only forward a normalized path.
 */

/** @param {string} rest */
export function normalizeProxyPath(rest) {
  let path = rest || '/'
  if (!path.startsWith('/')) path = `/${path}`
  if (path.startsWith('//')) return null
  const lower = path.toLowerCase()
  if (
    lower.includes('://') ||
    lower.startsWith('/http:') ||
    lower.startsWith('/https:')
  ) {
    return null
  }
  const parts = []
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') return null
    parts.push(seg)
  }
  return `/${parts.join('/')}`
}

/** @param {string} method @param {string} targetPath */
export function usesChatSlot(method, targetPath) {
  if (String(method || '').toUpperCase() !== 'POST') return false
  const pathOnly = String(targetPath || '').split('?')[0]
  return (
    pathOnly.endsWith('/chat/completions') || pathOnly.endsWith('/completions')
  )
}
