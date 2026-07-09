(function initTimelineEvents(global) {
  "use strict";

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createEvent(input) {
    return {
      id: input?.id || uid("evt"),
      label: input?.label || "未命名事件",
      year: Math.max(1, Math.round(Number(input?.year) || 1)),
      category: input?.category || "general",
      kind: input?.kind || "one-time",
      amount: Number(input?.amount) || 0,
      fundingSource: input?.fundingSource || "cash",
      enabled: input?.enabled !== false,
      linkedFundEventId: input?.linkedFundEventId || null
    };
  }

  function upsertEvent(events, nextEvent) {
    const list = Array.isArray(events) ? [...events] : [];
    const evt = createEvent(nextEvent);
    const idx = list.findIndex((e) => e.id === evt.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...evt };
    else list.push(evt);
    return list;
  }

  function removeEvent(events, eventId) {
    return (Array.isArray(events) ? events : []).filter((e) => e.id !== eventId);
  }

  function toggleEvent(events, eventId, enabled) {
    return (Array.isArray(events) ? events : []).map((e) =>
      e.id === eventId ? { ...e, enabled: enabled == null ? !e.enabled : Boolean(enabled) } : e
    );
  }

  function buildScenario(events, scenarioId) {
    const list = Array.isArray(events) ? events : [];
    if (!scenarioId || scenarioId === "all") return list.filter((e) => e.enabled !== false);
    return list.filter((e) => e.enabled !== false && (e.scenarioId || "default") === scenarioId);
  }

  function rentVsBuyTemplate(base) {
    const p = base || {};
    const buyYear = Math.max(1, Number(p.buyYearHint || 1));
    const housePrice = Number(p.housePrice || 0);
    const downPaymentPct = Number(p.downPaymentPct || 0.2);
    const closingPct = p.applyTxCosts ? 0.025 : 0;
    const downPaymentAndClosing = housePrice * (downPaymentPct + closingPct);
    const loanPrincipal = Math.max(0, housePrice - housePrice * downPaymentPct);
    const mortgageMonthly =
      Number(p.estimatedMortgageMonthly || 0) ||
      (global.FinanceEngine?.calcMonthlyPayment
        ? global.FinanceEngine.calcMonthlyPayment(loanPrincipal, Number(p.mortgageRate || 0), 30)
        : 0);
    const housingCarryMonthly =
      mortgageMonthly +
      Number(p.houseHOA || 0) +
      Number(p.homeownersIns || 0) +
      Number(p.earthquakeIns || 0) +
      Number(p.houseUtilities || 0) +
      Number(p.housingOtherFixed || 0) +
      Number(p.houseRepairs || 0);

    return {
      meta: {
        buyYear,
        housePrice,
        loanPrincipal,
        downPaymentAndClosing
      },
      rentScenario: [
        createEvent({
          id: "tpl_rent",
          label: "租金现金流",
          year: 1,
          category: "housing",
          kind: "recurring",
          amount: Number(p.rentStart || 0),
          fundingSource: "cash",
          enabled: true
        })
      ],
      buyScenario: [
        createEvent({
          id: "tpl_buy_home",
          label: "购房首付与交易成本",
          year: buyYear,
          category: "housing",
          kind: "one-time",
          amount: downPaymentAndClosing,
          fundingSource: "sell-invest",
          enabled: true
        }),
        createEvent({
          id: "tpl_housing_carry",
          label: "持房综合月供",
          year: buyYear + 1,
          category: "housing",
          kind: "recurring",
          amount: housingCarryMonthly,
          fundingSource: "cash",
          enabled: true
        }),
        createEvent({
          id: "tpl_mortgage_debt",
          label: "房贷本金",
          year: buyYear,
          category: "housing",
          kind: "one-time",
          amount: loanPrincipal,
          fundingSource: { loan: { rate: Number(p.mortgageRate || 0), termYears: 30 } },
          enabled: true
        })
      ]
    };
  }

  function projectRentVsBuyWithEngine(input) {
    const engine = input?.engine || global.FinanceEngine;
    if (!engine) return null;
    const baseline = input?.baseline || {};
    const assumptions = input?.assumptions || {};
    const horizon = Math.max(1, Math.round(Number(input?.horizonYears) || 1));
    const template = rentVsBuyTemplate(input?.templateInput || {});
    const rentSeries = engine.projectScenario(baseline, assumptions, template.rentScenario, horizon);
    const buySeries = engine.projectScenario(baseline, assumptions, template.buyScenario, horizon);
    const deltaSeries = engine.compareScenarioSeries(rentSeries, buySeries);
    return { template, rentSeries, buySeries, deltaSeries };
  }

  function buildRegressionSnapshot(input) {
    const legacy = input?.legacy || { rent: 0, buy: 0 };
    const engine = input?.engine || { rent: 0, buy: 0 };
    const absRent = Math.abs((Number(legacy.rent) || 0) - (Number(engine.rent) || 0));
    const absBuy = Math.abs((Number(legacy.buy) || 0) - (Number(engine.buy) || 0));
    return {
      horizon: Number(input?.horizon) || 0,
      view: input?.view || "ken",
      mode: input?.mode || "pre-tax",
      legacy: {
        rent: Number(legacy.rent) || 0,
        buy: Number(legacy.buy) || 0
      },
      engine: {
        rent: Number(engine.rent) || 0,
        buy: Number(engine.buy) || 0
      },
      absDiff: {
        rent: absRent,
        buy: absBuy
      }
    };
  }

  function assertRegression(snapshot, threshold) {
    const snap = snapshot || {};
    const maxAbs = Math.max(Number(snap?.absDiff?.rent) || 0, Number(snap?.absDiff?.buy) || 0);
    const th = Math.max(0, Number(threshold) || 0);
    return {
      ok: maxAbs <= th,
      maxAbs,
      threshold: th
    };
  }

  global.TimelineEvents = {
    createEvent,
    upsertEvent,
    removeEvent,
    toggleEvent,
    buildScenario,
    rentVsBuyTemplate,
    projectRentVsBuyWithEngine,
    buildRegressionSnapshot,
    assertRegression
  };
})(window);
