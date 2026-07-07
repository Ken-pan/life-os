import type { PurchaseEnrichmentSource } from '../engine/purchaseEnrichment'

type TFn = (key: string, vars?: Record<string, string | number>) => string

export function purchaseSourceLabel(
  source: string,
  tl: TFn,
): string {
  if (source === 'amazon') return tl('history.purchaseSourceAmazon')
  if (source === 'bestbuy') return tl('history.purchaseSourceBestbuy')
  if (source === 'target') return tl('history.purchaseSourceTarget')
  return source
}

export function purchaseSourceLabelTyped(
  source: PurchaseEnrichmentSource,
  tl: TFn,
): string {
  return purchaseSourceLabel(source, tl)
}
