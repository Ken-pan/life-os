import { useEffect, useRef, useState } from "react";
import type { PortfolioStickySummary } from "../../engine/portfolioAllocation";
import { useLocale } from "../../i18n/context";

export function PortfolioStickyBar({
  summary,
  hasAnyTarget,
  reviewCount,
  stanceLabel,
  onSetTarget,
  onImportAccounts,
}: {
  summary: Pick<PortfolioStickySummary, "top3Pct" | "needsAccounts">;
  hasAnyTarget: boolean;
  reviewCount: number;
  stanceLabel: string;
  onSetTarget: () => void;
  onImportAccounts?: () => void;
}) {
  const { t } = useLocale();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-72px 0px 0px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const targetNotSet = !hasAnyTarget;
  const targetDrift = hasAnyTarget && reviewCount > 0;
  const targetWarn = targetNotSet || targetDrift;
  const statusLabel = targetWarn
    ? targetNotSet
      ? t("stocks.stickySummary.targetNotSet")
      : t("stocks.stickySummary.targetDriftCount", { count: reviewCount })
    : summary.needsAccounts
      ? t("stocks.stickySummary.coveragePendingAccounts")
      : t("stocks.stickySummary.targetInRange");
  const statusWarn = targetWarn || summary.needsAccounts;
  const cta =
    !targetWarn && summary.needsAccounts && onImportAccounts
      ? { label: t("stocks.sticky.importAccounts"), onClick: onImportAccounts }
      : {
          label: targetWarn ? t("stocks.sticky.setTarget") : t("stocks.sticky.editTarget"),
          onClick: onSetTarget,
        };

  return (
    <>
      <div ref={sentinelRef} className="portfolio-sticky-sentinel" aria-hidden />
      <div
        className={`portfolio-sticky-bar ${pinned ? "is-pinned" : ""}`}
        role="region"
        aria-label={t("stocks.sticky.ariaLabel")}
        aria-hidden={!pinned}
      >
        <div className="portfolio-sticky-chips">
          <span className="portfolio-sticky-chip portfolio-sticky-chip-primary">
            {stanceLabel}
          </span>
          <span className="portfolio-sticky-chip portfolio-sticky-chip-desktop">
            {t("stocks.sticky.top3Prefix", { pct: summary.top3Pct.toFixed(1) })}
          </span>
          <span className={`portfolio-sticky-chip ${statusWarn ? "is-warn" : ""}`}>
            {statusLabel}
          </span>
        </div>
        <div className="portfolio-sticky-actions">
          <button type="button" className="btn" onClick={cta.onClick}>
            {cta.label}
          </button>
        </div>
      </div>
    </>
  );
}
