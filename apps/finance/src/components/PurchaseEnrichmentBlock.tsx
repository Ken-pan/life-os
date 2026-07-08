import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/context'
import { moneyPrecise } from '../format'
import type { PurchaseEnrichment } from '../engine/purchaseEnrichment'
import { lineItemImageSrc, uniqueLineItems } from '../engine/purchaseEnrichment'
import type { PurchaseDisplayState } from '../engine/purchaseEnrichmentDisplay'
import {
  isReturnLikeEnrichment,
  returnStatusLabelKey,
} from '../engine/purchaseReturnStatus'

export function PurchaseEnrichmentBlock({
  enrichment,
  privacy,
  chargeDate,
  compact = false,
  showLineItemsInBody = true,
  displayState = 'clean_enriched',
  debugMode = false,
  onOpenChange,
}: {
  enrichment: PurchaseEnrichment
  privacy: boolean
  /** 卡/账户扣款日期（流水 date） */
  chargeDate?: string
  compact?: boolean
  /** 为 false 时展开区只显示订单元数据（商品由 LedgerProductStrip 展示）。 */
  showLineItemsInBody?: boolean
  displayState?: PurchaseDisplayState
  debugMode?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t: tl } = useLocale()
  const [open, setOpen] = useState(!compact)
  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])
  const items = uniqueLineItems(enrichment.lineItems)
  const hasItemPrices = items.some((li) => li.price != null)
  const returnInfo = enrichment.returnInfo
  const showReturnBadge =
    isReturnLikeEnrichment(returnInfo) || returnInfo?.isRefundCredit
  const allowLineItems =
    displayState === 'clean_enriched' && showLineItemsInBody
  const showItemCount =
    items.length > 0 && (displayState === 'clean_enriched' || debugMode)
  const noItemsMessage =
    displayState === 'matched_review'
      ? tl('history.purchaseStateReviewHint')
      : displayState === 'unsupported_source'
        ? tl('history.purchaseState.unsupported_source')
        : tl('history.purchaseNoItems')
  const orderLabel =
    enrichment.source === 'amazon'
      ? tl('history.amazonOrder')
      : enrichment.source === 'bestbuy'
        ? tl('history.bestBuyOrder')
        : enrichment.source === 'target'
          ? tl('history.targetOrder')
          : tl('history.purchaseOrder')

  return (
    <div className="purchase-enrichment">
      <div className="purchase-enrichment-head">
        <button
          type="button"
          className="purchase-enrichment-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="purchase-enrichment-badge">{orderLabel}</span>
          {showReturnBadge && returnInfo && (
            <span
              className={`purchase-enrichment-return-badge purchase-enrichment-return-badge--${returnInfo.status}${returnInfo.isRefundCredit ? ' is-refund-credit' : ''}`}
            >
              {returnInfo.isRefundCredit
                ? tl('history.purchaseRefundCredit')
                : tl(returnStatusLabelKey(returnInfo.status))}
            </span>
          )}
          {showItemCount && (
            <span className="text-muted text-sm">
              {tl('history.purchaseItemCount', { count: items.length })}
            </span>
          )}
          <span className="purchase-enrichment-chevron">
            {open ? '▾' : '▸'}
          </span>
        </button>
        {enrichment.detailUrl && (
          <a
            className="purchase-enrichment-link"
            href={enrichment.detailUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {tl('history.purchaseViewOrder')} ↗
          </a>
        )}
      </div>
      {open && (
        <div className="purchase-enrichment-body">
          <dl className="purchase-enrichment-meta-list">
            {chargeDate && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseChargeDate')}</dt>
                <dd>{chargeDate}</dd>
              </div>
            )}
            {enrichment.orderDate && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseOrderDate')}</dt>
                <dd>{enrichment.orderDate}</dd>
              </div>
            )}
            {enrichment.status && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseOrderStatus')}</dt>
                <dd>{enrichment.status}</dd>
              </div>
            )}
            {returnInfo?.eventDate && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseReturnDate')}</dt>
                <dd>{returnInfo.eventDate}</dd>
              </div>
            )}
            {returnInfo?.refundAmount != null && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseRefundAmount')}</dt>
                <dd>{moneyPrecise(returnInfo.refundAmount, privacy)}</dd>
              </div>
            )}
            {returnInfo?.relatedOrderId && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseRelatedOrder')}</dt>
                <dd>{returnInfo.relatedOrderId}</dd>
              </div>
            )}
            {enrichment.orderId && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseOrderId')}</dt>
                <dd>{enrichment.orderId}</dd>
              </div>
            )}
            {enrichment.orderTotal != null && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl('history.purchaseOrderTotal')}</dt>
                <dd>{moneyPrecise(enrichment.orderTotal, privacy)}</dd>
              </div>
            )}
          </dl>
          {items.length > 0 ? (
            allowLineItems ? (
              <>
                {!hasItemPrices && (
                  <p className="purchase-enrichment-note text-sm">
                    {tl('history.purchaseNoItemPrices')}
                  </p>
                )}
                <ul className="purchase-enrichment-items">
                  {items.map((item) => {
                    const imgSrc = lineItemImageSrc(item)
                    return (
                      <li key={item.asin || item.detailUrl || item.title}>
                        {imgSrc && !privacy && (
                          <img
                            className="purchase-enrichment-item-img"
                            src={imgSrc}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="purchase-enrichment-item-main">
                          {item.detailUrl ? (
                            <a
                              href={item.detailUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {item.title}
                            </a>
                          ) : (
                            <span>{item.title}</span>
                          )}
                          {(item.quantity ?? 1) > 1 && (
                            <span className="purchase-enrichment-item-qty">
                              ×{item.quantity}
                            </span>
                          )}
                        </div>
                        {item.price != null && (
                          <span className="purchase-enrichment-item-price">
                            {moneyPrecise(item.price, privacy)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p className="muted-note text-sm mb-0">
                {tl('history.purchaseItemsAbove')}
              </p>
            )
          ) : (
            <p className="muted-note text-sm">{noItemsMessage}</p>
          )}
        </div>
      )}
    </div>
  )
}
