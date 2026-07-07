import type { ReactNode } from 'react'
import type { FinanceData } from '../types'
import type { Projection } from '../hooks/useProjection'
import type { Dashboard } from '../hooks/useDashboard'
import type { GoTab } from './AppShell'
import { HoldingsOverviewCard } from './stocks/HoldingsOverviewCard'
import { goalReachMonth } from '../engine/metrics'
import { signedMonthOffset } from '../engine/calendar'
import { safeToSpendLabel, safeToSpendExplainTitle } from '../copy/metrics'
import {
  accessibleLabel,
  lockedLabel,
  liquidCashLabel,
  stsBreakdown,
  welcomeTitle,
  netWorthLabel,
} from '../copy/terminology'
import { useLocale } from '../i18n/context'
import {
  money,
  signedMoney,
  pct,
  isoToCalendarLabel,
  monthOffsetToCalendarLabel,
  depositDeltaClass,
} from '../format'

function Kpi({
  label,
  value,
  sub,
  lead,
  privacy,
}: {
  label: string
  value: number
  sub?: ReactNode
  lead?: boolean
  privacy: boolean
}) {
  return (
    <div className={`card kpi${lead ? ' kpi-lead' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">{money(value, privacy)}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  )
}

export function OverviewView({
  data,
  projection,
  dashboard,
  onOpenSpend,
  onGoTab,
  onGoStocks,
  tabActive = true,
}: {
  data: FinanceData
  projection: Projection
  dashboard: Dashboard
  onOpenSpend: () => void
  onGoTab: GoTab
  onGoStocks: (snapshotId?: string) => void
  tabActive?: boolean
}) {
  const { summary, baseline } = projection
  const { derived } = dashboard
  const { t } = useLocale()
  const sts = stsBreakdown()
  const liquidCash = liquidCashLabel()
  const safeToSpend = safeToSpendLabel()
  const netWorth = netWorthLabel()
  const privacy = data.privacy
  const now = baseline[0]
  const m1 = baseline[1] ?? now

  if (data.accounts.length === 0 && data.cashFlows.length === 0) {
    return (
      <div className="empty">
        <h2 className="mb-2">{welcomeTitle()}</h2>
        <p className="text-secondary">{t('overview.emptyHint')}</p>
        <div className="flex-row-center mt-4">
          <button className="btn" onClick={() => onGoTab('accounts')}>
            {t('today.addAccounts')}
          </button>
          <button
            className="btn ghost"
            onClick={() => onGoTab('history', 'fixed')}
          >
            {t('today.addCashflows')}
          </button>
        </div>
      </div>
    )
  }

  const runway = summary.emergencyRunwayMonths

  return (
    <div className="grid gap-4">
      <p className="muted-note mb-1">{t('overview.intro')}</p>
      <div className="grid kpi-row-4">
        <Kpi
          label={netWorth}
          value={summary.netWorth}
          sub={
            <>
              {t('overview.netWorthSubPrefix')}{' '}
              <span
                className={depositDeltaClass(summary.netWorthChangeThisYear)}
              >
                {signedMoney(summary.netWorthChangeThisYear, privacy)}
              </span>
            </>
          }
          privacy={privacy}
        />
        <Kpi
          label={liquidCash}
          value={derived.liquidCash}
          sub={
            derived.cashAnchors.hasAnchoredAccounts
              ? t('overview.liquidAnchored')
              : runway != null
                ? t('overview.liquidRunway', { months: runway.toFixed(1) })
                : t('overview.liquidCheckingSavings')
          }
          privacy={privacy}
        />
        <Kpi
          label={t('terminology.invested')}
          value={summary.invested}
          sub={t('overview.investedSub', { pct: pct(summary.investedPct) })}
          privacy={privacy}
        />
        <Kpi
          label={safeToSpend}
          value={derived.safeToSpend}
          sub={t('overview.safeToSpendSub')}
          privacy={privacy}
        />
      </div>

      {(data.holdingsSnapshots?.length ?? 0) > 0 && (
        <HoldingsOverviewCard
          data={data}
          tabActive={tabActive}
          onGoStocks={onGoStocks}
        />
      )}

      <div className="card">
        <h3>{safeToSpendExplainTitle()}</h3>
        <div className="list">
          <div className="kv">
            <span className="k">{sts.lowest30d}</span>
            <span>
              {money(
                derived.safeToSpendBreakdown.lowestProjectedOperatingCash30d,
                privacy,
              )}
            </span>
          </div>
          <div className="kv">
            <span className="k">{sts.buffer}</span>
            <span>
              {money(derived.safeToSpendBreakdown.operatingCashBuffer, privacy)}
            </span>
          </div>
          <div className="kv">
            <span className="k">{sts.goalReserve}</span>
            <span>
              {money(
                derived.safeToSpendBreakdown.earmarkedOperatingGoalCash,
                privacy,
              )}
            </span>
          </div>
          <div className="kv">
            <span className="k">{sts.protectedReserve}</span>
            <span>
              {money(
                derived.safeToSpendBreakdown.protectedReserveExcludedUpstream,
                privacy,
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>{t('overview.driversTitle')}</h3>
        <ChangeDrivers now={now} m1={m1} privacy={privacy} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>{t('overview.whereMoneyGoes')}</h3>
            <button className="text-btn" onClick={() => onGoTab('forecast')}>
              {t('overview.viewForecast')}
            </button>
          </div>
          <CashflowWaterfall
            summary={summary}
            displayLiquidCash={derived.liquidCash}
            privacy={privacy}
          />
        </div>

        <div className="card">
          <h3>{t('overview.goalsTitle')}</h3>
          {data.goals.length === 0 && (
            <p className="text-muted">{t('overview.noGoals')}</p>
          )}
          <div className="list">
            {data.goals.map((g) => {
              const m = goalReachMonth(baseline, g)
              return (
                <div className="item" key={g.id}>
                  <div className="grow">
                    <div className="name">{g.name}</div>
                    <div className="meta">{money(g.target, privacy)}</div>
                  </div>
                  <div className="amount text-secondary">
                    {m == null
                      ? t('overview.goalUnreachable')
                      : t('overview.goalEta', {
                          when: monthOffsetToCalendarLabel(m),
                        })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <UpcomingFlows data={data} onGoTab={onGoTab} />

      <div className="card">
        <div className="section-head">
          <h3>{t('overview.spendImpactTitle')}</h3>
          <button className="btn" onClick={onOpenSpend}>
            {t('overview.trySpend')}
          </button>
        </div>
        <p className="muted-note">{t('overview.spendImpactHint')}</p>
      </div>
    </div>
  )
}

function ChangeDrivers({
  now,
  m1,
  privacy,
}: {
  now: Projection['baseline'][number]
  m1: Projection['baseline'][number]
  privacy: boolean
}) {
  const { t } = useLocale()
  const liquidCash = liquidCashLabel()
  const drivers = [
    { label: t('overview.driverMonthlySurplus'), delta: m1.surplus },
    {
      label: t('overview.driverOneTime'),
      delta: m1.oneTimeIncome - m1.oneTimeExpense,
    },
    {
      label: t('overview.driverInvestedChange'),
      delta: m1.invested - now.invested,
    },
    {
      label: t('overview.driverLiquidChange', { liquidCash }),
      delta: m1.liquidCash - now.liquidCash,
    },
    {
      label: t('overview.driverLiabilitiesChange'),
      delta: now.liabilities - m1.liabilities,
    },
  ]
    .filter((x) => Math.abs(x.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
  if (drivers.length === 0) {
    return <p className="muted-note">{t('overview.noDrivers')}</p>
  }
  return (
    <div className="list">
      {drivers.map((d) => (
        <div className="kv" key={d.label}>
          <span className="k">{d.label}</span>
          <span className={depositDeltaClass(d.delta)}>
            {signedMoney(d.delta, privacy)}
          </span>
        </div>
      ))}
      <p className="muted-note">{t('overview.driversNote')}</p>
    </div>
  )
}

interface UpcomingItem {
  id: string
  name: string
  month: number
  whenLabel: string
  signed: number
}

function UpcomingFlows({
  data,
  onGoTab,
}: {
  data: FinanceData
  onGoTab: GoTab
}) {
  const { t } = useLocale()
  const now = new Date()
  const items: UpcomingItem[] = []

  for (const e of data.events) {
    if (!e.enabled) continue
    if (e.eventType !== 'windfall' && e.eventType !== 'one-time-purchase')
      continue
    const month = e.date
      ? signedMonthOffset(now, e.date)
      : Math.round(e.monthOffset)
    const amt = e.amount ?? 0
    items.push({
      id: e.id,
      name: e.name,
      month,
      whenLabel: e.date
        ? isoToCalendarLabel(e.date)
        : monthOffsetToCalendarLabel(month),
      signed: e.eventType === 'windfall' ? amt : -amt,
    })
  }
  items.sort((a, b) => a.month - b.month)
  const upcoming = items.filter((i) => i.month >= 0).slice(0, 8)

  return (
    <div className="card">
      <div className="card-head">
        <h3>{t('overview.upcomingTitle')}</h3>
        <button
          className="icon-btn"
          onClick={() => onGoTab('history', 'oneoff')}
        >
          {t('overview.upcomingAdd')}
        </button>
      </div>
      {upcoming.length === 0 ? (
        <p className="muted-note">{t('overview.upcomingEmpty')}</p>
      ) : (
        <div className="list">
          {upcoming.map((i) => (
            <div className="item" key={i.id}>
              <div className="grow">
                <div className="name">{i.name}</div>
                <div className="meta">{i.whenLabel}</div>
              </div>
              <div className={`amount ${depositDeltaClass(i.signed)}`}>
                {signedMoney(i.signed, data.privacy)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CashflowWaterfall({
  summary,
  displayLiquidCash,
  privacy,
}: {
  summary: Projection['summary']
  displayLiquidCash: number
  privacy: boolean
}) {
  const { t } = useLocale()
  const accessible = accessibleLabel()
  const liquidCash = liquidCashLabel()
  const locked = lockedLabel()
  return (
    <div className="list">
      <div className="kv">
        <span className="k">
          {t('overview.accessibleAfterTax', { accessible })}
        </span>
        <span>{money(summary.accessible, privacy)}</span>
      </div>
      <div className="kv">
        <span className="k">{t('overview.locked401k', { locked })}</span>
        <span>{money(summary.locked, privacy)}</span>
      </div>
      <p className="muted-note mb-1-5">
        {t('overview.waterfallFormula', { accessible, liquidCash, locked })}
      </p>
      <div className="kv">
        <span className="k">
          {t('overview.liquidBreakdown', { liquidCash })}
        </span>
        <span>{money(displayLiquidCash, privacy)}</span>
      </div>
      {summary.investedTaxable > 0 && (
        <>
          <div className="kv">
            <span className="k">{t('overview.brokerageMarket')}</span>
            <span>{money(summary.investedTaxable, privacy)}</span>
          </div>
          {summary.taxBasisKnown ? (
            <>
              <div className="kv">
                <span className="k">{t('overview.brokerageBasis')}</span>
                <span>{money(summary.investedTaxableBasis, privacy)}</span>
              </div>
              <div className="kv">
                <span className="k">{t('overview.brokerageUnrealized')}</span>
                <span>{money(summary.unrealizedGainEstimate, privacy)}</span>
              </div>
              <div className="kv">
                <span className="k">{t('overview.brokerageTaxIfSell')}</span>
                <span>{money(summary.capitalGainsTaxEstimate, privacy)}</span>
              </div>
              <div className="kv">
                <span className="k">
                  {t('overview.brokerageAfterTax', { accessible })}
                </span>
                <span>{money(summary.investedTaxableAfterTax, privacy)}</span>
              </div>
            </>
          ) : (
            <p className="muted-note mb-1-5">
              {t('overview.brokerageNoBasis', { accessible })}
            </p>
          )}
        </>
      )}
      {summary.reserve > 0 && (
        <div className="kv">
          <span className="k">{t('overview.reserveBreakdown')}</span>
          <span>{money(summary.reserve, privacy)}</span>
        </div>
      )}
      <div className="kv">
        <span className="k">{t('overview.investedTotal')}</span>
        <span>{money(summary.invested, privacy)}</span>
      </div>
      <div className="kv">
        <span className="k">{t('overview.monthlySurplusAvg')}</span>
        <span className={depositDeltaClass(summary.monthlySurplus)}>
          {signedMoney(summary.monthlySurplus, privacy)}
        </span>
      </div>
    </div>
  )
}
