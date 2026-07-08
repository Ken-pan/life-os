import type { PurchaseEnrichmentSource } from '../engine/purchaseEnrichment'
import type { PurchaseCoverageStats } from '../engine/purchaseEnrichmentDisplay'
import { useLocale } from '../i18n/context'
import { purchaseSourceLabel } from './purchaseSourceLabel'

const SOURCE_ORDER: PurchaseEnrichmentSource[] = ['target', 'amazon', 'bestbuy']

export function PurchaseCoverageCard({
  stats,
  debugMode = false,
  sourceFilter = 'all',
  onSourceFilterChange,
  onFilter,
  onViewCleanBills,
}: {
  stats: PurchaseCoverageStats
  debugMode?: boolean
  sourceFilter?: 'all' | PurchaseEnrichmentSource
  onSourceFilterChange?: (source: 'all' | PurchaseEnrichmentSource) => void
  onFilter?: (preset: string) => void
  onViewCleanBills?: () => void
}) {
  const { t: tl } = useLocale()

  const statRows = [
    {
      key: 'clean',
      label: tl('history.coverageStatClean'),
      value: stats.cleanEnriched,
      preset: 'purchase:clean',
    },
    {
      key: 'review',
      label: tl('history.coverageStatReview'),
      value: stats.matchedReview,
      preset: 'purchase:review',
    },
    {
      key: 'return',
      label: tl('history.coverageStatReturn'),
      value: stats.returnRefund,
      preset: 'purchase:return',
    },
  ]

  const sourceChips = SOURCE_ORDER.filter(
    (s) => (stats.cleanBySource[s] ?? 0) > 0,
  )

  return (
    <div className="card purchase-coverage-card">
      <h3 className="purchase-coverage-title">{tl('history.coverageTitle')}</h3>
      <p className="purchase-coverage-headline">
        {tl('history.coverageHeadline', {
          bills: stats.cleanEnriched.toLocaleString(),
          items: stats.cleanItemCount.toLocaleString(),
        })}
      </p>
      <p className="muted-note text-sm mb-2">{tl('history.coverageLead')}</p>
      {(stats.matchedReview > 0 || stats.returnRefund > 0) && (
        <p className="muted-note text-sm mb-2">
          {tl('history.coverageSecondary', {
            review: stats.matchedReview.toLocaleString(),
            returns: stats.returnRefund.toLocaleString(),
          })}
        </p>
      )}

      <div className="purchase-coverage-stats">
        {statRows.map((row) => (
          <div className="purchase-coverage-stat" key={row.key}>
            <span className="purchase-coverage-stat-label">{row.label}</span>
            {onFilter ? (
              <button
                type="button"
                className="purchase-coverage-link"
                onClick={() => onFilter(row.preset)}
              >
                {row.value.toLocaleString()}
              </button>
            ) : (
              <span className="purchase-coverage-stat-value">
                {row.value.toLocaleString()}
              </span>
            )}
          </div>
        ))}
      </div>

      {onViewCleanBills && stats.cleanEnriched > 0 && (
        <button
          type="button"
          className="btn ghost purchase-coverage-cta"
          onClick={onViewCleanBills}
        >
          {tl('history.coverageViewCleanBills')}
        </button>
      )}

      {sourceChips.length > 0 && onSourceFilterChange && (
        <div
          className="purchase-source-chips"
          role="group"
          aria-label={tl('history.coverageSourceFilterAria')}
        >
          <button
            type="button"
            className={`purchase-source-chip${sourceFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => onSourceFilterChange('all')}
          >
            {tl('history.coverageSourceAll')}
          </button>
          {sourceChips.map((source) => (
            <button
              key={source}
              type="button"
              className={`purchase-source-chip${sourceFilter === source ? ' is-active' : ''}`}
              onClick={() => onSourceFilterChange(source)}
            >
              {purchaseSourceLabel(source, tl)} {stats.cleanBySource[source]}
            </button>
          ))}
        </div>
      )}

      {debugMode && (
        <details className="purchase-coverage-debug">
          <summary>{tl('history.coverageDebugTitle')}</summary>
          <dl className="purchase-coverage-grid">
            <div className="purchase-coverage-row">
              <dt>{tl('history.coverageTotal')}</dt>
              <dd>{stats.total.toLocaleString()}</dd>
            </div>
            <div className="purchase-coverage-row">
              <dt>{tl('history.coverageEnriched')}</dt>
              <dd>{stats.enrichedAny.toLocaleString()}</dd>
            </div>
            <div className="purchase-coverage-row">
              <dt>{tl('history.coverageMerchantOnly')}</dt>
              <dd>{stats.merchantOnly.toLocaleString()}</dd>
            </div>
          </dl>
        </details>
      )}
    </div>
  )
}
