import { useState } from "react";
import type { Account, AccountType, AutoPayMode } from "../types";
import { DUE_DAY_LAST_OF_MONTH } from "../types";
import { useFinance, uid } from "../store/store";
import { money, daysSince, formatDateForIntl } from "../format";
import { DateField, NumberField, PercentField, SelectField, TextField } from "./fields";
import { todayISO } from "../format";
import { SortBySelect } from "./SortBySelect";
import { ImportSnapshotCard } from "./stocks/ImportSnapshotCard";
import { sortedSnapshots } from "../engine/holdingsPortfolio";
import { resolveCardPortal } from "../lib/cardPortals";
import { CardPortalLink } from "./CardPortalLink";
import { InstitutionLogo } from "./InstitutionLogo";
import { resolveInstitutionMetaFrom } from "../lib/institutionLogos";
import {
  accountTypeOptions,
  accountTypeLabel,
  annualFeeLabel,
  aprLabel,
  liquidCashLabel,
  reserveAccountCheckboxLabel,
  reserveAccountTooltip,
  statementBalanceLabel,
} from "../copy/terminology";
import { useLocale, type TranslateParams } from "../i18n/context";

const ACCOUNT_TYPES = accountTypeOptions;

const ASSET_TYPES: AccountType[] = [
  "checking",
  "savings",
  "hsa",
  "brokerage",
  "retirement",
  "property",
  "other",
];
const LIABILITY_TYPES: AccountType[] = ["credit-card", "mortgage", "auto-loan"];
const ACCOUNT_SORT_PRIORITY: Record<AccountType, number> = {
  checking: 0,
  savings: 1,
  hsa: 2,
  brokerage: 3,
  retirement: 4,
  property: 5,
  "credit-card": 6,
  mortgage: 7,
  "auto-loan": 8,
  other: 9,
};
type AccountSort = "logic" | "balance-desc" | "balance-asc" | "name";

function newAccount(type: AccountType): Account {
  const base: Account = { id: uid("acct"), name: "", type, balance: 0, updatedAt: todayISO() };
  if (type === "savings") base.annualReturn = 0.04;
  if (type === "brokerage" || type === "retirement" || type === "hsa") {
    base.annualReturn = 0.06;
  }
  if (type === "credit-card") {
    base.apr = 0.22;
    base.creditMode = "paid-in-full";
  }
  if (type === "auto-loan" || type === "mortgage") {
    base.apr = 0.06;
    base.monthlyPayment = 0;
  }
  return base;
}

/** 把还款日数值转成可读文案。 */
function dueDayLabel(
  dueDay: number | undefined,
  t: (key: string, params?: TranslateParams) => string
): string | null {
  if (dueDay == null) return null;
  if (dueDay === DUE_DAY_LAST_OF_MONTH || dueDay >= 29) return t("accounts.dueDayLast");
  return t("accounts.dueDayNth", { day: String(dueDay) });
}

/** 还款日输入：1-28 号，或勾选「每月最后一天」(Apple Card 等)。 */
function DueDayField({
  value,
  onChange,
}: {
  value?: number;
  onChange: (v: number) => void;
}) {
  const { t } = useLocale();
  const isLastDay = value === DUE_DAY_LAST_OF_MONTH || (value != null && value >= 29);
  return (
    <div className="field">
      <label>{t("accounts.dueDayLabel")}</label>
      {isLastDay ? (
        <input className="input" type="text" value={t("accounts.dueDayDisabled")} disabled />
      ) : (
        <input
          className="input"
          type="number"
          inputMode="numeric"
          value={value ?? 15}
          step={1}
          min={1}
          max={28}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? 15
                : Math.min(28, Math.max(1, Math.round(Number(e.target.value))))
            )
          }
        />
      )}
      <label
        className="field-inline-check mt-1 text-sm"
        title={t("accounts.dueDayAppleHint")}
      >
        <input
          type="checkbox"
          checked={isLastDay}
          onChange={(e) => onChange(e.target.checked ? DUE_DAY_LAST_OF_MONTH : 15)}
        />
        {t("accounts.dueDayLastOption")}
      </label>
    </div>
  );
}

function AccountRow({
  a,
  accounts,
  privacy,
  bulkOpenVersion,
  bulkOpenValue,
}: {
  a: Account;
  accounts: Account[];
  privacy: boolean;
  bulkOpenVersion: number;
  bulkOpenValue: boolean;
}) {
  const { t } = useLocale();
  const store = useFinance();
  const [open, setOpen] = useState(
    bulkOpenVersion > 0 ? bulkOpenValue : !a.name
  );
  const set = (patch: Partial<Account>) =>
    store.upsertAccount({
      ...a,
      ...patch,
      ...(patch.balance !== undefined ? { balanceManual: true } : {}),
      updatedAt: todayISO(),
    });
  const showReturn = ["savings", "hsa", "brokerage", "retirement"].includes(a.type);
  const isCard = a.type === "credit-card";
  // 信用卡的 APR 字段在下方卡片专属区展示，这里排除以免出现两个重复输入框。
  const isLoan = LIABILITY_TYPES.includes(a.type) && !isCard;
  const cardPortal = isCard ? resolveCardPortal(a) : null;
  const isCashAsset = ["checking", "savings", "other"].includes(a.type);
  const isAsset = ASSET_TYPES.includes(a.type);
  const isBrokerage = a.type === "brokerage";
  const canManualBalance = isBrokerage || a.type === "retirement" || a.type === "hsa";
  const paymentSources = accounts.filter(
    (x) =>
      x.id !== a.id &&
      (x.type === "checking" || x.type === "savings" || x.type === "other")
  );
  // 「应急储备」只对现金类账户生效；非现金账户的 liquid=false 仅表示非流动，不应展示为应急储备。
  const isReserve = isCashAsset && a.liquid === false;
  const age = daysSince(a.updatedAt);
  const stale = age > 30;
  const brand = resolveInstitutionMetaFrom({ name: a.name, accountType: a.type });

  return (
    <div className="flow-row account-card">
      <button className="flow-head" onClick={() => setOpen((v) => !v)}>
        <span className="account-card-watermark" aria-hidden>
          {brand.label}
        </span>
        <InstitutionLogo name={a.name} accountType={a.type} size="lg" />
        <span className="grow">
          <span className="name">
            {a.name || t("accounts.unnamed")}
            <span className="tag inline-meta">
              {accountTypeLabel(a.type)}
            </span>
            {stale && (
              <span className="tag warn inline-meta">
                {Number.isFinite(age)
                  ? t("accounts.staleDays", { days: String(age) })
                  : t("accounts.staleDaysUnknown")}
              </span>
            )}
          </span>
          <span className="meta">
            {a.updatedAt
              ? t("accounts.updatedAt", { date: formatDateForIntl(a.updatedAt) })
              : t("accounts.noUpdatedAt")}
            {isCard && a.creditMode === "paid-in-full" && (
              <span className="inline-meta">{t("accounts.paidInFull")}</span>
            )}
            {isCard && dueDayLabel(a.dueDay, t) && (
              <span className="inline-meta">
                {t("accounts.dueDayMeta", { label: dueDayLabel(a.dueDay, t)! })}
              </span>
            )}
            {cardPortal && (
              <span className="inline-meta">
                · <CardPortalLink portal={cardPortal} compact showLogo={false} />
              </span>
            )}
            {isReserve && <span className="inline-meta">{t("accounts.reserveMeta")}</span>}
          </span>
        </span>
        <span className={`amount${isAsset ? "" : " amount--negative"}`}>
          {isAsset ? money(a.balance, privacy) : `-${money(a.balance, privacy)}`}
        </span>
        <span className={`chev${open ? " open" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="flow-body">
          <div className="row">
            <TextField label={t("accounts.name")} value={a.name} onChange={(v) => set({ name: v })} placeholder={t("accounts.namePlaceholder")} />
            <SelectField label={t("accounts.type")} value={a.type} options={ACCOUNT_TYPES()} onChange={(v) => set({ type: v })} />
            <NumberField
              label={ASSET_TYPES.includes(a.type) ? t("accounts.balanceAsset") : t("accounts.balanceLiability")}
              value={a.balance}
              onChange={(v) => set({ balance: v })}
              step={100}
            />
          </div>
          <div className="row">
            {showReturn && (
              <PercentField label={t("accounts.annualReturn")} value={a.annualReturn ?? 0} onChange={(v) => set({ annualReturn: v })} />
            )}
            {isLoan && <PercentField label={aprLabel()} value={a.apr ?? 0} onChange={(v) => set({ apr: v })} />}
            {isCard && (
              <>
                <PercentField label={aprLabel()} value={a.apr ?? 0.22} onChange={(v) => set({ apr: v })} />
                <SelectField
                  label={t("accounts.creditMode")}
                  value={a.creditMode ?? "paid-in-full"}
                  options={[
                    { value: "paid-in-full", label: t("accounts.creditPaidInFull") },
                    { value: "revolving", label: t("accounts.creditRevolving") },
                  ]}
                  onChange={(v) => set({ creditMode: v })}
                />
              </>
            )}
            {(a.type === "auto-loan" || a.type === "mortgage") && (
              <>
                <NumberField label={t("accounts.monthlyPayment")} value={a.monthlyPayment ?? 0} onChange={(v) => set({ monthlyPayment: v })} step={50} />
                <NumberField
                  label={t("accounts.remainingMonths")}
                  value={a.termMonths ?? 0}
                  onChange={(v) => set({ termMonths: Math.max(0, Math.round(v)) })}
                  step={1}
                  min={0}
                />
              </>
            )}
            {isCashAsset && (
              <label
                className="field field-inline-check"
                title={reserveAccountTooltip()}
              >
                <input
                  type="checkbox"
                  checked={isReserve}
                  onChange={(e) => set({ liquid: !e.target.checked })}
                />
                {reserveAccountCheckboxLabel()}
              </label>
            )}
            <div className="field field-actions">
              <label>&nbsp;</label>
              <button className="btn danger" onClick={() => store.removeAccount(a.id)}>
                {t("accounts.delete")}
              </button>
            </div>
          </div>
          {isCard && (
            <div className="row">
              <NumberField
                label={statementBalanceLabel()}
                value={a.statementBalance ?? 0}
                onChange={(v) => set({ statementBalance: v })}
                step={50}
              />
              <DueDayField value={a.dueDay} onChange={(v) => set({ dueDay: v })} />
              <SelectField<AutoPayMode>
                label={t("accounts.autoPay")}
                value={a.autoPayMode ?? (a.creditMode === "revolving" ? "minimum" : "statement")}
                options={[
                  { value: "full-balance", label: t("accounts.autoPayFull") },
                  { value: "statement", label: t("accounts.autoPayStatement") },
                  { value: "minimum", label: t("accounts.autoPayMinimum") },
                  { value: "none", label: t("accounts.autoPayNone") },
                ]}
                onChange={(v) => set({ autoPayMode: v })}
              />
            </div>
          )}
          {isCard && (
            <div className="row">
              <SelectField
                label={t("accounts.payFrom")}
                value={a.paymentAccountId ?? ""}
                options={[
                  { value: "", label: t("accounts.payFromDefault", { liquidCash: liquidCashLabel() }) },
                  ...paymentSources.map((x) => ({
                    value: x.id,
                    label: `${x.name || t("accounts.payFromUnnamed")}${x.liquid === false ? t("accounts.payFromReserve") : ""}`,
                  })),
                ]}
                onChange={(v) => set({ paymentAccountId: v || undefined })}
              />
              <NumberField label={annualFeeLabel()} value={a.annualFee ?? 0} onChange={(v) => set({ annualFee: v })} step={5} />
              <DateField label={t("accounts.annualFeeDate")} value={a.annualFeeDate} onChange={(v) => set({ annualFeeDate: v })} />
            </div>
          )}
          {isCard && cardPortal && (
            <div className="row">
              <div className="field">
                <label>{t("accounts.website")}</label>
                <CardPortalLink portal={cardPortal} />
              </div>
            </div>
          )}
          {canManualBalance && (
            <div className="row">
              <label
                className="field field-inline-check"
                title={t("accounts.manualBalanceTitle")}
              >
                <input
                  type="checkbox"
                  checked={a.balanceManual ?? false}
                  onChange={(e) => set({ balanceManual: e.target.checked })}
                />
                {t("accounts.manualBalance")}
              </label>
            </div>
          )}
          <div className="row">
            <TextField
              label={t("accounts.note")}
              value={a.note ?? ""}
              onChange={(v) => set({ note: v || undefined })}
              placeholder={t("accounts.notePlaceholder")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function AccountsView({ onGoStocks }: { onGoStocks?: () => void }) {
  const { t, intlLocale: intlLoc } = useLocale();
  const store = useFinance();
  const { accounts, privacy, holdingsSnapshots } = store.data;
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountGroup, setAddAccountGroup] = useState<"assets" | "liabilities">("assets");
  const [accountQuery, setAccountQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<"all" | "assets" | "liabilities" | "stale" | "reserve">(
    "all"
  );
  const [accountSort, setAccountSort] = useState<AccountSort>("logic");
  const accountBulkOpenVersion = 0;
  const accountBulkOpenValue = false;

  const addAccount = (type: AccountType) => {
    store.upsertAccount(newAccount(type));
    setAddAccountOpen(false);
  };

  // 摘要行的机构 logo 堆叠：按机构去重，最多展示 8 个。
  const institutionStack = (() => {
    const seen = new Set<string>();
    const list: Account[] = [];
    for (const acct of accounts) {
      const meta = resolveInstitutionMetaFrom({ name: acct.name, accountType: acct.type });
      if (seen.has(meta.id)) continue;
      seen.add(meta.id);
      list.push(acct);
      if (list.length >= 8) break;
    }
    return list;
  })();

  const totalAssets = accounts
    .filter((a) => ASSET_TYPES.includes(a.type))
    .reduce((s, a) => s + a.balance, 0);
  const totalLiab = accounts
    .filter((a) => !ASSET_TYPES.includes(a.type))
    .reduce((s, a) => s + a.balance, 0);
  const accountQ = accountQuery.trim().toLowerCase();
  const filteredAccounts = accounts
    .filter((a) => {
      const typeText = accountTypeLabel(a.type).toLowerCase();
      const nameText = (a.name || "").toLowerCase();
      const noteText = (a.note || "").toLowerCase();
      const qOk = !accountQ || nameText.includes(accountQ) || typeText.includes(accountQ) || noteText.includes(accountQ);
      if (!qOk) return false;
      if (accountFilter === "assets") return ASSET_TYPES.includes(a.type);
      if (accountFilter === "liabilities") return LIABILITY_TYPES.includes(a.type);
      if (accountFilter === "stale") return daysSince(a.updatedAt) > 30;
      if (accountFilter === "reserve") return ["checking", "savings", "other"].includes(a.type) && a.liquid === false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (accountSort === "balance-desc") {
        const delta = Math.abs(b.balance) - Math.abs(a.balance);
        if (delta !== 0) return delta;
        return (a.name || "").localeCompare(b.name || "", intlLoc);
      }
      if (accountSort === "balance-asc") {
        const delta = Math.abs(a.balance) - Math.abs(b.balance);
        if (delta !== 0) return delta;
        return (a.name || "").localeCompare(b.name || "", intlLoc);
      }
      if (accountSort === "name") {
        return (a.name || "").localeCompare(b.name || "", intlLoc);
      }
      const typePriority = ACCOUNT_SORT_PRIORITY[a.type] - ACCOUNT_SORT_PRIORITY[b.type];
      if (typePriority !== 0) return typePriority;
      const balanceDelta = Math.abs(b.balance) - Math.abs(a.balance);
      if (balanceDelta !== 0) return balanceDelta;
      return (a.name || "").localeCompare(b.name || "", intlLoc);
    });
  const brokerageAccounts = accounts.filter((a) => a.type === "brokerage" || a.type === "retirement");
  const latestSnapshot = sortedSnapshots(holdingsSnapshots)[0] ?? null;

  return (
    <div className="grid gap-4">
      <div className="accounts-section">
        <div className="section-head">
          <h2 className="section-title flush">
            {t("accounts.sectionTitle")}
          </h2>
          <button className="icon-btn" onClick={() => setAddAccountOpen((v) => !v)}>
            {addAccountOpen ? t("accounts.addToggleOpen") : t("accounts.addToggleClosed")}
          </button>
        </div>
        <p className="muted-note mt-1">
          {t("accounts.intro")}
        </p>
        <div className="account-summary-bar">
          {institutionStack.length > 0 && (
            <span className="account-logo-stack" aria-hidden>
              {institutionStack.map((acct) => (
                <InstitutionLogo
                  key={acct.id}
                  name={acct.name}
                  accountType={acct.type}
                  size="sm"
                />
              ))}
            </span>
          )}
          <span className="text-secondary">
            {t("accounts.assetsSummary")}{" "}
            <strong className="account-summary-pos">{money(totalAssets, privacy)}</strong>
            {" · "}
            {t("accounts.liabilitiesSummary")}{" "}
            <strong className="account-summary-neg">{money(totalLiab, privacy)}</strong>
          </span>
        </div>
        <div className="filter-bar">
          <div className="field filter-bar-search">
            <label>{t("accounts.searchLabel")}</label>
            <input
              className="input"
              value={accountQuery}
              onChange={(e) => setAccountQuery(e.target.value)}
              placeholder={t("accounts.searchPlaceholder")}
            />
          </div>
          <div className="field filter-bar-filters">
            <label>{t("accounts.filterLabel")}</label>
            <div className="seg">
              <button className={accountFilter === "all" ? "active" : ""} onClick={() => setAccountFilter("all")}>
                {t("accounts.filterAll")}
              </button>
              <button className={accountFilter === "assets" ? "active" : ""} onClick={() => setAccountFilter("assets")}>
                {t("accounts.filterAssets")}
              </button>
              <button
                className={accountFilter === "liabilities" ? "active" : ""}
                onClick={() => setAccountFilter("liabilities")}
              >
                {t("accounts.filterLiabilities")}
              </button>
              <button className={accountFilter === "stale" ? "active" : ""} onClick={() => setAccountFilter("stale")}>
                {t("accounts.filterStale")}
              </button>
              <button
                className={accountFilter === "reserve" ? "active" : ""}
                onClick={() => setAccountFilter("reserve")}
              >
                {t("accounts.filterReserve")}
              </button>
            </div>
          </div>
          <SortBySelect
            label={t("accounts.sortLabel")}
            value={accountSort}
            onChange={setAccountSort}
            options={[
              { id: "logic", label: t("accounts.sortLogic") },
              { id: "balance-desc", label: t("accounts.sortBalanceDesc") },
              { id: "balance-asc", label: t("accounts.sortBalanceAsc") },
              { id: "name", label: t("accounts.sortName") },
            ]}
          />
        </div>
        {addAccountOpen && (
          <div className="chart-controls mt-2">
            <div className="seg">
              <button
                className={addAccountGroup === "assets" ? "active" : ""}
                onClick={() => setAddAccountGroup("assets")}
              >
                {t("accounts.filterAssets")}
              </button>
              <button
                className={addAccountGroup === "liabilities" ? "active" : ""}
                onClick={() => setAddAccountGroup("liabilities")}
              >
                {t("accounts.filterLiabilities")}
              </button>
            </div>
            {(addAccountGroup === "assets"
              ? ACCOUNT_TYPES().filter((opt) => ASSET_TYPES.includes(opt.value))
              : ACCOUNT_TYPES().filter((opt) => LIABILITY_TYPES.includes(opt.value))
            ).map((opt) => (
              <button key={opt.value} className="icon-btn" onClick={() => addAccount(opt.value)}>
                + {opt.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3">
          {accounts.length === 0 && <div className="empty">{t("accounts.empty")}</div>}
          {accounts.length > 0 && filteredAccounts.length === 0 && (
            <div className="empty">{t("accounts.emptyFilter")}</div>
          )}
          {filteredAccounts.map((a) => (
            <AccountRow
              key={`${a.id}-${accountBulkOpenVersion}`}
              a={a}
              accounts={accounts}
              privacy={privacy}
              bulkOpenVersion={accountBulkOpenVersion}
              bulkOpenValue={accountBulkOpenValue}
            />
          ))}
        </div>
      </div>

      <div className="accounts-section">
        <div className="section-head">
          <h2 className="section-title flush">
            {t("accounts.holdingsTitle")}
          </h2>
          {onGoStocks && (
            <button className="btn" onClick={onGoStocks}>
              {t("accounts.goStocks")}
            </button>
          )}
        </div>
        {latestSnapshot ? (
          <p className="muted-note mt-1">
            {t("accounts.snapshotSummary", {
              date:
                latestSnapshot.asOfDate +
                (latestSnapshot.asOfTimeLocal ? ` · ${latestSnapshot.asOfTimeLocal}` : ""),
              value: money(latestSnapshot.holdingsMarketValue, privacy),
              count: String(latestSnapshot.positionCount),
            })}{" "}
            {t("accounts.snapshotHint")}
          </p>
        ) : (
          <p className="muted-note mt-1">
            {t("accounts.importHint")}
          </p>
        )}
        <ImportSnapshotCard
          accounts={accounts}
          privacy={privacy}
          brokerageAccounts={brokerageAccounts}
          compact
        />
      </div>
    </div>
  );
}
