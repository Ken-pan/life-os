import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { FinanceData, HoldingsSnapshot, PortfolioAllocationTarget } from "../../types";
import { useFinance } from "../../store/store";
import type { AllocationMetrics, AllocationTrendPoint } from "../../engine/holdingsPortfolio";
import type { ThemeConcentration } from "../../engine/portfolioAllocation";
import { AllocationTrendChart } from "./AllocationTrendChart";
import {
  ADVANCED_REFERENCE_MODELS,
  buildBlendedAssetBreakdown,
  buildTargetFromReferenceModel,
  buildPortfolioConfidence,
  buildPortfolioStickySummary,
  buildRebalanceSuggestions,
  classifyPortfolio,
  compareToReferenceModel,
  computeAllocationDrift,
  CORE_REFERENCE_MODELS,
  refModelMaintenanceTier,
  refModelText,
  refModelVolatilityTier,
  type ReferenceModel,
} from "../../engine/portfolioAllocation";
import { PortfolioStickyBar } from "./PortfolioStickyBar";
import { sanitizePortfolioAllocationTarget } from "../../lib/portfolioAllocationPrefs";
import { redactMoneyText } from "../../format";
import { useLocale } from "../../i18n/context";

function DriftStateTag({ state }: { state: "ok" | "review" | "unset" }) {
  const { t } = useLocale();
  if (state === "ok") return <span className="tag positive">{t("stocks.hub.drift.tag.ok")}</span>;
  if (state === "review") return <span className="tag warn">{t("stocks.hub.drift.tag.review")}</span>;
  return <span className="tag">{t("stocks.hub.drift.tag.unset")}</span>;
}

function TargetInputs({
  target,
  onChange,
}: {
  target: PortfolioAllocationTarget;
  onChange: (next: PortfolioAllocationTarget) => void;
}) {
  const { t } = useLocale();
  const field = (
    label: string,
    key: keyof PortfolioAllocationTarget,
    placeholder: string
  ) => (
    <label className="portfolio-target-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        placeholder={placeholder}
        value={target[key] ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          const next = { ...target };
          if (raw === "") {
            delete next[key];
          } else {
            const n = Number(raw);
            if (Number.isFinite(n)) next[key] = n;
          }
          onChange(next);
        }}
      />
      <span className="text-secondary">%</span>
    </label>
  );

  return (
    <div className="portfolio-target-grid">
      {field(t("stocks.hub.target.stockPct"), "stockPct", t("stocks.hub.target.placeholderStock"))}
      {field(t("stocks.hub.target.etfPct"), "etfPct", t("stocks.hub.target.placeholderEtf"))}
      {field(t("stocks.hub.target.top1Max"), "top1MaxPct", t("stocks.hub.target.placeholderTop1"))}
      {field(t("stocks.hub.target.top3Max"), "top3MaxPct", t("stocks.hub.target.placeholderTop3"))}
      {field(
        t("stocks.hub.target.driftThreshold"),
        "driftThresholdPct",
        t("stocks.hub.target.placeholderDrift")
      )}
    </div>
  );
}

export function PortfolioAllocationSection({
  data,
  allocation,
  activeSnapshot,
  taxableSecurities,
  onGoSettings,
  kpiSlot,
  trend,
  themes,
}: {
  data: FinanceData;
  allocation: AllocationMetrics;
  activeSnapshot: HoldingsSnapshot | null;
  taxableSecurities: number;
  /** 跳转到设置页录入 401(k) / HSA 等账户 */
  onGoSettings?: () => void;
  /** 市值/盈亏摘要条，渲染在结论层之后、诊断层之前 */
  kpiSlot?: ReactNode;
  /** 跨快照配置趋势（时间升序） */
  trend?: AllocationTrendPoint[];
  /** 主题/行业集中度（应税证券口径） */
  themes?: ThemeConcentration;
}) {
  const { t, locale } = useLocale();
  const store = useFinance();
  const target = useMemo(
    () => sanitizePortfolioAllocationTarget(store.data.portfolioAllocationTarget),
    [store.data.portfolioAllocationTarget]
  );
  const [selectedModelId, setSelectedModelId] = useState<string>("core-satellite");
  const [showAllModels, setShowAllModels] = useState(false);
  const [showCompareTable, setShowCompareTable] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const targetCardRef = useRef<HTMLDivElement | null>(null);

  const persistTarget = useCallback(
    (next: PortfolioAllocationTarget) => {
      store.setPortfolioAllocationTarget(sanitizePortfolioAllocationTarget(next));
    },
    [store]
  );

  const blended = useMemo(
    () => buildBlendedAssetBreakdown(taxableSecurities, data.accounts),
    [taxableSecurities, data.accounts]
  );
  const classification = useMemo(() => classifyPortfolio(allocation), [allocation, locale]);
  const driftRows = useMemo(
    () => computeAllocationDrift(allocation, target),
    [allocation, target, locale]
  );
  const confidence = useMemo(
    () =>
      buildPortfolioConfidence(data.accounts, data.holdingsSnapshots, activeSnapshot),
    [data.accounts, data.holdingsSnapshots, activeSnapshot, locale]
  );
  const allModels = useMemo(
    () => [...CORE_REFERENCE_MODELS, ...ADVANCED_REFERENCE_MODELS],
    []
  );
  const selectedModel = useMemo(
    () => allModels.find((m) => m.id === selectedModelId) ?? CORE_REFERENCE_MODELS[0],
    [allModels, selectedModelId]
  );
  const modelCompare = useMemo(
    () => compareToReferenceModel(allocation, selectedModel),
    [allocation, selectedModel, locale]
  );
  // 默认只露出前 3 个核心框架（+ 当前选中的），其余折叠，降低移动端 pill 墙的认知负担。
  const selectableModels = useMemo(
    () => allModels.filter((m) => m.id !== "custom"),
    [allModels]
  );
  const visibleModels = useMemo(() => {
    if (showAllModels) return selectableModels;
    const defaults = selectableModels.slice(0, 3);
    if (defaults.some((m) => m.id === selectedModelId)) return defaults;
    const selected = selectableModels.find((m) => m.id === selectedModelId);
    return selected ? [...defaults, selected] : defaults;
  }, [selectableModels, showAllModels, selectedModelId]);
  const hiddenModelCount = selectableModels.length - visibleModels.length;
  const rebalance = useMemo(
    () => buildRebalanceSuggestions(driftRows, activeSnapshot?.unrealizedGain),
    [driftRows, activeSnapshot?.unrealizedGain, locale]
  );
  const selectedModelTarget = useMemo(
    () => buildTargetFromReferenceModel(selectedModel, target),
    [selectedModel, target]
  );

  const hasAnyTarget = driftRows.some((r) => r.targetPct != null);
  const reviewCount = driftRows.filter((r) => r.state === "review").length;
  // 风险度量条着色阈值：与引擎口径一致（top3MaxPct 默认 45；主题备注触发线 50）
  const top3Elevated = allocation.top3Pct >= (target.top3MaxPct ?? 45);
  const themeElevated = (themes?.topTheme?.pct ?? 0) >= 50;
  const missingCount = confidence.items.filter((i) => !i.complete).length;
  const equityExposure = allocation.stockPct + allocation.etfPct;

  const applyModelToTarget = useCallback(
    (m: ReferenceModel, options: { edit?: boolean } = {}) => {
      const next = buildTargetFromReferenceModel(m, target);
      if (!next) return;
      persistTarget(next);
      setEditorOpen(Boolean(options.edit));
      requestAnimationFrame(() => {
        targetCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [persistTarget, target]
  );

  const openTargetEditor = useCallback(() => {
    setEditorOpen(true);
    requestAnimationFrame(() => {
      targetCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const showDriftTable = hasAnyTarget || editorOpen;

  const stickySummary = useMemo(
    () =>
      buildPortfolioStickySummary(
        allocation,
        classification,
        hasAnyTarget,
        reviewCount,
        confidence,
        data.accounts
      ),
    [allocation, classification, hasAnyTarget, reviewCount, confidence, data.accounts, locale]
  );

  return (
    <section className="portfolio-hub" aria-label={t("stocks.hub.ariaLabel")}>
      {/* ===== Layer 1 · 你现在的位置 ===== */}
      <div
        className={`card portfolio-stance ${classification.label.includes(t("stocks.classify.concentratedKeyword")) ? "is-warn" : ""}`}
      >
        <div className="portfolio-stance-main">
          <span className="portfolio-stance-eyebrow">{t("stocks.hub.stance.eyebrow")}</span>
          <h3 className="portfolio-stance-title">{classification.label}</h3>
          <p className="portfolio-stance-detail">{classification.detail}</p>
        </div>
        <div className="portfolio-stance-facts" role="list">
          <div className="portfolio-stance-fact" role="listitem">
            <span className="k">{t("stocks.hub.stance.top1")}</span>
            <span className="v">
              {allocation.top1Ticker} · {allocation.top1Pct.toFixed(1)}%
            </span>
          </div>
          <div className="portfolio-stance-fact" role="listitem">
            <span className="k">{t("stocks.hub.stance.top3")}</span>
            <span className="v">{allocation.top3Pct.toFixed(1)}%</span>
          </div>
          <div className="portfolio-stance-fact" role="listitem">
            <span className="k">{t("stocks.hub.stance.stockEtf")}</span>
            <span className="v">
              {allocation.stockPct.toFixed(0)}% / {allocation.etfPct.toFixed(0)}%
            </span>
          </div>
          <div className="portfolio-stance-fact" role="listitem">
            <span className="k">{t("stocks.hub.stance.target")}</span>
            <span className={`v ${!hasAnyTarget ? "is-muted" : reviewCount > 0 ? "is-warn" : ""}`}>
              {hasAnyTarget
                ? t("stocks.hub.stance.itemsToReview", { count: reviewCount })
                : t("stocks.hub.stance.notSet")}
            </span>
          </div>
        </div>
      </div>

      <PortfolioStickyBar
        summary={stickySummary}
        hasAnyTarget={hasAnyTarget}
        reviewCount={reviewCount}
        stanceLabel={classification.label}
        onSetTarget={openTargetEditor}
        onImportAccounts={onGoSettings}
      />

      {kpiSlot}

      {/* ===== Layer 2 · 诊断 ===== */}
      <h2 className="portfolio-layer-title">{t("stocks.hub.layer.diagnosis")}</h2>

      <div className="card portfolio-breakdown">
        <h3>{t("stocks.hub.breakdown.title")}</h3>
        <div className="portfolio-segbar-group">
          <div className="portfolio-segbar-row">
            <span className="portfolio-segbar-label">{t("stocks.hub.breakdown.stockVsEtf")}</span>
            <div className="portfolio-segbar">
              <span
                className="segbar-fill segbar-fill-stock"
                style={{ width: `${Math.max(allocation.stockPct, 0)}%` }}
                title={t("stocks.hub.breakdown.stockTitle", { pct: allocation.stockPct.toFixed(1) })}
              />
              <span
                className="segbar-fill segbar-fill-etf"
                style={{ width: `${Math.max(allocation.etfPct, 0)}%` }}
                title={t("stocks.hub.breakdown.etfTitle", { pct: allocation.etfPct.toFixed(1) })}
              />
            </div>
            <span className="portfolio-segbar-value">
              {allocation.stockPct.toFixed(0)}% / {allocation.etfPct.toFixed(0)}%
            </span>
          </div>
          <div className="portfolio-segbar-row">
            <span className="portfolio-segbar-label">{t("stocks.hub.breakdown.top3Concentration")}</span>
            <div className="portfolio-segbar">
              <span
                className={`segbar-fill segbar-fill-metric${top3Elevated ? " is-elevated" : ""}`}
                style={{ width: `${Math.min(allocation.top3Pct, 100)}%` }}
                title={t("stocks.hub.breakdown.top3Title", { pct: allocation.top3Pct.toFixed(1) })}
              />
            </div>
            <span className={`portfolio-segbar-value${top3Elevated ? " text-warn" : ""}`}>
              {allocation.top3Pct.toFixed(0)}%
            </span>
          </div>
          {themes?.topTheme && (
            <div className="portfolio-segbar-row">
              <span className="portfolio-segbar-label">{t("stocks.hub.breakdown.themeConcentration")}</span>
              <div className="portfolio-segbar">
                <span
                  className={`segbar-fill segbar-fill-metric${themeElevated ? " is-elevated" : ""}`}
                  style={{ width: `${Math.min(themes.topTheme.pct, 100)}%` }}
                  title={t("stocks.hub.breakdown.themeTitle", {
                    theme: themes.topTheme.theme,
                    pct: themes.topTheme.pct.toFixed(1),
                  })}
                />
              </div>
              <span className={`portfolio-segbar-value${themeElevated ? " text-warn" : ""}`}>
                {themes.topTheme.theme} {themes.topTheme.pct.toFixed(0)}%
              </span>
            </div>
          )}
        </div>
        {themes?.note && (
          <p className="muted-note portfolio-theme-note">{themes.note}</p>
        )}
        <p className={`muted-note${blended.retirementSummaries.length > 0 ? " mb-3" : ""}`}>
          {t("stocks.hub.breakdown.taxableNote")}
        </p>
        {blended.retirementSummaries.length > 0 && (
          <div className="portfolio-blended-row">
            <span className="portfolio-segbar-label">{t("stocks.hub.breakdown.totalInvested")}</span>
            <div className="portfolio-segbar portfolio-segbar-multi">
              <span
                className="segbar-fill segbar-fill-stock"
                style={{ width: `${blended.equityPct}%` }}
                title={t("stocks.hub.breakdown.equityTitle", { pct: blended.equityPct.toFixed(1) })}
              />
              <span
                className="segbar-fill segbar-fill-bond"
                style={{ width: `${blended.bondPct}%` }}
                title={t("stocks.hub.breakdown.bondTitle", { pct: blended.bondPct.toFixed(1) })}
              />
              <span
                className="segbar-fill segbar-fill-cash"
                style={{ width: `${blended.cashPct}%` }}
                title={t("stocks.hub.breakdown.cashTitle", { pct: blended.cashPct.toFixed(1) })}
              />
            </div>
            <span className="portfolio-segbar-value">
              {t("stocks.hub.breakdown.blendedSummary", {
                equity: blended.equityPct.toFixed(0),
                bond: blended.bondPct.toFixed(0),
                cash: blended.cashPct.toFixed(0),
              })}
            </span>
          </div>
        )}
      </div>

      {trend && (
        <div className="card allocation-trend-card">
          <div className="section-head">
            <h3 className="flush">{t("stocks.hub.trend.title")}</h3>
            {trend.length >= 2 && (
              <span className="text-secondary text-sm">
                {t("stocks.hub.trend.snapshotCount", { count: trend.length })}
              </span>
            )}
          </div>
          <AllocationTrendChart points={trend} target={target} />
        </div>
      )}

      {blended.retirementSummaries.map((ret) => (
        <div key={ret.accountId} className="card portfolio-retirement-funds">
          <div className="section-head">
            <h3 className="flush">{ret.accountName}</h3>
            <span className="text-secondary text-sm">
              {ret.underlying.length > 0
                ? t("stocks.hub.retirement.fidelityLookthrough")
                : t("stocks.hub.retirement.fundComposition")}
            </span>
          </div>
          <p className="muted-note">
            {t("stocks.hub.retirement.assetBreakdown", {
              equity: ret.equityPct.toFixed(1),
              bond: ret.bondPct.toFixed(1),
              cash: ret.cashPct.toFixed(1),
            })}
            {ret.otherPct > 0
              ? t("stocks.hub.retirement.otherSuffix", { pct: ret.otherPct.toFixed(1) })
              : ""}
            {ret.underlying.length > 0
              ? t("stocks.hub.retirement.lookthroughNote")
              : t("stocks.hub.retirement.fundRatioNote")}
          </p>
          {ret.underlying.length > 0 ? (
            <ul className="portfolio-retirement-fund-list">
              {ret.underlying.map((s) => (
                <li key={s.id}>
                  <span className="portfolio-retirement-ticker">{s.sourceTicker ?? t("stocks.compare.emDash")}</span>
                  <span>{s.label}</span>
                  <span className="portfolio-retirement-pct">{s.weightPct.toFixed(2)}%</span>
                  <span className="tag">
                    {s.assetClass === "cash"
                      ? t("stocks.hub.retirement.assetClass.cashShort")
                      : s.assetClass === "bond"
                        ? t("stocks.hub.retirement.assetClass.bond")
                        : s.assetClass === "other"
                          ? t("stocks.hub.retirement.assetClass.other")
                          : t("stocks.hub.retirement.assetClass.equity")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="portfolio-retirement-fund-list">
              {ret.funds.map((f) => (
                <li key={f.ticker}>
                  <span className="portfolio-retirement-ticker">{f.ticker}</span>
                  <span>{f.securityName ?? f.ticker}</span>
                  <span className="portfolio-retirement-pct">{f.weightPct.toFixed(0)}%</span>
                  <span className="tag">
                    {f.assetClass === "cash"
                      ? t("stocks.hub.retirement.assetClass.cashEquiv")
                      : f.assetClass === "bond"
                        ? t("stocks.hub.retirement.assetClass.bond")
                        : t("stocks.hub.retirement.assetClass.equity")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ret.underlying.length > 0 && ret.funds.length > 0 && (
            <details className="portfolio-retirement-positions mt-3">
              <summary>{t("stocks.hub.retirement.mainHoldings")}</summary>
              <ul className="portfolio-retirement-fund-list">
                {ret.funds.map((f) => (
                  <li key={f.ticker}>
                    <span className="portfolio-retirement-ticker">{f.ticker}</span>
                    <span>{f.securityName ?? f.ticker}</span>
                    <span className="portfolio-retirement-pct">{f.weightPct.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      <div
        className={`card portfolio-status ${confidence.complete ? "" : "is-partial"}`}
      >
        <div className="section-head">
          <h3 className="flush">{t("stocks.hub.confidence.title")}</h3>
          <span className={`tag ${confidence.complete ? "" : "warn"}`}>
            {confidence.complete
              ? missingCount > 0
                ? t("stocks.hub.confidence.partial")
                : t("stocks.hub.confidence.complete")
              : t("stocks.hub.confidence.noData")}
          </span>
        </div>
        <ul className="portfolio-status-list">
          {confidence.items.map((item) => {
            const actionable =
              !item.complete && (item.id === "retirement" || item.id === "hsa") && onGoSettings;
            return (
              <li key={item.id} className={item.complete ? "done" : "missing"}>
                <span className="portfolio-status-dot">{item.complete ? "✓" : "○"}</span>
                <span className="portfolio-status-label">{item.label}</span>
                {actionable && (
                  <button
                    type="button"
                    className="btn ghost compact portfolio-status-cta"
                    onClick={onGoSettings}
                  >
                    {t("stocks.hub.confidence.goSettings")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card portfolio-diagnosis">
        <h3>{t("stocks.hub.diagnosis.title")}</h3>
        <p className="muted-note">
          {t("stocks.hub.diagnosis.intro", { label: classification.label })}
          {classification.coreSatelliteNote
            ? t("stocks.hub.diagnosis.introNoteSeparator", { note: classification.coreSatelliteNote })
            : "。"}{" "}
          {t("stocks.hub.diagnosis.introSuffix")}
        </p>
        <div className="portfolio-model-tabs">
          {visibleModels.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`chip${model.tier === "advanced" ? " dashed" : ""}${selectedModelId === model.id ? " active" : ""}`}
              onClick={() => setSelectedModelId(model.id)}
            >
              {refModelText(model.id, "name")}
            </button>
          ))}
          <button
            type="button"
            className="chip dashed subtle"
            onClick={() => setShowAllModels((v) => !v)}
            aria-expanded={showAllModels}
          >
            {showAllModels
              ? t("stocks.hub.diagnosis.collapseModels")
              : t("stocks.hub.diagnosis.moreModels", { count: hiddenModelCount })}
          </button>
        </div>
        <ModelDetail model={selectedModel} yourEquityPct={equityExposure} />
        <div className="portfolio-diagnosis-actions">
          <button
            type="button"
            className="btn"
            onClick={() => applyModelToTarget(selectedModel)}
            disabled={!selectedModelTarget}
          >
            {t("stocks.hub.diagnosis.acceptTarget", {
              model: refModelText(selectedModel.id, "name"),
            })}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => applyModelToTarget(selectedModel, { edit: true })}
            disabled={!selectedModelTarget}
          >
            {t("stocks.hub.diagnosis.tweakFirst")}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setShowCompareTable((v) => !v)}
          >
            {showCompareTable
              ? t("stocks.hub.diagnosis.collapseCompare")
              : t("stocks.hub.diagnosis.expandCompare")}
          </button>
        </div>
        {showCompareTable && (
          <table className="review-table portfolio-compare-table">
            <thead>
              <tr>
                <th>{t("stocks.hub.diagnosis.compareTable.dimension")}</th>
                <th>{t("stocks.hub.diagnosis.compareTable.yours")}</th>
                <th>{t("stocks.hub.diagnosis.compareTable.model")}</th>
                <th>{t("stocks.hub.diagnosis.compareTable.gap")}</th>
              </tr>
            </thead>
            <tbody>
              {modelCompare.map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  <td>{row.yours}</td>
                  <td>{row.model}</td>
                  <td>{row.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== Layer 3 · 决策 ===== */}
      <h2 className="portfolio-layer-title">{t("stocks.hub.layer.decision")}</h2>

      <div className="card portfolio-drift-card" ref={targetCardRef}>
        <div className="section-head">
          <h3 className="flush">{t("stocks.hub.drift.title")}</h3>
          {showDriftTable && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => setEditorOpen((v) => !v)}
            >
              {editorOpen ? t("stocks.hub.drift.collapseEdit") : t("stocks.hub.drift.editTarget")}
            </button>
          )}
        </div>

        {!showDriftTable ? (
          <div className="portfolio-drift-setup">
            <p className="portfolio-drift-setup-lead">{t("stocks.hub.drift.setupLead")}</p>
            <p className="muted-note">{t("stocks.hub.drift.setupHint")}</p>
            <ul className="portfolio-drift-setup-list">
              <li>{t("stocks.hub.drift.setupItem1")}</li>
              <li>{t("stocks.hub.drift.setupItem2")}</li>
              <li>{t("stocks.hub.drift.setupItem3")}</li>
            </ul>
            <div className="portfolio-diagnosis-actions">
              <button
                type="button"
                className="btn"
                onClick={() => applyModelToTarget(selectedModel)}
                disabled={!selectedModelTarget}
              >
                {t("stocks.hub.diagnosis.acceptTarget", {
                  model: refModelText(selectedModel.id, "name"),
                })}
              </button>
              <button type="button" className="btn ghost" onClick={openTargetEditor}>
                {t("stocks.hub.drift.manualSet")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {editorOpen && <TargetInputs target={target} onChange={persistTarget} />}
            <table className="review-table portfolio-drift-table">
              <thead>
                <tr>
                  <th>{t("stocks.hub.drift.table.metric")}</th>
                  <th className="num">{t("stocks.hub.drift.table.current")}</th>
                  <th className="num">{t("stocks.hub.drift.table.target")}</th>
                  <th className="num">{t("stocks.hub.drift.table.delta")}</th>
                  <th>{t("stocks.hub.drift.table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {driftRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      {row.label}
                      {row.hint && (
                        <span className="text-secondary text-xs block">
                          {row.hint}
                        </span>
                      )}
                    </td>
                    <td className="num">{row.currentPct.toFixed(1)}%</td>
                    <td className="num">
                      {row.targetPct != null
                        ? `${row.targetPct.toFixed(1)}%`
                        : t("stocks.compare.emDash")}
                    </td>
                    <td className="num">
                      {row.driftPct != null
                        ? `${row.driftPct >= 0 ? "+" : ""}${row.driftPct.toFixed(1)}%`
                        : t("stocks.compare.emDash")}
                    </td>
                    <td>
                      <DriftStateTag state={row.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card portfolio-actions-card">
        <h3>{t("stocks.hub.actions.title")}</h3>
        <div className="portfolio-action-list">
          <ActionCard
            priority="P1"
            title={t("stocks.hub.actions.p1Title")}
            reason={t("stocks.hub.actions.p1Reason")}
            ctaLabel={t("stocks.hub.actions.p1Cta")}
            onClick={openTargetEditor}
          />
          <ActionCard
            priority="P2"
            title={t("stocks.hub.actions.p2Title")}
            reason={t("stocks.hub.actions.p2Reason")}
            ctaLabel={
              onGoSettings ? t("stocks.hub.actions.p2CtaSettings") : t("stocks.hub.actions.p2CtaPending")
            }
            disabled={!onGoSettings}
            onClick={onGoSettings}
          />
        </div>
        <div className="portfolio-rebalance-detail">
          {rebalance.map((item) =>
            item.collapsed ? (
              <details key={item.method} className="portfolio-rebalance-collapsed">
                <summary>{item.title}</summary>
                <p className="muted-note">{redactMoneyText(item.description, data.privacy)}</p>
              </details>
            ) : (
              <p key={item.method} className="muted-note portfolio-rebalance-note">
                <strong>{item.title}：</strong>
                {redactMoneyText(item.description, data.privacy)}
              </p>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function ActionCard({
  priority,
  title,
  reason,
  ctaLabel,
  onClick,
  disabled,
  done,
}: {
  priority: string;
  title: string;
  reason: string;
  ctaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
  done?: boolean;
}) {
  return (
    <div className={`portfolio-action-card ${done ? "is-done" : ""}`}>
      <span className="portfolio-action-priority">{priority}</span>
      <div className="portfolio-action-body">
        <strong>{title}</strong>
        <p className="muted-note">{reason}</p>
      </div>
      <button
        type="button"
        className="btn ghost portfolio-action-cta"
        onClick={onClick}
        disabled={disabled}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

function ModelDetail({ model, yourEquityPct }: { model: ReferenceModel; yourEquityPct: number }) {
  const { t } = useLocale();
  const { typical } = model;
  const gap = yourEquityPct - typical.equityPct;
  const gapLabel = `${gap >= 0 ? "+" : ""}${gap.toFixed(0)}%`;
  return (
    <div className="portfolio-model-detail">
      <p className="muted-note">{refModelText(model.id, "philosophy")}</p>
      <div className="portfolio-model-meta">
        <span>
          {t("stocks.hub.modelDetail.typical", {
            equity: typical.equityPct,
            bond: typical.bondPct,
          })}
        </span>
        <span>
          {t("stocks.hub.modelDetail.maintenance", {
            tier: refModelMaintenanceTier(model.maintenance),
          })}
        </span>
        <span>
          {t("stocks.hub.modelDetail.volatility", {
            tier: refModelVolatilityTier(model.volatility),
          })}
        </span>
        {typical.equityPct > 0 && (
          <span>
            {t("stocks.hub.modelDetail.yourExposure", {
              pct: yourEquityPct.toFixed(0),
              gap: gapLabel,
            })}
          </span>
        )}
      </div>
      <p className="text-secondary text-sm mb-0">
        {t("stocks.hub.modelDetail.rebalanceTradeoffs", {
          rebalance: refModelText(model.id, "rebalanceRule"),
          tradeoffs: refModelText(model.id, "tradeoffs"),
        })}
      </p>
    </div>
  );
}
