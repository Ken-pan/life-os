/** @param {string} source @param {(key: string, vars?: Record<string, string | number>) => string} tl */
export function purchaseSourceLabel(source, tl) {
  if (source === 'amazon') return tl('history.purchaseSourceAmazon')
  if (source === 'bestbuy') return tl('history.purchaseSourceBestbuy')
  if (source === 'target') return tl('history.purchaseSourceTarget')
  return source
}
