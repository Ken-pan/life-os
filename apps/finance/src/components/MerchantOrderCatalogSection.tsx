import { purchaseEnrichmentFromRow, type PurchaseEnrichment } from '../engine/purchaseEnrichment'
import { PurchaseEnrichmentBlock } from './PurchaseEnrichmentBlock'
import type { MerchantOrderCatalog } from '../types'

const SOURCE_LABEL: Record<string, string> = {
  bestbuy: 'Best Buy',
  target: 'Target',
}

export function MerchantOrderCatalogSection({
  catalog,
  privacy,
}: {
  catalog?: MerchantOrderCatalog
  privacy: boolean
}) {
  if (!catalog) return null

  const sections: Array<{ source: string; orders: PurchaseEnrichment[] }> = []
  for (const source of ['target', 'bestbuy'] as const) {
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

  return (
    <section className="merchant-order-catalog">
      {sections.map(({ source, orders }) => (
        <div className="card merchant-order-catalog-card" key={source}>
          <h3 className="merchant-order-catalog-title">
            {SOURCE_LABEL[source] ?? source} — 未关联银行流水的订单
          </h3>
          <p className="muted-note text-sm mb-2">
            这些订单已从商户网站采集，但账本里没有对应单笔扣款（常见于 Target
            RedCard 月结）。商品明细仅供核对。
          </p>
          <div className="merchant-order-catalog-list">
            {orders.map((enrichment) => (
              <PurchaseEnrichmentBlock
                key={enrichment.orderId ?? enrichment.detailUrl}
                enrichment={enrichment}
                privacy={privacy}
                compact
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
