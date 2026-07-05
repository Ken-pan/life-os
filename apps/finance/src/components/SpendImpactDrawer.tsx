import { useMemo, useState } from "react";
import type { FinanceData, FundingSource, ScenarioEvent } from "../types";
import type { MonthSnapshot } from "../engine/monthly";
import { projectMonthly } from "../engine/monthly";
import { projectDaily } from "../engine/daily";
import { computeSpendImpact, liquidAfterSimulatedSpend, selectSafeToSpendBreakdown } from "../engine/metrics";
import { money, signedMoney, delayToHuman, monthToYearLabel, depositDeltaClass } from "../format";
import { todayLocalISO } from "../engine/calendar";
import { pickSpendingCard } from "../engine/finance";
import { safeToSpendAfterPurchaseExplainTitle, safeToSpendAfterPurchaseLabel } from "../copy/metrics";
import { fundingSourceLabels, liquidCashLabel, stsBreakdown } from "../copy/terminology";
import { NumberField, SelectField } from "./fields";
import { useLocale } from "../i18n/context";

type SpendType = "one-time" | "monthly";

function verdictKey(verdict: string): string {
  switch (verdict) {
    case "low":
      return "spendImpact.verdictLow";
    case "noticeable":
      return "spendImpact.verdictNoticeable";
    case "plan-change":
      return "spendImpact.verdictPlanChange";
    case "funding":
      return "spendImpact.verdictFunding";
    default:
      return "spendImpact.verdictLow";
  }
}

function quickOptions(t: (key: string) => string): {
  label: string;
  type: SpendType;
  amount: number;
  source?: FundingSource;
}[] {
  return [
    { label: t("spendImpact.quickGadget"), type: "one-time", amount: 1500, source: "checking" },
    { label: t("spendImpact.quickRent"), type: "monthly", amount: 500 },
    { label: t("spendImpact.quickSubscription"), type: "monthly", amount: 30 },
    { label: t("spendImpact.quickTravel"), type: "one-time", amount: 3000, source: "savings" },
  ];
}

export function SpendImpactDrawer({
  data,
  baseline,
  onClose,
}: {
  data: FinanceData;
  baseline: MonthSnapshot[];
  onClose: () => void;
}) {
  const { t } = useLocale();
  const quick = useMemo(() => quickOptions(t), [t]);
  const [type, setType] = useState<SpendType>("one-time");
  const [amount, setAmount] = useState<number>(0);
  const [source, setSource] = useState<FundingSource>("checking");

  const compareYears = useMemo(
    () => [5, 10, 20].filter((y) => y <= data.assumptions.horizonYears),
    [data.assumptions.horizonYears]
  );
  const spendingCard = useMemo(() => pickSpendingCard(data.accounts), [data.accounts]);
  const fundingLabels = fundingSourceLabels();
  const liquidCash = liquidCashLabel();
  const sts = stsBreakdown();
  const fundingOptions = useMemo(() => {
    const opts: { value: FundingSource; label: string }[] = [
      { value: "checking", label: fundingLabels.checking },
      { value: "savings", label: fundingLabels.savings },
      { value: "invested", label: fundingLabels.invested },
    ];
    if (spendingCard) {
      opts.push({
        value: "credit-card",
        label: spendingCard.name
          ? t("spendImpact.creditCardNamed", { name: spendingCard.name })
          : fundingLabels["credit-card"],
      });
    }
    return opts;
  }, [spendingCard, fundingLabels, t]);

  const impact = useMemo(() => {
    if (amount <= 0) return null;
    const todayISO = todayLocalISO();
    const simEvent: ScenarioEvent =
      type === "one-time"
        ? {
            id: "__sim_spend__",
            name: t("spendImpact.simOneTime"),
            eventType: "one-time-purchase",
            enabled: true,
            date: todayISO,
            monthOffset: 0,
            amount,
            fundingSource: source,
          }
        : {
            id: "__sim_spend__",
            name: t("spendImpact.simMonthly"),
            eventType: "expense-change",
            enabled: true,
            monthOffset: 1,
            amount,
          };
    const simData: FinanceData = {
      ...data,
      events: [...data.events, simEvent],
      cashFlows:
        type === "monthly"
          ? [
              ...data.cashFlows,
              {
                id: "__sim_monthly_spend__",
                name: t("spendImpact.simMonthly"),
                type: "expense",
                frequency: "monthly",
                amount,
              },
            ]
          : data.cashFlows,
    };
    const sim = projectMonthly({
      accounts: simData.accounts,
      cashFlows: simData.cashFlows,
      events: simData.events,
      goals: simData.goals,
      assumptions: simData.assumptions,
    });
    const simDailyOutlook = projectDaily(simData);
    const spend = { amount, type, fundingSource: source };
    const safeToSpendBreakdownAfter = selectSafeToSpendBreakdown({
      outlook: simDailyOutlook,
      assumptions: simData.assumptions,
      goals: simData.goals,
    });
    return computeSpendImpact({
      baseline,
      sim,
      goals: data.goals,
      safeToSpendBreakdownAfter,
      cashAfter: liquidAfterSimulatedSpend(simDailyOutlook, spend),
      compareYears,
      spend,
    });
  }, [amount, type, source, data, baseline, compareYears, t]);

  const privacy = data.privacy;
  const delayedGoals =
    impact?.goalDelays.filter(
      (g) => g.delayMonths != null && Number.isFinite(g.delayMonths) && g.delayMonths > 0
    ) ?? [];

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <h2>{t("spendImpact.title")}</h2>
          <button className="icon-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <div className="seg mb-3">
          <button className={type === "one-time" ? "active" : ""} onClick={() => setType("one-time")}>
            {t("spendImpact.typeOneTime")}
          </button>
          <button className={type === "monthly" ? "active" : ""} onClick={() => setType("monthly")}>
            {t("spendImpact.typeMonthly")}
          </button>
        </div>

        <NumberField
          label={type === "one-time" ? t("spendImpact.amount") : t("spendImpact.amountMonthly")}
          value={amount}
          onChange={setAmount}
          step={50}
          min={0}
          suffix={type === "monthly" ? t("spendImpact.perMonthSuffix") : undefined}
          placeholder="0"
        />

        {type === "one-time" && (
          <SelectField<FundingSource>
            label={t("spendImpact.fundingSource")}
            value={source}
            onChange={setSource}
            options={fundingOptions}
          />
        )}

        <div className="flex-row-tight mt-1 mb-4">
          {quick.map((q) => (
            <button
              key={q.label}
              className="chip"
              onClick={() => {
                setType(q.type);
                setAmount(q.amount);
                if (q.source) setSource(q.source);
              }}
            >
              {q.label}
            </button>
          ))}
        </div>

        {!impact && <p className="text-muted">{t("spendImpact.emptyHint")}</p>}

        {impact && (
          <>
            <div className="result-block">
              <div className="rb-title">{t("spendImpact.immediateTitle")}</div>
              <div className="kv">
                <span className="k">{t("spendImpact.liquidCashEndOfDay", { liquidCash })}</span>
                <span>{money(impact.cashAfter, privacy)}</span>
              </div>
              {type === "one-time" && source === "invested" && (
                <p className="muted-note mb-2">
                  {t("spendImpact.investedNote", { liquidCash })}
                </p>
              )}
              {type === "one-time" && source === "credit-card" && (
                <p className="muted-note mb-2">
                  {t("spendImpact.creditCardNote", { liquidCash })}
                </p>
              )}
              <div className="kv">
                <span className="k">{t("spendImpact.buffer30d", { buffer: sts.buffer })}</span>
                <span className="text-secondary">
                  {impact.operatingCashBufferOk
                    ? t("spendImpact.bufferOk", {
                        amount: money(impact.safeToSpendBreakdown.operatingCashBuffer, privacy),
                      })
                    : t("spendImpact.bufferLow", {
                        amount: money(impact.safeToSpendBreakdown.operatingCashBuffer, privacy),
                      })}
                </span>
              </div>
              <div className="kv">
                <span className="k">{safeToSpendAfterPurchaseLabel()}</span>
                <span>{money(impact.safeToSpendAfter, privacy)}</span>
              </div>
              <SafeToSpendExplain breakdown={impact.safeToSpendBreakdown} privacy={privacy} />
              <div className="kv">
                <span className="k">{t("spendImpact.monthlySurplus")}</span>
                <span className={depositDeltaClass(impact.monthlySurplusChange)}>
                  {impact.monthlySurplusChange === 0
                    ? t("spendImpact.unchanged")
                    : signedMoney(impact.monthlySurplusChange, privacy)}
                </span>
              </div>
            </div>

            <div className="result-block">
              <div className="rb-title">{t("spendImpact.longTermTitle")}</div>
              {impact.diffByYear.map((d) => (
                <div className="kv" key={d.year}>
                  <span className="k">{t("spendImpact.assetsLessInYears", { years: d.year })}</span>
                  <span className={depositDeltaClass(d.diff)}>
                    {signedMoney(d.diff, privacy)}
                  </span>
                </div>
              ))}
            </div>

            {delayedGoals.length > 0 && (
              <div className="result-block">
                <div className="rb-title">{t("spendImpact.goalDelayTitle")}</div>
                {delayedGoals.map((g) => (
                  <div className="kv" key={g.goal.id}>
                    <span className="k">{g.goal.name}</span>
                    <span className="text-secondary">
                      {delayToHuman(g.delayMonths)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <NeutralSummary impact={impact} delayedGoals={delayedGoals} privacy={privacy} />

            <div className={`verdict ${impact.verdict}`}>{t(verdictKey(impact.verdict))}</div>
          </>
        )}
      </aside>
    </>
  );
}

function SafeToSpendExplain({
  breakdown,
  privacy,
}: {
  breakdown: NonNullable<ReturnType<typeof computeSpendImpact>>["safeToSpendBreakdown"];
  privacy: boolean;
}) {
  const { t } = useLocale();
  const sts = stsBreakdown();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        className="icon-btn plain-text-btn"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t("spendImpact.collapseBreakdown") : safeToSpendAfterPurchaseExplainTitle()}
      </button>
      {open && (
        <div className="list mt-1">
          <div className="kv">
            <span className="k">{sts.lowest30d}</span>
            <span>{money(breakdown.lowestProjectedOperatingCash30d, privacy)}</span>
          </div>
          <div className="kv">
            <span className="k">{sts.buffer}</span>
            <span>{money(breakdown.operatingCashBuffer, privacy)}</span>
          </div>
          <div className="kv">
            <span className="k">{sts.goalReserve}</span>
            <span>{money(breakdown.earmarkedOperatingGoalCash, privacy)}</span>
          </div>
          <div className="kv">
            <span className="k">{sts.protectedReserve}</span>
            <span>{money(breakdown.protectedReserveExcludedUpstream, privacy)}</span>
          </div>
          <div className="kv">
            <span className="k">{sts.obligations30d}</span>
            <span>{money(breakdown.upcomingObligations30d, privacy)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NeutralSummary({
  impact,
  delayedGoals,
  privacy,
}: {
  impact: NonNullable<ReturnType<typeof computeSpendImpact>>;
  delayedGoals: NonNullable<ReturnType<typeof computeSpendImpact>>["goalDelays"];
  privacy: boolean;
}) {
  const { t } = useLocale();
  const sts = stsBreakdown();
  const ten = impact.diffByYear.find((d) => d.year === 10) ?? impact.diffByYear[impact.diffByYear.length - 1];
  const firstDelay = delayedGoals[0];
  const year = ten ? monthToYearLabel(ten.year * 12) : null;

  return (
    <p className="muted-note">
      {ten && year != null && (
        <>
          {t("spendImpact.neutralSummaryNetWorth", {
            year,
            amount: money(Math.abs(ten.diff), privacy),
          })}
        </>
      )}
      {firstDelay
        ? t("spendImpact.neutralSummaryGoalDelay", {
            name: firstDelay.goal.name,
            delay: delayToHuman(firstDelay.delayMonths),
          })
        : t("spendImpact.neutralSummaryNoGoalDelay")}
      {impact.operatingCashBufferOk
        ? t("spendImpact.neutralSummaryBufferOk", { buffer: sts.buffer })
        : t("spendImpact.neutralSummaryBufferLow", { buffer: sts.buffer })}
    </p>
  );
}
