import { useMemo, useState } from "react";
import type {
  Goal,
  GoalMetric,
  GoalReservePolicy,
  Scenario,
  ScenarioEvent,
  ScenarioEventType,
} from "../types";
import { useFinance, uid } from "../store/store";
import { useProjection } from "../hooks/useProjection";
import { isoToCalendarLabel, money, monthOffsetToCalendarLabel } from "../format";
import {
  DateField,
  NumberField,
  PercentField,
  SelectField,
  SliderField,
  TextField,
} from "./fields";
import { dateToMonthOffset } from "../engine/calendar";
import { SortBySelect } from "./SortBySelect";
import {
  goalReservePolicy,
  isMilestoneGoal,
} from "../engine/goals";
import { projectDaily } from "../engine/daily";
import { selectMonthlySavingCapacity } from "../engine/metrics";
import { getGoalReservePolicies, getGoalMetricOptions, stsBreakdown, quoteSafeToSpend, scenarioStatusLabel } from "../copy/terminology";
import { safeToSpendLabel } from "../copy/metrics";
import { useLocale } from "../i18n/context";

function eventTypeOptions(t: (key: string) => string): { value: ScenarioEventType; label: string }[] {
  return [
    { value: "salary-change", label: t("scenarios.eventSalaryChange") },
    { value: "expense-change", label: t("scenarios.eventExpenseChange") },
    { value: "partner-contribution", label: t("scenarios.eventPartnerContribution") },
  ];
}

type ScenarioSort = "timeline" | "name" | "type";
type GoalSort = "logic" | "target-asc" | "target-desc" | "name";

function defaultEvent(type: ScenarioEventType, t: (key: string) => string): ScenarioEvent {
  const options = eventTypeOptions(t);
  const base: ScenarioEvent = {
    id: uid("evt"),
    name: options.find((e) => e.value === type)?.label ?? t("scenarios.eventDefaultName"),
    eventType: type,
    enabled: true,
    monthOffset: 12,
  };
  if (type === "salary-change") base.amount = 500;
  if (type === "expense-change") base.amount = 200;
  if (type === "partner-contribution") {
    base.contributionPercent = 0.5;
    base.expenseCategory = "";
  }
  return base;
}

function EventRow({ e }: { e: ScenarioEvent }) {
  const { t } = useLocale();
  const eventTypes = useMemo(() => eventTypeOptions(t), [t]);
  const store = useFinance();
  const set = (patch: Partial<ScenarioEvent>) => store.upsertEvent({ ...e, ...patch });
  const whenLabel = e.date
    ? isoToCalendarLabel(e.date)
    : monthOffsetToCalendarLabel(e.monthOffset);

  return (
    <div className="card card-compact" style={{ opacity: e.enabled ? 1 : 0.55 }}>
      <div className="row">
        <TextField label={t("scenarios.name")} value={e.name} onChange={(v) => set({ name: v })} />
        <SelectField<ScenarioEventType>
          label={t("scenarios.type")}
          value={e.eventType}
          options={eventTypes}
          onChange={(v) =>
            store.upsertEvent({
              ...defaultEvent(v, t),
              id: e.id,
              name: e.name,
              monthOffset: e.monthOffset,
              date: e.date,
            })
          }
        />
        <DateField
          label={t("scenarios.effectiveDate")}
          value={e.date}
          onChange={(v) =>
            set({ date: v || undefined, monthOffset: v ? dateToMonthOffset(new Date(), v) : e.monthOffset })
          }
        />
      </div>
      <div className="row">
        {(e.eventType === "salary-change" ||
          e.eventType === "expense-change") && (
          <NumberField
            label={
              e.eventType === "salary-change" || e.eventType === "expense-change"
                ? t("scenarios.monthlyDelta")
                : t("scenarios.amount")
            }
            value={e.amount ?? 0}
            onChange={(v) => set({ amount: v })}
            step={50}
          />
        )}
        {e.eventType === "partner-contribution" && (
          <>
            <PercentField
              label={t("scenarios.partnerShare")}
              value={e.contributionPercent ?? 0.5}
              onChange={(v) => set({ contributionPercent: v })}
            />
            <TextField
              label={t("scenarios.expenseCategory")}
              value={e.expenseCategory ?? ""}
              onChange={(v) => set({ expenseCategory: v })}
              placeholder={t("scenarios.expenseCategoryPlaceholder")}
            />
          </>
        )}
        <div className="field field-actions">
          <label>&nbsp;</label>
          <div className="flex-row-tight">
            <button className="btn ghost" onClick={() => store.toggleEvent(e.id)}>
              {e.enabled ? t("scenarios.disable") : t("scenarios.enable")}
            </button>
            <button className="btn danger" onClick={() => store.removeEvent(e.id)}>
              {t("scenarios.delete")}
            </button>
          </div>
        </div>
      </div>
      <span className="meta">
        {t("scenarios.effective", {
          when: whenLabel,
          suffix: e.enabled ? "" : t("scenarios.effectiveDisabled"),
        })}
      </span>
    </div>
  );
}

function GoalRow({
  g,
  effBudget,
  committedBudget,
  reserveAllocSum,
}: {
  g: Goal;
  /** 当前生效的每月存款总额（拖动顶部滑块时为预览值）。 */
  effBudget: number;
  /** 已提交的每月存款总额，用于从已存的 monthlyAllocation 反推稳定的占比。 */
  committedBudget: number;
  /** 所有「专款专用」桶已分配的每月存入额合计（含本桶），用于约束占比合计不超过 100%。 */
  reserveAllocSum: number;
}) {
  const { t } = useLocale();
  const store = useFinance();
  const privacy = store.data.privacy;
  const set = (patch: Partial<Goal>) => store.upsertGoal({ ...g, ...patch });

  const policy = goalReservePolicy(g);
  const reservePolicies = getGoalReservePolicies();
  const isReserve = policy !== "milestone_only";
  const current = g.current ?? 0;
  const alloc = g.monthlyAllocation ?? 0;
  const pct = committedBudget > 0 ? Math.min(1, alloc / committedBudget) : 0;
  const siblingAlloc = Math.max(0, reserveAllocSum - alloc);
  const maxPct =
    committedBudget > 0
      ? Math.max(0, ((committedBudget - siblingAlloc) / committedBudget) * 100)
      : 0;
  const effMonthly = Math.round(pct * effBudget);
  const remaining = Math.max(0, g.target - current);
  const progressPct = g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0;
  const monthsToFill = effMonthly > 0 ? Math.ceil(remaining / effMonthly) : null;

  let fillHint: string;
  if (effMonthly <= 0) fillHint = t("scenarios.fillHintDrag");
  else if (remaining <= 0)
    fillHint = t("scenarios.fillHintFull", { amount: money(effMonthly, privacy) });
  else if (monthsToFill != null)
    fillHint = t("scenarios.fillHintProgress", {
      amount: money(effMonthly, privacy),
      months: monthsToFill,
      when: monthOffsetToCalendarLabel(monthsToFill),
    });
  else fillHint = t("scenarios.fillHintDragShort");

  return (
    <div className="card card-compact">
      <div className="row">
        <TextField label={t("scenarios.goalName")} value={g.name} onChange={(v) => set({ name: v })} />
        <SelectField<GoalMetric>
          label={t("scenarios.metric")}
          value={g.metric}
          options={getGoalMetricOptions()}
          onChange={(v) => set({ metric: v })}
        />
        <NumberField label={t("scenarios.targetAmount")} value={g.target} onChange={(v) => set({ target: v })} step={10000} />
        <div className="field field-actions">
          <label>&nbsp;</label>
          <button className="btn danger" onClick={() => store.removeGoal(g.id)}>
            {t("scenarios.delete")}
          </button>
        </div>
      </div>

      <label
        className="goal-reserve-toggle"
        title={t("scenarios.reservePolicyTitle", { safeToSpend: quoteSafeToSpend() })}
      >
        <select
          value={policy}
          onChange={(e) => {
            const nextPolicy = e.target.value as GoalReservePolicy;
            set({
              reservePolicy: nextPolicy,
              reserve: nextPolicy !== "milestone_only",
            });
          }}
        >
          {(Object.keys(reservePolicies) as GoalReservePolicy[]).map((key) => (
            <option key={key} value={key} title={reservePolicies[key].title}>
              {reservePolicies[key].label}
            </option>
          ))}
        </select>
      </label>

      {isReserve && (
        <div className="goal-bucket">
          <div className="row">
            <NumberField
              label={t("scenarios.savedAmount")}
              value={current}
              onChange={(v) => set({ current: Math.max(0, v) })}
              step={100}
              min={0}
            />
          </div>

          <SliderField
            label={t("scenarios.monthlySharePct")}
            value={Math.round(pct * 100)}
            onChange={(v) => {
              const capped = Math.min(v, maxPct);
              set({ monthlyAllocation: Math.round((capped / 100) * effBudget) });
            }}
            min={0}
            max={100}
            step={1}
            format={(v) =>
              t("scenarios.monthlyShareFormat", {
                pct: Math.min(v, Math.round(maxPct)),
                amount: money(
                  Math.round((Math.min(v, maxPct) / 100) * effBudget),
                  privacy
                ),
              })
            }
            hint={
              maxPct < 100 && Math.round(pct * 100) >= Math.round(maxPct)
                ? t("scenarios.shareCapHint", { maxPct: Math.round(maxPct) })
                : fillHint
            }
          />

          <div className="goal-progress">
            <div className="goal-progress-bar">
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <div className="goal-progress-meta">
              <span>
                {t("scenarios.savedProgress", {
                  current: money(current, privacy),
                  target: money(g.target, privacy),
                })}
              </span>
              <span className="text-secondary">
                {t("scenarios.remaining", { amount: money(remaining, privacy) })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SavingsBudgetCard({
  effBudget,
  committedBudget,
  surplus,
  recommendedBudget,
  reserveGoals,
  onChange,
  onCommit,
}: {
  effBudget: number;
  committedBudget: number;
  surplus: number;
  recommendedBudget: number;
  reserveGoals: Goal[];
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const { t } = useLocale();
  const store = useFinance();
  const privacy = store.data.privacy;
  const sts = stsBreakdown();

  const sliderMax = Math.max(
    1000,
    Math.ceil(Math.max(surplus * 1.2, committedBudget) / 50) * 50
  );

  const safeToSpend = safeToSpendLabel();
  const ratio = surplus > 0 ? effBudget / surplus : null;
  let tone = t("scenarios.toneModerate");
  if (ratio != null) {
    if (ratio >= 0.9) tone = t("scenarios.toneTight", { safeToSpend });
    else if (ratio <= 0.4) tone = t("scenarios.toneLoose", { safeToSpend });
  }
  const hint =
    surplus > 0
      ? effBudget > surplus
        ? t("scenarios.hintOverSurplus", { surplus: money(surplus, privacy) })
        : t("scenarios.hintSurplusTone", { surplus: money(surplus, privacy), tone })
      : t("scenarios.hintNoCashflows");

  const allocated = reserveGoals.reduce(
    (s, g) =>
      s +
      Math.round(
        ((g.monthlyAllocation ?? 0) / Math.max(1, committedBudget)) * effBudget
      ),
    0
  );
  const remainingBudget = effBudget - allocated;
  const allocatedPct = effBudget > 0 ? (allocated / effBudget) * 100 : 0;

  return (
    <div className="card card-compact">
      <SliderField
        label={t("scenarios.monthlyBudgetTotal")}
        value={effBudget}
        onChange={onChange}
        onCommit={onCommit}
        min={0}
        max={sliderMax}
        step={50}
        format={(v) => t("scenarios.monthlyBudgetFormat", { amount: money(v, privacy) })}
        hint={hint}
      />
      <div className="kv mt-2">
        <span className="k">{t("scenarios.recommendedToday")}</span>
        <span>{t("scenarios.monthlyBudgetFormat", { amount: money(recommendedBudget, privacy) })}</span>
      </div>
      <p className="muted-note mt-1-5">
        {t("scenarios.budgetSourceNote", { buffer: sts.buffer, goalReserve: sts.goalReserve })}
      </p>
      {Math.abs(effBudget - recommendedBudget) >= 50 && (
        <div className="mt-2">
          <button
            className="icon-btn"
            onClick={() => {
              onChange(recommendedBudget);
              onCommit(recommendedBudget);
            }}
          >
            {t("scenarios.applyRecommendation", {
              amount: money(recommendedBudget, privacy),
            })}
          </button>
        </div>
      )}
      {reserveGoals.length > 0 && (
        <div className="goal-progress mt-2-5">
          <div className="goal-progress-bar">
            <span
              style={{
                width: `${Math.min(100, allocatedPct)}%`,
                background: allocatedPct > 100 ? "var(--critical)" : undefined,
              }}
            />
          </div>
          <div className="goal-progress-meta">
            <span>
              {t("scenarios.allocatedTotal", {
                pct: Math.round(allocatedPct),
                amount: money(allocated, privacy),
              })}
            </span>
            <span className={remainingBudget < 0 ? "text-neg" : "text-secondary"}>
              {remainingBudget < 0
                ? t("scenarios.overBudget", { amount: money(-remainingBudget, privacy) })
                : t("scenarios.remainingBudget", { amount: money(remainingBudget, privacy) })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScenariosView() {
  const { t, intlLocale: intlLoc } = useLocale();
  const eventTypes = useMemo(() => eventTypeOptions(t), [t]);
  const store = useFinance();
  const { events, goals } = store.data;
  const scenarios = store.data.scenarios ?? [];
  const activeScenarioId = store.data.activeScenarioId ?? scenarios[0]?.id;
  const activeScenario =
    scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0] ?? null;
  const projection = useProjection(store.data);
  const [draftBudget, setDraftBudget] = useState<number | null>(null);
  const [scenarioSort, setScenarioSort] = useState<ScenarioSort>("timeline");
  const [goalSort, setGoalSort] = useState<GoalSort>("logic");
  const scenarioEvents = events.filter(
    (e) =>
      e.eventType === "salary-change" ||
      e.eventType === "expense-change" ||
      e.eventType === "partner-contribution"
  );

  const reserveGoals = goals.filter((g) => !isMilestoneGoal(g));
  const sortedGoals = goals
    .slice()
    .sort((a, b) => {
      if (goalSort === "target-asc") return a.target - b.target;
      if (goalSort === "target-desc") return b.target - a.target;
      if (goalSort === "name") return a.name.localeCompare(b.name, intlLoc);
      const reserveDelta = Number(!isMilestoneGoal(b)) - Number(!isMilestoneGoal(a));
      if (reserveDelta !== 0) return reserveDelta;
      const targetDelta = a.target - b.target;
      if (targetDelta !== 0) return targetDelta;
      return a.name.localeCompare(b.name, intlLoc);
    });
  const sortedScenarioEvents = scenarioEvents
    .slice()
    .sort((a, b) => {
      if (scenarioSort === "name") return a.name.localeCompare(b.name, intlLoc);
      if (scenarioSort === "type") {
        const typeDelta = a.eventType.localeCompare(b.eventType, intlLoc);
        if (typeDelta !== 0) return typeDelta;
      }
      return a.monthOffset - b.monthOffset;
    });
  const surplus = Math.max(0, Math.round(projection.summary.monthlySurplus));
  const reserveAllocSum = reserveGoals.reduce(
    (s, g) => s + (g.monthlyAllocation ?? 0),
    0
  );
  const recommendedBudget = Math.round(
    selectMonthlySavingCapacity({
      outlook: projectDaily(store.data),
      assumptions: store.data.assumptions,
      goals: store.data.goals,
    }).capacity
  );
  const committedBudget =
    store.data.assumptions.savingsBudget ??
    (reserveAllocSum > 0
      ? reserveAllocSum
      : recommendedBudget > 0
        ? recommendedBudget
        : surplus);
  const effBudget = draftBudget ?? committedBudget;

  const commitBudget = (next: number) => {
    store.setAssumptions({ savingsBudget: next });
    if (committedBudget > 0) {
      for (const g of reserveGoals) {
        const pct = (g.monthlyAllocation ?? 0) / committedBudget;
        const nextAlloc = Math.round(pct * next);
        if (nextAlloc !== (g.monthlyAllocation ?? 0)) {
          store.upsertGoal({ ...g, monthlyAllocation: nextAlloc });
        }
      }
    }
    setDraftBudget(null);
  };

  return (
    <div className="grid gap-4">
      <div className="card card-compact">
        <div className="row">
          <SelectField<string>
            label={t("scenarios.currentScenario")}
            value={activeScenarioId ?? ""}
            options={scenarios.map((s) => ({
              value: s.id,
              label: `${s.name}${
                s.status === "saved"
                  ? ""
                  : t("scenarios.scenarioStatusWrap", { status: scenarioStatusLabel(s.status) })
              }`,
            }))}
            onChange={(id) => store.setActiveScenario(id)}
          />
          <TextField
            label={t("scenarios.scenarioName")}
            value={activeScenario?.name ?? ""}
            onChange={(name) => {
              if (!activeScenario) return;
              store.upsertScenario({ ...activeScenario, name, updatedAt: new Date().toISOString() });
            }}
          />
          <div className="field field-actions">
            <label>&nbsp;</label>
            <div className="flex-row-tight">
              <button
                className="btn ghost"
                onClick={() => {
                  const id = uid("scn");
                  const next: Scenario = {
                    id,
                    name: t("scenarios.newScenarioDefault"),
                    scenarioType: "custom",
                    status: "draft",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                  store.upsertScenario(next);
                  store.setActiveScenario(id);
                }}
              >
                {t("scenarios.newScenario")}
              </button>
              <button className="btn ghost" onClick={() => store.duplicateActiveScenario()}>
                {t("scenarios.duplicate")}
              </button>
              <button
                className="btn ghost"
                disabled={!activeScenario}
                onClick={() => {
                  if (!activeScenario) return;
                  store.upsertScenario({
                    ...activeScenario,
                    status: "saved",
                    updatedAt: new Date().toISOString(),
                  });
                }}
              >
                {t("scenarios.save")}
              </button>
              <button
                className="btn danger"
                disabled={!activeScenario || activeScenario.id === "scenario_baseline"}
                onClick={() => {
                  if (!activeScenario) return;
                  if (!window.confirm(t("scenarios.deleteScenarioConfirm", { name: activeScenario.name }))) return;
                  store.removeScenario(activeScenario.id);
                }}
              >
                {t("scenarios.deleteScenario")}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div>
        <h2 className="section-title">{t("scenarios.longTermTitle")}</h2>
        <p className="muted-note">{t("scenarios.longTermIntro")}</p>
        <div className="chart-controls">
          {eventTypes.map((opt) => (
            <button
              key={opt.value}
              className="icon-btn"
              onClick={() => store.upsertEvent(defaultEvent(opt.value, t))}
            >
              {t("scenarios.addEvent", { label: opt.label })}
            </button>
          ))}
          <SortBySelect
            label={t("scenarios.sort")}
            value={scenarioSort}
            onChange={setScenarioSort}
            options={[
              { id: "timeline", label: t("scenarios.sortTimeline") },
              { id: "type", label: t("scenarios.sortType") },
              { id: "name", label: t("scenarios.sortName") },
            ]}
          />
        </div>
        <div className="grid gap-3">
          {scenarioEvents.length === 0 && (
            <div className="empty">{t("scenarios.longTermEmpty")}</div>
          )}
          {sortedScenarioEvents.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="section-title">{t("scenarios.goalsTitle")}</h2>
        <p className="muted-note">{t("scenarios.goalsIntro")}</p>
        <SavingsBudgetCard
          effBudget={effBudget}
          committedBudget={committedBudget}
          surplus={surplus}
          recommendedBudget={recommendedBudget}
          reserveGoals={reserveGoals}
          onChange={setDraftBudget}
          onCommit={commitBudget}
        />
        <div className="chart-controls mt-3">
          <button
            className="icon-btn"
            onClick={() =>
              store.upsertGoal({
                id: uid("goal"),
                name: t("scenarios.newGoalDefault"),
                metric: "net-worth",
                target: 100000,
                reservePolicy: "milestone_only",
                reserve: false,
              })
            }
          >
            {t("scenarios.addMilestone")}
          </button>
          <button
            className="icon-btn"
            onClick={() =>
              store.upsertGoal({
                id: uid("goal"),
                name: t("scenarios.newSavingsGoalDefault"),
                metric: "liquid",
                target: 10000,
                current: 0,
                monthlyAllocation: 0,
                reservePolicy: "earmarked_operating_cash",
                reserve: true,
              })
            }
          >
            {t("scenarios.addSavingsGoal")}
          </button>
          <SortBySelect
            label={t("scenarios.sort")}
            value={goalSort}
            onChange={setGoalSort}
            options={[
              { id: "logic", label: t("scenarios.sortLogic") },
              { id: "target-asc", label: t("scenarios.sortTargetAsc") },
              { id: "target-desc", label: t("scenarios.sortTargetDesc") },
              { id: "name", label: t("scenarios.sortName") },
            ]}
          />
        </div>
        <div className="grid gap-3">
          {sortedGoals.map((g) => (
            <GoalRow
              key={g.id}
              g={g}
              effBudget={effBudget}
              committedBudget={committedBudget}
              reserveAllocSum={reserveAllocSum}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
