import { useEffect, useMemo, useState } from "react";
import type { FundingSource, ScenarioEvent } from "../types";
import { useFinance } from "../store/store";
import { fundingSourceLabels } from "../copy/terminology";
import { pickSpendingCard } from "../engine/finance";
import { useTransactions } from "../store/transactions";
import { useTimeline } from "../store/timeline";
import { signedMonthOffset } from "../engine/calendar";
import {
  classifyEventClosure,
  confirmOccurredLabel,
  displayStatusClass,
  displayStatusLabel,
  occurrenceDisplayStatus,
  occurrenceForEvent,
  rankTxnCandidates,
  type ExpectedOccurrence,
} from "../engine/timeline";
import type { Txn } from "../engine/transactions";
import { isoToCalendarLabel, signedMoney, depositDeltaClass } from "../format";
import { DateField, NumberField, SelectField, TextField } from "./fields";
import { SortBySelect } from "./SortBySelect";
import type { GoTab } from "./AppShell";
import { useLocale } from "../i18n/context";
import { t as translate } from "../i18n/translate";

const ARCHIVE_MONTHS = 12;

function eventMonth(e: ScenarioEvent, now: Date): number {
  return e.date ? signedMonthOffset(now, e.date) : Math.round(e.monthOffset ?? 0);
}

function eventSortKey(e: ScenarioEvent): number {
  if (e.date) {
    const ts = new Date(e.date).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return Math.round((e.monthOffset ?? 0) * 30) * 24 * 60 * 60 * 1000;
}

function relativeWhen(months: number, tr: (key: string, params?: Record<string, string | number>) => string): string {
  if (months === 0) return tr("futureCashflow.thisMonth");
  const abs = Math.abs(months);
  const y = Math.floor(abs / 12);
  const m = abs % 12;
  let span: string;
  if (y > 0) {
    span = m > 0 ? translate("format.yearsMonths", { y, m }) : translate("format.yearsOnly", { y });
  } else {
    span = translate("format.monthsOnly", { m });
  }
  return months > 0 ? tr("futureCashflow.relativeAfter", { span }) : tr("futureCashflow.relativeBefore", { span });
}

function monthsBefore(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isArchived(eventDate: string | undefined, now: Date): boolean {
  if (!eventDate) return false;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return eventDate < monthsBefore(todayIso, ARCHIVE_MONTHS);
}

function sortEvents(
  items: ScenarioEvent[],
  mode: "timeline" | "amount-desc" | "name" | "latest",
  intlLoc: string
): ScenarioEvent[] {
  return items.slice().sort((a, b) => {
    if (mode === "amount-desc") return (b.amount ?? 0) - (a.amount ?? 0);
    if (mode === "name") return a.name.localeCompare(b.name, intlLoc);
    const delta =
      mode === "latest"
        ? eventSortKey(b) - eventSortKey(a)
        : eventSortKey(a) - eventSortKey(b);
    if (delta !== 0) return delta;
    return a.name.localeCompare(b.name, intlLoc);
  });
}

function StatusBadge({ occ }: { occ?: ExpectedOccurrence }) {
  if (!occ) return null;
  const status = occurrenceDisplayStatus(occ);
  return (
    <span className={`occ-status-pill ${displayStatusClass(status)} inline-meta`}>
      {displayStatusLabel(status)}
    </span>
  );
}

function TxnLinkPicker({
  occ,
  txns,
  privacy,
  onPick,
  onCancel,
}: {
  occ: ExpectedOccurrence;
  txns: Txn[];
  privacy: boolean;
  onPick: (txnId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const candidates = useMemo(() => rankTxnCandidates(occ, txns), [occ, txns]);
  return (
    <div className="oneoff-link-picker">
      {candidates.length === 0 ? (
        <p className="muted-note">{t("futureCashflow.noMatchingTxn")}</p>
      ) : (
        <div className="list">
          {candidates.map((txn) => (
            <button
              key={txn.id}
              type="button"
              className="oneoff-link-row"
              onClick={() => txn.id && onPick(txn.id)}
            >
              <span className="grow">
                <span className="name">{txn.merchant || txn.category || t("futureCashflow.txnFallback")}</span>
                <span className="meta">{txn.date}</span>
              </span>
              <span className={`amount ${depositDeltaClass(txn.amount)}`}>
                {signedMoney(txn.amount, privacy)}
              </span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn ghost mt-2" onClick={onCancel}>
        {t("futureCashflow.cancel")}
      </button>
    </div>
  );
}

function FlowRow({
  e,
  now,
  occ,
  matchedTxn,
  txns,
  showActions,
  onSkip,
  onConfirm,
  onLinkTxn,
  onViewLedger,
}: {
  e: ScenarioEvent;
  now: Date;
  occ?: ExpectedOccurrence;
  matchedTxn?: Txn;
  txns: Txn[];
  showActions?: boolean;
  onSkip?: (occId: string) => void;
  onConfirm?: (occId: string) => void;
  onLinkTxn?: (occId: string, txnId: string) => void;
  onViewLedger?: (name: string) => void;
}) {
  const { t } = useLocale();
  const store = useFinance();
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const set = (patch: Partial<ScenarioEvent>) => store.upsertEvent({ ...e, ...patch });
  const spendingCard = useMemo(
    () => pickSpendingCard(store.data.accounts),
    [store.data.accounts]
  );
  const fundingOptions = useMemo(() => {
    const opts: { value: FundingSource; label: string }[] = [
      { value: "checking", label: fundingSourceLabels().checking },
      { value: "savings", label: fundingSourceLabels().savings },
      { value: "invested", label: fundingSourceLabels().invested },
    ];
    if (spendingCard) {
      opts.push({
        value: "credit-card",
        label: spendingCard.name
          ? t("futureCashflow.creditCardNamed", { name: spendingCard.name })
          : t("futureCashflow.creditCardDefault"),
      });
    }
    return opts;
  }, [spendingCard, t]);

  const isIncome = e.eventType === "windfall";
  const months = eventMonth(e, now);
  const amt = e.amount ?? 0;
  const signed = isIncome ? amt : -amt;

  return (
    <div
      id={`oneoff-event-${e.id}`}
      className={`oneoff-event-row flow-row-wrap${e.enabled ? "" : " is-off"}`}
    >
    <div className={`flow-row${e.enabled ? "" : " is-off"}`}>
      <button type="button" className="flow-head" onClick={() => setOpen((v) => !v)}>
        <span className={`dot ${isIncome ? "ok" : "critical"}`} />
        <span className="grow">
          <span className="name">
            {e.name}
            {!e.enabled && <span className="tag inline-meta">{t("futureCashflow.disabledTag")}</span>}
            <StatusBadge occ={occ} />
          </span>
          <span className="meta">
            {relativeWhen(months, t)}
            {e.date ? ` · ${isoToCalendarLabel(e.date)}` : ""}
            {matchedTxn && (
              <span className="tag inline-meta">
                {t("futureCashflow.linkedTxn", {
                  name: matchedTxn.merchant || matchedTxn.category || "",
                })}
              </span>
            )}
          </span>
        </span>
        <span className={`amount ${depositDeltaClass(signed)}`}>
          {signedMoney(signed, store.data.privacy)}
        </span>
        <span className={`chev${open ? " open" : ""}`}>⌄</span>
      </button>

      {showActions && occ && !linkOpen && (
        <div className="oneoff-actions">
          <button type="button" className="occ-micro-btn primary" onClick={() => onConfirm?.(occ.id)}>
            {confirmOccurredLabel(occ)}
          </button>
          <button type="button" className="occ-micro-btn" onClick={() => setLinkOpen(true)}>
            {t("futureCashflow.linkTxn")}
          </button>
          <button type="button" className="occ-micro-btn" onClick={() => onSkip?.(occ.id)}>
            {t("futureCashflow.notOccurred")}
          </button>
          {onViewLedger && (
            <button type="button" className="occ-micro-btn" onClick={() => onViewLedger(e.name)}>
              {t("futureCashflow.viewLedger")}
            </button>
          )}
        </div>
      )}

      {linkOpen && occ && onLinkTxn && (
        <TxnLinkPicker
          occ={occ}
          txns={txns}
          privacy={store.data.privacy}
          onPick={(txnId) => {
            onLinkTxn(occ.id, txnId);
            setLinkOpen(false);
          }}
          onCancel={() => setLinkOpen(false)}
        />
      )}

      {open && (
        <div className="flow-body">
          <div className="row">
            <TextField label={t("futureCashflow.name")} value={e.name} onChange={(v) => set({ name: v })} />
            <SelectField
              label={t("futureCashflow.type")}
              value={e.eventType}
              options={[
                { value: "windfall", label: t("futureCashflow.typeWindfall") },
                { value: "one-time-purchase", label: t("futureCashflow.typeOneTimePurchase") },
              ]}
              onChange={(v) =>
                set({
                  eventType: v,
                  fundingSource:
                    v === "one-time-purchase" ? e.fundingSource ?? "checking" : undefined,
                })
              }
            />
            <DateField
              label={t("futureCashflow.date")}
              value={e.date}
              onChange={(v) =>
                set({
                  date: v || undefined,
                  monthOffset: v ? signedMonthOffset(now, v) : e.monthOffset,
                })
              }
            />
            <NumberField
              label={t("futureCashflow.amount")}
              value={e.amount ?? 0}
              onChange={(v) => set({ amount: v })}
              step={50}
              min={0}
            />
          </div>
          <div className="row">
            {!isIncome && (
              <SelectField<FundingSource>
                label={t("futureCashflow.fundingSource")}
                value={e.fundingSource ?? "checking"}
                options={fundingOptions}
                onChange={(v) => set({ fundingSource: v })}
              />
            )}
            <div className="field field-actions">
              <label>&nbsp;</label>
              <div className="flex-row-tight">
                <button type="button" className="btn ghost" onClick={() => store.toggleEvent(e.id)}>
                  {e.enabled ? t("futureCashflow.disable") : t("futureCashflow.enable")}
                </button>
                <button type="button" className="btn danger" onClick={() => store.removeEvent(e.id)}>
                  {t("futureCashflow.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

export function FutureCashflowView({
  onGoTab,
  focusEventId,
  onFocusConsumed,
}: {
  onGoTab?: GoTab;
  focusEventId?: string;
  onFocusConsumed?: () => void;
}) {
  const { t, intlLocale: intlLoc } = useLocale();
  const store = useFinance();
  const { txns } = useTransactions();
  const timeline = useTimeline();
  const now = useMemo(() => new Date(), []);
  const [plannedSort, setPlannedSort] = useState<"timeline" | "amount-desc" | "name">("timeline");
  const [pendingSort, setPendingSort] = useState<"latest" | "amount-desc" | "name">("latest");
  const [closedSort, setClosedSort] = useState<"latest" | "amount-desc" | "name">("latest");
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const all = useMemo(
    () =>
      store.data.events.filter(
        (e) => e.eventType === "windfall" || e.eventType === "one-time-purchase"
      ),
    [store.data.events]
  );

  const enriched = useMemo(
    () =>
      all.map((e) => {
        const occ = occurrenceForEvent(timeline.occurrences, e.id, e.date);
        const bucket = classifyEventClosure(e, occ, now);
        const matchedTxn = occ?.matchedTxnId
          ? txns.find((txn) => txn.id === occ.matchedTxnId)
          : undefined;
        return { e, occ, bucket, matchedTxn };
      }),
    [all, timeline.occurrences, now, txns]
  );

  const planned = sortEvents(
    enriched.filter((x) => x.bucket === "planned").map((x) => x.e),
    plannedSort,
    intlLoc
  );
  const pending = sortEvents(
    enriched.filter((x) => x.bucket === "pending").map((x) => x.e),
    pendingSort,
    intlLoc
  );
  const closedAll = enriched.filter((x) => x.bucket === "closed");
  const closedRecent = closedAll.filter((x) => !isArchived(x.e.date, now));
  const closedArchived = closedAll.filter((x) => isArchived(x.e.date, now));
  const closedShown = showArchived ? closedAll : closedRecent;

  const lookup = useMemo(() => {
    const map = new Map<string, (typeof enriched)[number]>();
    for (const row of enriched) map.set(row.e.id, row);
    return map;
  }, [enriched]);

  useEffect(() => {
    if (!focusEventId) return;
    const row = lookup.get(focusEventId);
    if (row?.bucket === "closed") setShowClosed(true);

    const timer = window.setTimeout(() => {
      const el = document.getElementById(`oneoff-event-${focusEventId}`);
      if (!el) {
        onFocusConsumed?.();
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("is-focused");
      window.setTimeout(() => {
        el.classList.remove("is-focused");
        onFocusConsumed?.();
      }, 2200);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [focusEventId, lookup, onFocusConsumed]);

  const renderRow = (e: ScenarioEvent, showActions = false) => {
    const row = lookup.get(e.id);
    return (
      <FlowRow
        key={e.id}
        e={e}
        now={now}
        occ={row?.occ}
        matchedTxn={row?.matchedTxn}
        txns={txns}
        showActions={showActions}
        onSkip={(id) => void timeline.markSkipped(id)}
        onConfirm={(id) => void timeline.markConfirmedPaid(id)}
        onLinkTxn={(occId, txnId) => void timeline.markMatchedWithTxn(occId, txnId)}
        onViewLedger={
          onGoTab
            ? (name) => onGoTab("history", "insights", { ledgerSearch: name })
            : undefined
        }
      />
    );
  };

  const sortOptions = [
    { id: "timeline" as const, label: t("futureCashflow.sortTimeline") },
    { id: "amount-desc" as const, label: t("futureCashflow.sortAmountDesc") },
    { id: "name" as const, label: t("futureCashflow.sortName") },
  ];
  const latestSortOptions = [
    { id: "latest" as const, label: t("futureCashflow.sortLatest") },
    { id: "amount-desc" as const, label: t("futureCashflow.sortAmountDesc") },
    { id: "name" as const, label: t("futureCashflow.sortName") },
  ];

  return (
    <div className="grid gap-5">
      <p className="muted-note">{t("futureCashflow.intro")}</p>

      <section className="oneoff-section">
        <div className="section-head-inline">
          <h2 className="section-title flush">{t("futureCashflow.plannedTitle")}</h2>
          <SortBySelect
            label={t("futureCashflow.sort")}
            value={plannedSort}
            onChange={setPlannedSort}
            compact
            options={sortOptions}
          />
        </div>
        <div className="grid gap-2 mt-3">
          {planned.length === 0 && (
            <div className="empty">{t("futureCashflow.plannedEmpty")}</div>
          )}
          {planned.map((e) => renderRow(e))}
        </div>
      </section>

      {pending.length > 0 && (
        <section className="oneoff-section oneoff-section-pending">
          <div className="section-head-inline">
            <h2 className="section-title flush">
              {t("futureCashflow.pendingTitle")}
              <span className="tag warn inline-meta">{pending.length}</span>
            </h2>
            <div className="section-head-actions">
              {onGoTab && (
                <button type="button" className="icon-btn" onClick={() => onGoTab("today")}>
                  {t("futureCashflow.viewInToday")}
                </button>
              )}
              <SortBySelect
              label={t("futureCashflow.sort")}
              value={pendingSort}
              onChange={setPendingSort}
              compact
              options={latestSortOptions}
            />
            </div>
          </div>
          <p className="muted-note mt-2">{t("futureCashflow.pendingIntro")}</p>
          <div className="grid gap-2 mt-3">
            {pending.map((e) => renderRow(e, true))}
          </div>
        </section>
      )}

      {closedAll.length > 0 && (
        <section className="oneoff-section">
          <button type="button" className="group-toggle" onClick={() => setShowClosed((v) => !v)}>
            <span className={`chev${showClosed ? " open" : ""}`}>⌄</span>
            {t("futureCashflow.closedTitle", { count: closedAll.length })}
            {closedArchived.length > 0 && !showArchived && (
              <span className="tag inline-meta">
                {t("futureCashflow.archivedTag", {
                  count: closedArchived.length,
                  months: ARCHIVE_MONTHS,
                })}
              </span>
            )}
          </button>
          {showClosed && (
            <div className="grid gap-2 mt-2 past-group">
              <div className="section-head-inline">
                <SortBySelect
                  label={t("futureCashflow.sort")}
                  value={closedSort}
                  onChange={setClosedSort}
                  compact
                  options={latestSortOptions}
                />
                {closedArchived.length > 0 && (
                  <button type="button" className="btn ghost" onClick={() => setShowArchived((v) => !v)}>
                    {showArchived
                      ? t("futureCashflow.hideOlder")
                      : t("futureCashflow.showOlder", {
                          months: ARCHIVE_MONTHS,
                          count: closedArchived.length,
                        })}
                  </button>
                )}
              </div>
              {sortEvents(
                closedShown.map((x) => x.e),
                closedSort,
                intlLoc
              ).map((e) => renderRow(e))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
