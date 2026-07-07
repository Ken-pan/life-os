import { useLocale } from '../i18n/context'
import type { PurchaseCoverageStats } from '../engine/purchaseEnrichmentDisplay'
import { purchaseSourceLabel } from './purchaseSourceLabel'

export function PurchaseCoverageCard({
  stats,
  onFilter,
}: {
  stats: PurchaseCoverageStats
  onFilter?: (preset: string) => void
}) {
  const { t: tl } = useLocale()

  const rows: { key: string; label: string; value: number; preset?: string }[] = [
    { key: 'total', label: tl('history.coverageTotal'), value: stats.total },
    { key: 'enriched', label: tl('history.coverageEnriched'), value: stats.enrichedAny },
    {
      key: 'clean',
      label: tl('history.coverageClean'),
      value: stats.cleanEnriched,
      preset: 'purchase:clean',
    },
    {
      key: 'review',
      label: tl('history.coverageReview'),
      value: stats.matchedReview,
      preset: 'purchase:review',
    },
    {
      key: 'return',
      label: tl('history.coverageReturn'),
      value: stats.returnRefund,
      preset: 'purchase:return',
    },
    {
      key: 'merchant',
      label: tl('history.coverageMerchantOnly'),
      value: stats.merchantOnly,
    },
  ]

  const sourceBits = (['target', 'amazon', 'bestbuy'] as const)
    .filter((s) => stats.cleanBySource[s] > 0)
    .map((s) => `${purchaseSourceLabel(s, tl)} ${stats.cleanBySource[s]}`)

  return (
    <div className="card purchase-coverage-card">
      <h3 className="purchase-coverage-title">{tl('history.coverageTitle')}</h3>
      <p className="muted-note text-sm mb-2">{tl('history.coverageHint')}</p>
      <dl className="purchase-coverage-grid">
        {rows.map((row) => (
          <div className="purchase-coverage-row" key={row.key}>
            <dt>{row.label}</dt>
            <dd>
              {row.preset && onFilter ? (
                <button
                  type="button"
                  className="purchase-coverage-link"
                  onClick={() => onFilter(row.preset!)}
                >
                  {row.value.toLocaleString()}
                </button>
              ) : (
                row.value.toLocaleString()
              )}
            </dd>
          </div>
        ))}
      </dl>
      {sourceBits.length > 0 && (
        <p className="muted-note text-sm mb-0">
          {tl('history.coverageBySource', { list: sourceBits.join(' · ') })}
        </p>
      )}
    </div>
  )
}
