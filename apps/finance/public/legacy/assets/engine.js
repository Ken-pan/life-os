(function initFinanceEngine(global) {
  "use strict";

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function calcMonthlyPayment(principal, annualRate, termYears) {
    const p = Math.max(0, Number(principal) || 0);
    const r = Math.max(0, Number(annualRate) || 0) / 12;
    const n = Math.max(0, Math.round((Number(termYears) || 0) * 12));
    if (n <= 0) return 0;
    if (r === 0) return p / n;
    return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function remainingLoanBalance(principal, annualRate, monthlyPayment, monthsElapsed) {
    const p = Math.max(0, Number(principal) || 0);
    const r = Math.max(0, Number(annualRate) || 0) / 12;
    const m = Math.max(0, Math.round(Number(monthsElapsed) || 0));
    const pay = Math.max(0, Number(monthlyPayment) || 0);
    if (r === 0) return Math.max(0, p - pay * m);
    return Math.max(0, p * Math.pow(1 + r, m) - pay * ((Math.pow(1 + r, m) - 1) / r));
  }

  function principalPaidInYear(principal, annualRate, monthlyPayment, yearIndex) {
    const y = Math.max(1, Math.round(Number(yearIndex) || 1));
    const prev = remainingLoanBalance(principal, annualRate, monthlyPayment, (y - 1) * 12);
    const curr = remainingLoanBalance(principal, annualRate, monthlyPayment, y * 12);
    return Math.max(0, prev - curr);
  }

  function calcLiquidationTaxOnInvestSale(grossSale, portfolioValue, portfolioBasis, taxContext) {
    const gross = Math.max(0, Number(grossSale) || 0);
    const val = Math.max(0, Number(portfolioValue) || 0);
    const basis = Math.max(0, Number(portfolioBasis) || 0);
    if (gross <= 0 || val <= 0) return 0;
    const soldRatio = clamp(gross / val, 0, 1);
    const basisSold = basis * soldRatio;
    const gain = Math.max(0, gross - basisSold);
    const federalRate = clamp(Number(taxContext?.federalLtcgRate ?? 0.15), 0, 1);
    const waRate = taxContext?.applyWACGT ? clamp(Number(taxContext?.waRate ?? 0.07), 0, 1) : 0;
    return gain * (federalRate + waRate);
  }

  function growInvestments(investments, annualReturn) {
    const bal = Math.max(0, Number(investments) || 0);
    const r = Number(annualReturn) || 0;
    return Math.max(0, bal * (1 + r));
  }

  function calcNetWorthPreTax(state) {
    return (
      (Number(state.cash) || 0) +
      (Number(state.investments) || 0) +
      (Number(state.homeEquity) || 0) -
      (Number(state.debt) || 0)
    );
  }

  function calcAfterTaxNetWorth(state, assumptions) {
    const pre = calcNetWorthPreTax(state);
    const assumedLiquidationTaxRate = clamp(Number(assumptions?.liquidationTaxRate ?? 0), 0, 1);
    const taxableGainsEstimate = Math.max(0, Number(state.investments) || 0) * assumedLiquidationTaxRate;
    return pre - taxableGainsEstimate;
  }

  function calcNetWorthAfterTax(state, assumptions) {
    return calcAfterTaxNetWorth(state, assumptions);
  }

  function normalizeEvents(events) {
    return (Array.isArray(events) ? events : [])
      .filter((e) => e && e.enabled !== false)
      .map((e) => ({
        id: String(e.id || ""),
        label: String(e.label || ""),
        year: Math.max(1, Math.round(Number(e.year) || 1)),
        category: String(e.category || "general"),
        kind: e.kind || "one-time",
        amount: Number(e.amount) || 0,
        fundingSource: e.fundingSource || "cash",
        enabled: e.enabled !== false,
        rampStartAmount: e.rampStartAmount == null ? null : Number(e.rampStartAmount),
        rampAnnualStep: e.rampAnnualStep == null ? null : Number(e.rampAnnualStep)
      }));
  }

  function validateInputs(baseline, assumptions, events, horizonYears) {
    if (!baseline || typeof baseline !== "object") return false;
    if (!assumptions || typeof assumptions !== "object") return false;
    if (!Array.isArray(events)) return false;
    const h = Number(horizonYears);
    return Number.isFinite(h) && h > 0;
  }

  function listOneTimeEventsForYear(events, year) {
    return normalizeEvents(events).filter((e) => e.kind === "one-time" && e.year === year);
  }

  function recurringMonthlyAmountAtYear(event, year) {
    if (event.kind === "recurring") return Number(event.amount) || 0;
    if (event.kind === "ramp") {
      const base = event.rampStartAmount == null ? Number(event.amount) || 0 : Number(event.rampStartAmount) || 0;
      const step = Number(event.rampAnnualStep || 0);
      return base + Math.max(0, year - event.year) * step;
    }
    return 0;
  }

  function sumRecurringDeltaForYear(events, year) {
    return normalizeEvents(events)
      .filter((e) => (e.kind === "recurring" || e.kind === "ramp") && e.year <= year)
      .reduce((sum, e) => sum + recurringMonthlyAmountAtYear(e, year) * 12, 0);
  }

  function sumRampDeltaForYear(events, year) {
    return normalizeEvents(events)
      .filter((e) => e.kind === "ramp" && e.year <= year)
      .reduce((sum, e) => sum + recurringMonthlyAmountAtYear(e, year) * 12, 0);
  }

  function buildLoanAmortSchedule(principal, annualRate, termYears, startYear) {
    const monthlyPayment = calcMonthlyPayment(principal, annualRate, termYears);
    return {
      principal: Math.max(0, Number(principal) || 0),
      annualRate: Math.max(0, Number(annualRate) || 0),
      termYears: Math.max(0, Number(termYears) || 0),
      startYear: Math.max(1, Math.round(Number(startYear) || 1)),
      monthlyPayment
    };
  }

  function fundByCash(state, amount) {
    const amt = Math.max(0, Number(amount) || 0);
    const next = { ...state };
    next.cash -= amt;
    return next;
  }

  function solveGrossSaleForNetCash(netNeeded, portfolioValue, portfolioBasis, taxContext) {
    const target = Math.max(0, Number(netNeeded) || 0);
    const value = Math.max(0, Number(portfolioValue) || 0);
    const basis = Math.max(0, Number(portfolioBasis) || 0);
    if (target <= 0 || value <= 0) return 0;
    let lo = 0;
    let hi = value;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      const tax = calcLiquidationTaxOnInvestSale(mid, value, basis, taxContext);
      const net = mid - tax;
      if (net >= target) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function fundBySellInvest(state, amount, taxContext) {
    const amt = Math.max(0, Number(amount) || 0);
    const next = { ...state };
    const grossSale = solveGrossSaleForNetCash(amt, next.investments, next.investmentsBasis || next.investments, taxContext);
    const tax = calcLiquidationTaxOnInvestSale(grossSale, next.investments, next.investmentsBasis || next.investments, taxContext);
    next.investments -= grossSale;
    next.cash -= amt;
    next.realizedTax = (next.realizedTax || 0) + tax;
    return next;
  }

  function fundByLoan(state, amount, loanSpec, year, schedule) {
    const amt = Math.max(0, Number(amount) || 0);
    const next = { ...state };
    const spec = loanSpec || {};
    const s = buildLoanAmortSchedule(amt, spec.rate || 0, spec.termYears || 1, year);
    next.debt += amt;
    schedule.push(s);
    return next;
  }

  function applyOneTimeEvent(state, event, context) {
    const next = { ...state };
    const amount = Math.max(0, Number(event.amount) || 0);
    const src = event.fundingSource;
    if (src === "cash") return fundByCash(next, amount);
    if (src === "sell-invest") return fundBySellInvest(next, amount, context.taxContext || {});
    if (src && typeof src === "object" && src.loan) {
      return fundByLoan(next, amount, src.loan, context.year, context.loanSchedule);
    }
    return fundByCash(next, amount);
  }

  function settleYear(prevState, context) {
    let next = {
      ...prevState,
      cash: Number(prevState.cash) || 0,
      investments: Number(prevState.investments) || 0,
      homeEquity: Number(prevState.homeEquity) || 0,
      debt: Number(prevState.debt) || 0
    };
    const year = context.year;
    const assumptions = context.assumptions || {};
    const baseline = context.baseline || {};
    const events = context.events || [];
    const loanSchedule = context.loanSchedule || [];

    const incomeGrowth = Number(baseline.incomeGrowthAnnual) || 0;
    const income = (Number(baseline.afterTaxIncomeMonthly) || 0) * 12 * Math.pow(1 + incomeGrowth, year - 1);
    next.cash += income;

    const baseExpense = (Number(baseline.baseExpenseMonthly) || 0) * 12;
    const recurringDelta = sumRecurringDeltaForYear(events, year);
    next.cash -= (baseExpense + recurringDelta);

    next.investments = growInvestments(next.investments, Number(assumptions.stockReturn) || 0);

    const oneTimeEvents = listOneTimeEventsForYear(events, year);
    for (let i = 0; i < oneTimeEvents.length; i++) {
      next = applyOneTimeEvent(next, oneTimeEvents[i], {
        year,
        assumptions,
        taxContext: assumptions,
        loanSchedule
      });
    }

    const homeGrowth = Number(assumptions.houseAppreciationAnnual || assumptions.houseApp || 0);
    next.homeEquity = Math.max(0, next.homeEquity * (1 + homeGrowth));

    for (let i = 0; i < loanSchedule.length; i++) {
      const loan = loanSchedule[i];
      if (year < loan.startYear) continue;
      const principalPaid = principalPaidInYear(loan.principal, loan.annualRate, loan.monthlyPayment, year - loan.startYear + 1);
      next.debt = Math.max(0, next.debt - principalPaid);
      next.homeEquity += principalPaid;
    }

    next.netWorthPreTax = calcNetWorthPreTax(next);
    next.netWorthAfterTax = calcNetWorthAfterTax(next, assumptions);
    return next;
  }

  function projectNetWorth(baseline, assumptions, events, horizonYears) {
    if (!validateInputs(baseline, assumptions, events, horizonYears)) return [];
    const horizon = Math.max(1, Math.round(Number(horizonYears) || 1));
    const normalizedEvents = normalizeEvents(events);
    const loanSchedule = [];
    let current = {
      year: 0,
      cash: Number(baseline.cash) || 0,
      investments: Number(baseline.investments) || 0,
      investmentsBasis: Number(baseline.investmentsBasis ?? baseline.investments) || 0,
      homeEquity: Number(baseline.homeEquity) || 0,
      debt: Number(baseline.debt) || 0
    };
    current.netWorthPreTax = calcNetWorthPreTax(current);
    current.netWorthAfterTax = calcNetWorthAfterTax(current, assumptions);
    const rows = [current];

    for (let year = 1; year <= horizon; year++) {
      current = settleYear(current, {
        year,
        baseline,
        assumptions,
        events: normalizedEvents,
        loanSchedule
      });
      rows.push({ ...current, year });
    }
    return rows;
  }

  function projectScenario(baseline, assumptions, scenarioEvents, horizonYears) {
    return projectNetWorth(baseline, assumptions, scenarioEvents || [], horizonYears);
  }

  function compareScenarioSeries(seriesA, seriesB) {
    const maxLen = Math.max(seriesA?.length || 0, seriesB?.length || 0);
    const rows = [];
    for (let i = 0; i < maxLen; i++) {
      const a = seriesA?.[i];
      const b = seriesB?.[i];
      if (!a && !b) continue;
      rows.push({
        year: Number(a?.year ?? b?.year ?? i) || 0,
        preTaxDelta: (Number(a?.netWorthPreTax) || 0) - (Number(b?.netWorthPreTax) || 0),
        afterTaxDelta: (Number(a?.netWorthAfterTax) || 0) - (Number(b?.netWorthAfterTax) || 0)
      });
    }
    return rows;
  }

  function calcGoalGap(projectedSeries, targetAmount, targetYear, afterTax) {
    const y = Math.max(0, Math.round(Number(targetYear) || 0));
    const row = (projectedSeries || []).find((r) => r.year === y) || null;
    const expected = row ? (afterTax ? row.netWorthAfterTax : row.netWorthPreTax) : 0;
    const target = Math.max(0, Number(targetAmount) || 0);
    const gap = Math.max(0, target - expected);
    return { expected, target, gap };
  }

  function readNetWorthAtYear(series, targetYear, afterTax) {
    const y = Math.max(0, Math.round(Number(targetYear) || 0));
    const rows = Array.isArray(series) ? series : [];
    const row = rows.find((r) => r.year === y) || rows[rows.length - 1] || null;
    if (!row) return 0;
    return afterTax ? Number(row.netWorthAfterTax) || 0 : Number(row.netWorthPreTax) || 0;
  }

  function solveRequiredMonthlyExtraSaving(
    baseline,
    assumptions,
    events,
    horizonYears,
    targetAmount,
    targetYear,
    solverOptions
  ) {
    const opts = solverOptions || {};
    const maxExtra = Math.max(0, Number(opts.maxExtraMonthly) || 100000);
    const epsilon = Math.max(1, Number(opts.epsilon) || 1);
    const afterTax = Boolean(opts.afterTax);
    const year = Math.max(0, Math.round(Number(targetYear) || 0));
    const target = Math.max(0, Number(targetAmount) || 0);

    function withExtra(extraMonthly) {
      const extra = Math.max(0, Number(extraMonthly) || 0);
      const synthetic = {
        id: "__goal_extra__",
        label: "额外储蓄",
        year: 1,
        category: "goal",
        kind: "recurring",
        amount: -extra,
        fundingSource: "cash",
        enabled: true
      };
      const series = projectNetWorth(baseline, assumptions, [...(events || []), synthetic], horizonYears);
      const row = series.find((r) => r.year === year) || series[series.length - 1];
      return afterTax ? row.netWorthAfterTax : row.netWorthPreTax;
    }

    if (withExtra(0) >= target) return 0;
    if (withExtra(maxExtra) < target) return null;

    let lo = 0;
    let hi = maxExtra;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (withExtra(mid) >= target) hi = mid;
      else lo = mid;
      if (hi - lo <= epsilon) break;
    }
    return hi;
  }

  function buildGoalProjection(input) {
    const baseline = input?.baseline || {};
    const assumptions = input?.assumptions || {};
    const events = input?.events || [];
    const horizonYears = Math.max(1, Math.round(Number(input?.horizonYears) || 1));
    const targetAmount = Math.max(0, Number(input?.targetAmount) || 0);
    const targetYear = Math.max(0, Math.round(Number(input?.targetYear) || 0));
    const afterTax = Boolean(input?.afterTax);
    const solverOptions = input?.solverOptions || {};
    const series = projectNetWorth(baseline, assumptions, events, horizonYears);
    const expected = readNetWorthAtYear(series, targetYear, afterTax);
    const gap = Math.max(0, targetAmount - expected);
    const extraMonthly = solveRequiredMonthlyExtraSaving(
      baseline,
      assumptions,
      events,
      horizonYears,
      targetAmount,
      targetYear,
      { ...solverOptions, afterTax }
    );
    return {
      series,
      expected,
      target: targetAmount,
      gap,
      extraMonthly
    };
  }

  function cloneYearState(state) {
    return {
      year: Number(state?.year) || 0,
      cash: Number(state?.cash) || 0,
      investments: Number(state?.investments) || 0,
      homeEquity: Number(state?.homeEquity) || 0,
      debt: Number(state?.debt) || 0,
      netWorthPreTax: Number(state?.netWorthPreTax) || 0,
      netWorthAfterTax: Number(state?.netWorthAfterTax) || 0
    };
  }

  global.FinanceEngine = {
    projectNetWorth,
    projectScenario,
    compareScenarioSeries,
    settleYear,
    sumRecurringDeltaForYear,
    sumRampDeltaForYear,
    listOneTimeEventsForYear,
    applyOneTimeEvent,
    fundByCash,
    fundBySellInvest,
    fundByLoan,
    calcMonthlyPayment,
    remainingLoanBalance,
    principalPaidInYear,
    buildLoanAmortSchedule,
    growInvestments,
    calcLiquidationTaxOnInvestSale,
    calcNetWorthPreTax,
    calcNetWorthAfterTax,
    calcAfterTaxNetWorth,
    calcGoalGap,
    readNetWorthAtYear,
    buildGoalProjection,
    solveRequiredMonthlyExtraSaving,
    normalizeEvents,
    validateInputs,
    cloneYearState
  };
})(window);
