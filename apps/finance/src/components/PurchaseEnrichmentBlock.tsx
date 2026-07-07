import { useState } from "react";
import { useLocale } from "../i18n/context";
import { moneyPrecise } from "../format";
import type { PurchaseEnrichment } from "../engine/purchaseEnrichment";
import { uniqueLineItems } from "../engine/purchaseEnrichment";
import {
  isReturnLikeEnrichment,
  returnStatusLabelKey,
} from "../engine/purchaseReturnStatus";

export function PurchaseEnrichmentBlock({
  enrichment,
  privacy,
  chargeDate,
  compact = false,
}: {
  enrichment: PurchaseEnrichment;
  privacy: boolean;
  /** 卡/账户扣款日期（流水 date） */
  chargeDate?: string;
  compact?: boolean;
}) {
  const { t: tl } = useLocale();
  const [open, setOpen] = useState(!compact);
  const items = uniqueLineItems(enrichment.lineItems);
  const hasItemPrices = items.some((li) => li.price != null);
  const returnInfo = enrichment.returnInfo;
  const showReturnBadge = isReturnLikeEnrichment(returnInfo) || returnInfo?.isRefundCredit;
  const orderLabel =
    enrichment.source === "amazon"
      ? tl("history.amazonOrder")
      : enrichment.source === "bestbuy"
        ? tl("history.bestBuyOrder")
        : tl("history.purchaseOrder");

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
              className={`purchase-enrichment-return-badge purchase-enrichment-return-badge--${returnInfo.status}${returnInfo.isRefundCredit ? " is-refund-credit" : ""}`}
            >
              {returnInfo.isRefundCredit
                ? tl("history.purchaseRefundCredit")
                : tl(returnStatusLabelKey(returnInfo.status))}
            </span>
          )}
          {items.length > 0 && (
            <span className="text-muted text-sm">
              {tl("history.amazonItemCount", { count: items.length })}
            </span>
          )}
          <span className="purchase-enrichment-chevron">{open ? "▾" : "▸"}</span>
        </button>
        {enrichment.detailUrl && (
          <a
            className="purchase-enrichment-link"
            href={enrichment.detailUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {tl("history.amazonViewOrder")} ↗
          </a>
        )}
      </div>
      {open && (
        <div className="purchase-enrichment-body">
          <dl className="purchase-enrichment-meta-list">
            {chargeDate && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.amazonChargeDate")}</dt>
                <dd>{chargeDate}</dd>
              </div>
            )}
            {enrichment.orderDate && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.amazonOrderDate")}</dt>
                <dd>{enrichment.orderDate}</dd>
              </div>
            )}
            {enrichment.status && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.amazonOrderStatus")}</dt>
                <dd>{enrichment.status}</dd>
              </div>
            )}
            {returnInfo?.eventDate && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.purchaseReturnDate")}</dt>
                <dd>{returnInfo.eventDate}</dd>
              </div>
            )}
            {returnInfo?.refundAmount != null && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.purchaseRefundAmount")}</dt>
                <dd>{moneyPrecise(returnInfo.refundAmount, privacy)}</dd>
              </div>
            )}
            {returnInfo?.relatedOrderId && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.purchaseRelatedOrder")}</dt>
                <dd>{returnInfo.relatedOrderId}</dd>
              </div>
            )}
            {enrichment.orderId && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.amazonOrderId")}</dt>
                <dd>{enrichment.orderId}</dd>
              </div>
            )}
            {enrichment.orderTotal != null && (
              <div className="purchase-enrichment-meta-row">
                <dt>{tl("history.amazonOrderTotal")}</dt>
                <dd>{moneyPrecise(enrichment.orderTotal, privacy)}</dd>
              </div>
            )}
          </dl>
          {items.length > 0 ? (
            <>
              {!hasItemPrices && (
                <p className="purchase-enrichment-note text-sm">
                  {tl("history.amazonNoItemPrices")}
                </p>
              )}
              <ul className="purchase-enrichment-items">
                {items.map((item) => (
                  <li key={item.asin || item.detailUrl || item.title}>
                    {item.imageUrl && !privacy && (
                      <img
                        className="purchase-enrichment-item-img"
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="purchase-enrichment-item-main">
                      {item.detailUrl ? (
                        <a href={item.detailUrl} target="_blank" rel="noopener noreferrer">
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
                ))}
              </ul>
            </>
          ) : (
            <p className="muted-note text-sm">{tl("history.amazonNoItems")}</p>
          )}
        </div>
      )}
    </div>
  );
}
