/* GENERATED — do not edit.
 * Source: packages/platform-web/src/kenosHealthReadiness.js (+ state engine)
 * Regenerate: node scripts/bundle-kenos-health-readiness-native.mjs
 */
var KenosHealthReadiness = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/platform-web/src/kenosHealthReadiness.js
  var kenosHealthReadiness_exports = {};
  __export(kenosHealthReadiness_exports, {
    HEALTH_READINESS_VERSION: () => HEALTH_READINESS_VERSION,
    buildHealthReadinessFromMeasurements: () => buildHealthReadinessFromMeasurements,
    buildHealthReadinessSummary: () => buildHealthReadinessSummary,
    focusCapacityFromDims: () => focusCapacityFromDims,
    formatHealthReadinessForAssistant: () => formatHealthReadinessForAssistant,
    healthReadinessToTodayPriority: () => healthReadinessToTodayPriority,
    healthReadinessToTodaySignal: () => healthReadinessToTodaySignal,
    isSafeHealthReadiness: () => isSafeHealthReadiness,
    resolveInjectedHealthReadiness: () => resolveInjectedHealthReadiness
  });

  // packages/platform-web/src/kenosHealthStateEngine.js
  var DIMENSION_ORDER = [
    "energy",
    "focus",
    "recovery",
    "stress",
    "sleepDebt",
    "physical"
  ];
  var HEADLINE_PRIORITY = [
    "stress",
    "sleepDebt",
    "recovery",
    "energy",
    "physical",
    "focus"
  ];
  var HOUR = 3600 * 1e3;
  var MIN_BASELINE = 4;
  function isoDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function pickToday(health, key, now) {
    const todayStr = isoDate(now);
    const withKey = health.filter((d) => typeof d?.[key] === "number" && d.date);
    const today = withKey.find((d) => d.date === todayStr);
    if (today) return { value: today[key], date: today.date, fresh: true };
    const sorted = [...withKey].sort((a, b) => a.date < b.date ? 1 : -1);
    const last = sorted[0];
    if (last && Date.parse(`${last.date}T23:59:59`) >= now - 36 * HOUR) {
      return { value: last[key], date: last.date, fresh: false };
    }
    return null;
  }
  function baselineOf(health, key, now) {
    const todayStr = isoDate(now);
    const vals = health.filter(
      (d) => typeof d?.[key] === "number" && d.date && d.date !== todayStr
    ).map((d) => d[key]);
    return {
      value: vals.length >= MIN_BASELINE ? median(vals) : null,
      n: vals.length
    };
  }
  function healthDaysToSleepObs(days) {
    if (!Array.isArray(days)) return [];
    return days.filter((d) => d && d.date && typeof d.sleepHours === "number").map((d) => ({
      ts: (/* @__PURE__ */ new Date(`${d.date}T08:00:00`)).getTime(),
      type: "sleep",
      hours: d.sleepHours
    }));
  }
  function recentSleeps(days, now, n = 3) {
    const obs = healthDaysToSleepObs(days).sort((a, b) => a.ts - b.ts);
    const recent = obs.slice(-n).reverse();
    const last = recent[0] && now - recent[0].ts <= 36 * HOUR ? recent[0] : null;
    return { last, recent };
  }
  function recommendPolicy(dims, baseMinutes = 20) {
    const rank = { good: 0, ok: 0, unknown: 0, watch: 1, bad: 2 };
    let sev = 0;
    let driver = null;
    for (const k of ["sleepDebt", "stress", "recovery", "energy", "physical"]) {
      const r = rank[dims?.[k]?.level] ?? 0;
      if (r > sev) {
        sev = r;
        driver = k;
      }
    }
    if (sev === 0) return { limitMinutes: baseMinutes, driver: null };
    const limitMinutes = Math.min(baseMinutes, sev >= 2 ? 12 : 16);
    return { limitMinutes, driver };
  }
  function todayTrainingLedger(health, now) {
    const workoutCount = pickToday(health, "workoutCount", now);
    const workoutMinutes = pickToday(health, "workoutMinutes", now);
    const exerciseMinutes = pickToday(health, "exerciseMinutes", now);
    const activeEnergy = pickToday(health, "activeEnergyKcal", now);
    const standMinutes = pickToday(health, "standMinutes", now);
    const steps = pickToday(health, "steps", now);
    const wc = workoutCount?.value ?? 0;
    const wm = workoutMinutes?.value ?? null;
    const em = exerciseMinutes?.value ?? null;
    const trained = wc >= 1 || wm != null && wm >= 15 || em != null && em >= 30;
    return {
      trained,
      workoutCount: wc,
      workoutMinutes: wm,
      exerciseMinutes: em,
      activeEnergyKcal: activeEnergy?.value ?? null,
      standMinutes: standMinutes?.value ?? null,
      steps: steps?.value ?? null
    };
  }
  function trainingRecommendation(dims, ledger) {
    const phys = dims?.physical?.level;
    const rec = dims?.recovery?.level;
    const debt = dims?.sleepDebt?.level;
    if (phys === "bad" || rec === "bad" || debt === "bad") {
      return { code: "recover", k: "now.trainRecover" };
    }
    if (ledger?.trained) {
      return { code: "already_trained", k: "now.trainAlready" };
    }
    if (phys === "unknown" && ledger?.steps == null && ledger?.exerciseMinutes == null) {
      return { code: "unknown", k: "now.trainUnknown" };
    }
    if (phys === "watch" || rec === "watch") {
      return { code: "easy", k: "now.trainEasy" };
    }
    return { code: "ok_to_train", k: "now.trainOk" };
  }
  function activityLevel(stepsToday, stepsBase, energyToday, energyBase, exerciseToday) {
    const ratios = [];
    if (stepsToday && stepsBase?.value)
      ratios.push(stepsToday.value / stepsBase.value);
    if (energyToday && energyBase?.value)
      ratios.push(energyToday.value / energyBase.value);
    if (ratios.length) {
      const r = ratios.reduce((s, n) => s + n, 0) / ratios.length;
      if (r >= 0.85) return "good";
      if (r >= 0.55) return "ok";
      if (r >= 0.35) return "watch";
      return "bad";
    }
    const ex = exerciseToday?.value;
    const steps = stepsToday?.value;
    if (ex != null && ex >= 30) return "good";
    if (steps != null) {
      if (steps >= 8e3) return "good";
      if (steps >= 5e3) return "ok";
      if (steps >= 2500) return "watch";
      return "bad";
    }
    if (ex != null) {
      if (ex >= 20) return "ok";
      if (ex >= 10) return "watch";
      return "bad";
    }
    if (energyToday?.value != null) {
      if (energyToday.value >= 500) return "good";
      if (energyToday.value >= 300) return "ok";
      if (energyToday.value >= 150) return "watch";
      return "bad";
    }
    return null;
  }
  function hrvRatioLevel(ratio) {
    if (ratio >= 0.95) return "good";
    if (ratio >= 0.85) return "ok";
    if (ratio >= 0.75) return "watch";
    return "bad";
  }
  function rhrDeltaLevel(delta) {
    if (delta <= 2) return "good";
    if (delta <= 5) return "ok";
    if (delta <= 9) return "watch";
    return "bad";
  }
  var RANK = { good: 0, ok: 1, watch: 2, bad: 3 };
  var worseOf = (...levels) => levels.reduce((w, l) => RANK[l] > RANK[w] ? l : w, "good");
  function sleepLevel(h) {
    return h >= 7 ? "good" : h >= 6 ? "ok" : h >= 5 ? "watch" : "bad";
  }
  function stepDown(level) {
    const order = ["good", "ok", "watch", "bad"];
    return order[Math.min(order.length - 1, order.indexOf(level) + 1)];
  }
  function deriveState({ now, health, agent }) {
    const H = Array.isArray(health) ? health : [];
    const a = agent ?? { online: false };
    const netMin = Math.max(0, Math.round(a.todayNetMinutes ?? 0));
    const dims = {};
    const { last: sleepLast, recent: sleeps } = recentSleeps(H, now);
    const hrvToday = pickToday(H, "hrv", now);
    const hrvBase = baselineOf(H, "hrv", now);
    const rhrToday = pickToday(H, "restingHR", now);
    const rhrBase = baselineOf(H, "restingHR", now);
    const stepsToday = pickToday(H, "steps", now);
    const stepsBase = baselineOf(H, "steps", now);
    const energyToday = pickToday(H, "activeEnergyKcal", now);
    const energyBase = baselineOf(H, "activeEnergyKcal", now);
    const exerciseToday = pickToday(H, "exerciseMinutes", now);
    const standToday = pickToday(H, "standMinutes", now);
    const workoutMinutesToday = pickToday(H, "workoutMinutes", now);
    const ledger = todayTrainingLedger(H, now);
    const hrvRatio = hrvToday && hrvBase.value ? hrvToday.value / hrvBase.value : null;
    const rhrDelta = rhrToday && rhrBase.value ? rhrToday.value - rhrBase.value : null;
    if (!a.online) {
      dims.focus = { level: "unknown", reasons: [{ k: "state.r_agentOffline" }] };
    } else if (a.phase === "breaking") {
      dims.focus = { level: "ok", reasons: [{ k: "state.r_break" }] };
    } else {
      const limit = Math.max(1, a.limitSeconds ?? 1200);
      const frac = (a.score ?? 0) / limit;
      const p = {
        min: Math.floor((a.score ?? 0) / 60),
        limit: Math.floor(limit / 60)
      };
      const reasons = [
        frac >= 0.85 || a.phase === "warning" ? { k: "state.r_nearLimit", p } : { k: "state.r_headroom", p }
      ];
      if (a.note) reasons.push({ k: "state.r_focusLive", p: { note: a.note } });
      dims.focus = {
        level: a.phase === "warning" || frac >= 0.85 ? "watch" : frac >= 0.5 ? "ok" : "good",
        reasons
      };
    }
    if (!sleepLast) {
      dims.sleepDebt = {
        level: "unknown",
        reasons: [{ k: "state.r_needWatchSleep" }]
      };
    } else {
      const h = sleepLast.hours;
      const reasons = [{ k: "state.r_sleepLastMeasured", p: { hours: h } }];
      let level = sleepLevel(h);
      if (sleeps.length >= 2) {
        const avg = sleeps.reduce((s, o) => s + o.hours, 0) / sleeps.length;
        reasons.push({
          k: "state.r_sleepAvg",
          p: { n: sleeps.length, avg: avg.toFixed(1) }
        });
        if (avg < 6.5 && level === "good") level = "ok";
      }
      dims.sleepDebt = { level, reasons };
    }
    if (hrvRatio == null) {
      const reasons = [
        {
          k: hrvToday ? "state.r_needBaseline" : "state.r_needWatchHrv",
          p: { n: hrvBase.n, need: MIN_BASELINE }
        }
      ];
      dims.stress = { level: "unknown", reasons };
    } else {
      let level = hrvRatioLevel(hrvRatio);
      const reasons = [
        {
          k: "state.r_hrvToday",
          p: { hrv: Math.round(hrvToday.value), base: Math.round(hrvBase.value) }
        }
      ];
      const warns = a.warnsToday ?? 0;
      if (warns >= 2) {
        level = stepDown(level);
        reasons.push({ k: "state.r_warns", p: { n: warns } });
      }
      dims.stress = { level, reasons };
    }
    {
      const signals = [];
      const reasons = [];
      if (hrvRatio != null) {
        signals.push(hrvRatioLevel(hrvRatio));
        reasons.push({
          k: "state.r_hrvToday",
          p: { hrv: Math.round(hrvToday.value), base: Math.round(hrvBase.value) }
        });
      }
      if (rhrDelta != null) {
        signals.push(rhrDeltaLevel(rhrDelta));
        reasons.push({
          k: "state.r_rhrToday",
          p: {
            rhr: Math.round(rhrToday.value),
            base: Math.round(rhrBase.value),
            delta: rhrDelta > 0 ? `+${Math.round(rhrDelta)}` : Math.round(rhrDelta)
          }
        });
      }
      if (sleepLast) signals.push(sleepLevel(sleepLast.hours));
      if (signals.length) {
        let level = worseOf(...signals);
        const breaks = a.breaksToday ?? 0;
        if (netMin >= 60 && breaks < Math.floor(netMin / 60)) {
          level = stepDown(level);
          reasons.push({ k: "state.r_fewBreaks", p: { min: netMin, n: breaks } });
        }
        dims.recovery = { level, reasons };
      } else if (a.online) {
        if (netMin < 30)
          dims.recovery = {
            level: "good",
            reasons: [{ k: "state.r_netToday", p: { min: netMin } }]
          };
        else {
          const breaks = a.breaksToday ?? 0;
          dims.recovery = breaks >= Math.floor(netMin / 60) ? {
            level: "ok",
            reasons: [
              { k: "state.r_netToday", p: { min: netMin } },
              { k: "state.r_breaks", p: { n: breaks } }
            ]
          } : {
            level: "watch",
            reasons: [
              { k: "state.r_fewBreaks", p: { min: netMin, n: breaks } }
            ]
          };
        }
      } else {
        dims.recovery = {
          level: "unknown",
          reasons: [
            {
              k: "state.r_needWatchHrv",
              p: { n: hrvBase.n, need: MIN_BASELINE }
            }
          ]
        };
      }
    }
    if (!sleepLast) {
      dims.energy = {
        level: "unknown",
        reasons: [{ k: "state.r_needWatchSleep" }]
      };
    } else {
      let level = sleepLevel(sleepLast.hours);
      const reasons = [
        { k: "state.r_sleepLastMeasured", p: { hours: sleepLast.hours } }
      ];
      if (rhrDelta != null && rhrDelta > 5) {
        level = stepDown(level);
        reasons.push({
          k: "state.r_rhrElevated",
          p: { delta: `+${Math.round(rhrDelta)}` }
        });
      }
      if (netMin >= 150) {
        level = stepDown(level);
        reasons.push({ k: "state.r_highLoad", p: { min: netMin } });
      }
      dims.energy = { level, reasons };
    }
    {
      const act = activityLevel(
        stepsToday,
        stepsBase,
        energyToday,
        energyBase,
        exerciseToday
      );
      const hasPhysio = Boolean(sleepLast) || rhrDelta != null;
      const hasActivity = act != null;
      if (!hasPhysio && !hasActivity) {
        dims.physical = {
          level: "unknown",
          reasons: [{ k: "state.r_needHealth" }]
        };
      } else {
        const signals = [];
        const reasons = [{ k: "state.r_derivedPhysio" }];
        if (sleepLast) signals.push(sleepLevel(sleepLast.hours));
        if (rhrDelta != null) signals.push(rhrDeltaLevel(rhrDelta));
        let level = signals.length ? worseOf(...signals) : act;
        if (act === "watch" || act === "bad") {
          if (level === "good") level = act === "bad" ? "watch" : "ok";
          else if (level === "ok") level = "watch";
          reasons.push({
            k: act === "bad" ? "state.r_activityLow" : "state.r_activitySoft"
          });
        } else if (act === "good" || act === "ok") {
          reasons.push({ k: "state.r_activityOk" });
        }
        if (stepsToday) {
          reasons.push({
            k: "state.r_stepsToday",
            p: { steps: Math.round(stepsToday.value) }
          });
        }
        if (energyToday) {
          reasons.push({
            k: "state.r_energyToday",
            p: { kcal: Math.round(energyToday.value) }
          });
        }
        if (exerciseToday) {
          reasons.push({
            k: "state.r_exerciseToday",
            p: { min: Math.round(exerciseToday.value) }
          });
        }
        if (standToday) {
          reasons.push({
            k: "state.r_standToday",
            p: { min: Math.round(standToday.value) }
          });
        }
        if (ledger.trained) {
          const mins = Math.round(
            ledger.workoutMinutes ?? ledger.exerciseMinutes ?? 0
          );
          reasons.push({
            k: "state.r_workoutToday",
            p: { n: ledger.workoutCount || 1, min: mins }
          });
          const hard = (ledger.workoutMinutes ?? 0) >= 40 || (ledger.exerciseMinutes ?? 0) >= 40;
          if (hard && level === "good") {
            level = "ok";
            reasons.push({ k: "state.r_alreadyLoaded" });
          }
        }
        if (((workoutMinutesToday?.value ?? 0) >= 45 || (exerciseToday?.value ?? 0) >= 45) && rhrDelta != null && rhrDelta > 5) {
          level = stepDown(level);
          reasons.push({ k: "state.r_overreach" });
        }
        dims.physical = { level, reasons };
      }
    }
    let headline;
    if (a.online && a.phase === "breaking") {
      headline = { k: "state.h_breaking" };
    } else {
      const firstAt = (lvl) => HEADLINE_PRIORITY.find((k) => dims[k].level === lvl);
      const worst = firstAt("bad") ?? firstAt("watch");
      const unknowns = DIMENSION_ORDER.filter(
        (k) => dims[k].level === "unknown"
      ).length;
      if (worst) headline = { k: `state.h_${worst}` };
      else if (unknowns >= 3) headline = { k: "state.h_noData" };
      else headline = { k: "state.h_allGood" };
    }
    return { dims, headline };
  }

  // packages/platform-web/src/kenosHealthReadiness.js
  var HEALTH_READINESS_VERSION = 1;
  var LEVELS = /* @__PURE__ */ new Set(["good", "ok", "watch", "bad", "unknown"]);
  var TRAIN_CODES = /* @__PURE__ */ new Set([
    "recover",
    "already_trained",
    "easy",
    "ok_to_train",
    "unknown"
  ]);
  var CAPACITIES = /* @__PURE__ */ new Set(["full", "reduced", "low", "unknown"]);
  function focusCapacityFromDims(dims) {
    const rank = { good: 0, ok: 0, unknown: 0, watch: 1, bad: 2 };
    const levelOf = (k) => {
      const v = dims?.[k];
      return typeof v === "string" ? v : v?.level;
    };
    let sev = 0;
    for (const k of ["sleepDebt", "stress", "recovery", "energy", "physical"]) {
      sev = Math.max(sev, rank[levelOf(k)] ?? 0);
    }
    if (sev >= 2) return "low";
    if (sev === 1) return "reduced";
    if (DIMENSION_ORDER.filter((k) => levelOf(k) === "unknown").length >= 3) {
      return "unknown";
    }
    return "full";
  }
  function buildHealthReadinessSummary(input) {
    const dimsIn = input?.dims && typeof input.dims === "object" ? input.dims : {};
    const dims = {};
    for (const k of DIMENSION_ORDER) {
      const level = dimsIn[k]?.level;
      dims[k] = LEVELS.has(level) ? level : "unknown";
    }
    const trainCode = TRAIN_CODES.has(input?.training?.code) ? input.training.code : "unknown";
    const capacity = focusCapacityFromDims(dims);
    const asOf = input?.asOf instanceof Date ? input.asOf.toISOString() : typeof input?.asOf === "string" ? input.asOf : typeof input?.asOf === "number" ? new Date(input.asOf).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
    return Object.freeze({
      version: HEALTH_READINESS_VERSION,
      asOf,
      source: typeof input?.source === "string" ? input.source : "unknown",
      dayCount: Number.isFinite(input?.dayCount) ? Number(input.dayCount) : 0,
      dims: Object.freeze(dims),
      headlineKey: typeof input?.headline?.k === "string" ? input.headline.k : "state.h_noData",
      focusCapacity: CAPACITIES.has(capacity) ? capacity : "unknown",
      training: Object.freeze({
        code: trainCode,
        trained: Boolean(input?.training?.trained)
      }),
      policy: Object.freeze({
        driver: typeof input?.policy?.driver === "string" ? input.policy.driver : null,
        limitMinutes: Number.isFinite(input?.policy?.limitMinutes) ? Number(input.policy.limitMinutes) : null
      })
    });
  }
  function buildHealthReadinessFromMeasurements(input = {}) {
    const now = input.now ?? Date.now();
    const health = Array.isArray(input.health) ? input.health : [];
    const agent = input.agent ?? { online: false };
    const engine = deriveState({ now, health, agent });
    const ledger = todayTrainingLedger(health, now);
    const training = trainingRecommendation(engine.dims, ledger);
    const policy = recommendPolicy(engine.dims, 20);
    return buildHealthReadinessSummary({
      dims: engine.dims,
      headline: engine.headline,
      training: { code: training.code, trained: ledger.trained },
      policy,
      asOf: now,
      source: input.source || "healthkit",
      dayCount: health.length
    });
  }
  function isSafeHealthReadiness(value) {
    if (!value || typeof value !== "object") return false;
    if (value.version !== HEALTH_READINESS_VERSION) return false;
    if (!value.dims || typeof value.dims !== "object") return false;
    for (const k of DIMENSION_ORDER) {
      if (!LEVELS.has(value.dims[k])) return false;
    }
    if (!TRAIN_CODES.has(value.training?.code)) return false;
    if (!CAPACITIES.has(value.focusCapacity)) return false;
    const blob = JSON.stringify(value);
    if (/sleepHours|restingHR|"hrv"|activeEnergyKcal|spo2|bodyMass|steps"|workoutMinutes/i.test(
      blob
    )) {
      return false;
    }
    return true;
  }
  function resolveInjectedHealthReadiness(opts = {}) {
    if (typeof window === "undefined") return null;
    const injected = window.__KENOS_HEALTH_READINESS__;
    if (isSafeHealthReadiness(injected)) return injected;
    const days = window.__KENOS_APPLE_HEALTH__?.days;
    if (!Array.isArray(days) || days.length === 0) return null;
    const summary = buildHealthReadinessFromMeasurements({
      now: opts.now ?? Date.now(),
      health: days,
      agent: opts.agent ?? { online: false },
      source: window.__KENOS_APPLE_HEALTH__?.source || "healthkit"
    });
    try {
      window.__KENOS_HEALTH_READINESS__ = summary;
    } catch {
    }
    return summary;
  }
  var TRAIN_COPY = {
    recover: {
      zh: "\u4ECA\u5929\u5B9C\u6062\u590D\uFF0C\u522B\u4E0A\u9AD8\u5F3A\u5EA6",
      en: "Recover today \u2014 skip high intensity"
    },
    already_trained: { zh: "\u4ECA\u5929\u5DF2\u8BAD\u7EC3\u8FC7", en: "Already trained today" },
    easy: { zh: "\u9002\u5408\u8F7B\u677E\u6D3B\u52A8", en: "Keep training easy" },
    ok_to_train: { zh: "\u53EF\u4EE5\u6309\u8BA1\u5212\u8BAD\u7EC3", en: "OK to train as planned" },
    unknown: { zh: "\u6D3B\u52A8\u6570\u636E\u4E0D\u8DB3", en: "Activity data missing" }
  };
  var CAPACITY_COPY = {
    full: { zh: "\u4E13\u6CE8\u4F59\u91CF\u5145\u8DB3", en: "Focus capacity full" },
    reduced: { zh: "\u4E13\u6CE8\u5B9C\u6536\u7D27", en: "Focus capacity reduced" },
    low: { zh: "\u4ECA\u5929\u5B9C\u4F4E\u8D1F\u8377", en: "Keep load low today" },
    unknown: { zh: "\u72B6\u6001\u6570\u636E\u4E0D\u8DB3", en: "Status data missing" }
  };
  function healthReadinessToTodaySignal(summary, opts = {}) {
    if (!isSafeHealthReadiness(summary)) return null;
    const locale = opts.locale?.startsWith("en") ? "en" : "zh";
    const train = TRAIN_COPY[summary.training.code]?.[locale] || TRAIN_COPY.unknown[locale];
    const capacity = CAPACITY_COPY[summary.focusCapacity]?.[locale] || CAPACITY_COPY.unknown[locale];
    const worst = DIMENSION_ORDER.find(
      (k) => ["bad", "watch"].includes(summary.dims[k])
    );
    return {
      id: "health",
      label: "Health",
      value: train,
      detail: worst ? `${capacity} \xB7 ${worst}` : capacity,
      href: opts.href || "https://health.kenos.space/",
      ownerDomain: "health",
      source: "kenos.health_readiness",
      freshness: "fresh",
      lastUpdated: summary.asOf,
      available: true,
      stale: false,
      futureActionAllowed: false,
      tone: summary.training.code === "recover" || summary.focusCapacity === "low" ? "attention" : summary.training.code === "unknown" ? "calm" : "calm"
    };
  }
  function healthReadinessToTodayPriority(summary, opts = {}) {
    if (!isSafeHealthReadiness(summary)) return null;
    const locale = opts.locale?.startsWith("en") ? "en" : "zh";
    const needs = summary.training.code === "recover" || summary.focusCapacity === "low" || summary.dims.sleepDebt === "bad" || summary.dims.stress === "bad";
    if (!needs) return null;
    const train = TRAIN_COPY[summary.training.code]?.[locale] || TRAIN_COPY.recover[locale];
    return {
      id: "health-readiness",
      tone: summary.focusCapacity === "low" || summary.training.code === "recover" ? "attention" : "calm",
      eyebrow: locale === "en" ? "Body" : "\u8EAB\u4F53",
      title: train,
      detail: locale === "en" ? "Based on Apple Health readiness \u2014 no vitals shared here." : "\u6765\u81EA Apple Health \u51C6\u5907\u5EA6\u6458\u8981\u2014\u2014\u6B64\u5904\u4E0D\u5C55\u793A\u751F\u7406\u660E\u7EC6\u3002",
      href: opts.href || "https://health.kenos.space/",
      actionLabel: locale === "en" ? "Open Health" : "\u6253\u5F00 Health",
      ownerDomain: "health",
      source: "kenos.health_readiness",
      freshness: "fresh",
      lastUpdated: summary.asOf,
      available: true,
      stale: false,
      futureActionAllowed: false
    };
  }
  function formatHealthReadinessForAssistant(summary, opts = {}) {
    if (!isSafeHealthReadiness(summary)) return null;
    const locale = opts.locale?.startsWith("en") ? "en" : "zh";
    const train = TRAIN_COPY[summary.training.code]?.[locale];
    const capacity = CAPACITY_COPY[summary.focusCapacity]?.[locale];
    const dimLine = DIMENSION_ORDER.map((k) => `${k}=${summary.dims[k]}`).join(
      " \xB7 "
    );
    if (locale === "en") {
      return [
        "Health readiness (summary only \u2014 no vitals):",
        `- focusCapacity: ${summary.focusCapacity} (${capacity})`,
        `- training: ${summary.training.code} (${train}); trainedToday=${summary.training.trained}`,
        `- dims: ${dimLine}`,
        summary.policy?.driver ? `- focusPolicyHint: tighten when ${summary.policy.driver}` : "- focusPolicyHint: none",
        "Do not invent HRV/sleep hours/steps. If user needs detail, send them to Health."
      ].join("\n");
    }
    return [
      "Health \u51C6\u5907\u5EA6\u6458\u8981(\u65E0\u751F\u7406\u660E\u7EC6):",
      `- focusCapacity: ${summary.focusCapacity}\uFF08${capacity}\uFF09`,
      `- training: ${summary.training.code}\uFF08${train}\uFF09\uFF1BtrainedToday=${summary.training.trained}`,
      `- dims: ${dimLine}`,
      summary.policy?.driver ? `- focusPolicyHint: \u56E0 ${summary.policy.driver} \u5B9C\u6536\u7D27\u7A97\u53E3` : "- focusPolicyHint: \u65E0",
      "\u7981\u6B62\u7F16\u9020 HRV/\u7761\u7720\u5C0F\u65F6/\u6B65\u6570\u3002\u7528\u6237\u8981\u660E\u7EC6\u65F6\u5F15\u5BFC\u6253\u5F00 Health\u3002"
    ].join("\n");
  }
  return __toCommonJS(kenosHealthReadiness_exports);
})();
