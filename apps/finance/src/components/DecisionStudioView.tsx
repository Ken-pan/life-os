import { useEffect, useMemo, useState } from "react";
import type {
  DecisionRecord,
  DecisionStatus,
  Scenario,
  ScenarioEvent,
  ScenarioType,
} from "../types";
import { useFinance, uid } from "../store/store";
import { formatDateTimeForIntl, money, signedMoney } from "../format";
import { selectDecisionComparison, type DecisionComparison } from "../engine/decision";
import { safeToSpendLabel } from "../copy/metrics";
import {
  getDecisionConfidenceLabels,
  decisionStatusLabel,
  scenarioStatusLabel,
  scenarioTypeLabel,
} from "../copy/terminology";
import { useLocale } from "../i18n/context";
import type { TranslateParams } from "../i18n/translate";
import {
  DateField,
  NumberField,
  PercentField,
  SelectField,
  TextField,
} from "./fields";
import * as repo from "../lib/repo";
import { BASELINE_SCENARIO_ID } from "../store/defaults";
import { HorizontalTabs, TabPanel } from "./HorizontalTabs";

type StudioTab = "compare" | "saved" | "log";
type TemplateType =
  | "purchase"
  | "recurring_cost"
  | "wait_buy_later"
  | "cash_vs_finance"
  | "rent_change"
  | "travel"
  | "career_break"
  | "partner_contribution";

type TranslateFn = (key: string, params?: TranslateParams) => string;

type AdvancedField = "downPayment" | "apr" | "termMonths" | "moveCost";

type FieldNumberConfig = {
  label: string;
  hint: string;
  suffix?: string;
  isMonthlyAmount?: boolean;
  optional?: boolean;
};

type TemplateFieldConfig = {
  summary: string;
  amount?: FieldNumberConfig;
  monthly?: FieldNumberConfig;
  startDate?: { label: string; hint: string };
  partnerPercent?: { label: string; hint: string };
  advanced?: AdvancedField[];
};

function getTemplates(t: TranslateFn): { id: TemplateType; label: string }[] {
  return [
    { id: "purchase", label: t("decisionStudio.template.purchase") },
    { id: "recurring_cost", label: t("decisionStudio.template.recurring_cost") },
    { id: "cash_vs_finance", label: t("decisionStudio.template.cash_vs_finance") },
    { id: "rent_change", label: t("decisionStudio.template.rent_change") },
    { id: "travel", label: t("decisionStudio.template.travel") },
    { id: "career_break", label: t("decisionStudio.template.career_break") },
    { id: "partner_contribution", label: t("decisionStudio.template.partner_contribution") },
    { id: "wait_buy_later", label: t("decisionStudio.template.wait_buy_later") },
  ];
}

function getTemplateFieldConfig(t: TranslateFn): Record<TemplateType, TemplateFieldConfig> {
  const usd = t("decisionStudio.suffixUsd");
  const usdMo = t("decisionStudio.suffixUsdPerMonth");
  return {
    purchase: {
      summary: t("decisionStudio.field.purchase.summary"),
      amount: {
        label: t("decisionStudio.field.purchase.amountLabel"),
        hint: t("decisionStudio.field.purchase.amountHint"),
        suffix: usd,
      },
      startDate: {
        label: t("decisionStudio.field.purchase.startDateLabel"),
        hint: t("decisionStudio.field.purchase.startDateHint"),
      },
    },
    wait_buy_later: {
      summary: t("decisionStudio.field.wait_buy_later.summary"),
      amount: {
        label: t("decisionStudio.field.wait_buy_later.amountLabel"),
        hint: t("decisionStudio.field.wait_buy_later.amountHint"),
        suffix: usd,
      },
      startDate: {
        label: t("decisionStudio.field.wait_buy_later.startDateLabel"),
        hint: t("decisionStudio.field.wait_buy_later.startDateHint"),
      },
    },
    recurring_cost: {
      summary: t("decisionStudio.field.recurring_cost.summary"),
      monthly: {
        label: t("decisionStudio.field.recurring_cost.monthlyLabel"),
        hint: t("decisionStudio.field.recurring_cost.monthlyHint"),
        suffix: usdMo,
      },
      startDate: {
        label: t("decisionStudio.field.recurring_cost.startDateLabel"),
        hint: t("decisionStudio.field.recurring_cost.startDateHint"),
      },
    },
    cash_vs_finance: {
      summary: t("decisionStudio.field.cash_vs_finance.summary"),
      amount: {
        label: t("decisionStudio.field.cash_vs_finance.amountLabel"),
        hint: t("decisionStudio.field.cash_vs_finance.amountHint"),
        suffix: usd,
      },
      monthly: {
        label: t("decisionStudio.field.cash_vs_finance.monthlyLabel"),
        hint: t("decisionStudio.field.cash_vs_finance.monthlyHint"),
        suffix: usdMo,
        optional: true,
      },
      startDate: {
        label: t("decisionStudio.field.cash_vs_finance.startDateLabel"),
        hint: t("decisionStudio.field.cash_vs_finance.startDateHint"),
      },
      advanced: ["downPayment", "apr", "termMonths"],
    },
    rent_change: {
      summary: t("decisionStudio.field.rent_change.summary"),
      monthly: {
        label: t("decisionStudio.field.rent_change.monthlyLabel"),
        hint: t("decisionStudio.field.rent_change.monthlyHint"),
        suffix: usdMo,
      },
      startDate: {
        label: t("decisionStudio.field.rent_change.startDateLabel"),
        hint: t("decisionStudio.field.rent_change.startDateHint"),
      },
      advanced: ["moveCost"],
    },
    travel: {
      summary: t("decisionStudio.field.travel.summary"),
      amount: {
        label: t("decisionStudio.field.travel.amountLabel"),
        hint: t("decisionStudio.field.travel.amountHint"),
        suffix: usd,
      },
      monthly: {
        label: t("decisionStudio.field.travel.monthlyLabel"),
        hint: t("decisionStudio.field.travel.monthlyHint"),
        suffix: usdMo,
        optional: true,
      },
      startDate: {
        label: t("decisionStudio.field.travel.startDateLabel"),
        hint: t("decisionStudio.field.travel.startDateHint"),
      },
    },
    career_break: {
      summary: t("decisionStudio.field.career_break.summary"),
      monthly: {
        label: t("decisionStudio.field.career_break.monthlyLabel"),
        hint: t("decisionStudio.field.career_break.monthlyHint"),
        suffix: usdMo,
      },
      amount: {
        label: t("decisionStudio.field.career_break.amountLabel"),
        hint: t("decisionStudio.field.career_break.amountHint"),
        suffix: usdMo,
        isMonthlyAmount: true,
        optional: true,
      },
      startDate: {
        label: t("decisionStudio.field.career_break.startDateLabel"),
        hint: t("decisionStudio.field.career_break.startDateHint"),
      },
    },
    partner_contribution: {
      summary: t("decisionStudio.field.partner_contribution.summary"),
      partnerPercent: {
        label: t("decisionStudio.field.partner_contribution.partnerPercentLabel"),
        hint: t("decisionStudio.field.partner_contribution.partnerPercentHint"),
      },
      startDate: {
        label: t("decisionStudio.field.partner_contribution.startDateLabel"),
        hint: t("decisionStudio.field.partner_contribution.startDateHint"),
      },
    },
  };
}

function getAdvancedFieldLabels(t: TranslateFn): Record<
  AdvancedField,
  { label: string; hint: string; suffix?: string; isPercent?: boolean }
> {
  return {
    downPayment: {
      label: t("decisionStudio.advanced.downPaymentLabel"),
      hint: t("decisionStudio.advanced.downPaymentHint"),
      suffix: t("decisionStudio.suffixUsd"),
    },
    apr: {
      label: t("decisionStudio.advanced.aprLabel"),
      hint: t("decisionStudio.advanced.aprHint"),
      isPercent: true,
    },
    termMonths: {
      label: t("decisionStudio.advanced.termMonthsLabel"),
      hint: t("decisionStudio.advanced.termMonthsHint"),
      suffix: t("decisionStudio.suffixMonths"),
    },
    moveCost: {
      label: t("decisionStudio.advanced.moveCostLabel"),
      hint: t("decisionStudio.advanced.moveCostHint"),
      suffix: t("decisionStudio.suffixUsd"),
    },
  };
}

function estimatedFinancePayment(input: {
  amount: number;
  downPayment: number;
  apr: number;
  termMonths: number;
}): number {
  return (
    ((input.amount - input.downPayment) * (1 + input.apr)) / Math.max(1, input.termMonths)
  );
}

function describeTemplateInput(
  t: TranslateFn,
  input: {
    template: TemplateType;
    amount: number;
    monthlyAmount: number;
    startDate?: string;
    apr: number;
    termMonths: number;
    downPayment: number;
    moveCost: number;
    partnerPercent: number;
    privacy: boolean;
  }
): string[] {
  const cfg = getTemplateFieldConfig(t)[input.template];
  const dateLabel = input.startDate || t("decisionStudio.input.defaultDate");
  const lines: string[] = [];

  switch (input.template) {
    case "purchase":
    case "wait_buy_later":
      lines.push(
        t("decisionStudio.input.oneTimePurchase", {
          amount: money(input.amount, input.privacy),
          date: dateLabel,
        })
      );
      break;
    case "recurring_cost":
      lines.push(
        t("decisionStudio.input.recurringLine", {
          direction:
            input.monthlyAmount >= 0
              ? t("decisionStudio.input.recurringIncrease")
              : t("decisionStudio.input.recurringDecrease"),
          amount: money(Math.abs(input.monthlyAmount), input.privacy),
          date: dateLabel,
        })
      );
      break;
    case "cash_vs_finance": {
      const payment =
        input.monthlyAmount > 0
          ? input.monthlyAmount
          : estimatedFinancePayment(input);
      lines.push(
        t("decisionStudio.input.downPaymentLine", {
          amount: money(input.downPayment, input.privacy),
          date: dateLabel,
        })
      );
      lines.push(
        t("decisionStudio.input.monthlyPaymentLine", {
          payment: money(Math.round(payment), input.privacy),
          term: input.termMonths,
          apr: (input.apr * 100).toFixed(1),
        })
      );
      break;
    }
    case "rent_change":
      lines.push(
        t("decisionStudio.input.rentLine", {
          direction:
            input.monthlyAmount >= 0
              ? t("decisionStudio.input.rentIncrease")
              : t("decisionStudio.input.rentDecrease"),
          amount: money(Math.abs(input.monthlyAmount), input.privacy),
          date: dateLabel,
        })
      );
      if (input.moveCost > 0) {
        lines.push(
          t("decisionStudio.input.moveCostLine", {
            amount: money(input.moveCost, input.privacy),
          })
        );
      }
      break;
    case "travel":
      lines.push(
        t("decisionStudio.input.travelSpend", {
          amount: money(input.amount, input.privacy),
          date: dateLabel,
        })
      );
      if (input.monthlyAmount > 0) {
        lines.push(
          t("decisionStudio.input.travelSave", {
            amount: money(input.monthlyAmount, input.privacy),
          })
        );
      }
      break;
    case "career_break":
      lines.push(
        t("decisionStudio.input.incomeReduction", {
          amount: money(Math.abs(input.monthlyAmount), input.privacy),
          date: dateLabel,
        })
      );
      if (input.amount !== 0) {
        lines.push(
          t("decisionStudio.input.tempExpense", {
            amount: money(input.amount, input.privacy),
          })
        );
      }
      break;
    case "partner_contribution":
      lines.push(
        t("decisionStudio.input.partnerLine", {
          percent: Math.round(input.partnerPercent * 100),
          date: dateLabel,
        })
      );
      break;
  }

  if (lines.length === 0 && cfg.summary) lines.push(cfg.summary);
  return lines;
}

function decisionStatusOptions(): { value: DecisionStatus; label: string }[] {
  const statuses: DecisionStatus[] = [
    "considering",
    "chosen",
    "declined",
    "deferred",
    "reviewed",
  ];
  return statuses.map((value) => ({ value, label: decisionStatusLabel(value) }));
}

function scenarioTypeFromTemplate(template: TemplateType): ScenarioType {
  if (template === "purchase" || template === "wait_buy_later") return "purchase";
  if (template === "recurring_cost") return "recurring_cost";
  if (template === "cash_vs_finance") return "cash_vs_finance";
  if (template === "rent_change") return "rent_change";
  if (template === "travel") return "travel";
  if (template === "career_break") return "career_break";
  return "partner_contribution";
}

function dateToMonthOffset(dateIso?: string): number {
  if (!dateIso) return 1;
  const now = new Date();
  const d = new Date(dateIso);
  return Math.max(
    1,
    (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + 1
  );
}

function buildTemplateEvents(
  t: TranslateFn,
  input: {
    template: TemplateType;
    amount: number;
    monthlyAmount: number;
    startDate?: string;
    apr: number;
    termMonths: number;
    downPayment: number;
    moveCost: number;
    partnerPercent: number;
  }
): ScenarioEvent[] {
  const monthOffset = dateToMonthOffset(input.startDate);
  const events: ScenarioEvent[] = [];
  switch (input.template) {
    case "purchase":
    case "wait_buy_later":
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.oneTimePurchase"),
        eventType: "one-time-purchase",
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.amount,
        fundingSource: "checking",
      });
      break;
    case "recurring_cost":
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.expenseChange"),
        eventType: "expense-change",
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.monthlyAmount,
      });
      break;
    case "cash_vs_finance":
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.downPayment"),
        eventType: "one-time-purchase",
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.downPayment,
        fundingSource: "checking",
      });
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.monthlyPayment"),
        eventType: "expense-change",
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount:
          input.monthlyAmount > 0
            ? input.monthlyAmount
            : estimatedFinancePayment(input),
      });
      break;
    case "rent_change":
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.rentChange"),
        eventType: "expense-change",
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.monthlyAmount,
      });
      if (input.moveCost > 0) {
        events.push({
          id: uid("evt"),
          name: t("decisionStudio.event.moveCost"),
          eventType: "one-time-purchase",
          enabled: true,
          monthOffset,
          date: input.startDate,
          amount: input.moveCost,
          fundingSource: "checking",
        });
      }
      break;
    case "travel":
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.travelBudget"),
        eventType: "one-time-purchase",
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.amount,
        fundingSource: "checking",
      });
      if (input.monthlyAmount > 0) {
        events.push({
          id: uid("evt"),
          name: t("decisionStudio.event.travelSavings"),
          eventType: "expense-change",
          enabled: true,
          monthOffset: 1,
          amount: input.monthlyAmount,
        });
      }
      break;
    case "career_break":
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.incomeReduction"),
        eventType: "salary-change",
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: -Math.abs(input.monthlyAmount),
      });
      if (input.amount !== 0) {
        events.push({
          id: uid("evt"),
          name: t("decisionStudio.event.tempExpense"),
          eventType: "expense-change",
          enabled: true,
          monthOffset,
          date: input.startDate,
          amount: input.amount,
        });
      }
      break;
    case "partner_contribution":
      events.push({
        id: uid("evt"),
        name: t("decisionStudio.event.partnerContribution"),
        eventType: "partner-contribution",
        enabled: true,
        monthOffset,
        date: input.startDate,
        contributionPercent: input.partnerPercent,
      });
      break;
  }
  return events;
}

function eventDisplayType(t: TranslateFn, e: ScenarioEvent): string {
  if (e.eventType === "one-time-purchase") return t("decisionStudio.eventType.oneTimePurchase");
  if (e.eventType === "windfall") return t("decisionStudio.eventType.windfall");
  if (e.eventType === "expense-change") return t("decisionStudio.eventType.expenseChange");
  if (e.eventType === "salary-change") return t("decisionStudio.eventType.salaryChange");
  if (e.eventType === "partner-contribution") return t("decisionStudio.eventType.partnerContribution");
  return t("decisionStudio.eventType.custom");
}

function previewRowFromEvent(
  t: TranslateFn,
  e: ScenarioEvent,
  scenarioName: string,
  privacy: boolean
): repo.ScenarioApplyPreviewRow {
  const amount = e.amount ?? 0;
  const proposed =
    e.eventType === "windfall"
      ? signedMoney(amount, privacy)
      : e.eventType === "partner-contribution"
      ? `${Math.round((e.contributionPercent ?? 0) * 100)}%`
      : signedMoney(-amount, privacy);
  return {
    eventId: e.id,
    plannedItem: `${eventDisplayType(t, e)} · ${e.name}`,
    currentValue: t("decisionStudio.preview.noCurrentValue"),
    proposedValue: proposed,
    effectiveDate:
      e.date ?? t("decisionStudio.preview.monthOffset", { offset: e.monthOffset }),
    sourceScenario: scenarioName,
  };
}

function ComparisonCard({
  title,
  c,
  privacy,
}: {
  title: string;
  c: DecisionComparison;
  privacy: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="card card-compact">
      <h3>{title}</h3>
      <div className="grid kpi-row-4">
        <div className="item">
          <div className="meta">{safeToSpendLabel()}</div>
          <div className="name">{money(c.scenario.safeToSpendToday, privacy)}</div>
          <div className={c.delta.safeToSpendToday >= 0 ? "text-pos" : "text-neg"}>
            {signedMoney(c.delta.safeToSpendToday, privacy)}
          </div>
        </div>
        <div className="item">
          <div className="meta">{t("decisionStudio.compare.lowestCash30d")}</div>
          <div className="name">
            {money(c.scenario.lowestProjectedOperatingCash30d, privacy)}
          </div>
          <div
            className={
              c.delta.lowestProjectedOperatingCash30d >= 0 ? "text-pos" : "text-neg"
            }
          >
            {signedMoney(c.delta.lowestProjectedOperatingCash30d, privacy)}
          </div>
        </div>
        <div className="item">
          <div className="meta">{t("decisionStudio.compare.monthlySurplus")}</div>
          <div className="name">{money(c.scenario.monthlySurplus, privacy)}</div>
          <div className={c.delta.monthlySurplus >= 0 ? "text-pos" : "text-neg"}>
            {signedMoney(c.delta.monthlySurplus, privacy)}
          </div>
        </div>
        <div className="item">
          <div className="meta">{t("decisionStudio.compare.netWorth10yDelta")}</div>
          <div className={c.delta.netWorth10y >= 0 ? "text-pos" : "text-neg"}>
            {signedMoney(c.delta.netWorth10y, privacy)}
          </div>
          <div className="meta">
            {t("decisionStudio.compare.confidence", {
              label: getDecisionConfidenceLabels()[c.confidence],
            })}
          </div>
        </div>
      </div>
      {c.warnings.length > 0 && (
        <ul className="muted-note mt-2">
          {c.warnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DecisionStudioView() {
  const { t } = useLocale();
  const store = useFinance();
  const privacy = store.data.privacy;
  const templates = useMemo(() => getTemplates(t), [t]);
  const templateFieldConfig = useMemo(() => getTemplateFieldConfig(t), [t]);
  const advancedFieldLabels = useMemo(() => getAdvancedFieldLabels(t), [t]);
  const scenarios = useMemo(
    () => (store.data.scenarios ?? []).filter((s) => s.status !== "archived"),
    [store.data.scenarios]
  );
  const savedScenarios = useMemo(
    () => scenarios.filter((s) => s.id !== BASELINE_SCENARIO_ID),
    [scenarios]
  );
  const [tab, setTab] = useState<StudioTab>("compare");
  const studioSections = useMemo(
    () =>
      [
        { id: "compare" as const, label: t("decisionStudio.tabCompare") },
        { id: "saved" as const, label: t("decisionStudio.tabSaved") },
        { id: "log" as const, label: t("decisionStudio.tabLog") },
      ] satisfies { id: StudioTab; label: string }[],
    [t]
  );
  const [template, setTemplate] = useState<TemplateType>("purchase");
  const [amount, setAmount] = useState(2000);
  const [monthlyAmount, setMonthlyAmount] = useState(300);
  const [startDate, setStartDate] = useState("");
  const [apr, setApr] = useState(0.08);
  const [termMonths, setTermMonths] = useState(12);
  const [downPayment, setDownPayment] = useState(500);
  const [moveCost, setMoveCost] = useState(800);
  const [partnerPercent, setPartnerPercent] = useState(0.3);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewEvents, setPreviewEvents] = useState<ScenarioEvent[]>([]);
  const [previewComparison, setPreviewComparison] = useState<DecisionComparison | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedComparisons, setSelectedComparisons] = useState<
    Array<{ scenario: Scenario; comparison: DecisionComparison }>
  >([]);
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [recordScenarioId, setRecordScenarioId] = useState<string>(
    savedScenarios[0]?.id ?? BASELINE_SCENARIO_ID
  );
  const [recordStatus, setRecordStatus] = useState<DecisionStatus>("considering");
  const [recordSummary, setRecordSummary] = useState("");
  const [recordReason, setRecordReason] = useState("");
  const [recordReviewOn, setRecordReviewOn] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [applyScenarioId, setApplyScenarioId] = useState<string>(
    savedScenarios[0]?.id ?? ""
  );
  const [applyEvents, setApplyEvents] = useState<ScenarioEvent[]>([]);
  const [applySelectedIds, setApplySelectedIds] = useState<string[]>([]);
  const [applyAck, setApplyAck] = useState(false);
  const [staleAck, setStaleAck] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const fieldConfig = templateFieldConfig[template];

  const inputSummary = useMemo(
    () =>
      describeTemplateInput(t, {
        template,
        amount,
        monthlyAmount,
        startDate: startDate || undefined,
        apr,
        termMonths,
        downPayment,
        moveCost,
        partnerPercent,
        privacy: store.data.privacy,
      }),
    [
      t,
      template,
      amount,
      monthlyAmount,
      startDate,
      apr,
      termMonths,
      downPayment,
      moveCost,
      partnerPercent,
      store.data.privacy,
    ]
  );

  useEffect(() => {
    setPreviewEvents([]);
    setPreviewComparison(null);
    if (!fieldConfig.advanced?.length) setAdvancedOpen(false);
  }, [template, fieldConfig.advanced?.length]);

  useEffect(() => {
    void repo
      .loadDecisionRecords()
      .then(setRecords)
      .catch((e) => console.error("[decision] load records failed", e));
  }, []);

  useEffect(() => {
    if (!applyScenarioId && savedScenarios.length > 0) {
      void Promise.resolve().then(() => setApplyScenarioId(savedScenarios[0].id));
    }
  }, [applyScenarioId, savedScenarios]);

  useEffect(() => {
    const picked = selectedIds.slice(0, 3);
    if (picked.length === 0) {
      setSelectedComparisons((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    void (async () => {
      const out: Array<{ scenario: Scenario; comparison: DecisionComparison }> = [];
      for (const id of picked) {
        const scenario = savedScenarios.find((s) => s.id === id);
        if (!scenario) continue;
        const events = await repo.loadScenarioEvents(id);
        const comparison = selectDecisionComparison({
          data: store.data,
          baselineEvents: [],
          scenarioEvents: events,
        });
        out.push({ scenario, comparison });
      }
      setSelectedComparisons(out);
    })().catch((e) => console.error("[decision] compare saved failed", e));
  }, [savedScenarios, selectedIds, store.data]);

  useEffect(() => {
    if (!applyScenarioId) {
      void Promise.resolve().then(() => {
        setApplyEvents([]);
        setApplySelectedIds([]);
      });
      return;
    }
    void repo
      .loadScenarioEvents(applyScenarioId)
      .then((events) => {
        setApplyEvents(events);
        setApplySelectedIds(events.map((e) => e.id));
      })
      .catch((e) => console.error("[decision] load apply scenario events failed", e));
  }, [applyScenarioId]);

  const filteredScenarios = useMemo(() => {
    return savedScenarios.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== "all" && s.scenarioType !== filterType) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      return true;
    });
  }, [filterStatus, filterType, savedScenarios, search]);

  const applyPreviewRows = useMemo(() => {
    const scenarioName =
      savedScenarios.find((s) => s.id === applyScenarioId)?.name ??
      t("decisionStudio.selectedScenarioFallback");
    return applyEvents
      .filter((e) => applySelectedIds.includes(e.id))
      .map((e) => previewRowFromEvent(t, e, scenarioName, store.data.privacy));
  }, [applyEvents, applyScenarioId, applySelectedIds, savedScenarios, store.data.privacy, t]);

  const runPreview = () => {
    const events = buildTemplateEvents(t, {
      template,
      amount,
      monthlyAmount,
      startDate: startDate || undefined,
      apr,
      termMonths,
      downPayment,
      moveCost,
      partnerPercent,
    });
    setPreviewEvents(events);
    setPreviewComparison(
      selectDecisionComparison({
        data: store.data,
        baselineEvents: [],
        scenarioEvents: events,
      })
    );
  };

  const savePreviewAsScenario = () => {
    if (previewEvents.length === 0) return;
    const id = uid("scn");
    const scenario: Scenario = {
      id,
      name: `${templates.find((tpl) => tpl.id === template)?.label ?? t("decisionStudio.saveNameFallback")} ${new Date()
        .toISOString()
        .slice(5, 10)}`,
      scenarioType: scenarioTypeFromTemplate(template),
      status: "saved",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.upsertScenario(scenario);
    for (const e of previewEvents) {
      void repo.upsertEvent({ ...e, scenarioId: id }, id);
    }
  };

  const recordDecision = async () => {
    const row: DecisionRecord = {
      id: uid("dr"),
      scenarioId: recordScenarioId,
      decisionStatus: recordStatus,
      decisionSummary: recordSummary || t("decisionStudio.defaultDecisionSummary"),
      reason: recordReason || undefined,
      reviewOn: recordReviewOn || undefined,
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.upsertDecisionRecord(row);
    setRecords((r) => [row, ...r]);
    setRecordSummary("");
    setRecordReason("");
  };

  const applyToPlan = async () => {
    if (!applyScenarioId || applySelectedIds.length === 0) return;
    setApplyBusy(true);
    setApplyMessage(null);
    try {
      const result = await repo.applyScenarioToPlan(applyScenarioId, applySelectedIds);
      setApplyMessage(
        t("decisionStudio.applySuccess", {
          date: formatDateTimeForIntl(result.appliedAt),
          count: result.appliedCount,
        })
      );
      store.setActiveScenario(BASELINE_SCENARIO_ID);
      const s = savedScenarios.find((x) => x.id === applyScenarioId);
      if (s) {
        store.upsertScenario({
          ...s,
          status: "chosen",
          updatedAt: new Date().toISOString(),
        });
      }
      await repo.upsertDecisionRecord({
        id: uid("dr"),
        scenarioId: applyScenarioId,
        decisionStatus: "chosen",
        decisionSummary: t("decisionStudio.appliedDecisionSummary"),
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setApplyMessage(e instanceof Error ? e.message : t("decisionStudio.applyFailed"));
    } finally {
      setApplyBusy(false);
    }
  };

  const undoLatestApply = async () => {
    setUndoBusy(true);
    setApplyMessage(null);
    try {
      const result = await repo.undoLatestScenarioApply();
      setApplyMessage(
        t("decisionStudio.undoSuccess", {
          date: formatDateTimeForIntl(result.undoneAt),
          count: result.undoneCount,
        })
      );
      store.setActiveScenario(BASELINE_SCENARIO_ID);
    } catch (e) {
      setApplyMessage(e instanceof Error ? e.message : t("decisionStudio.undoFailed"));
    } finally {
      setUndoBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <HorizontalTabs
        items={studioSections}
        activeId={tab}
        onChange={setTab}
        ariaLabel={t("decisionStudio.sectionAria")}
      >
        <TabPanel tabId="compare" active={tab === "compare"}>
        <div className="grid gap-3">
          <div className="card card-compact">
            <h3>{t("decisionStudio.step1Title")}</h3>
            <SelectField<TemplateType>
              label={t("decisionStudio.questionType")}
              value={template}
              options={templates.map((tpl) => ({ value: tpl.id, label: tpl.label }))}
              onChange={setTemplate}
            />
            <p className="muted-note mt-1 mb-3">
              {fieldConfig.summary}
            </p>
            <div className="row">
              {fieldConfig.amount && (
                <div className="field field-flex">
                  <NumberField
                    label={
                      fieldConfig.amount.optional
                        ? `${fieldConfig.amount.label}${t("decisionStudio.optional")}`
                        : fieldConfig.amount.label
                    }
                    value={amount}
                    onChange={setAmount}
                    step={fieldConfig.amount.isMonthlyAmount ? 50 : 100}
                    suffix={fieldConfig.amount.suffix}
                  />
                  <p className="muted-note mt-1">
                    {fieldConfig.amount.hint}
                  </p>
                </div>
              )}
              {fieldConfig.monthly && (
                <div className="field field-flex">
                  <NumberField
                    label={
                      fieldConfig.monthly.optional
                        ? `${fieldConfig.monthly.label}${t("decisionStudio.optional")}`
                        : fieldConfig.monthly.label
                    }
                    value={monthlyAmount}
                    onChange={setMonthlyAmount}
                    step={50}
                    suffix={fieldConfig.monthly.suffix}
                  />
                  <p className="muted-note mt-1">
                    {fieldConfig.monthly.hint}
                    {template === "cash_vs_finance" &&
                      monthlyAmount <= 0 &&
                      amount > downPayment && (
                        <>
                          {" "}
                          {t("decisionStudio.autoEstimate", {
                            amount: money(
                              Math.round(
                                estimatedFinancePayment({
                                  amount,
                                  downPayment,
                                  apr,
                                  termMonths,
                                })
                              ),
                              store.data.privacy
                            ),
                          })}
                        </>
                      )}
                  </p>
                </div>
              )}
              {fieldConfig.partnerPercent && (
                <div className="field field-flex">
                  <PercentField
                    label={fieldConfig.partnerPercent.label}
                    value={partnerPercent}
                    onChange={setPartnerPercent}
                  />
                  <p className="muted-note mt-1">
                    {fieldConfig.partnerPercent.hint}
                  </p>
                </div>
              )}
              {fieldConfig.startDate && (
                <div className="field field-flex">
                  <DateField
                    label={fieldConfig.startDate.label}
                    value={startDate}
                    onChange={(v) => setStartDate(v ?? "")}
                  />
                  <p className="muted-note mt-1">
                    {fieldConfig.startDate.hint}
                  </p>
                </div>
              )}
            </div>
            {fieldConfig.advanced && fieldConfig.advanced.length > 0 && (
              <>
                <button className="icon-btn" onClick={() => setAdvancedOpen((v) => !v)}>
                  {advancedOpen ? t("decisionStudio.collapseAdvanced") : t("decisionStudio.expandAdvanced")}
                </button>
                {advancedOpen && (
                  <div className="row mt-2">
                    {fieldConfig.advanced.includes("downPayment") && (
                      <div className="field field-flex-compact">
                        <NumberField
                          label={advancedFieldLabels.downPayment.label}
                          value={downPayment}
                          onChange={setDownPayment}
                          step={100}
                          suffix={advancedFieldLabels.downPayment.suffix}
                        />
                        <p className="muted-note mt-1">
                          {advancedFieldLabels.downPayment.hint}
                        </p>
                      </div>
                    )}
                    {fieldConfig.advanced.includes("apr") && (
                      <div className="field field-flex-compact">
                        <PercentField label={advancedFieldLabels.apr.label} value={apr} onChange={setApr} />
                        <p className="muted-note mt-1">
                          {advancedFieldLabels.apr.hint}
                        </p>
                      </div>
                    )}
                    {fieldConfig.advanced.includes("termMonths") && (
                      <div className="field field-flex-compact">
                        <NumberField
                          label={advancedFieldLabels.termMonths.label}
                          value={termMonths}
                          onChange={setTermMonths}
                          suffix={advancedFieldLabels.termMonths.suffix}
                        />
                        <p className="muted-note mt-1">
                          {advancedFieldLabels.termMonths.hint}
                        </p>
                      </div>
                    )}
                    {fieldConfig.advanced.includes("moveCost") && (
                      <div className="field field-flex-compact">
                        <NumberField
                          label={advancedFieldLabels.moveCost.label}
                          value={moveCost}
                          onChange={setMoveCost}
                          step={100}
                          suffix={advancedFieldLabels.moveCost.suffix}
                        />
                        <p className="muted-note mt-1">
                          {advancedFieldLabels.moveCost.hint}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <div
              className="item inset-panel"
            >
              <div className="meta mb-1">
                {t("decisionStudio.willSimulate")}
              </div>
              <ul>
                {inputSummary.map((line) => (
                  <li key={line} className="name text-base">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="row mt-3">
              <button className="btn" onClick={runPreview}>
                {t("decisionStudio.previewScenario")}
              </button>
              <button
                className="btn ghost"
                onClick={savePreviewAsScenario}
                disabled={previewEvents.length === 0}
              >
                {t("decisionStudio.saveScenario")}
              </button>
            </div>
          </div>

          {previewComparison && (
            <ComparisonCard
              title={t("decisionStudio.step2Title")}
              c={previewComparison}
              privacy={privacy}
            />
          )}

          {previewComparison && (
          <div className="card card-compact">
            <h3>{t("decisionStudio.step3Title")}</h3>
            <div className="row">
              {savedScenarios.slice(0, 12).map((s) => (
                <label key={s.id} className="item" style={{ minWidth: 180 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds((prev) => [...prev, s.id].slice(0, 3));
                      } else {
                        setSelectedIds((prev) => prev.filter((id) => id !== s.id));
                      }
                    }}
                  />
                  <span className="name">{s.name}</span>
                </label>
              ))}
            </div>
            <p className="muted-note mt-2">
              {t("decisionStudio.compareTagsNote")}
            </p>
          </div>
          )}

          {previewComparison &&
          selectedComparisons.map((entry) => (
            <ComparisonCard
              key={entry.scenario.id}
              title={entry.scenario.name}
              c={entry.comparison}
              privacy={privacy}
            />
          ))}

          {previewComparison && (
          <div className="card card-compact">
            <h3>{t("decisionStudio.step4Title")}</h3>
            <div className="row">
              <SelectField<string>
                label={t("decisionStudio.sourceScenario")}
                value={applyScenarioId}
                options={savedScenarios.map((s) => ({ value: s.id, label: s.name }))}
                onChange={setApplyScenarioId}
              />
            </div>
            <div className="list">
              {applyEvents.map((e) => (
                <label key={e.id} className="item">
                  <input
                    type="checkbox"
                    checked={applySelectedIds.includes(e.id)}
                    onChange={(ev) => {
                      if (ev.target.checked) {
                        setApplySelectedIds((prev) => [...prev, e.id]);
                      } else {
                        setApplySelectedIds((prev) => prev.filter((id) => id !== e.id));
                      }
                    }}
                  />
                  <div className="grow">
                    <div className="name">{e.name}</div>
                    <div className="meta">
                      {eventDisplayType(t, e)} ·{" "}
                      {e.date ?? t("decisionStudio.preview.monthOffset", { offset: e.monthOffset })}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="life-os-scroll-x mt-2">
              <table className="review-table">
                <thead>
                  <tr>
                    <th>{t("decisionStudio.colPlannedItem")}</th>
                    <th>{t("decisionStudio.colCurrentValue")}</th>
                    <th>{t("decisionStudio.colProposedValue")}</th>
                    <th>{t("decisionStudio.colEffectiveDate")}</th>
                    <th>{t("decisionStudio.colSourceScenario")}</th>
                  </tr>
                </thead>
                <tbody>
                  {applyPreviewRows.map((r) => (
                    <tr key={r.eventId}>
                      <td>{r.plannedItem}</td>
                      <td>{r.currentValue}</td>
                      <td>{r.proposedValue}</td>
                      <td>{r.effectiveDate}</td>
                      <td>{r.sourceScenario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="item mt-2">
              <input
                type="checkbox"
                checked={applyAck}
                onChange={(e) => setApplyAck(e.target.checked)}
              />
              <span>{t("decisionStudio.applyAck")}</span>
            </label>
            {previewComparison && previewComparison.confidence !== "Ready to compare" && (
              <label className="item">
                <input
                  type="checkbox"
                  checked={staleAck}
                  onChange={(e) => setStaleAck(e.target.checked)}
                />
                <span>{t("decisionStudio.staleAck")}</span>
              </label>
            )}
            <div className="row mt-2">
              <button className="btn ghost" onClick={undoLatestApply} disabled={undoBusy}>
                {undoBusy ? t("decisionStudio.undoBusy") : t("decisionStudio.undoLatest")}
              </button>
              <button
                className="btn"
                disabled={
                  applyBusy ||
                  applySelectedIds.length === 0 ||
                  !applyAck ||
                  (previewComparison?.confidence !== "Ready to compare" && !staleAck)
                }
                onClick={() => void applyToPlan()}
              >
                {applyBusy ? t("decisionStudio.applyBusy") : t("decisionStudio.applySelected")}
              </button>
            </div>
            {applyMessage && (
              <p className="muted-note mt-2">
                {applyMessage}
              </p>
            )}
          </div>
          )}
        </div>
        </TabPanel>

        <TabPanel tabId="saved" active={tab === "saved"}>
        <div className="grid gap-3">
          <div className="card card-compact">
            <div className="row">
              <TextField label={t("decisionStudio.search")} value={search} onChange={setSearch} />
              <SelectField<string>
                label={t("decisionStudio.filterByType")}
                value={filterType}
                options={[
                  { value: "all", label: t("decisionStudio.filterAllTypes") },
                  { value: "purchase", label: t("terminology.scenarioTypePurchase") },
                  { value: "recurring_cost", label: t("terminology.scenarioTypeRecurringCost") },
                  { value: "rent_change", label: t("terminology.scenarioTypeRentChange") },
                  { value: "travel", label: t("terminology.scenarioTypeTravel") },
                  { value: "career_break", label: t("terminology.scenarioTypeCareerBreak") },
                  { value: "partner_contribution", label: t("terminology.scenarioTypePartnerContribution") },
                  { value: "cash_vs_finance", label: t("terminology.scenarioTypeCashVsFinance") },
                ]}
                onChange={setFilterType}
              />
              <SelectField<string>
                label={t("decisionStudio.filterByStatus")}
                value={filterStatus}
                options={[
                  { value: "all", label: t("decisionStudio.filterAllStatuses") },
                  { value: "draft", label: t("terminology.scenarioStatusDraft") },
                  { value: "saved", label: t("terminology.scenarioStatusSaved") },
                  { value: "chosen", label: t("terminology.scenarioStatusChosen") },
                  { value: "archived", label: t("terminology.scenarioStatusArchived") },
                ]}
                onChange={setFilterStatus}
              />
            </div>
          </div>
          {filteredScenarios.map((s) => (
            <div key={s.id} className="card card-compact">
              <div className="row">
                <TextField
                  label={t("decisionStudio.scenarioName")}
                  value={s.name}
                  onChange={(name) =>
                    store.upsertScenario({ ...s, name, updatedAt: new Date().toISOString() })
                  }
                />
                <div className="field">
                  <label>{t("decisionStudio.type")}</label>
                  <div className="input">
                    {scenarioTypeLabel(s.scenarioType)}
                  </div>
                </div>
                <div className="field">
                  <label>{t("decisionStudio.status")}</label>
                  <div className="input">
                    {scenarioStatusLabel(s.status)}
                  </div>
                </div>
                <div className="field field-actions">
                  <label>&nbsp;</label>
                  <div className="flex-row-tight">
                    <button className="btn ghost" onClick={() => store.setActiveScenario(s.id)}>
                      {t("decisionStudio.open")}
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() =>
                        store.upsertScenario({
                          ...s,
                          status: s.status === "archived" ? "saved" : "archived",
                          updatedAt: new Date().toISOString(),
                          archivedAt:
                            s.status === "archived" ? undefined : new Date().toISOString(),
                        })
                      }
                    >
                      {s.status === "archived" ? t("decisionStudio.unarchive") : t("decisionStudio.archive")}
                    </button>
                    <button className="btn danger" onClick={() => store.removeScenario(s.id)}>
                      {t("decisionStudio.delete")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        </TabPanel>

        <TabPanel tabId="log" active={tab === "log"}>
        <div className="grid gap-3">
          <div className="card card-compact">
            <h3>{t("decisionStudio.recordDecision")}</h3>
            <div className="row">
              <SelectField<string>
                label={t("decisionStudio.scenario")}
                value={recordScenarioId}
                options={savedScenarios.map((s) => ({ value: s.id, label: s.name }))}
                onChange={setRecordScenarioId}
              />
              <SelectField<DecisionStatus>
                label={t("decisionStudio.decision")}
                value={recordStatus}
                options={decisionStatusOptions()}
                onChange={setRecordStatus}
              />
              <DateField
                label={t("decisionStudio.reviewDate")}
                value={recordReviewOn}
                onChange={(v) => setRecordReviewOn(v ?? "")}
              />
            </div>
            <div className="row">
              <TextField
                label={t("decisionStudio.conclusion")}
                value={recordSummary}
                onChange={setRecordSummary}
                placeholder={t("decisionStudio.conclusionPlaceholder")}
              />
              <TextField
                label={t("decisionStudio.reason")}
                value={recordReason}
                onChange={setRecordReason}
                placeholder={t("decisionStudio.reasonPlaceholder")}
              />
            </div>
            <button className="btn" onClick={() => void recordDecision()}>
              {t("decisionStudio.recordDecision")}
            </button>
          </div>
          {records.map((r) => {
            const scenario = savedScenarios.find((s) => s.id === r.scenarioId);
            return (
              <div key={r.id} className="card card-compact">
                <div className="row">
                  <div className="item grow">
                    <div className="name">{r.decisionSummary}</div>
                    <div className="meta">
                      {scenario?.name ?? t("decisionStudio.unknownScenario")} · {decisionStatusLabel(r.decisionStatus)} ·{" "}
                      {r.decidedAt?.slice(0, 10)}
                    </div>
                    {r.reason && <div className="meta">{r.reason}</div>}
                  </div>
                  <div className="flex-row-tight">
                    <button
                      className="btn danger"
                      onClick={() => {
                        void repo.deleteDecisionRecord(r.id);
                        setRecords((prev) => prev.filter((x) => x.id !== r.id));
                      }}
                    >
                      {t("decisionStudio.delete")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </TabPanel>
      </HorizontalTabs>
    </div>
  );
}
