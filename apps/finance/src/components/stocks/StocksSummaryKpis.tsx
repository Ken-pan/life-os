import { money, signedMoney } from "../../format";
import { useLocale } from "../../i18n/context";

function KpiLabel({ text, tip }: { text: string; tip: string }) {
  const { t } = useLocale();
  return (
    <span className="label">
      {text}
      <span className="help-tip" tabIndex={0} aria-label={t("stocks.kpi.helpTipAria", { label: text })}>
        ?
        <span className="help-tip-pop">{tip}</span>
      </span>
    </span>
  );
}

export function StocksSummaryKpis({
  scope,
  todayReturnAmount,
  todayReturnPct,
  unrealizedGain,
  weightedTotalReturnPct,
  positionCount,
  privacy,
}: {
  scope: {
    totalInvested: number;
    taxableSecurities: number;
    taxableCostBasis?: number;
    retirementBalance: number;
    hsaBalance: number;
    lockedBalance: number;
  };
  todayReturnAmount: number | undefined;
  todayReturnPct: number | undefined;
  unrealizedGain: number | undefined;
  weightedTotalReturnPct: number | undefined;
  positionCount: number;
  privacy: boolean;
}) {
  const { t } = useLocale();
  const { totalInvested, taxableSecurities, taxableCostBasis, lockedBalance, retirementBalance, hsaBalance } =
    scope;
  const hasLocked = lockedBalance > 0;
  const hasTodayAmount = todayReturnAmount != null && Number.isFinite(todayReturnAmount);
  const todayPctLabel =
    todayReturnPct != null && Number.isFinite(todayReturnPct)
      ? `${todayReturnPct >= 0 ? "+" : ""}${todayReturnPct.toFixed(2)}%`
      : "--";
  const todayAmountLabel = hasTodayAmount ? signedMoney(todayReturnAmount as number, privacy) : "--";
  const totalReturnPctLabel =
    weightedTotalReturnPct != null && Number.isFinite(weightedTotalReturnPct)
      ? `${weightedTotalReturnPct >= 0 ? "+" : ""}${weightedTotalReturnPct.toFixed(2)}%`
      : null;
  return (
    <div className="card stocks-kpi-strip">
      <div className="stocks-kpi stocks-kpi-lead">
        <KpiLabel
          text={t("stocks.kpi.investedSnapshot")}
          tip={
            hasLocked
              ? t("stocks.kpi.investedSnapshotTipWithLocked")
              : t("stocks.kpi.investedSnapshotTipTaxableOnly")
          }
        />
        <span className="value">{money(totalInvested, privacy)}</span>
        {hasLocked ? (
          <span className="sub">
            {t("stocks.kpi.taxableSecurities", { amount: money(taxableSecurities, privacy) })}
            {retirementBalance > 0 &&
              t("stocks.kpi.retirement401k", { amount: money(retirementBalance, privacy) })}
            {hsaBalance > 0 && t("stocks.kpi.hsa", { amount: money(hsaBalance, privacy) })}
          </span>
        ) : (
          taxableCostBasis != null &&
          Number.isFinite(taxableCostBasis) && (
            <span className="sub">
              {t("stocks.kpi.totalCostSub", { amount: money(taxableCostBasis, privacy) })}
            </span>
          )
        )}
      </div>
      <div className="stocks-kpi">
        <KpiLabel text={t("stocks.kpi.dailyChange")} tip={t("stocks.kpi.dailyChangeTip")} />
        <span className="value">{todayAmountLabel}</span>
        <span className="sub">{todayPctLabel}</span>
      </div>
      <div className="stocks-kpi">
        <KpiLabel text={t("stocks.kpi.unrealizedGain")} tip={t("stocks.kpi.unrealizedGainTip")} />
        <span className="value">{signedMoney(unrealizedGain ?? 0, privacy)}</span>
        {totalReturnPctLabel && <span className="sub">{totalReturnPctLabel}</span>}
      </div>
      <div className="stocks-kpi">
        <span className="label">{t("stocks.kpi.positionCount")}</span>
        <span className="value">{positionCount}</span>
        <span className="sub">{t("stocks.kpi.positionCountSub")}</span>
      </div>
    </div>
  );
}
