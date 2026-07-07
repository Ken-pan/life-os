import { useLocale } from "../i18n/context";
import { moneyPrecise } from "../format";
import type { PurchaseEnrichment } from "../engine/purchaseEnrichment";
import { uniqueLineItems } from "../engine/purchaseEnrichment";

const DEFAULT_MAX = 3;

export function LedgerProductStrip({
  enrichment,
  privacy,
  maxItems = DEFAULT_MAX,
}: {
  enrichment: PurchaseEnrichment;
  privacy: boolean;
  maxItems?: number;
}) {
  const { t: tl } = useLocale();
  const items = uniqueLineItems(enrichment.lineItems);
  if (items.length === 0) return null;

  const shown = items.slice(0, maxItems);
  const extra = items.length - shown.length;

  return (
    <ul className="ledger-product-strip" aria-label={tl("history.ledgerProductsAria")}>
      {shown.map((item) => (
        <li className="ledger-product-chip" key={item.asin || item.detailUrl || item.title}>
          {item.imageUrl && !privacy && (
            <img
              className="ledger-product-chip-img"
              src={item.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="ledger-product-chip-text">
            {item.detailUrl ? (
              <a href={item.detailUrl} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
            ) : (
              item.title
            )}
            {(item.quantity ?? 1) > 1 && (
              <span className="ledger-product-chip-qty"> ×{item.quantity}</span>
            )}
            {item.price != null && (
              <span className="ledger-product-chip-price">
                {" "}
                {moneyPrecise(item.price, privacy)}
              </span>
            )}
          </span>
        </li>
      ))}
      {extra > 0 && (
        <li className="ledger-product-chip ledger-product-chip--more">
          {tl("history.ledgerProductsMore", { count: extra })}
        </li>
      )}
    </ul>
  );
}
