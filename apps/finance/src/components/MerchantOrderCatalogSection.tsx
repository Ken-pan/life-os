import { useState } from 'react'
import { useLocale } from '../i18n/context'
import {
  purchaseEnrichmentFromRow,
  type PurchaseEnrichment,
} from '../engine/purchaseEnrichment'
import { PurchaseEnrichmentBlock } from './PurchaseEnrichmentBlock'
import type { MerchantOrderCatalog } from '../types'
import { purchaseSourceLabel } from './purchaseSourceLabel'

const SOURCES = ['target', 'bestbuy'] as const

function catalogHintKey(source: (typeof SOURCES)[number]): string {
  return source === 'target'
    ? 'history.catalogTargetHint'
    : 'history.catalogBestbuyHint'
}

export function MerchantOrderCatalogSection({
  catalog,
  privacy,
  debugMode = false,
}: {
  catalog?: MerchantOrderCatalog
  privacy: boolean
  debugMode?: boolean
}) {
  const { t: tl } = useLocale()
  const [expanded, setExpanded] = useState(debugMode)

  if (!catalog) return null

  const sections: Array<{
    source: (typeof SOURCES)[number]
    orders: PurchaseEnrichment[]
  }> = []
  for (const source of SOURCES) {
    const bucket = catalog[source]?.orders
    if (!bucket?.length) continue
    sections.push({
      source,
      orders: bucket
        .map((o) => purchaseEnrichmentFromRow(o))
        .filter((o): o is PurchaseEnrichment => o != null),
    })
  }

  if (!sections.length) return null

  const orderCount = sections.reduce((n, s) => n + s.orders.length, 0)

  if (!expanded) {
    return (
      <div className="card merchant-order-catalog-collapsed">
        <p className="merchant-order-catalog-collapsed-title mb-1">
          {tl('history.catalogMaintenanceTitle', {
            count: orderCount.toLocaleString(),
          })}
        </p>
        <p className="muted-note text-sm mb-2">
          {tl('history.catalogMaintenanceHint')}
        </p>
        <button
          type="button"
          className="btn ghost"
          aria-expanded={false}
          aria-controls="merchant-order-catalog-panel"
          onClick={() => setExpanded(true)}
        >
          {tl('history.catalogMaintenanceAction')}
        </button>
      </div>
    )
  }

  return (
    <section
      className="merchant-order-catalog"
      id="merchant-order-catalog-panel"
    >
      {!debugMode && (
        <button
          type="button"
          className="btn ghost text-sm merchant-order-catalog-collapse"
          aria-expanded
          aria-controls="merchant-order-catalog-panel"
          onClick={() => setExpanded(false)}
        >
          {tl('common.close')}
        </button>
      )}
      {sections.map(({ source, orders }) => (
        <div className="card merchant-order-catalog-card" key={source}>
          <h3 className="merchant-order-catalog-title">
            {tl('history.catalogUnlinkedTitle', {
              source: purchaseSourceLabel(source, tl),
            })}
          </h3>
          <p className="muted-note text-sm mb-2">
            {tl(catalogHintKey(source))}
          </p>
          <div className="merchant-order-catalog-list">
            {orders.map((enrichment) => (
              <PurchaseEnrichmentBlock
                key={enrichment.orderId ?? enrichment.detailUrl}
                enrichment={enrichment}
                privacy={privacy}
                compact
                debugMode={debugMode}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
