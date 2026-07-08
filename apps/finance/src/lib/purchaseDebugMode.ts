/** Data-quality / audit UI for purchase enrichment (off by default). */
export function isPurchaseEnrichmentDebugMode(): boolean {
  if (typeof window === 'undefined') return false
  return (
    new URLSearchParams(window.location.search).get('debug') ===
    'purchase-enrichment'
  )
}
