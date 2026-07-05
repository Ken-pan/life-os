/** 售价/同比：Redfin city housing-market，Mar 2026（Woodinville city/20001；Mountlake Terrace 用邮编 98043 为主城区代理）。Property tax rate：King County 2026 levy ranges 取中位近似，Snohomish County 2026 predominant rate；租金档位结合 Zillow/RentCafe/Apartments.com/Rent.com 等租赁市场源与都会区层级；年租金涨幅为模型假设。 */
const LOCATION_PRESETS = {
  seattle: {
    name: "Seattle",
    housePrice: 865000,
    houseApp: 0.015,
    propTaxRate: 1.106,
    rentStart: 2850,
    rent2BR: 3550,
    rentGrowth: 0.026,
    dataNote:
      "Redfin Mar 2026 中位售价约 $865,000（YoY −1.6%）；租金涨幅按市区租赁市场偏紧设定；参考 apartmentlist.com 对 Seattle 租金同比量级。"
  },
  bellevue: {
    name: "Bellevue",
    housePrice: 1500000,
    houseApp: 0.015,
    propTaxRate: 0.856,
    rentStart: 3000,
    rent2BR: 4100,
    rentGrowth: 0.029,
    dataNote:
      "Redfin Mar 2026 中位售价约 $1,500,000（YoY −6.7%）；Eastside 租金溢价高，年涨幅略高于 Seattle 市区。"
  },
  kirkland: {
    name: "Kirkland",
    housePrice: 1375000,
    houseApp: 0.026,
    propTaxRate: 0.836,
    rentStart: 2950,
    rent2BR: 3980,
    rentGrowth: 0.03,
    dataNote: "Redfin Mar 2026 中位售价约 $1,375,000（YoY +2.6%）；租金涨幅与 Bellevue/Redmond 同级偏紧。"
  },
  redmond: {
    name: "Redmond",
    housePrice: 1397500,
    houseApp: 0.027,
    propTaxRate: 0.783,
    rentStart: 2950,
    rent2BR: 4050,
    rentGrowth: 0.031,
    dataNote: "Redfin Mar 2026 中位售价约 $1,397,500（YoY +4.2%）；科技走廊租赁需求强，租金涨幅略高于 Kirkland。"
  },
  sammamish: {
    name: "Sammamish",
    housePrice: 1614000,
    houseApp: 0.016,
    propTaxRate: 0.877,
    rentStart: 2650,
    rent2BR: 3850,
    rentGrowth: 0.028,
    dataNote:
      "Redfin Mar 2026 中位售价约 $1,614,000（YoY −3.5%）；可租房少、独栋为主，模型租金按东区别墅租赁溢价略低于 Bellevue 公寓核心区。"
  },
  issaquah: {
    name: "Issaquah",
    housePrice: 1000000,
    houseApp: 0.015,
    propTaxRate: 0.824,
    rentStart: 2750,
    rent2BR: 3720,
    rentGrowth: 0.027,
    dataNote:
      "Redfin Mar 2026 中位售价约 $1,000,000（YoY −12.9%，成交结构波动大）；租金仍跟东线，涨幅接近 Kirkland。"
  },
  woodinville: {
    name: "Woodinville",
    housePrice: 855000,
    houseApp: 0.015,
    propTaxRate: 0.881,
    rentStart: 2750,
    rent2BR: 3550,
    rentGrowth: 0.027,
    dataNote:
      "Redfin Mar 2026 中位售价约 $855,000（YoY −27.2%，样本小易波动）；租金水平贴近 Bothell/Eastside 外沿。"
  },
  bothell: {
    name: "Bothell",
    housePrice: 980000,
    houseApp: 0.015,
    propTaxRate: 0.953,
    rentStart: 2680,
    rent2BR: 3420,
    rentGrowth: 0.025,
    dataNote: "Redfin Mar 2026 中位售价约 $980,000（YoY −7.5%）；租金涨幅介于 Seattle 与 Snohomish 热门之间。"
  },
  shoreline: {
    name: "Shoreline",
    housePrice: 760000,
    houseApp: 0.015,
    propTaxRate: 0.995,
    rentStart: 2650,
    rent2BR: 3350,
    rentGrowth: 0.024,
    dataNote: "Redfin Mar 2026 中位售价约 $760,000（YoY −12.2%）；通勤北西雅图，租金涨幅略低于 Seattle 市区。"
  },
  edmonds: {
    name: "Edmonds",
    housePrice: 1139000,
    houseApp: 0.03,
    propTaxRate: 0.783,
    rentStart: 2580,
    rent2BR: 3320,
    rentGrowth: 0.028,
    dataNote:
      "Redfin Mar 2026 中位售价约 $1,139,000（YoY +27.6% 波动极大）；房价涨幅滑杆已上限平滑；滨水/好学区租赁紧，租金涨幅接近 Eastside。"
  },
  lynnwood: {
    name: "Lynnwood",
    housePrice: 720000,
    houseApp: 0.035,
    propTaxRate: 0.791,
    rentStart: 2380,
    rent2BR: 3050,
    rentGrowth: 0.027,
    dataNote: "Redfin Mar 2026 中位售价约 $720,000（YoY +9.9%）；Link 延伸带热度，租金涨幅略高于 Everett。"
  },
  mountlakeTerrace: {
    name: "Mountlake Terrace",
    housePrice: 604500,
    houseApp: 0.015,
    propTaxRate: 0.791,
    rentStart: 2320,
    rent2BR: 2980,
    rentGrowth: 0.023,
    dataNote:
      "以 Redfin Mar 2026 邮编 98043（含 MLT 主城）中位售价约 $604,500（YoY −13.6%）为代理；租金涨幅近 Lynnwood 略温和。"
  },
  everett: {
    name: "Everett",
    housePrice: 560000,
    houseApp: 0.015,
    propTaxRate: 0.859,
    rentStart: 2180,
    rent2BR: 2750,
    rentGrowth: 0.021,
    dataNote: "Redfin Mar 2026 中位售价约 $560,000（YoY −12.5%）；Snohomish 北部租金涨幅低于 Lynnwood。"
  },
  renton: {
    name: "Renton",
    housePrice: 764000,
    houseApp: 0.024,
    propTaxRate: 0.995,
    rentStart: 2400,
    rent2BR: 3080,
    rentGrowth: 0.023,
    dataNote: "Redfin Mar 2026 中位售价约 $764,000（YoY +3.6%）；南 King 就业带，租金涨幅中等。"
  },
  kent: {
    name: "Kent",
    housePrice: 610000,
    houseApp: 0.015,
    propTaxRate: 1.019,
    rentStart: 2200,
    rent2BR: 2850,
    rentGrowth: 0.022,
    dataNote: "Redfin Mar 2026 中位售价约 $610,000（YoY −7.9%）；南 King 腹地，租金涨幅略低于 Renton。"
  },
  auburn: {
    name: "Auburn",
    housePrice: 596000,
    houseApp: 0.015,
    propTaxRate: 1.122,
    rentStart: 2120,
    rent2BR: 2780,
    rentGrowth: 0.021,
    dataNote: "Redfin Mar 2026 中位售价约 $596,000（YoY −1.1%）；租金水平与 Kent 接近，涨幅略缓。"
  },
  federalWay: {
    name: "Federal Way",
    housePrice: 618125,
    houseApp: 0.032,
    propTaxRate: 0.93,
    rentStart: 2080,
    rent2BR: 2680,
    rentGrowth: 0.024,
    dataNote: "Redfin Mar 2026 中位售价约 $618,125（YoY +9.4%）；南线房价升温时租金跟涨，但仍低于东线。"
  },
  desMoines: {
    name: "Des Moines (WA)",
    housePrice: 554500,
    houseApp: 0.015,
    propTaxRate: 1.055,
    rentStart: 2250,
    rent2BR: 2920,
    rentGrowth: 0.023,
    dataNote:
      "Redfin Mar 2026 中位售价约 $554,500（YoY −7.6%）；水岸/近机场户型差异大，租金涨幅取南 King 中游；可参考 realtor.com 当地租金 YoY 量级。"
  },
  tacoma: {
    name: "Tacoma",
    housePrice: 485000,
    houseApp: 0.015,
    propTaxRate: 0.91,
    rentStart: 1650,
    rent2BR: 2180,
    rentGrowth: 0.019,
    dataNote: "Redfin Mar 2026 中位售价约 $485,000（YoY −1.0%）；Pierce County 租金涨幅整体低于 King/Eastside。"
  }
};

Object.values(LOCATION_PRESETS).forEach((preset) => {
  preset.rent2B1B = Math.round(preset.rent2BR * 0.92);
});

const PRESET_REGIONS = [
  { id: "seattleCore", label: "西雅图市区", keys: ["seattle", "shoreline"] },
  {
    id: "eastside",
    label: "东区",
    keys: ["bellevue", "kirkland", "redmond", "sammamish", "issaquah", "woodinville"]
  },
  {
    id: "northSnohomish",
    label: "北线 / Snohomish",
    keys: ["bothell", "edmonds", "lynnwood", "mountlakeTerrace", "everett"]
  },
  {
    id: "southKing",
    label: "南 King",
    keys: ["renton", "kent", "auburn", "federalWay", "desMoines"]
  },
  { id: "pierce", label: "Pierce", keys: ["tacoma"] }
];

const PRESET_TRACK_KEYS = ["housePrice", "houseApp", "rentGrowth", "rentStart", "rent2BR"];

const DEF = {
  robinhoodValue: 140021,
  robinhoodBasis: 94980,
  familySupport: 100000,
  monthlyLiving: 2500,
  kevinLiving: 2200,
  stockReturn: 0.07,
  mortgageRate: 0.0636,
  behaviorGap: 0.01,
  livingInflation: 0.025,
  rentStart: 2380,
  rent2BR: 3050,
  rent2B1B: 2806,
  rentGrowth: 0.027,
  rent2b1bTo2brRatio: 0.92,
  enableRent2B1BSwitch: true,
  rent2b1bSwitchYear: 2030,
  petFee: 60,
  renterIns: 20,
  moveCost: 3500,
  housePrice: 720000,
  filingStatus: "mfj",
  ownershipModel: "capital",
  deedKenShare: 0.5,
  enableKevinBuyIn: false,
  kevinBuyInPct: 0.0,
  houseScenario: "base",
  enforceHomeSaleEligibility: true,
  homeSaleUseYears: 2,
  capitalTrackLargeRepairs: true,
  waDeductionBase: 278000,
  waDeductionInflation: 0.02,
  stdDedInflation: 0.02,
  taxBracketInflation: 0.02,
  houseApp: 0.035,
  houseHOA: 150,
  hoaGrowth: 0.035,
  propTaxRate: 0.791,
  earthquakeIns: 175,
  homeownersIns: 110,
  houseUtilities: 150,
  rentUtilities: 120,
  housingOtherFixed: 150,
  houseRepairs: 200,
  downPaymentPct: 0.20,
  majorRepairCost: 20000,
  majorRepairYear: 10,
  specialAssessCost: 0,
  specialAssessYear: 99,
  mortgageDeduction: true,
  applyWACGT: true,
  applyTxCosts: true,
  observationYear: 2026,
  maxYears: 40,
  kenCareerStartYear: 2023,
  kenStartSalary: 120000,
  kenCareerGrowth: 0.04,
  kenNetRate: 0.68,
  kevinCareerStartYear: 2029,
  kevinStartSalary: 120000,
  kevinCareerGrowth: 0.03,
  kevinNetRate: 0.70,
  kevinMoveInYear: 2,
  kevinYear: 3,
  kevinHousingShare: 0.50,
  incomeShockEnable: false,
  incomeShockTarget: "ken",
  incomeShockStartYear: 3,
  incomeShockDurationYears: 2,
  incomeShockSeverity: 1.0,
  relocationEnable: false,
  relocationMode: "sell",
  relocationYear: 5,
  relocationKenSalary: 60000,
  relocationKevinSalary: 50000,
  relocationHousingMonthly: 1500
};

const state = {
  p: { ...DEF },
  horizon: 7,
  afterTax: false,
  view: "ken",
  curveYears: 7,
  selectedPreset: "lynnwood",
  privacyMode: false,
  showBand: true,
  goal: {
    targetAmount: 1500000,
    targetYear: 20
  },
  timelineEvents: [],
  namedSnapshots: [],
  compareA: null,
  compareB: null
};

const appStore = window.FinanceState?.createStore ? window.FinanceState.createStore(state) : null;

const LOCK_CURVE_TO_HORIZON = true;

const motionUI = (() => {
  const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reducedMq.matches;
  reducedMq.addEventListener("change", () => {
    reduced = reducedMq.matches;
  });

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function isReduced() {
    return reduced;
  }

  function chartMotion() {
    if (reduced) return { duration: 0 };
    return { duration: 380, easing: "easeOutQuart" };
  }

  function pulse(el, className = "kpi-pulse") {
    if (!el || reduced) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    el.addEventListener(
      "animationend",
      () => el.classList.remove(className),
      { once: true }
    );
  }

  function flashParamValue(valEl) {
    if (!valEl || reduced) return;
    valEl.classList.add("param-value-live", "is-live");
    window.clearTimeout(flashParamValue._t);
    flashParamValue._t = window.setTimeout(() => {
      valEl.classList.remove("is-live");
    }, 220);
  }

  function setSubline(el, text) {
    if (!el) return;
    if (isReduced() || el.textContent === text) {
      el.textContent = text;
      return;
    }
    el.classList.add("is-fading");
    window.setTimeout(() => {
      el.textContent = text;
      el.classList.remove("is-fading");
    }, 90);
  }

  function tweenKpi(el, from, to, formatFn) {
    if (!el) return;
    if (from == null || isReduced() || Math.abs(to - from) < 500) {
      el.textContent = formatFn(to);
      if (from != null && Math.abs(to - from) >= 500) pulse(el);
      return;
    }
    const start = performance.now();
    const duration = 300;
    el.classList.add("is-tweening");
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * easeOutCubic(t);
      el.textContent = formatFn(v);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = formatFn(to);
        el.classList.remove("is-tweening");
        pulse(el);
      }
    };
    requestAnimationFrame(tick);
  }

  function setWorkspaceUpdating(on) {
    document.getElementById("dashboardWorkspace")?.classList.toggle("is-updating", on);
  }

  function refreshInsights(listEl) {
    if (!listEl || reduced) return;
    listEl.classList.remove("is-refreshing");
    void listEl.offsetWidth;
    listEl.classList.add("is-refreshing");
  }

  function setDpAlert(el, visible, message) {
    if (!el) return;
    if (visible) {
      el.textContent = message;
      el.classList.add("is-visible");
      el.setAttribute("role", "alert");
    } else {
      el.classList.remove("is-visible");
      el.removeAttribute("role");
    }
  }

  return {
    isReduced,
    chartMotion,
    pulse,
    flashParamValue,
    setSubline,
    tweenKpi,
    setWorkspaceUpdating,
    refreshInsights,
    setDpAlert
  };
})();

state.kpiCache = { rent: null, buy: null, winner: null };
state.chartSkin = null;

const STORAGE_KEY = "rb_dashboard_v1";
const PARAM_SECTIONS_KEY = "rb_param_sections";
const PERSIST_UI_KEYS = [
  "stockReturn",
  "mortgageRate",
  "houseApp",
  "rentGrowth",
  "housePrice",
  "familySupport",
  "downPaymentPct",
  "deedKenShare",
  "kevinBuyInPct",
  "rentStart",
  "rent2BR",
  "rent2B1B",
  "propTaxRate",
  "hoaGrowth",
  "rent2b1bTo2brRatio",
  "enableRent2B1BSwitch",
  "filingStatus",
  "houseScenario",
  "ownershipModel",
  "applyWACGT",
  "applyTxCosts",
  "mortgageDeduction",
  "enableKevinBuyIn",
  "enforceHomeSaleEligibility",
  "capitalTrackLargeRepairs",
  "incomeShockEnable",
  "incomeShockTarget",
  "incomeShockStartYear",
  "incomeShockDurationYears",
  "incomeShockSeverity",
  "relocationEnable",
  "relocationMode",
  "relocationYear",
  "relocationKenSalary",
  "relocationKevinSalary",
  "relocationHousingMonthly"
];

let persistTimer = null;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function sanitizePersistedParams(raw) {
  if (!raw || typeof raw !== "object") return { ...DEF };
  const p = { ...DEF, ...raw };
  const numClamp = [
    ["stockReturn", 0.04, 0.14],
    ["mortgageRate", 0.02, 0.12],
    ["houseApp", 0, 0.07],
    ["rentGrowth", 0.01, 0.07],
    ["housePrice", 350000, 5000000],
    ["familySupport", 0, 1000000],
    ["downPaymentPct", 0.1, 1],
    ["deedKenShare", 0.3, 0.9],
    ["kevinBuyInPct", 0, 0.6],
    ["incomeShockStartYear", 1, 40],
    ["incomeShockDurationYears", 1, 20],
    ["incomeShockSeverity", 0, 1],
    ["relocationYear", 1, 40],
    ["relocationKenSalary", 0, 500000],
    ["relocationKevinSalary", 0, 500000],
    ["relocationHousingMonthly", 0, 20000]
  ];
  numClamp.forEach(([key, min, max]) => {
    const v = Number(p[key]);
    if (Number.isFinite(v)) p[key] = clamp(v, min, max);
  });
  const filingOk = new Set(["mfj", "single", "mfs", "unmarried"]);
  if (!filingOk.has(p.filingStatus)) p.filingStatus = DEF.filingStatus;
  const scenarioOk = new Set(["bear", "base", "bull"]);
  if (!scenarioOk.has(p.houseScenario)) p.houseScenario = DEF.houseScenario;
  const ownershipOk = new Set(["capital", "deed"]);
  if (!ownershipOk.has(p.ownershipModel)) p.ownershipModel = DEF.ownershipModel;
  const shockTargetOk = new Set(["ken", "kevin", "both"]);
  if (!shockTargetOk.has(p.incomeShockTarget)) p.incomeShockTarget = DEF.incomeShockTarget;
  p.incomeShockStartYear = Math.round(p.incomeShockStartYear);
  p.incomeShockDurationYears = Math.round(p.incomeShockDurationYears);
  const relocationModeOk = new Set(["sell", "rent-out"]);
  if (!relocationModeOk.has(p.relocationMode)) p.relocationMode = DEF.relocationMode;
  p.relocationYear = Math.round(p.relocationYear);
  [
    "applyWACGT",
    "applyTxCosts",
    "mortgageDeduction",
    "enableKevinBuyIn",
    "enforceHomeSaleEligibility",
    "capitalTrackLargeRepairs",
    "enableRent2B1BSwitch",
    "incomeShockEnable",
    "relocationEnable"
  ].forEach((key) => {
    p[key] = Boolean(p[key]);
  });
  if (p.downPaymentPct == null) p.downPaymentPct = 0.2;
  return p;
}

function pickPersistedParams() {
  const picked = {};
  PERSIST_UI_KEYS.forEach((key) => {
    if (state.p[key] !== undefined) picked[key] = state.p[key];
  });
  return picked;
}

function persistState() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          v: 1,
          horizon: state.horizon,
          afterTax: state.afterTax,
          view: state.view,
          privacyMode: state.privacyMode,
          showBand: state.showBand,
          selectedPreset: state.selectedPreset || "",
          goal: state.goal,
          timelineEvents: state.timelineEvents,
          p: pickPersistedParams()
        })
      );
    } catch (_) {
      /* storage full or private mode */
    }
  }, 280);
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.p) return false;

    state.horizon = [5, 7, 20].includes(data.horizon) ? data.horizon : 7;
    state.afterTax = Boolean(data.afterTax);
    state.privacyMode = Boolean(data.privacyMode);
    state.showBand = data.showBand !== false;
    state.view = data.view === "kevin" ? "kevin" : "ken";
    state.selectedPreset =
      typeof data.selectedPreset === "string" && data.selectedPreset in LOCATION_PRESETS
        ? data.selectedPreset
        : typeof data.selectedPreset === "string"
          ? data.selectedPreset
          : "";
    if (data.goal && typeof data.goal === "object") {
      const targetAmount = Number(data.goal.targetAmount);
      const targetYear = Number(data.goal.targetYear);
      if (Number.isFinite(targetAmount) && targetAmount >= 0) state.goal.targetAmount = targetAmount;
      if (Number.isFinite(targetYear) && targetYear >= 1) state.goal.targetYear = Math.min(40, Math.round(targetYear));
    }
    if (Array.isArray(data.timelineEvents)) {
      state.timelineEvents = data.timelineEvents.map((e) => ({
        id: String(e.id || `evt_${Math.random().toString(36).slice(2, 8)}`),
        label: String(e.label || "未命名事件"),
        year: clamp(Math.round(Number(e.year) || 1), 1, 40),
        category: String(e.category || "general"),
        kind: ["one-time", "recurring", "ramp"].includes(e.kind) ? e.kind : "one-time",
        amount: Number(e.amount) || 0,
        fundingSource: e.fundingSource || "cash",
        enabled: e.enabled !== false
      }));
    }
    state.p = sanitizePersistedParams(data.p);
    if (LOCK_CURVE_TO_HORIZON) state.curveYears = state.horizon;

    const housePriceInput = document.getElementById("housePrice");
    if (housePriceInput && state.p.housePrice > Number(housePriceInput.max || 0)) {
      housePriceInput.max = String(Math.ceil(state.p.housePrice / 100000) * 100000);
    }
    return true;
  } catch (_) {
    return false;
  }
}

function syncHorizonButtons() {
  document.querySelectorAll(".horizon-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.horizon) === state.horizon);
  });
}

/** 金额展示：≥1万用「$X万」，不足1万保留整数美元（中式万单位，不用 K/M）。 */
const fmtMoneyWan = (n, opts = {}) => {
  if (state.privacyMode) {
    const sign = n < 0 ? "-" : "";
    return Math.abs(n) < 10000 ? `${sign}$****` : `${sign}$***万`;
  }
  const digits = opts.digits ?? 2;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 10000) return `${sign}$${Math.round(abs).toLocaleString("zh-CN")}`;
  let wan = abs / 10000;
  let text;
  if (wan >= 1000) text = wan.toFixed(0);
  else if (wan >= 100) text = wan.toFixed(1);
  else text = wan.toFixed(digits);
  text = text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `${sign}$${text}万`;
};

const fmtUSD = (n) => fmtMoneyWan(n);
const fmtPercent = (n) => `${(n * 100).toFixed(2)}%`;
const fmtMoneyShort = (n) => fmtMoneyWan(n, { digits: 1 });

function ensureGoalControls() {
  const header = document.getElementById("decisionHeader");
  if (!header || !window.FinanceUI?.syncGoalControls) return;
  window.FinanceUI.syncGoalControls(header, {
    amountLabel: window.FinanceI18n?.t?.("goal.amountLabel") || "目标净资产",
    yearLabel: window.FinanceI18n?.t?.("goal.yearLabel") || "目标年份",
    goal: state.goal,
    onGoalChange: (goal) => {
      state.goal = {
        targetAmount: Number(goal.targetAmount) || 0,
        targetYear: clamp(Math.round(Number(goal.targetYear) || 20), 1, 40)
      };
      scheduleRerender(100);
    }
  });
}

function baselineFromStateForView(initialRow) {
  const p = state.p;
  const view = state.view;
  const year1 = 1;
  const annualGross = view === "ken" ? kenGrossAt(year1, p) : kevinGrossAt(year1, p);
  const netRate = view === "ken" ? p.kenNetRate : p.kevinNetRate;
  const afterTaxIncomeMonthly = monthlyTakeHome(annualGross, netRate);
  const baseExpenseMonthly = view === "ken" ? (p.monthlyLiving + p.rentStart + p.petFee + p.renterIns) : p.kevinLiving;
  const initial = initialRow || runModel(p).rows[0];
  const cashBase = Math.max(0, p.monthlyLiving * 6);
  const pre = view === "ken" ? initial.kenPreA : initial.kevinPreA;
  const investments = Math.max(0, pre - cashBase);
  return {
    cash: cashBase,
    investments,
    homeEquity: 0,
    debt: 0,
    afterTaxIncomeMonthly,
    incomeGrowthAnnual: view === "ken" ? p.kenCareerGrowth : p.kevinCareerGrowth,
    baseExpenseMonthly
  };
}

function computeBaselineProjection(horizon, initialRow) {
  const engine = window.FinanceEngine;
  if (!engine) return [];
  const p = state.p;
  const baseline = baselineFromStateForView(initialRow);
  const assumptions = {
    stockReturn: (p.stockReturn || 0) - (p.behaviorGap || 0),
    houseAppreciationAnnual: p.houseApp || 0,
    liquidationTaxRate: state.afterTax ? 0.12 : 0
  };
  return engine.projectNetWorth(baseline, assumptions, state.timelineEvents || [], horizon);
}

function buildGoalProjectionFromState(targetYear, horizon, afterTax, initialRow) {
  const engine = window.FinanceEngine;
  if (!engine?.buildGoalProjection) return null;
  const p = state.p;
  return engine.buildGoalProjection({
    baseline: baselineFromStateForView(initialRow),
    assumptions: {
      stockReturn: (p.stockReturn || 0) - (p.behaviorGap || 0),
      houseAppreciationAnnual: p.houseApp || 0,
      liquidationTaxRate: afterTax ? 0.12 : 0
    },
    events: state.timelineEvents || [],
    horizonYears: Math.max(targetYear, horizon),
    targetAmount: Math.max(0, Number(state.goal?.targetAmount) || 0),
    targetYear,
    afterTax,
    solverOptions: { maxExtraMonthly: 100000, epsilon: 1 }
  });
}

const TIMELINE_QUICK_BOOKS = [
  { id: "home-downpayment", label: "买房首付（一次性）" },
  { id: "car", label: "买车（一次性）" },
  { id: "wedding", label: "婚礼（一次性）" },
  { id: "sabbatical", label: "Sabbatical（持续）" }
];

function quickBookEvent(templateId) {
  const baseYear = clamp(Math.round((state.goal?.targetYear || state.horizon || 7) / 2), 1, 40);
  const maps = {
    "home-downpayment": { label: "买房首付", year: Math.min(baseYear, 10), kind: "one-time", amount: 120000, fundingSource: "sell-invest" },
    car: { label: "买车", year: Math.min(baseYear, 8), kind: "one-time", amount: 35000, fundingSource: "cash" },
    wedding: { label: "婚礼", year: Math.min(baseYear, 6), kind: "one-time", amount: 60000, fundingSource: "cash" },
    sabbatical: { label: "Sabbatical 收入缺口", year: Math.min(baseYear, 7), kind: "recurring", amount: 4000, fundingSource: "cash" }
  };
  const seed = maps[templateId];
  if (!seed) return;
  const evt = window.TimelineEvents?.createEvent?.({
    ...seed,
    category: "life",
    enabled: true
  });
  if (!evt) return;
  state.timelineEvents = window.TimelineEvents.upsertEvent(state.timelineEvents, evt);
  rerender();
}

function appendTimelineEventFromForm(data) {
  const evt = window.TimelineEvents?.createEvent?.(data);
  if (!evt) return;
  state.timelineEvents = window.TimelineEvents.upsertEvent(state.timelineEvents, evt);
  rerender();
}

function toggleTimelineEvent(eventId, enabled) {
  state.timelineEvents = window.TimelineEvents.toggleEvent(state.timelineEvents, eventId, enabled);
  rerender();
}

function deleteTimelineEvent(eventId) {
  state.timelineEvents = window.TimelineEvents.removeEvent(state.timelineEvents, eventId);
  rerender();
}

function bindTimelineForm() {
  const form = document.getElementById("timelineEventForm");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const label = document.getElementById("timelineLabelInput")?.value?.trim();
    const year = Number(document.getElementById("timelineYearInput")?.value);
    const kind = document.getElementById("timelineKindInput")?.value || "one-time";
    const amount = Number(document.getElementById("timelineAmountInput")?.value);
    const funding = document.getElementById("timelineFundingInput")?.value || "cash";
    if (!label) return;
    const fundingSource =
      funding === "loan" ? { loan: { rate: Number(state.p.mortgageRate || 0.06), termYears: 5 } } : funding;
    appendTimelineEventFromForm({
      label,
      year: clamp(Math.round(year || 1), 1, 40),
      kind,
      amount: Number.isFinite(amount) ? amount : 0,
      fundingSource,
      category: "life",
      enabled: true
    });
    form.reset();
    const yearInput = document.getElementById("timelineYearInput");
    if (yearInput) yearInput.value = "2";
    const amountInput = document.getElementById("timelineAmountInput");
    if (amountInput) amountInput.value = "10000";
  });
}

function renderTimelinePanel() {
  if (!window.FinanceUI?.ensureTimelinePanel) return;
  const panel = window.FinanceUI.ensureTimelinePanel();
  if (!panel) return;
  bindTimelineForm();
  window.FinanceUI.renderTimelineQuickBooks({
    quickBooks: TIMELINE_QUICK_BOOKS,
    onQuickBook: quickBookEvent
  });
  window.FinanceUI.renderTimelineEvents({
    events: state.timelineEvents || [],
    formatMoney: fmtMoneyShort,
    onToggle: toggleTimelineEvent,
    onDelete: deleteTimelineEvent
  });
  const enabledCount = (state.timelineEvents || []).filter((e) => e.enabled !== false).length;
  const totalCount = (state.timelineEvents || []).length;
  const summaryEl = document.getElementById("timelineSummary");
  if (summaryEl) summaryEl.textContent = `${enabledCount}/${totalCount} 个事件已启用`;
}

function buildEngineRentBuyScenariosForView(horizonYears, runResult) {
  const eventKit = window.TimelineEvents;
  if (!eventKit?.projectRentVsBuyWithEngine) return null;
  const p = state.p;
  const run = runResult || runModel(p);
  const baseline = baselineFromStateForView(run.rows?.[0]);
  const assumptions = {
    stockReturn: (p.stockReturn || 0) - (p.behaviorGap || 0),
    houseAppreciationAnnual: p.houseApp || 0,
    liquidationTaxRate: state.afterTax ? 0.12 : 0,
    federalLtcgRate: 0.15,
    applyWACGT: Boolean(p.applyWACGT),
    waRate: 0.07
  };
  const horizon = Math.max(1, Math.round(Number(horizonYears) || state.horizon || 7));
  const projected = eventKit.projectRentVsBuyWithEngine({
    horizonYears: horizon,
    baseline,
    assumptions,
    templateInput: {
      ...p,
      buyYearHint: run.buyYear || 1,
      estimatedMortgageMonthly: run.housePMT || 0
    }
  });
  if (!projected) return null;
  return {
    rentSeries: projected.rentSeries,
    buySeries: projected.buySeries,
    deltaSeries: projected.deltaSeries,
    templateMeta: projected.template.meta
  };
}

function runEngineRegressionFixture(legacyResult) {
  const legacy = legacyResult || runModel(state.p);
  const pack = buildEngineRentBuyScenariosForView(state.horizon, legacy);
  if (!pack) return;
  const legacyRow = legacy.outcomes[state.horizon];
  const viewKey = state.view === "ken" ? "ken" : "kevin";
  const taxKey = state.afterTax ? "Aft" : "Pre";
  const legacyA = legacyRow?.[`${viewKey}${taxKey}A`] || 0;
  const legacyB = legacyRow?.[`${viewKey}${taxKey}B`] || 0;
  const engineA = pack.rentSeries?.[state.horizon]?.[state.afterTax ? "netWorthAfterTax" : "netWorthPreTax"] || 0;
  const engineB = pack.buySeries?.[state.horizon]?.[state.afterTax ? "netWorthAfterTax" : "netWorthPreTax"] || 0;
  const snapshot = window.TimelineEvents?.buildRegressionSnapshot?.({
    horizon: state.horizon,
    view: state.view,
    mode: state.afterTax ? "after-tax" : "pre-tax",
    legacy: { rent: legacyA, buy: legacyB },
    engine: { rent: engineA, buy: engineB }
  }) || null;
  window.__engineRegression = snapshot;
  const verdict = window.TimelineEvents?.assertRegression?.(snapshot, 5000);
  window.__engineRegressionVerdict = verdict || null;
}

function scrubMoneyText(text) {
  if (!state.privacyMode || text == null) return text;
  return String(text).replace(/\$[\d,]+(?:\.\d+)?万?/g, (match) =>
    match.includes("万") ? "$***万" : "$****"
  );
}

function chartMoneyTick(v) {
  return state.privacyMode ? "$*" : `$${v}万`;
}

const mpmt = (principal, annualRate, termYears) => {
  const r = annualRate / 12;
  const n = termYears * 12;
  if (n === 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
};

const lbal = (p, r, pmt, months) => {
  const rm = r / 12;
  if (rm === 0) return Math.max(0, p - pmt * months);
  return Math.max(0, p * Math.pow(1 + rm, months) - pmt * ((Math.pow(1 + rm, months) - 1) / rm));
};

const growPort = (bal, annualReturn, behaviorGap, monthlyContrib) => {
  const r = (annualReturn - behaviorGap) / 12;
  const n = 12;
  if (r <= 0) return Math.max(0, bal + monthlyContrib * n);
  return Math.max(0, bal * Math.pow(1 + r, n) + monthlyContrib * ((Math.pow(1 + r, n) - 1) / r));
};

const STATUS_CFG = {
  single: {
    label: "Single",
    stdDeduction2026: 16100,
    ltcgBrackets: { zeroTop: 49450, fifteenTop: 545500 },
    niitThreshold: 200000,
    saltCap: 40000,
    saltPhaseStart: 500000,
    midDebtCap: 750000,
    homeSaleExclusion: 250000,
    entityMode: "individual"
  },
  mfj: {
    label: "MFJ",
    stdDeduction2026: 32200,
    ltcgBrackets: { zeroTop: 98900, fifteenTop: 613700 },
    niitThreshold: 250000,
    saltCap: 40000,
    saltPhaseStart: 500000,
    midDebtCap: 750000,
    homeSaleExclusion: 500000,
    entityMode: "joint"
  },
  mfs: {
    label: "MFS",
    stdDeduction2026: 16100,
    ltcgBrackets: { zeroTop: 49450, fifteenTop: 306850 },
    niitThreshold: 125000,
    saltCap: 20000,
    saltPhaseStart: 250000,
    midDebtCap: 375000,
    homeSaleExclusion: 250000,
    entityMode: "individual"
  },
  unmarried: {
    label: "Unmarried partners",
    stdDeduction2026: 16100,
    ltcgBrackets: { zeroTop: 49450, fifteenTop: 545500 },
    niitThreshold: 200000,
    saltCap: 40000,
    saltPhaseStart: 500000,
    midDebtCap: 750000,
    homeSaleExclusion: 250000,
    entityMode: "individual"
  }
};

const stdDedAtYear = (modelYear, filingStatus, p) => {
  const cfg = STATUS_CFG[filingStatus] || STATUS_CFG.mfj;
  return cfg.stdDeduction2026 * Math.pow(1 + (p.stdDedInflation || 0.02), modelYear);
};

const ltcgTaxOnly = (gain, ordinaryIncome, filingStatus, modelYear, p) => {
  if (gain <= 0) return 0;
  const cfg = STATUS_CFG[filingStatus] || STATUS_CFG.mfj;
  const stdDed = stdDedAtYear(modelYear, filingStatus, p);
  const bracketInflation = Math.pow(1 + (p.taxBracketInflation || 0.02), modelYear);
  const zeroTop = cfg.ltcgBrackets.zeroTop * bracketInflation;
  const fifteenTop = cfg.ltcgBrackets.fifteenTop * bracketInflation;
  const ordinaryTaxable = Math.max(0, ordinaryIncome - stdDed);
  const zeroRoom = Math.max(0, zeroTop - ordinaryTaxable);
  const zeroPortion = Math.min(gain, zeroRoom);
  const remainAfterZero = Math.max(0, gain - zeroPortion);
  const fifteenRoom = Math.max(0, fifteenTop - Math.max(ordinaryTaxable, zeroTop));
  const fifteenPortion = Math.min(remainAfterZero, fifteenRoom);
  const twentyPortion = Math.max(0, remainAfterZero - fifteenPortion);
  return fifteenPortion * 0.15 + twentyPortion * 0.20;
};

const niitTax = (investmentGain, ordinaryIncome, filingStatus) => {
  if (investmentGain <= 0) return 0;
  const cfg = STATUS_CFG[filingStatus] || STATUS_CFG.mfj;
  const magi = ordinaryIncome + investmentGain;
  const excess = Math.max(0, magi - cfg.niitThreshold);
  const niitBase = Math.min(investmentGain, excess);
  return niitBase * 0.038;
};

const federalInvestmentTax = (gain, ordinaryIncome, filingStatus, modelYear, p) =>
  ltcgTaxOnly(gain, ordinaryIncome, filingStatus, modelYear, p) + niitTax(gain, ordinaryIncome, filingStatus);

const waDeductionAtYear = (modelYear, p) => {
  const taxYear = calendarYear(modelYear, p);
  const yearsSince2025 = Math.max(0, taxYear - 2025);
  return (p.waDeductionBase || 278000) * Math.pow(1 + (p.waDeductionInflation || 0.02), yearsSince2025);
};

const waCGTax = (gain, applyWA, modelYear, p) => {
  if (!applyWA || gain <= 0) return 0;
  const exempt = waDeductionAtYear(modelYear, p);
  if (gain <= exempt) return 0;
  const tier1 = Math.min(gain - exempt, 1000000);
  const tier2 = Math.max(0, gain - exempt - 1000000);
  return tier1 * 0.07 + tier2 * 0.099;
};

const afterTaxHome = (
  salePrice,
  purchasePrice,
  closingBuy,
  loanRemaining,
  applyTxCosts,
  filingStatus,
  eligibleForExclusion,
  ordinaryIncome,
  modelYear,
  p
) => {
  const sellingCosts = applyTxCosts ? salePrice * 0.065 : 0;
  const netProceeds = salePrice - sellingCosts;
  const capitalGain = netProceeds - purchasePrice - (applyTxCosts ? closingBuy : 0);
  const cfg = STATUS_CFG[filingStatus] || STATUS_CFG.mfj;
  const exclusion = eligibleForExclusion ? cfg.homeSaleExclusion : 0;
  const taxableGain = Math.max(0, capitalGain - exclusion);
  const federalTax = federalInvestmentTax(taxableGain, ordinaryIncome, filingStatus, modelYear, p);
  return netProceeds - federalTax - loanRemaining;
};

const effectiveSaltCap = (filingStatus, ordinaryIncome, modelYear, p) => {
  const cfg = STATUS_CFG[filingStatus] || STATUS_CFG.mfj;
  const taxYear = (p.observationYear || 2026) + modelYear;
  const baseStart = filingStatus === "mfs" ? 20000 : 40000;
  const phaseStartBase = filingStatus === "mfs" ? 250000 : 500000;
  const base = taxYear >= 2030
    ? (filingStatus === "mfs" ? 5000 : 10000)
    : baseStart * Math.pow(1.01, Math.max(0, taxYear - 2025));
  const phaseStart = taxYear >= 2030
    ? (filingStatus === "mfs" ? 125000 : 250000)
    : phaseStartBase * Math.pow(1.01, Math.max(0, taxYear - 2025));
  if (ordinaryIncome <= phaseStart) return base;
  const floor = filingStatus === "mfs" ? 5000 : 10000;
  const reduction = (ordinaryIncome - phaseStart) * 0.30;
  return Math.max(floor, base - reduction);
};

const marginalOrdinaryRate = (ordinaryIncome, filingStatus, modelYear, p) => {
  const stdDed = stdDedAtYear(modelYear, filingStatus, p);
  const taxable = Math.max(0, ordinaryIncome - stdDed);
  const bracketInflation = Math.pow(1 + (p.taxBracketInflation || 0.02), modelYear);
  const bracketsBase = filingStatus === "mfj"
    ? [24800, 100800, 211400, 403550, 512450, 768700]
    : filingStatus === "mfs"
      ? [12400, 50400, 105700, 201775, 256225, 384350]
      : [12400, 50400, 105700, 201775, 256225, 640600];
  const brackets = bracketsBase.map((v) => v * bracketInflation);
  const rates = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  for (let i = 0; i < brackets.length; i++) {
    if (taxable <= brackets[i]) return rates[i];
  }
  return rates[rates.length - 1];
};

const midBenefit = (loan, r, pmt, year, propTaxAnnual, enabled, filingStatus, ordinaryIncome, modelYear, p) => {
  if (!enabled) return 0;
  const b0 = lbal(loan, r, pmt, (year - 1) * 12);
  const b1 = lbal(loan, r, pmt, year * 12);
  const interest = pmt * 12 - (b0 - b1);
  const cfg = STATUS_CFG[filingStatus] || STATUS_CFG.mfj;
  const debtRatio = loan > 0 ? Math.min(1, cfg.midDebtCap / loan) : 0;
  const deductibleInterest = interest * debtRatio;
  const salt = Math.min(propTaxAnnual, effectiveSaltCap(filingStatus, ordinaryIncome, modelYear, p));
  const stdDed = stdDedAtYear(modelYear, filingStatus, p);
  const marginalRate = marginalOrdinaryRate(ordinaryIncome, filingStatus, modelYear, p);
  return Math.max(0, (deductibleInterest + salt - stdDed) * marginalRate) / 12;
};

const applyPortfolioYear = (portfolio, annualContribution, annualReturn, behaviorGap, ordinaryIncome, filingStatus, applyWA, modelYear, p) => {
  const r = annualReturn - behaviorGap;
  const grownValue = Math.max(0, portfolio.value * Math.pow(1 + r, 1));
  let value = grownValue;
  let basis = Math.max(0, portfolio.basis);
  let realizedTax = 0;
  let realizedGain = 0;

  if (annualContribution >= 0) {
    value += annualContribution;
    basis += annualContribution;
    return { value, basis, realizedTax, realizedGain, grossSold: 0, shortfall: 0 };
  }

  const netNeeded = Math.max(0, -annualContribution);
  const solved = solveGrossSaleForNetCash(
    netNeeded,
    value,
    basis,
    ordinaryIncome,
    applyWA,
    modelYear,
    p,
    filingStatus
  );
  const grossSold = Math.min(value, solved.grossSale);
  const sellFrac = value > 0 ? Math.min(1, grossSold / value) : 0;
  const actualTax = taxOnGrossSale(grossSold, value, basis, ordinaryIncome, applyWA, modelYear, p, filingStatus);
  const actualNetCash = Math.max(0, grossSold - actualTax);
  value = Math.max(0, value - grossSold);
  basis = Math.max(0, basis * (1 - sellFrac));
  realizedTax = actualTax;
  realizedGain = Math.max(0, grossSold - portfolio.basis * sellFrac);
  return {
    value,
    basis,
    realizedTax,
    realizedGain,
    grossSold,
    shortfall: Math.max(0, netNeeded - actualNetCash)
  };
};

const taxOnGrossSale = (grossSale, portValue, portBasis, ordinaryIncome, applyWA, modelYear, p, filingStatus) => {
  if (grossSale <= 0 || portValue <= 0) return 0;
  const sellFraction = Math.min(1, grossSale / portValue);
  const basisSold = portBasis * sellFraction;
  const gain = Math.max(0, grossSale - basisSold);
  return federalInvestmentTax(gain, ordinaryIncome, filingStatus, modelYear, p) + waCGTax(gain, applyWA, modelYear, p);
};

const solveGrossSaleForNetCash = (netNeeded, portValue, portBasis, ordinaryIncome, applyWA, modelYear, p, filingStatus) => {
  if (netNeeded <= 0 || portValue <= 0) {
    return { grossSale: 0, tax: 0, realizedGain: 0, netCash: 0 };
  }
  let lo = 0;
  let hi = portValue;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const tax = taxOnGrossSale(mid, portValue, portBasis, ordinaryIncome, applyWA, modelYear, p, filingStatus);
    const net = mid - tax;
    if (net >= netNeeded) hi = mid;
    else lo = mid;
  }
  const grossSale = hi;
  const tax = taxOnGrossSale(grossSale, portValue, portBasis, ordinaryIncome, applyWA, modelYear, p, filingStatus);
  const sellFraction = Math.min(1, grossSale / portValue);
  const basisSold = portBasis * sellFraction;
  const realizedGain = Math.max(0, grossSale - basisSold);
  return { grossSale, tax, realizedGain, netCash: grossSale - tax };
};

const applyPortfolioYearWithDebt = (portfolio, annualContribution, annualReturn, behaviorGap, ordinaryIncome, filingStatus, applyWA, modelYear, p) => {
  let debt = Math.max(0, portfolio.debt || 0);
  let contribution = annualContribution;

  if (contribution > 0 && debt > 0) {
    const repayment = Math.min(debt, contribution);
    debt -= repayment;
    contribution -= repayment;
  }

  const res = applyPortfolioYear(
    { value: portfolio.value, basis: portfolio.basis },
    contribution,
    annualReturn,
    behaviorGap,
    ordinaryIncome,
    filingStatus,
    applyWA,
    modelYear,
    p
  );

  return {
    ...res,
    debt: debt + (res.shortfall || 0)
  };
};

const calendarYear = (modelYear, p) => p.observationYear + modelYear;

const effectiveRent2B1B = (p) =>
  p.rent2B1B ?? Math.round((p.rent2BR ?? 0) * (p.rent2b1bTo2brRatio ?? 0.92));

const rent2B1BSwitchModelYear = (p) =>
  (p.rent2b1bSwitchYear ?? 2030) - (p.observationYear ?? 2026);

const projectedRent2B1BAtSwitch = (p) => {
  const ySw = rent2B1BSwitchModelYear(p);
  const base = effectiveRent2B1B(p);
  return base * Math.pow(1 + (p.rentGrowth ?? 0), Math.max(0, ySw - 1));
};

/** 模型第 y 年整套房月租：2030 前 1BR / Kevin 入住后 2BR；2030 起以预计 2B1B 为锚再按 rentGrowth 递推。 */
const monthlyRentAt = (modelYear, p, kevinLives) => {
  const g = p.rentGrowth ?? 0;
  const switchCal = p.rent2b1bSwitchYear ?? 2030;
  if (p.enableRent2B1BSwitch && calendarYear(modelYear, p) >= switchCal) {
    const ySw = rent2B1BSwitchModelYear(p);
    const anchor = projectedRent2B1BAtSwitch(p);
    return anchor * Math.pow(1 + g, Math.max(0, modelYear - ySw));
  }
  const rent1BR = p.rentStart * Math.pow(1 + g, modelYear - 1);
  if (kevinLives) {
    return p.rent2BR * Math.pow(1 + g, Math.max(0, modelYear - p.kevinMoveInYear));
  }
  return rent1BR;
};

function syncRent2B1BHint() {
  const el = document.getElementById("rent2B1BHint");
  if (!el) return;
  const p = state.p;
  if (!p.enableRent2B1BSwitch) {
    el.textContent = "已关闭：继续按 1BR / Kevin 入住后 2BR 计租。";
    return;
  }
  const switchYear = p.rent2b1bSwitchYear ?? 2030;
  const proj = projectedRent2B1BAtSwitch(p);
  const ratioPct = Math.round((p.rent2b1bTo2brRatio ?? 0.92) * 100);
  el.textContent = `${switchYear} 年预计 2B1B 约 ${fmtUSD(proj)}/月（当前 2B1B 基准 ${fmtUSD(effectiveRent2B1B(p))}，约为同区 2BR 的 ${ratioPct}%）；之后按租金涨幅递推。`;
}

function incomeShockWindow(p) {
  const start = Math.max(1, Math.round(Number(p.incomeShockStartYear) || 1));
  const dur = Math.max(1, Math.round(Number(p.incomeShockDurationYears) || 1));
  return { start, endIncl: start + dur - 1, dur };
}

function syncIncomeShockHint() {
  const el = document.getElementById("incomeShockHint");
  if (!el) return;
  const p = state.p;
  if (!p.incomeShockEnable) {
    el.textContent = "已关闭：收入按既定薪资轨迹增长。";
    return;
  }
  const whoLabel = p.incomeShockTarget === "both" ? "Ken + Kevin" : p.incomeShockTarget === "kevin" ? "Kevin" : "Ken";
  const { start, endIncl } = incomeShockWindow(p);
  const sevPct = Math.round(clamp(Number(p.incomeShockSeverity ?? 1), 0, 1) * 100);
  const lossWord = sevPct >= 100 ? "收入归零" : `损失 ${sevPct}% 收入`;
  el.textContent = `${whoLabel} 第 ${start}–${endIncl} 年${lossWord}；该窗口内月现金流与流动性跑道会据此重算。`;
}

function syncRelocationHint() {
  const el = document.getElementById("relocationHint");
  if (!el) return;
  const p = state.p;
  if (!p.relocationEnable) {
    el.textContent = "已关闭：维持美国收入与住房口径。";
    return;
  }
  const yr = Math.max(1, Math.round(Number(p.relocationYear) || 1));
  const sell = (p.relocationMode || "sell") === "sell";
  const houseWord = sell ? "买房路径在该年卖房清算、净额并入投资" : "买房路径保留房产出租（租金假设覆盖持房成本）";
  el.textContent = `第 ${yr} 年起：Ken/Kevin 收入换算为海外 USD 等值、住房改按设定支出；${houseWord}。跨境税务按现有美国口径近似，非税务建议。`;
}

const salaryAt = (startYear, startSalary, growth, year) =>
  year < startYear ? 0 : startSalary * Math.pow(1 + growth, year - startYear);

/** 收入冲击（H-1B 断签 / 裁员）：在 [start, start+duration) 模型年窗口内，对目标人按 severity 比例削减收入。1=收入归零。 */
const incomeShockFactor = (target, modelYear, p) => {
  if (!p || !p.incomeShockEnable) return 1;
  const who = p.incomeShockTarget || "ken";
  if (who !== "both" && who !== target) return 1;
  const start = Math.max(1, Math.round(Number(p.incomeShockStartYear) || 1));
  const dur = Math.max(1, Math.round(Number(p.incomeShockDurationYears) || 1));
  if (modelYear < start || modelYear >= start + dur) return 1;
  const sev = clamp(Number(p.incomeShockSeverity ?? 1), 0, 1);
  return 1 - sev;
};

/** 离美/搬迁后，美国薪资轨迹替换为另一地的 USD-equiv 收入（不再增长，已含汇率/当地水平假设）。 */
const isRelocated = (modelYear, p) =>
  Boolean(p && p.relocationEnable) && modelYear >= Math.max(1, Math.round(Number(p.relocationYear) || 1));

const kenGrossAt = (modelYear, p) => {
  const base = isRelocated(modelYear, p)
    ? Math.max(0, Number(p.relocationKenSalary) || 0)
    : salaryAt(p.kenCareerStartYear, p.kenStartSalary, p.kenCareerGrowth, calendarYear(modelYear, p));
  return base * incomeShockFactor("ken", modelYear, p);
};

const kevinGrossAt = (modelYear, p) => {
  if (modelYear < p.kevinYear) return 0;
  const base = isRelocated(modelYear, p)
    ? Math.max(0, Number(p.relocationKevinSalary) || 0)
    : salaryAt(p.kevinCareerStartYear, p.kevinStartSalary, p.kevinCareerGrowth, calendarYear(modelYear, p));
  return base * incomeShockFactor("kevin", modelYear, p);
};

const combinedGrossAt = (modelYear, p) => kenGrossAt(modelYear, p) + kevinGrossAt(modelYear, p);
const monthlyTakeHome = (annualGross, netRate) => (annualGross * netRate) / 12;

function runModel(p) {
  const filingStatus = p.filingStatus || "mfj";
  const filingCfg = STATUS_CFG[filingStatus] || STATUS_CFG.mfj;
  const scenarioAdj = (p.houseScenario === "bear") ? -0.02 : (p.houseScenario === "bull" ? 0.012 : 0);
  const adjustedHouseApp = Math.max(-0.03, p.houseApp + scenarioAdj);
  const emergencyFund = p.monthlyLiving * 6;
  const closingPct = p.applyTxCosts ? 0.025 : 0;
  const targetDPPct = p.downPaymentPct ?? 0.20;
  const housingOtherFixed = p.housingOtherFixed || 0;

  const kenOwnFirst = Math.min(10000, Math.max(0, p.familySupport));
  const sponsorPool = Math.max(0, p.familySupport - kenOwnFirst);
  const familyKen = kenOwnFirst + sponsorPool * 0.5;
  const familyKevin = sponsorPool * 0.5;
  const kenInitialInvestable = Math.max(0, p.robinhoodValue - emergencyFund + familyKen);
  const kenInitialBasis = Math.max(0, p.robinhoodBasis + familyKen);

  let kenA = kenInitialInvestable;
  let kenABasis = kenInitialBasis;
  let kenADebt = 0;
  let kevinA = Math.max(0, familyKevin);
  let kevinABasis = Math.max(0, familyKevin);
  let kevinADebt = 0;

  let kenB = kenInitialInvestable;
  let kenBBasis = kenInitialBasis;
  let kenBDebt = 0;
  let kevinB = Math.max(0, familyKevin);
  let kevinBBasis = Math.max(0, familyKevin);
  let kevinBDebt = 0;

  let capitalKen = 0;
  let capitalKevin = 0;
  let bought = false;
  let houseSold = false;
  let houseSoldYear = null;
  let buyYear = null;
  let buyPrice = 0;
  let houseDP = 0;
  let houseClose = 0;
  let houseLoan = 0;
  let housePMT = 0;
  let dpLiqTax = 0;
  let dpGrossSale = 0;
  let dpNetCash = 0;
  let dpRealizedGain = 0;
  let upfrontNeedAtBuy = 0;
  let targetDPAtBuy = 0;
  let familySupportUsed = 0;
  let ownCashUsed = 0;
  const cashFlows = [];

  const priceAtYear = (y) => p.housePrice * Math.pow(1 + adjustedHouseApp, Math.max(0, y - 1));
  const ownership = (y) => {
    if (!bought || buyYear === null || y < buyYear) return { ken: 1, kevin: 0 };
    if ((p.ownershipModel || "capital") === "deed") {
      if (y < p.kevinMoveInYear) return { ken: 1, kevin: 0 };
      const deedKen = Math.min(1, Math.max(0, p.deedKenShare ?? (1 - p.kevinHousingShare)));
      return { ken: deedKen, kevin: 1 - deedKen };
    }
    const totalCapital = capitalKen + capitalKevin;
    if (totalCapital <= 0) return { ken: 1, kevin: 0 };
    return { ken: capitalKen / totalCapital, kevin: capitalKevin / totalCapital };
  };

  const canAffordForBuyYear = (yearToBuy, poolValue, poolBasis) => {
    const price = priceAtYear(yearToBuy);
    const targetDP = price * targetDPPct;
    const close = price * closingPct;
    const upfrontNeed = targetDP + close;
    const ordinaryIncome = filingCfg.entityMode === "joint"
      ? combinedGrossAt(Math.max(0, yearToBuy - 1), p)
      : kenGrossAt(Math.max(0, yearToBuy - 1), p);
    const solved = solveGrossSaleForNetCash(
      upfrontNeed,
      poolValue,
      poolBasis,
      ordinaryIncome,
      p.applyWACGT,
      Math.max(0, yearToBuy - 1),
      p,
      filingStatus
    );
    return {
      price,
      targetDP,
      close,
      upfrontNeed,
      ...solved,
      affordable: solved.netCash >= upfrontNeed && solved.grossSale <= poolValue
    };
  };

  const afterTaxPortfolioSplit = (kenV, kenBz, kevV, kevBz, modelYear) => {
    const kenGain = Math.max(0, kenV - kenBz);
    const kevGain = Math.max(0, kevV - kevBz);
    const kenIncome = kenGrossAt(modelYear, p);
    const kevIncome = kevinGrossAt(modelYear, p);
    if (filingCfg.entityMode === "joint") {
      const totalGain = kenGain + kevGain;
      const totalIncome = kenIncome + kevIncome;
      const tax = federalInvestmentTax(totalGain, totalIncome, filingStatus, modelYear, p) +
        waCGTax(totalGain, p.applyWACGT, modelYear, p);
      const allocDen = Math.max(1, totalGain);
      const kenTax = tax * (kenGain / allocDen);
      const kevTax = tax * (kevGain / allocDen);
      return { kenAft: kenV - kenTax, kevinAft: kevV - kevTax };
    }
    const singleLike = filingStatus === "unmarried" ? "single" : filingStatus;
    const kenTax = federalInvestmentTax(kenGain, kenIncome, singleLike, modelYear, p) + waCGTax(kenGain, p.applyWACGT, modelYear, p);
    const kevTax = federalInvestmentTax(kevGain, kevIncome, singleLike, modelYear, p) + waCGTax(kevGain, p.applyWACGT, modelYear, p);
    return { kenAft: kenV - kenTax, kevinAft: kevV - kevTax };
  };

  const snapshotAt = (y) => {
    const own = ownership(y);
    const aSplit = afterTaxPortfolioSplit(kenA, kenABasis, kevinA, kevinABasis, y);
    const bSplit = afterTaxPortfolioSplit(kenB, kenBBasis, kevinB, kevinBBasis, y);

    let homeNet = 0;
    let homeAftTotal = 0;
    let homeKenPre = 0;
    let homeKevinPre = 0;
    let homeKenAft = 0;
    let homeKevinAft = 0;

    if (bought && buyYear !== null && y >= buyYear && !houseSold) {
      const yearsSinceBuy = y - buyYear + 1;
      const houseVal = buyPrice * Math.pow(1 + adjustedHouseApp, yearsSinceBuy);
      const loanBal = lbal(houseLoan, p.mortgageRate, housePMT, yearsSinceBuy * 12);
      const eligibleForExclusion = !p.enforceHomeSaleEligibility || yearsSinceBuy >= (p.homeSaleUseYears || 2);
      homeNet = houseVal - loanBal;
      const ordinaryIncomeForHomeTax = filingCfg.entityMode === "joint" ? combinedGrossAt(y, p) : kenGrossAt(y, p);
      homeAftTotal = afterTaxHome(
        houseVal,
        buyPrice,
        houseClose,
        loanBal,
        p.applyTxCosts,
        filingStatus,
        eligibleForExclusion,
        ordinaryIncomeForHomeTax,
        y,
        p
      );
      homeKenPre = homeNet * own.ken;
      homeKevinPre = homeNet * own.kevin;
      homeKenAft = homeAftTotal * own.ken;
      homeKevinAft = homeAftTotal * own.kevin;
    }

    return {
      year: y,
      kenPreA: kenA - kenADebt,
      kenPreB: kenB + homeKenPre - kenBDebt,
      kevinPreA: kevinA - kevinADebt,
      kevinPreB: kevinB + homeKevinPre - kevinBDebt,
      kenAftA: aSplit.kenAft - kenADebt,
      kenAftB: bSplit.kenAft + homeKenAft - kenBDebt,
      kevinAftA: aSplit.kevinAft - kevinADebt,
      kevinAftB: bSplit.kevinAft + homeKevinAft - kevinBDebt,
      householdPreA: kenA + kevinA - kenADebt - kevinADebt,
      householdPreB: kenB + kevinB + homeNet - kenBDebt - kevinBDebt,
      householdAftA: aSplit.kenAft + aSplit.kevinAft - kenADebt - kevinADebt,
      householdAftB: bSplit.kenAft + bSplit.kevinAft + homeAftTotal - kenBDebt - kevinBDebt,
      kenPortAPre: kenA - kenADebt,
      kenPortBPre: kenB - kenBDebt,
      kevinPortAPre: kevinA - kevinADebt,
      kevinPortBPre: kevinB - kevinBDebt,
      kenPortAAft: aSplit.kenAft - kenADebt,
      kenPortBAft: bSplit.kenAft - kenBDebt,
      kevinPortAAft: aSplit.kevinAft - kevinADebt,
      kevinPortBAft: bSplit.kevinAft - kevinBDebt,
      kenDebtA: kenADebt,
      kenDebtB: kenBDebt,
      kevinDebtA: kevinADebt,
      kevinDebtB: kevinBDebt,
      homeKenPre,
      homeKevinPre,
      homeKenAft,
      homeKevinAft,
      homeTotalPre: homeNet,
      homeTotalAft: homeAftTotal
    };
  };

  let eligibleToBuyThisYear = canAffordForBuyYear(1, kenB + kevinB, kenBBasis + kevinBBasis).affordable;
  const rows = [snapshotAt(0)];

  for (let y = 1; y <= p.maxYears; y++) {
    if (!bought && eligibleToBuyThisYear) {
      const pool = kenB + kevinB;
      const basisPool = kenBBasis + kevinBBasis;
      const kenPoolBefore = kenB;
      const kevinPoolBefore = kevinB;
      const deal = canAffordForBuyYear(y, pool, basisPool);
      if (deal.affordable) {
        bought = true;
        buyYear = y;
        buyPrice = deal.price;
        targetDPAtBuy = deal.targetDP;
        upfrontNeedAtBuy = deal.upfrontNeed;
        houseDP = targetDPAtBuy;
        houseClose = deal.close;
        dpLiqTax = deal.tax;
        dpGrossSale = deal.grossSale;
        dpNetCash = deal.netCash;
        dpRealizedGain = deal.realizedGain;
        houseLoan = Math.max(0, buyPrice - houseDP);
        housePMT = mpmt(houseLoan, p.mortgageRate, 30);
        const withdrawFrac = pool > 0 ? Math.min(1, dpGrossSale / pool) : 0;
        const kenGrossUsed = kenPoolBefore * withdrawFrac;
        const kevinGrossUsed = kevinPoolBefore * withdrawFrac;
        const grossUsed = Math.max(1, kenGrossUsed + kevinGrossUsed);
        const kenNetUsed = upfrontNeedAtBuy * (kenGrossUsed / grossUsed);
        const kevinNetUsed = upfrontNeedAtBuy * (kevinGrossUsed / grossUsed);
        capitalKen += kenNetUsed;
        capitalKevin += kevinNetUsed;
        kenB *= (1 - withdrawFrac);
        kevinB *= (1 - withdrawFrac);
        kenBBasis *= (1 - withdrawFrac);
        kevinBBasis *= (1 - withdrawFrac);
        familySupportUsed = Math.min(p.familySupport, upfrontNeedAtBuy);
        ownCashUsed = Math.max(0, upfrontNeedAtBuy - familySupportUsed);
      }
    }

    const kevinLives = y >= p.kevinMoveInYear;
    const relocated = isRelocated(y, p);
    const relocationSellMode = (p.relocationMode || "sell") === "sell";
    const reloHousing = Math.max(0, Number(p.relocationHousingMonthly) || 0);
    const kenNet = monthlyTakeHome(kenGrossAt(y, p), p.kenNetRate);
    const kevinNet = monthlyTakeHome(kevinGrossAt(y, p), p.kevinNetRate);
    const ordinaryIncomeForMid = filingCfg.entityMode === "joint" ? combinedGrossAt(y, p) : kenGrossAt(y, p);

    const livingKen = p.monthlyLiving * Math.pow(1 + p.livingInflation, y - 1);
    const livingKevin = p.kevinLiving * Math.pow(1 + p.livingInflation, y - 1);

    const rentFull = monthlyRentAt(y, p, kevinLives);
    const kenRentShare = kevinLives ? rentFull * (1 - p.kevinHousingShare) : rentFull;
    const kevinRentShare = kevinLives ? rentFull * p.kevinHousingShare : 0;
    const kenRentUtilities = kevinLives ? (p.rentUtilities || 0) * (1 - p.kevinHousingShare) : (p.rentUtilities || 0);
    const kevinRentUtilities = kevinLives ? (p.rentUtilities || 0) * p.kevinHousingShare : 0;
    const kenRentExtras = p.petFee + p.renterIns + kenRentUtilities;
    const moveCost = (!kevinLives && p.moveFreq > 0 && y % p.moveFreq === 0) ? p.moveCost / 12 : 0;

    const kenHousingA = relocated ? reloHousing : kenRentShare + kenRentExtras + moveCost;
    const kevinHousingA = relocated ? 0 : kevinRentShare + kevinRentUtilities;
    const kenContribA = kenNet - livingKen - kenHousingA;
    const kevinContribA = kevinNet - livingKevin - kevinHousingA;
    const aOrdinaryIncome = filingCfg.entityMode === "joint" ? combinedGrossAt(y, p) : kenGrossAt(y, p);
    const kenARes = applyPortfolioYearWithDebt(
      { value: kenA, basis: kenABasis, debt: kenADebt },
      kenContribA * 12,
      p.stockReturn,
      p.behaviorGap,
      aOrdinaryIncome,
      filingStatus,
      p.applyWACGT,
      y,
      p
    );
    const kevinAStatus = filingCfg.entityMode === "joint" ? filingStatus : (filingStatus === "unmarried" ? "single" : filingStatus);
    const kevinAOrdinaryIncome = filingCfg.entityMode === "joint" ? combinedGrossAt(y, p) : kevinGrossAt(y, p);
    const kevinARes = applyPortfolioYearWithDebt(
      { value: kevinA, basis: kevinABasis, debt: kevinADebt },
      kevinContribA * 12,
      p.stockReturn,
      p.behaviorGap,
      kevinAOrdinaryIncome,
      kevinAStatus,
      p.applyWACGT,
      y,
      p
    );
    kenA = kenARes.value;
    kenABasis = kenARes.basis;
    kenADebt = kenARes.debt;
    kevinA = kevinARes.value;
    kevinABasis = kevinARes.basis;
    kevinADebt = kevinARes.debt;

    if (relocated && relocationSellMode && bought && !houseSold && y >= buyYear) {
      const yearsSinceBuy = y - buyYear + 1;
      const houseValSale = buyPrice * Math.pow(1 + adjustedHouseApp, yearsSinceBuy);
      const loanBalSale = lbal(houseLoan, p.mortgageRate, housePMT, yearsSinceBuy * 12);
      const eligibleSale = !p.enforceHomeSaleEligibility || yearsSinceBuy >= (p.homeSaleUseYears || 2);
      const ordIncSale = filingCfg.entityMode === "joint" ? combinedGrossAt(y, p) : kenGrossAt(y, p);
      const netProceeds = Math.max(
        0,
        afterTaxHome(houseValSale, buyPrice, houseClose, loanBalSale, p.applyTxCosts, filingStatus, eligibleSale, ordIncSale, y, p)
      );
      const ownSale = ownership(y);
      const kenShare = netProceeds * ownSale.ken;
      const kevinShare = netProceeds * ownSale.kevin;
      kenB += kenShare;
      kenBBasis += kenShare;
      kevinB += kevinShare;
      kevinBBasis += kevinShare;
      houseSold = true;
      houseSoldYear = y;
    }

    let kenContribB;
    let kevinContribB;
    let buyHousingMonthly = 0;
    if (relocated) {
      buyHousingMonthly = reloHousing;
      kenContribB = kenNet - livingKen - reloHousing;
      kevinContribB = kevinNet - livingKevin;
    } else if (!bought || y < buyYear) {
      kenContribB = kenNet - livingKen - kenRentShare - kenRentExtras - moveCost;
      kevinContribB = kevinNet - livingKevin - kevinRentShare - kevinRentUtilities;
    } else {
      const yearsSinceBuy = y - buyYear + 1;
      const houseValY = buyPrice * Math.pow(1 + adjustedHouseApp, yearsSinceBuy);
      const houseTaxM = houseValY * (p.propTaxRate / 100) / 12;
      const houseHOA = p.houseHOA * Math.pow(1 + p.hoaGrowth, yearsSinceBuy - 1);
      const prevLoanBal = lbal(houseLoan, p.mortgageRate, housePMT, (yearsSinceBuy - 1) * 12);
      const houseLoanBal = lbal(houseLoan, p.mortgageRate, housePMT, yearsSinceBuy * 12);
      const principalPaid = Math.max(0, prevLoanBal - houseLoanBal);
      const pmiM = (houseLoanBal / houseValY) > 0.80 ? houseLoan * 0.005 / 12 : 0;
      const maintenance = p.houseRepairs + (y === p.majorRepairYear ? p.majorRepairCost / 12 : 0);
      const special = (y === p.specialAssessYear) ? p.specialAssessCost / 12 : 0;
      const totalHousingFull = housePMT + houseTaxM + houseHOA + pmiM + maintenance + (p.homeownersIns || 0) + p.earthquakeIns + (p.houseUtilities || 0) + housingOtherFixed + special;
      buyHousingMonthly = totalHousingFull;
      const kevinHousingContrib = kevinLives ? totalHousingFull * p.kevinHousingShare : 0;
      const kenHousingContrib = totalHousingFull - kevinHousingContrib;
      const mid = midBenefit(
        houseLoan,
        p.mortgageRate,
        housePMT,
        yearsSinceBuy,
        houseValY * p.propTaxRate / 100,
        p.mortgageDeduction,
        filingStatus,
        ordinaryIncomeForMid,
        y,
        p
      );
      kenContribB = kenNet - livingKen - kenHousingContrib + mid;
      kevinContribB = kevinNet - livingKevin - (kevinLives ? kevinHousingContrib : 0);

      if ((p.ownershipModel || "capital") === "capital") {
        const payDen = Math.max(1, kenHousingContrib + kevinHousingContrib);
        capitalKen += principalPaid * (kenHousingContrib / payDen);
        capitalKevin += principalPaid * (kevinHousingContrib / payDen);
        if (p.capitalTrackLargeRepairs) {
          const capexAnnual = (y === p.majorRepairYear ? p.majorRepairCost : 0) + (y === p.specialAssessYear ? p.specialAssessCost : 0);
          capitalKen += capexAnnual * (kenHousingContrib / payDen);
          capitalKevin += capexAnnual * (kevinHousingContrib / payDen);
        }
      }
    }

    const bOrdinaryIncome = filingCfg.entityMode === "joint" ? combinedGrossAt(y, p) : kenGrossAt(y, p);
    const kenBRes = applyPortfolioYearWithDebt(
      { value: kenB, basis: kenBBasis, debt: kenBDebt },
      kenContribB * 12,
      p.stockReturn,
      p.behaviorGap,
      bOrdinaryIncome,
      filingStatus,
      p.applyWACGT,
      y,
      p
    );
    const kevinBStatus = filingCfg.entityMode === "joint" ? filingStatus : (filingStatus === "unmarried" ? "single" : filingStatus);
    const kevinBOrdinaryIncome = filingCfg.entityMode === "joint" ? combinedGrossAt(y, p) : kevinGrossAt(y, p);
    const kevinBRes = applyPortfolioYearWithDebt(
      { value: kevinB, basis: kevinBBasis, debt: kevinBDebt },
      kevinContribB * 12,
      p.stockReturn,
      p.behaviorGap,
      kevinBOrdinaryIncome,
      kevinBStatus,
      p.applyWACGT,
      y,
      p
    );
    kenB = kenBRes.value;
    kenBBasis = kenBRes.basis;
    kenBDebt = kenBRes.debt;
    kevinB = kevinBRes.value;
    kevinBBasis = kevinBRes.basis;
    kevinBDebt = kevinBRes.debt;

    if (bought && p.enableKevinBuyIn && y === p.kevinMoveInYear) {
      const buyInTarget = Math.max(0, upfrontNeedAtBuy * (p.kevinBuyInPct || 0));
      const buyInSolved = solveGrossSaleForNetCash(
        buyInTarget,
        kevinB,
        kevinBBasis,
        kevinBOrdinaryIncome,
        p.applyWACGT,
        y,
        p,
        kevinBStatus
      );
      const grossSold = Math.min(kevinB, buyInSolved.grossSale);
      const soldFrac = kevinB > 0 ? Math.min(1, grossSold / kevinB) : 0;
      const netTransferred = Math.max(0, grossSold - buyInSolved.tax);
      kevinB = Math.max(0, kevinB - grossSold);
      kevinBBasis = Math.max(0, kevinBBasis * (1 - soldFrac));
      kenB += netTransferred;
      kenBBasis += netTransferred;
      if ((p.ownershipModel || "capital") === "capital") {
        const transferredCapital = Math.min(capitalKen, netTransferred);
        capitalKen -= transferredCapital;
        capitalKevin += transferredCapital;
      }
    }

    if (!bought && y < p.maxYears) {
      eligibleToBuyThisYear = canAffordForBuyYear(y + 1, kenB + kevinB, kenBBasis + kevinBBasis).affordable;
    }

    cashFlows.push({
      year: y,
      kenA: kenContribA,
      kevinA: kevinContribA,
      kenB: kenContribB,
      kevinB: kevinContribB,
      householdA: kenContribA + kevinContribA,
      householdB: kenContribB + kevinContribB,
      buyHousingMonthly,
      bought: bought && y >= buyYear && !houseSold && !relocated,
      forcedDebtA: kenADebt + kevinADebt,
      forcedDebtB: kenBDebt + kevinBDebt,
      kenForcedDebtB: kenBDebt,
      kevinForcedDebtB: kevinBDebt
    });

    rows.push(snapshotAt(y));
  }

  const outcomes = {
    5: rows[Math.min(5, p.maxYears)],
    7: rows[Math.min(7, p.maxYears)],
    20: rows[Math.min(20, p.maxYears)]
  };

  return {
    rows,
    outcomes,
    cashFlows,
    housePMT,
    houseDP,
    houseClose,
    ownCashUsed,
    familySupportUsed,
    dpLiqTax,
    dpGrossSale,
    dpNetCash,
    dpRealizedGain,
    buyYear,
    buyPrice,
    upfrontNeedAtBuy,
    targetDPAtBuy,
    adjustedHouseApp,
    emergencyFund,
    filingStatus
  };
}

function valueByState(row, strategy) {
  const viewKey = state.view === "ken" ? "ken" : "kevin";
  const taxKey = state.afterTax ? "Aft" : "Pre";
  return row[`${viewKey}${taxKey}${strategy}`];
}

function selectedOutcome(result) {
  return result.outcomes[state.horizon] || result.outcomes[20];
}

function valueByScenario(row, strategy, opts) {
  const viewKey = opts.view === "ken" ? "ken" : "kevin";
  const taxKey = opts.afterTax ? "Aft" : "Pre";
  return row[`${viewKey}${taxKey}${strategy}`];
}

function findBreakEven(p, opts = { view: "ken", afterTax: false, horizon: 20 }) {
  const cacheKey = JSON.stringify({ p, opts });
  if (!findBreakEven._cache) findBreakEven._cache = new Map();
  if (findBreakEven._cache.has(cacheKey)) return findBreakEven._cache.get(cacheKey);
  for (let r = 0.03; r <= 0.15; r += 0.001) {
    const t = runModel({ ...p, stockReturn: r });
    const row = t.outcomes[opts.horizon] || t.outcomes[20];
    if (!row) continue;
    if (valueByScenario(row, "A", opts) >= valueByScenario(row, "B", opts)) {
      findBreakEven._cache.set(cacheKey, r);
      return r;
    }
  }
  findBreakEven._cache.set(cacheKey, null);
  return null;
}

const SENSITIVITY_SPECS = [
  { key: "stockReturn", label: "标普年化", min: 0.03, max: 0.15, step: 0.002, fmt: fmtPercent },
  { key: "houseApp", label: "房价涨幅", min: 0, max: 0.07, step: 0.002, fmt: fmtPercent },
  { key: "mortgageRate", label: "房贷利率", min: 0.02, max: 0.12, step: 0.002, fmt: fmtPercent },
  { key: "rentGrowth", label: "租金涨幅", min: 0.01, max: 0.07, step: 0.002, fmt: fmtPercent }
];

const SCENARIO_SHORT = { bear: "Bear", base: "Base", bull: "Bull" };

function modelOptsFromState() {
  return { view: state.view, afterTax: state.afterTax, horizon: state.horizon };
}

function winnerIsRentAt(p, opts) {
  const row = runModel(p).outcomes[opts.horizon];
  if (!row) return true;
  return valueByScenario(row, "A", opts) >= valueByScenario(row, "B", opts);
}

function findFlipPoint(p, paramKey, opts, min, max, step) {
  const rentWinsNow = winnerIsRentAt(p, opts);
  for (let v = min; v <= max + step / 2; v += step) {
    const test = { ...p, [paramKey]: Math.round(v * 10000) / 10000 };
    if (winnerIsRentAt(test, opts) !== rentWinsNow) return test[paramKey];
  }
  return null;
}

function distanceClass(pp) {
  if (pp == null) return "sensitivity-distance--safe";
  const abs = Math.abs(pp);
  if (abs >= 0.02) return "sensitivity-distance--safe";
  if (abs >= 0.01) return "sensitivity-distance--warn";
  return "sensitivity-distance--risk";
}

function formatMarginPp(current, flip, rentWinsNow, paramKey) {
  if (flip == null) return { text: "未触及", cls: "sensitivity-distance--safe", note: "在扫描区间内结论不变" };
  const delta = flip - current;
  const higherHelpsBuy = ["houseApp", "mortgageRate"].includes(paramKey)
    ? !rentWinsNow
    : paramKey === "rentGrowth"
      ? rentWinsNow
      : rentWinsNow;
  if (Math.abs(delta) < 0.0005) {
    return { text: "临界", cls: "sensitivity-distance--risk", note: "已接近反转点" };
  }
  const pp = delta * 100;
  const sign = pp > 0 ? "+" : "";
  let note = "结论仍稳定";
  if (Math.abs(pp) < 1) note = "轻微扰动即可反转";
  else if (Math.abs(pp) < 2) note = "对结论较敏感";
  return { text: `${sign}${pp.toFixed(1)}pp`, cls: distanceClass(pp / 100), note };
}

function computeStability(result, p, opts) {
  const horizons = [5, 7, 20];
  const winners = horizons.map((y) => {
    const row = result.outcomes[y];
    return row && valueByScenario(row, "A", opts) >= valueByScenario(row, "B", opts) ? "A" : "B";
  });
  const unanimous = winners.every((w) => w === winners[0]);
  const stockBE = findBreakEven(p, { ...opts, horizon: opts.horizon });
  const stockMargin = stockBE != null ? p.stockReturn - stockBE : null;
  if (!unanimous) {
    return {
      level: "sensitive",
      label: "敏感",
      reason: `5/7/20 年领先方案不完全一致（${winners.map((w, i) => `${horizons[i]}年:${w === "A" ? "租" : "买"}`).join(" · ")}）`
    };
  }
  if (stockMargin != null && Math.abs(stockMargin) < 0.015) {
    return {
      level: "fragile",
      label: "脆弱",
      reason: `标普收益距反转点仅约 ${(Math.abs(stockMargin) * 100).toFixed(1)} 个百分点`
    };
  }
  return { level: "stable", label: "稳定", reason: "5/7/20 年结论一致，主要变量安全边际较宽" };
}

function analyzeDrivers(result, p, opts) {
  const o = result.outcomes[opts.horizon];
  if (!o) return { why: "", drivers: [] };
  const rentWins = valueByScenario(o, "A", opts) >= valueByScenario(o, "B", opts);
  const viewKey = opts.view === "ken" ? "ken" : "kevin";
  const taxKey = opts.afterTax ? "Aft" : "Pre";
  const portA = o[`${viewKey}PortA${taxKey}`];
  const portB = o[`${viewKey}PortB${taxKey}`];
  const homeKey = `home${viewKey === "ken" ? "Ken" : "Kevin"}${taxKey}`;
  const homeEq = o[homeKey] ?? 0;
  const diff = Math.abs(valueByScenario(o, "A", opts) - valueByScenario(o, "B", opts));
  const drivers = [];
  if (rentWins) {
    drivers.push(`期末股票资产更高（租房方案 ${fmtMoneyShort(portA)} vs 买房 ${fmtMoneyShort(portB)}）`);
    if (result.buyYear) drivers.push(`买房方案第 ${result.buyYear} 年才购入，前期持币投资`);
    else drivers.push(`当前储蓄无法在 ${p.maxYears} 年内达到首付门槛，买房路径持续租住`);
  } else {
    drivers.push(`房屋净值 ${fmtMoneyShort(homeEq)} 叠加股票 ${fmtMoneyShort(portB)} 拉高总资产`);
    if (result.buyYear) drivers.push(`第 ${result.buyYear} 年购入，房价情景 ${p.houseScenario.toUpperCase()}（有效涨幅 ${fmtPercent(result.adjustedHouseApp)}）`);
  }
  drivers.push(`有效投资收益率约 ${fmtPercent(p.stockReturn - p.behaviorGap)}（名义 ${fmtPercent(p.stockReturn)} − 行为折损）`);
  const why = rentWins
    ? `在 ${opts.horizon} 年、${opts.afterTax ? "税后清算" : "税前账面"}口径下，持租投资领先约 ${fmtMoneyShort(diff)}。`
    : `在 ${opts.horizon} 年、${opts.afterTax ? "税后清算" : "税前账面"}口径下，买房投资领先约 ${fmtMoneyShort(diff)}。`;
  return { why, drivers: drivers.slice(0, 3) };
}

function buildSensitivityRows(p, opts) {
  const rentWinsNow = winnerIsRentAt(p, opts);
  return SENSITIVITY_SPECS.map((spec) => {
    const current = p[spec.key];
    const flip = findFlipPoint(p, spec.key, opts, spec.min, spec.max, spec.step);
    const margin = formatMarginPp(current, flip, rentWinsNow, spec.key);
    return {
      label: spec.label,
      current: spec.fmt(current),
      flip: flip != null ? spec.fmt(flip) : "—",
      marginText: margin.text,
      marginCls: margin.cls,
      note: margin.note
    };
  });
}

function renderDecisionHeader(result, p, opts) {
  const o = result.outcomes[opts.horizon];
  if (!o) return;
  const rentWins = valueByScenario(o, "A", opts) >= valueByScenario(o, "B", opts);
  const winner = rentWins ? "租房 + 投资" : "买房 + 投资";
  const diff = Math.abs(valueByScenario(o, "A", opts) - valueByScenario(o, "B", opts));
  const viewLabel = opts.view === "ken" ? "Ken" : "Kevin";
  const preset = LOCATION_PRESETS[state.selectedPreset];
  const city = preset?.name || (state.selectedPreset ? state.selectedPreset : "自定义");
  const stability = computeStability(result, p, opts);
  const breakEven = findBreakEven(p, { ...opts, horizon: opts.horizon });
  const { why, drivers } = analyzeDrivers(result, p, opts);
  const targetYear = clamp(Math.round(state.goal?.targetYear || opts.horizon), 1, p.maxYears || 40);
  const goalProjection = buildGoalProjectionFromState(targetYear, opts.horizon, opts.afterTax, result.rows?.[0]);
  const expectedGoalNet = goalProjection?.expected || 0;
  const targetAmount = goalProjection?.target || Math.max(0, Number(state.goal?.targetAmount) || 0);
  const gapAmount = goalProjection?.gap || Math.max(0, targetAmount - expectedGoalNet);
  const extraSaving = goalProjection?.extraMonthly ?? null;
  const goalPrefixForecast = window.FinanceI18n?.t?.("goal.yearlyForecastPrefix") || "预计净资产";
  const goalPrefixTarget = window.FinanceI18n?.t?.("goal.targetPrefix") || "目标";
  const goalPrefixGap = window.FinanceI18n?.t?.("goal.gapPrefix") || "缺口";
  const goalPrefixExtra = window.FinanceI18n?.t?.("goal.extraSavingPrefix") || "每月需多存";
  const goalReachableSuffix = window.FinanceI18n?.t?.("goal.reachableSuffix") || "可达标";
  const goalUnreachable = window.FinanceI18n?.t?.("goal.unreachable") || "在当前假设上限内暂不可达";

  const headline = document.getElementById("decisionHeadline");
  if (headline) {
    const extraText = extraSaving == null ? goalUnreachable : `${fmtMoneyShort(extraSaving)}/月`;
    headline.textContent =
      window.FinanceUI?.buildGoalHeadline?.({
        privacyMode: state.privacyMode,
        targetYear,
        expectedText: fmtMoneyShort(expectedGoalNet),
        targetText: fmtMoneyShort(targetAmount),
        gapText: fmtMoneyShort(gapAmount),
        extraText,
        extraReachable: extraSaving != null,
        i18n: {
          yearlyForecastPrefix: goalPrefixForecast,
          targetPrefix: goalPrefixTarget,
          gapPrefix: goalPrefixGap,
          extraSavingPrefix: goalPrefixExtra,
          reachableSuffix: goalReachableSuffix
        }
      }) ||
      `${targetYear}年 ${goalPrefixForecast} ${fmtMoneyShort(expectedGoalNet)} / ${goalPrefixTarget} ${fmtMoneyShort(targetAmount)} / ${goalPrefixGap} ${fmtMoneyShort(gapAmount)} / ${goalPrefixExtra} ${extraText}`;
  }

  const badge = document.getElementById("decisionStabilityBadge");
  if (badge) {
    badge.textContent = stability.label;
    badge.className = `badge stability-badge stability-badge--${stability.level}`;
    badge.title = stability.reason;
  }

  const chips = document.getElementById("decisionLensChips");
  if (chips) {
    const tax = opts.afterTax ? "税后清算" : "税前账面";
    const scenario = SCENARIO_SHORT[p.houseScenario] || p.houseScenario;
    chips.innerHTML = [
      ["周期", `${opts.horizon}年`],
      ["视角", viewLabel],
      ["口径", tax],
      ["城市", city],
      ["情景", scenario],
      ["平衡标普", breakEven ? fmtPercent(breakEven) : "—"]
    ]
      .map(([k, v]) => `<span class="decision-lens-chip"><strong>${k}</strong> ${v}</span>`)
      .join("");
  }

  const whyEl = document.getElementById("decisionWhyWin");
  if (whyEl) whyEl.textContent = state.privacyMode ? "隐私模式下原因说明已简化。" : why;

  const driversEl = document.getElementById("decisionDrivers");
  if (driversEl) {
    driversEl.innerHTML = (state.privacyMode ? ["薪资与资产细节已隐藏；模型仍按内部假设运行。"] : drivers)
      .map((d) => `<li>${d}</li>`)
      .join("");
  }

  const stabilitySummary = document.getElementById("stabilitySummary");
  if (stabilitySummary) stabilitySummary.textContent = stability.reason;

  const sensBody = document.getElementById("sensitivityTableBody");
  if (sensBody) {
    sensBody.innerHTML = buildSensitivityRows(p, opts)
      .map(
        (row) => `
      <tr>
        <th scope="row">${row.label}</th>
        <td>${row.current}</td>
        <td>${row.flip}</td>
        <td class="${row.marginCls}">${row.marginText}</td>
        <td class="text-secondary">${row.note}</td>
      </tr>`
      )
      .join("");
  }
}

const CASH_FLOOR_MONTHS = 3;

function syncFamilySupport3520() {
  const el = document.getElementById("familySupport3520");
  if (!el) return;
  const trigger = (Number(state.p.familySupport) || 0) > 100000;
  el.classList.toggle("d-none", !trigger);
}

function renderCashflowRunway(result) {
  const root = document.getElementById("cashflowRunway");
  if (!root) return;
  const flowsEl = document.getElementById("cashflowRunwayFlows");
  const badge = document.getElementById("cashflowRunwayBadge");
  const noteEl = document.getElementById("cashflowRunwayNote");
  const viewKey = state.view === "ken" ? "ken" : "kevin";
  const viewLabel = state.view === "ken" ? "Ken" : "Kevin";
  const year = state.horizon;
  const flows = Array.isArray(result.cashFlows) ? result.cashFlows : [];
  const atYear = flows.find((c) => c.year === year);
  if (!atYear) {
    root.classList.add("d-none");
    return;
  }
  root.classList.remove("d-none");

  const aKey = viewKey === "ken" ? "kenA" : "kevinA";
  const bKey = viewKey === "ken" ? "kenB" : "kevinB";
  const bDebtKey = viewKey === "ken" ? "kenForcedDebtB" : "kevinForcedDebtB";

  const rentMonthly = atYear[aKey] || 0;
  const buyMonthly = atYear[bKey] || 0;
  const bought = Boolean(atYear.bought);

  const fmtFlow = (v) => `${v >= 0 ? "+" : "−"}${fmtMoneyShort(Math.abs(v))}/月`;
  const flowClass = (v) => (v >= 0 ? "cashflow-pill--surplus" : "cashflow-pill--deficit");

  if (flowsEl) {
    flowsEl.innerHTML = [
      `<span class="cashflow-pill ${flowClass(rentMonthly)}">租房 <strong>${fmtFlow(rentMonthly)}</strong></span>`,
      `<span class="cashflow-pill ${flowClass(buyMonthly)}">买房 <strong>${fmtFlow(buyMonthly)}</strong></span>`,
      `<span class="cashflow-flow-context">${viewLabel} · 第 ${year} 年末 · 月盈余/赤字</span>`
    ].join("");
  }

  const monthlyLiving = Number(state.p.monthlyLiving) || 0;
  const floorMonths = CASH_FLOOR_MONTHS;
  const buffer = Number(result.emergencyFund) || monthlyLiving * 6;

  const windowFlows = flows.filter((c) => c.year <= year);
  let worstBuy = Infinity;
  let worstBuyYear = year;
  let breachYear = null;
  let breachDebt = 0;
  windowFlows.forEach((c) => {
    const bm = c[bKey] || 0;
    if (bm < worstBuy) {
      worstBuy = bm;
      worstBuyYear = c.year;
    }
    const debt = c[bDebtKey] || 0;
    if (debt > 0 && breachYear === null) breachYear = c.year;
    if (debt > breachDebt) breachDebt = debt;
  });
  const burn = worstBuy < 0 ? -worstBuy : 0;
  const runwayMonths = burn > 0 ? buffer / burn : Infinity;

  let level = "ok";
  let badgeText = "现金流稳健";
  let note = "";
  if (breachDebt > 0) {
    level = "breach";
    badgeText = "击穿安全垫";
    note = `买房路径在第 ${breachYear} 年现金流被迫融资约 ${fmtMoneyShort(breachDebt)}（投资组合已无法覆盖支出）。建议降低房价/首付比例、延后购房年份或提高月储蓄。`;
  } else if (burn > 0 && runwayMonths < floorMonths) {
    level = "danger";
    badgeText = "跑道偏短";
    note = `买房路径最紧的一年（第 ${worstBuyYear} 年）月赤字约 ${fmtMoneyShort(burn)}，现金垫 ${fmtMoneyShort(buffer)} 仅够覆盖约 ${runwayMonths.toFixed(1)} 个月，已低于 ${floorMonths} 个月底线。`;
  } else if (burn > 0 && runwayMonths < 6) {
    level = "warn";
    badgeText = "留意跑道";
    note = `买房路径第 ${worstBuyYear} 年月赤字约 ${fmtMoneyShort(burn)}，现金垫 ${fmtMoneyShort(buffer)} 约可覆盖 ${runwayMonths.toFixed(1)} 个月（高于 ${floorMonths} 个月底线，但不算宽裕）。`;
  } else if (burn > 0) {
    note = `买房路径第 ${worstBuyYear} 年虽有月赤字约 ${fmtMoneyShort(burn)}，现金垫 ${fmtMoneyShort(buffer)} 可覆盖约 ${runwayMonths === Infinity ? "∞" : runwayMonths.toFixed(1)} 个月，仍在 ${floorMonths} 个月底线之上。`;
  } else {
    note = bought
      ? `买房路径月现金流为正，未触及 ${floorMonths} 个月流动性底线。`
      : `${state.p.maxYears} 年内买房路径仍维持租住，月现金流与租房一致，无购房月供压力。`;
  }
  if (state.privacyMode) note = scrubMoneyText(note);

  if (badge) {
    badge.textContent = badgeText;
    badge.className = `badge cashflow-runway-badge cashflow-runway-badge--${level}`;
  }
  if (noteEl) noteEl.textContent = note;
  root.setAttribute("data-level", level);
}

function exportAssumptionsSnapshot() {
  const payload = {
    exportedAt: new Date().toISOString(),
    horizon: state.horizon,
    view: state.view,
    afterTax: state.afterTax,
    selectedPreset: state.selectedPreset,
    params: state.p,
    disclaimer: "Planning model only — not tax/legal/financial advice."
  };
  const text = JSON.stringify(payload, null, 2);
  navigator.clipboard?.writeText(text).then(
    () => {
      const btn = document.getElementById("exportAssumptionsBtn");
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(() => {
          btn.textContent = prev;
        }, 1600);
      }
    },
    () => window.prompt("复制以下 JSON：", text)
  );
}

const SNAP_KEY = "rb_snapshots_v1";
const SNAP_PCT_KEYS = new Set([
  "stockReturn", "mortgageRate", "houseApp", "rentGrowth", "downPaymentPct", "deedKenShare",
  "kevinBuyInPct", "behaviorGap", "livingInflation", "hoaGrowth", "incomeShockSeverity",
  "kenCareerGrowth", "kevinCareerGrowth", "kenNetRate", "kevinNetRate"
]);
const SNAP_USD_KEYS = new Set([
  "housePrice", "familySupport", "robinhoodValue", "robinhoodBasis", "monthlyLiving", "kevinLiving",
  "rentStart", "rent2BR", "rent2B1B", "houseHOA", "earthquakeIns", "homeownersIns", "houseUtilities",
  "majorRepairCost", "kenStartSalary", "kevinStartSalary", "moveCost",
  "relocationKenSalary", "relocationKevinSalary", "relocationHousingMonthly"
]);
const SNAP_LABELS = {
  stockReturn: "标普收益", mortgageRate: "房贷利率", houseApp: "房价涨幅", rentGrowth: "租金涨幅",
  housePrice: "买房价格", familySupport: "父母赞助", downPaymentPct: "首付比例", deedKenShare: "Ken 产权",
  kevinBuyInPct: "Kevin buy-in", filingStatus: "报税身份", houseScenario: "房价情景", ownershipModel: "权益模型",
  incomeShockEnable: "收入冲击", incomeShockTarget: "冲击对象", incomeShockStartYear: "冲击起始年",
  incomeShockDurationYears: "冲击持续", incomeShockSeverity: "损失比例", monthlyLiving: "月生活费",
  kenStartSalary: "Ken 起薪", kevinStartSalary: "Kevin 起薪", rentStart: "起租", houseHOA: "HOA",
  earthquakeIns: "地震险", propTaxRate: "房产税率", behaviorGap: "行为折损", enableKevinBuyIn: "启用 buy-in",
  relocationEnable: "搬迁/离场", relocationMode: "房产处理", relocationYear: "搬迁年份",
  relocationKenSalary: "Ken 海外收入", relocationKevinSalary: "Kevin 海外收入", relocationHousingMonthly: "海外住房/月"
};
const SNAP_TARGET_LABEL = { ken: "仅 Ken", kevin: "仅 Kevin", both: "两人" };

function formatSnapParamValue(key, v) {
  if (typeof v === "boolean") return v ? "开" : "关";
  if (key === "filingStatus") return FILING_SHORT[v] || v;
  if (key === "houseScenario") return SCENARIO_SHORT[v] || v;
  if (key === "ownershipModel") return v === "capital" ? "Capital" : "Deed";
  if (key === "incomeShockTarget") return SNAP_TARGET_LABEL[v] || v;
  if (key === "relocationMode") return v === "rent-out" ? "保留出租" : "卖房清算";
  if (key === "relocationYear") return `第${Math.round(Number(v))}年`;
  if (key === "incomeShockStartYear") return `第${Math.round(Number(v))}年`;
  if (key === "incomeShockDurationYears") return `${Math.round(Number(v))}年`;
  if (key === "propTaxRate") return `${Number(v).toFixed(3)}%`;
  if (SNAP_PCT_KEYS.has(key)) return fmtPercent(Number(v));
  if (SNAP_USD_KEYS.has(key)) return fmtUSD(Number(v));
  return String(v);
}

function captureSnapshot(name) {
  return {
    id: `snap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: name || `快照 ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
    savedAt: new Date().toISOString(),
    horizon: state.horizon,
    view: state.view,
    afterTax: state.afterTax,
    selectedPreset: state.selectedPreset,
    goal: { ...state.goal },
    p: { ...state.p }
  };
}

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    state.namedSnapshots = Array.isArray(arr) ? arr.filter((s) => s && s.p) : [];
  } catch (_) {
    state.namedSnapshots = [];
  }
}

function saveSnapshotsToStorage() {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(state.namedSnapshots || []));
  } catch (_) {
    /* storage full / private mode */
  }
}

function addSnapshot(name) {
  const snap = captureSnapshot(name);
  state.namedSnapshots = [snap, ...(state.namedSnapshots || [])].slice(0, 20);
  saveSnapshotsToStorage();
  renderSnapshotPanel();
}

function deleteSnapshot(id) {
  state.namedSnapshots = (state.namedSnapshots || []).filter((s) => s.id !== id);
  if (state.compareA === id) state.compareA = null;
  if (state.compareB === id) state.compareB = null;
  saveSnapshotsToStorage();
  renderSnapshotPanel();
}

function loadSnapshotIntoState(id) {
  const snap = (state.namedSnapshots || []).find((s) => s.id === id);
  if (!snap) return;
  state.p = sanitizePersistedParams(snap.p);
  state.horizon = [5, 7, 20].includes(snap.horizon) ? snap.horizon : state.horizon;
  state.view = snap.view === "kevin" ? "kevin" : "ken";
  state.afterTax = Boolean(snap.afterTax);
  state.selectedPreset = typeof snap.selectedPreset === "string" ? snap.selectedPreset : "";
  if (snap.goal && typeof snap.goal === "object") {
    const ta = Number(snap.goal.targetAmount);
    const ty = Number(snap.goal.targetYear);
    if (Number.isFinite(ta) && ta >= 0) state.goal.targetAmount = ta;
    if (Number.isFinite(ty) && ty >= 1) state.goal.targetYear = Math.min(40, Math.round(ty));
  }
  if (LOCK_CURVE_TO_HORIZON) state.curveYears = state.horizon;
  syncTaxModeButtonText();
  syncBandButton();
  syncHorizonButtons();
  syncViewButtons();
  syncCurveYearButtons();
  syncPresetPanel();
  syncInputs();
  ensureGoalControls();
  rerender();
}

function snapshotSummaryText(snap) {
  const p = snap.p || {};
  const preset = LOCATION_PRESETS[snap.selectedPreset];
  const city = preset?.name || (snap.selectedPreset ? snap.selectedPreset : "自定义");
  return `${city} · ${fmtUSD(p.housePrice)} · 首付${fmtPercent(p.downPaymentPct ?? 0.2)} · ${SCENARIO_SHORT[p.houseScenario] || p.houseScenario}${p.incomeShockEnable ? " · 收入冲击" : ""}`;
}

function renderSnapshotPanel() {
  const body = document.getElementById("snapshotListBody");
  const summary = document.getElementById("snapshotSummary");
  const snaps = state.namedSnapshots || [];
  if (summary) summary.textContent = `${snaps.length} 个快照`;
  if (!body) return;
  if (!snaps.length) {
    body.innerHTML = `<tr><td colspan="6" class="text-secondary">还没有快照。先保存当前假设，便于「上月的我 vs 现在的我」做对比。</td></tr>`;
    renderSnapshotCompare();
    return;
  }
  body.innerHTML = snaps
    .map((s) => {
      const time = new Date(s.savedAt).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      return `
        <tr data-snap-id="${s.id}">
          <td><input class="form-check-input snap-a" type="radio" name="snapA" aria-label="选为对比A" ${state.compareA === s.id ? "checked" : ""} /></td>
          <td><input class="form-check-input snap-b" type="radio" name="snapB" aria-label="选为对比B" ${state.compareB === s.id ? "checked" : ""} /></td>
          <td>${s.name}</td>
          <td class="small text-secondary">${snapshotSummaryText(s)}</td>
          <td class="small text-secondary">${time}</td>
          <td class="text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary snap-load">载入</button>
            <button type="button" class="btn btn-sm btn-outline-danger snap-del">删除</button>
          </td>
        </tr>`;
    })
    .join("");
  body.querySelectorAll("tr[data-snap-id]").forEach((row) => {
    const id = row.getAttribute("data-snap-id");
    row.querySelector(".snap-load")?.addEventListener("click", () => loadSnapshotIntoState(id));
    row.querySelector(".snap-del")?.addEventListener("click", () => deleteSnapshot(id));
    row.querySelector(".snap-a")?.addEventListener("change", () => {
      state.compareA = id;
      renderSnapshotCompare();
    });
    row.querySelector(".snap-b")?.addEventListener("change", () => {
      state.compareB = id;
      renderSnapshotCompare();
    });
  });
  renderSnapshotCompare();
}

function buildSnapshotParamDiff(a, b) {
  const diffs = [];
  Object.keys(DEF).forEach((k) => {
    const av = a.p?.[k];
    const bv = b.p?.[k];
    if (av === bv) return;
    if (av == null && bv == null) return;
    diffs.push({
      label: SNAP_LABELS[k] || k,
      a: formatSnapParamValue(k, av),
      b: formatSnapParamValue(k, bv)
    });
  });
  const lensPairs = [
    ["视角", a.view === "kevin" ? "Kevin" : "Ken", b.view === "kevin" ? "Kevin" : "Ken"],
    ["周期", `${a.horizon}年`, `${b.horizon}年`],
    ["口径", a.afterTax ? "税后" : "税前", b.afterTax ? "税后" : "税前"]
  ];
  lensPairs.forEach(([label, av, bv]) => {
    if (av !== bv) diffs.push({ label, a: av, b: bv });
  });
  return diffs;
}

function renderSnapshotCompare() {
  const empty = document.getElementById("snapshotCompareEmpty");
  const result = document.getElementById("snapshotCompareResult");
  const snaps = state.namedSnapshots || [];
  const a = snaps.find((s) => s.id === state.compareA);
  const b = snaps.find((s) => s.id === state.compareB);

  if (!a || !b || a.id === b.id) {
    result?.classList.add("d-none");
    if (empty) {
      empty.classList.remove("d-none");
      empty.textContent =
        a && b && a.id === b.id
          ? "A 与 B 不能是同一个快照，请另选一个。"
          : "选择两个不同快照（A / B）后自动对比参数差异与净资产分歧。";
    }
    if (snapshotCompareChart) {
      snapshotCompareChart.destroy();
      snapshotCompareChart = null;
    }
    return;
  }

  empty?.classList.add("d-none");
  result?.classList.remove("d-none");

  const opts = { view: state.view, afterTax: state.afterTax };
  const lensLabel = `${opts.view === "ken" ? "Ken" : "Kevin"} · ${opts.afterTax ? "税后清算" : "税前账面"}`;
  const titleEl = document.getElementById("snapshotCompareTitle");
  if (titleEl) titleEl.textContent = `对比口径：${lensLabel}　|　A：${a.name}　vs　B：${b.name}`;

  const diffEl = document.getElementById("snapshotDiffParams");
  if (diffEl) {
    const diffs = buildSnapshotParamDiff(a, b);
    diffEl.innerHTML = diffs.length
      ? diffs
          .map(
            (d) =>
              `<span class="snapshot-diff-chip"><strong>${d.label}</strong> ${d.a} <span class="snapshot-diff-arrow">→</span> ${d.b}</span>`
          )
          .join("")
      : `<span class="text-secondary small">两个快照参数完全一致。</span>`;
  }

  const resA = runModel(a.p);
  const resB = runModel(b.p);

  const tbody = document.getElementById("snapshotDiffTableBody");
  if (tbody) {
    tbody.innerHTML = [5, 7, 20]
      .map((y) => {
        const ra = resA.outcomes[y];
        const rb = resB.outcomes[y];
        if (!ra || !rb) return "";
        const aRent = valueByScenario(ra, "A", opts);
        const aBuy = valueByScenario(ra, "B", opts);
        const bRent = valueByScenario(rb, "A", opts);
        const bBuy = valueByScenario(rb, "B", opts);
        const dRent = bRent - aRent;
        const dBuy = bBuy - aBuy;
        const deltaCell = (d) => {
          const cls = d >= 0 ? "text-success" : "text-danger";
          const sign = d >= 0 ? "+" : "−";
          return `<td class="${cls}">${sign}${fmtMoneyShort(Math.abs(d))}</td>`;
        };
        return `
          <tr>
            <td>${y}年</td>
            <td>${fmtMoneyShort(aRent)}</td>
            <td>${fmtMoneyShort(aBuy)}</td>
            <td>${fmtMoneyShort(bRent)}</td>
            <td>${fmtMoneyShort(bBuy)}</td>
            ${deltaCell(dRent)}
            ${deltaCell(dBuy)}
          </tr>`;
      })
      .join("");
  }

  renderSnapshotCompareChart(resA, resB, opts);
}

function renderSnapshotCompareChart(resA, resB, opts) {
  const canvas = document.getElementById("snapshotCompareChart");
  if (!canvas || typeof Chart === "undefined") return;
  const compareYears = Math.min(20, state.p.maxYears || 40);
  const css = getComputedStyle(document.documentElement);
  const isDark = (document.documentElement.getAttribute("data-bs-theme") || "dark") === "dark";
  const textColor = css.getPropertyValue("--bs-body-color").trim() || "#cbd5e1";
  const gridColor = isDark ? "rgba(148, 163, 184, 0.24)" : "rgba(100, 116, 139, 0.22)";
  const labels = [];
  for (let y = 0; y <= compareYears; y++) labels.push(`Y${y}`);
  const series = (res, strat) =>
    res.rows.filter((r) => r.year <= compareYears).map((r) => valueByScenario(r, strat, opts) / 10000);

  const datasets = [
    { label: "A · 租", data: series(resA, "A"), borderColor: "#22c55e", backgroundColor: "transparent", tension: 0.25, borderWidth: 2.2, pointRadius: 0 },
    { label: "A · 买", data: series(resA, "B"), borderColor: "#3b82f6", backgroundColor: "transparent", tension: 0.25, borderWidth: 2.2, pointRadius: 0 },
    { label: "B · 租", data: series(resB, "A"), borderColor: "#22c55e", backgroundColor: "transparent", tension: 0.25, borderWidth: 1.8, borderDash: [6, 4], pointRadius: 0 },
    { label: "B · 买", data: series(resB, "B"), borderColor: "#3b82f6", backgroundColor: "transparent", tension: 0.25, borderWidth: 1.8, borderDash: [6, 4], pointRadius: 0 }
  ];

  if (snapshotCompareChart) {
    snapshotCompareChart.destroy();
    snapshotCompareChart = null;
  }
  snapshotCompareChart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      animation: motionUI.chartMotion(),
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, padding: 12 } },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label || ""}: ${fmtMoneyWan(ctx.parsed.y * 10000)}`
          }
        }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: textColor, maxTicksLimit: 11 }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, callback: chartMoneyTick }, grid: { color: gridColor } }
      }
    }
  });
}

const chartBuyYearPlugin = {
  id: "buyYearMarker",
  afterDatasetsDraw(chart) {
    const year = chart.options.plugins?.buyYearMarker?.year;
    if (!year) return;
    const idx = chart.data.labels?.indexOf(`Y${year}`);
    if (idx == null || idx < 0) return;
    const { ctx, chartArea, scales } = chart;
    const x = scales.x.getPixelForValue(idx);
    if (x < chartArea.left || x > chartArea.right) return;
    ctx.save();
    ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(251, 191, 36, 0.95)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText(`购房 Y${year}`, x + 4, chartArea.top + 12);
    ctx.restore();
  }
};
const chartIncomeShockPlugin = {
  id: "incomeShockMarker",
  beforeDatasetsDraw(chart) {
    const cfg = chart.options.plugins?.incomeShockMarker;
    if (!cfg || !cfg.enabled) return;
    const labels = chart.data.labels || [];
    const startIdx = labels.indexOf(`Y${cfg.startYear}`);
    if (startIdx < 0) return;
    const endIdx = labels.indexOf(`Y${cfg.endYear}`);
    const { ctx, chartArea, scales } = chart;
    let xStart = scales.x.getPixelForValue(startIdx);
    let xEnd = endIdx >= 0 ? scales.x.getPixelForValue(endIdx) : chartArea.right;
    xStart = Math.max(chartArea.left, Math.min(chartArea.right, xStart));
    xEnd = Math.max(chartArea.left, Math.min(chartArea.right, xEnd));
    if (xEnd <= xStart) xEnd = Math.min(chartArea.right, xStart + 6);
    ctx.save();
    ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
    ctx.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText("收入冲击", xStart + 4, chartArea.top + 24);
    ctx.restore();
  }
};
const chartRelocationPlugin = {
  id: "relocationMarker",
  beforeDatasetsDraw(chart) {
    const cfg = chart.options.plugins?.relocationMarker;
    if (!cfg || !cfg.enabled) return;
    const labels = chart.data.labels || [];
    const idx = labels.indexOf(`Y${cfg.year}`);
    if (idx < 0) return;
    const { ctx, chartArea, scales } = chart;
    const x = Math.max(chartArea.left, Math.min(chartArea.right, scales.x.getPixelForValue(idx)));
    ctx.save();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(168, 85, 247, 0.95)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText(cfg.label || "搬迁", x + 4, chartArea.top + 12);
    ctx.restore();
  }
};
if (typeof Chart !== "undefined") {
  const hasBuyYearMarkerPlugin = Object.prototype.hasOwnProperty.call(
    Chart.registry.plugins.items,
    chartBuyYearPlugin.id
  );
  if (!hasBuyYearMarkerPlugin) {
    Chart.register(chartBuyYearPlugin);
  }
  const hasIncomeShockPlugin = Object.prototype.hasOwnProperty.call(
    Chart.registry.plugins.items,
    chartIncomeShockPlugin.id
  );
  if (!hasIncomeShockPlugin) {
    Chart.register(chartIncomeShockPlugin);
  }
  const hasRelocationPlugin = Object.prototype.hasOwnProperty.call(
    Chart.registry.plugins.items,
    chartRelocationPlugin.id
  );
  if (!hasRelocationPlugin) {
    Chart.register(chartRelocationPlugin);
  }
}

let curveChart;
let splitChart;
let snapshotCompareChart;

function setTheme(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
  localStorage.setItem("rb_theme", theme);
  state.chartSkin = null;
  const btn = document.getElementById("themeBtn");
  const isDark = theme === "dark";
  const nextLabel = isDark ? "切换到浅色主题" : "切换到深色主题";
  btn.setAttribute("aria-label", nextLabel);
  btn.setAttribute("title", nextLabel);
  btn.querySelector(".theme-toggle-sun")?.classList.toggle("d-none", !isDark);
  btn.querySelector(".theme-toggle-moon")?.classList.toggle("d-none", isDark);
}

function syncPresetHint() {
  const hintEl = document.getElementById("presetHint");
  if (!hintEl) return;
  const preset = LOCATION_PRESETS[state.selectedPreset];
  if (!preset) return;
  const title = preset.name || state.selectedPreset;
  const note = preset.dataNote || "";
  hintEl.textContent = scrubMoneyText(note ? `${title}：${note}` : `${title}：已套用预设参数，可自行微调。`);
}

function isPresetStale() {
  const preset = LOCATION_PRESETS[state.selectedPreset];
  if (!preset) return false;
  return PRESET_TRACK_KEYS.some((k) => preset[k] !== undefined && state.p[k] !== preset[k]);
}

function syncPresetSummary() {
  const el = document.getElementById("presetSummary");
  const preset = LOCATION_PRESETS[state.selectedPreset];
  if (!el || !preset) return;
  const name = preset?.name || (state.selectedPreset ? state.selectedPreset : "自定义");
  const rows = [
    ["当前城市", name],
    ["买房价格", fmtUSD(state.p.housePrice)],
    ["1BR 起租", `${fmtUSD(state.p.rentStart)}/月`],
    ["2BR 月租", `${fmtUSD(state.p.rent2BR)}/月`],
    ["房价涨幅", fmtPercent(state.p.houseApp)],
    ["租金涨幅", fmtPercent(state.p.rentGrowth)]
  ];
  el.innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join("");
}

function syncPresetCustomBadge() {
  const badge = document.getElementById("presetCustomBadge");
  if (!badge) return;
  const stale = isPresetStale();
  const custom = !state.selectedPreset;
  badge.classList.toggle("d-none", !stale && !custom);
  badge.textContent = custom && !stale ? "自定义参数" : "已手动调整";
}

function filterPresetSearch(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  document.querySelectorAll(".preset-region").forEach((region) => {
    let visible = 0;
    region.querySelectorAll(".location-preset-btn").forEach((btn) => {
      const key = btn.dataset.preset;
      const preset = LOCATION_PRESETS[key];
      const hay = `${preset?.name || key} ${key}`.toLowerCase();
      const match = !q || hay.includes(q);
      btn.classList.toggle("is-filtered-out", !match);
      if (match) visible += 1;
    });
    region.classList.toggle("is-filtered-out", visible === 0);
  });
}

function renderLocationPresets() {
  const root = document.getElementById("locationPresets");
  if (!root) return;
  root.innerHTML = PRESET_REGIONS.map((region) => {
    const chips = region.keys
      .filter((key) => LOCATION_PRESETS[key])
      .map((key) => {
        const preset = LOCATION_PRESETS[key];
        const label = preset.name || key;
        return `<button type="button" class="btn btn-sm btn-outline-primary location-preset-btn" data-preset="${key}" role="option" aria-selected="false">${label}</button>`;
      })
      .join("");
    return `<div class="preset-region" data-region="${region.id}"><span class="preset-region-label">${region.label}</span><div class="preset-region-chips">${chips}</div></div>`;
  }).join("");
  root.querySelectorAll(".location-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });
  syncPresetButtons();
  filterPresetSearch(document.getElementById("presetSearch")?.value || "");
}

function scrollActivePresetIntoView() {
  const active = document.querySelector(".location-preset-btn.active");
  active?.scrollIntoView({ block: "nearest", behavior: motionUI.isReduced() ? "auto" : "smooth" });
}

function syncPresetPanel() {
  syncPresetHint();
  syncPresetSummary();
  syncPresetCustomBadge();
  syncPresetButtons();
  syncParamSectionHints();
  syncOwnershipMode();
}

const FILING_SHORT = {
  mfj: "MFJ",
  single: "Single",
  mfs: "MFS",
  unmarried: "伴侣"
};


function syncParamSectionHints() {
  const preset = LOCATION_PRESETS[state.selectedPreset];
  const marketEl = document.getElementById("sectionHintMarket");
  if (marketEl) {
    marketEl.textContent = preset?.name || (state.selectedPreset ? state.selectedPreset : "自定义");
  }
  const purchaseEl = document.getElementById("sectionHintPurchase");
  if (purchaseEl) {
    purchaseEl.textContent = `${fmtPercent(state.p.downPaymentPct)} · ${SCENARIO_SHORT[state.p.houseScenario] || state.p.houseScenario}`;
  }
  const familyEl = document.getElementById("sectionHintFamily");
  if (familyEl) familyEl.textContent = fmtUSD(state.p.familySupport);
  const investEl = document.getElementById("sectionHintInvest");
  if (investEl) {
    investEl.textContent = `${fmtPercent(state.p.stockReturn)} · ${fmtPercent(state.p.mortgageRate)}`;
  }
  const ownershipEl = document.getElementById("sectionHintOwnership");
  if (ownershipEl) {
    const model = state.p.ownershipModel === "capital" ? "Capital" : "Deed";
    ownershipEl.textContent = `${FILING_SHORT[state.p.filingStatus] || state.p.filingStatus} · ${model}`;
  }
  const riskEl = document.getElementById("sectionHintRisk");
  if (riskEl) {
    if (!state.p.incomeShockEnable) {
      riskEl.textContent = "关闭";
    } else {
      const who = state.p.incomeShockTarget === "both" ? "双人" : state.p.incomeShockTarget === "kevin" ? "Kevin" : "Ken";
      const { start, endIncl } = incomeShockWindow(state.p);
      const sevPct = Math.round(clamp(Number(state.p.incomeShockSeverity ?? 1), 0, 1) * 100);
      riskEl.textContent = `${who} · Y${start}-${endIncl} · ${sevPct}%`;
    }
  }
  const reloEl = document.getElementById("sectionHintRelocation");
  if (reloEl) {
    if (!state.p.relocationEnable) {
      reloEl.textContent = "关闭";
    } else {
      const yr = Math.max(1, Math.round(Number(state.p.relocationYear) || 1));
      const modeWord = (state.p.relocationMode || "sell") === "sell" ? "卖房" : "出租";
      reloEl.textContent = `Y${yr} · ${modeWord}`;
    }
  }
}

function syncOwnershipMode() {
  const mode = state.p.ownershipModel === "deed" ? "deed" : "capital";
  document.body.setAttribute("data-ownership", mode);
}

function initParamSections() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PARAM_SECTIONS_KEY) || "{}");
  } catch {
    saved = {};
  }
  document.querySelectorAll(".param-section[data-section]").forEach((section) => {
    const key = section.dataset.section;
    if (typeof saved[key] === "boolean") section.open = saved[key];
  });
}

function bindParamSections() {
  document.querySelectorAll(".param-section[data-section]").forEach((section) => {
    section.addEventListener("toggle", () => {
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(PARAM_SECTIONS_KEY) || "{}");
      } catch {
        saved = {};
      }
      saved[section.dataset.section] = section.open;
      localStorage.setItem(PARAM_SECTIONS_KEY, JSON.stringify(saved));
    });
  });
}

function syncPrivacyMode() {
  const on = state.privacyMode;
  document.body.classList.toggle("privacy-mode", on);
  const btn = document.getElementById("privacyBtn");
  if (btn) {
    const label = on ? "关闭隐私模式" : "开启隐私模式";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", on ? "关闭隐私模式（恢复显示金额）" : "开启隐私模式（隐藏金额，便于分享）");
    btn.classList.toggle("btn-primary", on);
    btn.classList.toggle("btn-outline-secondary", !on);
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector(".privacy-toggle-off")?.classList.toggle("d-none", on);
    btn.querySelector(".privacy-toggle-on")?.classList.toggle("d-none", !on);
  }
  const familyRule = document.getElementById("familySupportRule");
  if (familyRule) {
    familyRule.textContent = on
      ? "分配规则已隐藏（隐私模式）。"
      : "分配规则：前 1 万美元归 Ken；其余部分 Ken/Kevin 各 50%。";
  }
  syncPresetPanel();
}

function syncTaxModeButtonText() {
  const btn = document.getElementById("taxModeBtn");
  const aft = state.afterTax;
  const nextLabel = aft ? "切换到税前账面口径" : "切换到税后清算口径";
  btn.setAttribute("aria-label", nextLabel);
  btn.setAttribute("title", nextLabel);
  btn.classList.toggle("btn-primary", aft);
  btn.classList.toggle("btn-outline-secondary", !aft);
  btn.setAttribute("aria-pressed", String(aft));
  syncTaxModeExplain();
  pulseTaxBadge();
}

function syncTaxModeExplain() {
  const aft = state.afterTax;
  const label = aft ? "税后" : "税前";
  const badgeClass = aft ? "badge text-bg-primary" : "badge text-bg-secondary";
  const lead = document.getElementById("taxModeLead");
  if (lead) {
    lead.textContent = aft ? "变现后净额，含清算税" : "账面净资产，不含变现税";
  }
  const badge = document.getElementById("taxModeBadge");
  if (badge) {
    badge.textContent = label;
    badge.className = badgeClass;
  }
  document.getElementById("taxComparePre")?.classList.toggle("is-active", !aft);
  document.getElementById("taxCompareAft")?.classList.toggle("is-active", aft);
  document.getElementById("taxModeExplain")?.setAttribute("data-tax-mode", aft ? "after" : "pre");
}

function pulseTaxBadge() {
  motionUI.pulse(document.getElementById("taxModeBadge"), "badge-pulse");
}

function syncBandButton() {
  const btn = document.getElementById("bandBtn");
  if (!btn) return;
  const on = state.showBand !== false;
  const label = on ? "隐藏 P10–P90 区间带" : "显示 P10–P90 区间带";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("title", on ? "隐藏 P10–P90 区间带（基于 ±3pp 标普与 Bear/Bull 房价情景）" : "显示 P10–P90 区间带");
  btn.setAttribute("aria-pressed", String(on));
  btn.classList.toggle("btn-primary", on);
  btn.classList.toggle("btn-outline-secondary", !on);
}

function syncViewButtons() {
  const kenBtn = document.getElementById("viewKenBtn");
  const kevinBtn = document.getElementById("viewKevinBtn");
  kenBtn.classList.toggle("active", state.view === "ken");
  kevinBtn.classList.toggle("active", state.view === "kevin");
}

function syncCurveYearButtons() {
  document.querySelectorAll(".curve-years-btn").forEach((btn) => {
    const years = Number(btn.dataset.years);
    const active = years === state.curveYears;
    btn.classList.toggle("active", active);
  });
}

function syncPresetButtons() {
  document.querySelectorAll(".location-preset-btn").forEach((btn) => {
    const active = Boolean(state.selectedPreset) && btn.dataset.preset === state.selectedPreset;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
}

function renderCharts(result) {
  const isMobile = window.matchMedia("(max-width: 576px)").matches;
  const isDark = (document.documentElement.getAttribute("data-bs-theme") || "dark") === "dark";
  const skin = `${isMobile ? "m" : "d"}-${isDark ? "dark" : "light"}`;
  const rebuildCharts = !curveChart || state.chartSkin !== skin;
  state.chartSkin = skin;
  const css = getComputedStyle(document.documentElement);
  const textColor = css.getPropertyValue("--bs-body-color").trim() || "#cbd5e1";
  const gridColor = isDark ? "rgba(148, 163, 184, 0.24)" : "rgba(100, 116, 139, 0.22)";
  const bgColor = css.getPropertyValue("--bs-body-bg").trim() || "#0b1220";
  const chartAnim = motionUI.chartMotion();
  const chartTransitions = motionUI.isReduced()
    ? {}
    : {
        active: { animation: { duration: 320, easing: "easeOutQuart" } },
        resize: { animation: { duration: 0 } }
      };

  const rowsForCurve = result.rows.filter((r) => r.year <= state.curveYears);
  const labels = rowsForCurve.map((r) => `Y${r.year}`);
  const aData = rowsForCurve.map((r) => valueByState(r, "A") / 10000);
  const bData = rowsForCurve.map((r) => valueByState(r, "B") / 10000);
  const baselineSeries = computeBaselineProjection(state.curveYears, result.rows?.[0]);
  const baselineMap = new Map((baselineSeries || []).map((row) => [row.year, row]));
  const baselineData = rowsForCurve.map((r) => {
    const base = baselineMap.get(r.year);
    const val = base ? (state.afterTax ? base.netWorthAfterTax : base.netWorthPreTax) : 0;
    return val / 10000;
  });

  const bandOn = state.showBand !== false;
  let bandData = null;
  if (bandOn) {
    const lowResult = runModel({
      ...state.p,
      stockReturn: clamp((state.p.stockReturn || 0.07) - 0.03, 0.01, 0.2),
      houseScenario: "bear"
    });
    const highResult = runModel({
      ...state.p,
      stockReturn: clamp((state.p.stockReturn || 0.07) + 0.03, 0.01, 0.2),
      houseScenario: "bull"
    });
    const lowMap = new Map(lowResult.rows.map((r) => [r.year, r]));
    const highMap = new Map(highResult.rows.map((r) => [r.year, r]));
    const envelope = (r, strat, edge) => {
      const lo = valueByState(lowMap.get(r.year) || r, strat) / 10000;
      const hi = valueByState(highMap.get(r.year) || r, strat) / 10000;
      return edge === "low" ? Math.min(lo, hi) : Math.max(lo, hi);
    };
    bandData = {
      aLow: rowsForCurve.map((r) => envelope(r, "A", "low")),
      aHigh: rowsForCurve.map((r) => envelope(r, "A", "high")),
      bLow: rowsForCurve.map((r) => envelope(r, "B", "low")),
      bHigh: rowsForCurve.map((r) => envelope(r, "B", "high"))
    };
  }

  const chartTooltipWan = {
    filter: (item) => item.parsed.y > 0 && !String(item.dataset?.label || "").includes("区间"),
    callbacks: {
      label: (ctx) => {
        const raw = ctx.parsed.y * 10000;
        const label = ctx.dataset.label || "";
        return `${label}: ${fmtMoneyWan(raw)}`;
      },
      footer: (items) => {
        if (!items.length) return "";
        const total = items.reduce((sum, i) => sum + i.parsed.y, 0) * 10000;
        return `合计 ${fmtMoneyWan(total)}`;
      }
    }
  };

  const viewLabel = state.view === "ken" ? "Ken" : "Kevin";

  const curveDatasets = [
    {
      label: `租房 + 投资（${viewLabel}）`,
      data: aData,
      borderColor: "#22c55e",
      backgroundColor: "rgba(34,197,94,.15)",
      tension: 0.25,
      borderWidth: 2.2,
      pointRadius: 0,
      order: 1
    },
    {
      label: `买房 + 投资（${viewLabel}）`,
      data: bData,
      borderColor: "#3b82f6",
      backgroundColor: "rgba(59,130,246,.15)",
      tension: 0.25,
      borderWidth: 2.2,
      pointRadius: 0,
      order: 1
    },
    {
      label: `基线（${viewLabel}）`,
      data: baselineData,
      borderColor: "#f59e0b",
      backgroundColor: "rgba(245,158,11,.12)",
      tension: 0.2,
      borderWidth: 1.8,
      borderDash: [6, 4],
      pointRadius: 0,
      order: 2
    }
  ];
  if (bandData) {
    curveDatasets.push(
      {
        label: "区间·租下沿",
        data: bandData.aLow,
        borderColor: "transparent",
        backgroundColor: "transparent",
        borderWidth: 0,
        pointRadius: 0,
        fill: false,
        tension: 0.25,
        order: 9
      },
      {
        label: "区间 P10–P90（租）",
        data: bandData.aHigh,
        borderColor: "transparent",
        backgroundColor: "rgba(34,197,94,.12)",
        borderWidth: 0,
        pointRadius: 0,
        fill: "-1",
        tension: 0.25,
        order: 9
      },
      {
        label: "区间·买下沿",
        data: bandData.bLow,
        borderColor: "transparent",
        backgroundColor: "transparent",
        borderWidth: 0,
        pointRadius: 0,
        fill: false,
        tension: 0.25,
        order: 9
      },
      {
        label: "区间 P10–P90（买）",
        data: bandData.bHigh,
        borderColor: "transparent",
        backgroundColor: "rgba(59,130,246,.12)",
        borderWidth: 0,
        pointRadius: 0,
        fill: "-1",
        tension: 0.25,
        order: 9
      }
    );
  }

  const legendFilter = (item) => !String(item.text || "").includes("下沿");
  const shockWin = incomeShockWindow(state.p);
  const shockMarkerCfg = {
    enabled: Boolean(state.p.incomeShockEnable),
    startYear: shockWin.start,
    endYear: shockWin.endIncl
  };
  const relocationMarkerCfg = {
    enabled: Boolean(state.p.relocationEnable),
    year: Math.max(1, Math.round(Number(state.p.relocationYear) || 1)),
    label: (state.p.relocationMode || "sell") === "sell" ? "搬迁·卖房" : "搬迁·出租"
  };

  if (rebuildCharts && curveChart) {
    curveChart.destroy();
    curveChart = null;
  }
  if (!curveChart) {
    curveChart = new Chart(document.getElementById("curveChart"), {
      type: "line",
      data: { labels, datasets: curveDatasets },
      options: {
        maintainAspectRatio: false,
        animation: chartAnim,
        transitions: chartTransitions,
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { size: isMobile ? 10 : 12 },
              padding: isMobile ? 10 : 14,
              filter: legendFilter
            }
          },
          tooltip: { mode: "index", intersect: false, ...chartTooltipWan },
          buyYearMarker: { year: result.buyYear },
          incomeShockMarker: shockMarkerCfg,
          relocationMarker: relocationMarkerCfg
        },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            ticks: { color: textColor, maxTicksLimit: isMobile ? 7 : 14 },
            grid: { color: gridColor }
          },
          y: {
            ticks: { color: textColor, callback: chartMoneyTick },
            grid: { color: gridColor }
          }
        }
      }
    });
  } else {
    curveChart.data.labels = labels;
    curveChart.data.datasets = curveDatasets;
    curveChart.options.plugins.legend.labels.color = textColor;
    curveChart.options.plugins.legend.labels.filter = legendFilter;
    curveChart.options.scales.x.ticks.color = textColor;
    curveChart.options.scales.y.ticks.color = textColor;
    curveChart.options.scales.x.grid.color = gridColor;
    curveChart.options.scales.y.grid.color = gridColor;
    if (!curveChart.options.plugins) curveChart.options.plugins = {};
    curveChart.options.plugins.buyYearMarker = { year: result.buyYear };
    curveChart.options.plugins.incomeShockMarker = shockMarkerCfg;
    curveChart.options.plugins.relocationMarker = relocationMarkerCfg;
    curveChart.update("active");
  }

  const o = selectedOutcome(result);
  const taxKey = state.afterTax ? "Aft" : "Pre";
  const viewKey = state.view === "ken" ? "ken" : "kevin";
  const rentPort = o[`${viewKey}PortA${taxKey}`] ?? valueByState(o, "A");
  const buyPort = o[`${viewKey}PortB${taxKey}`];
  const buyEq = o[`home${viewKey === "ken" ? "Ken" : "Kevin"}${taxKey}`];

  if (rebuildCharts && splitChart) {
    splitChart.destroy();
    splitChart = null;
  }
  const splitLabels = isMobile ? ["租房", "买房"] : ["租房 + 投资", "买房 + 投资"];
  const splitData = {
    labels: splitLabels,
    datasets: [
      {
        label: "投资组合",
        data: [rentPort / 10000, 0],
        backgroundColor: "#22c55e",
        borderRadius: 8,
        stack: "stack"
      },
      {
        label: "股票资产",
        data: [0, buyPort / 10000],
        backgroundColor: "#60a5fa",
        borderRadius: buyEq > 0 ? 0 : 8,
        stack: "stack"
      },
      {
        label: "房屋净值",
        data: [0, Math.max(0, buyEq) / 10000],
        backgroundColor: "#a78bfa",
        borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
        stack: "stack"
      }
    ]
  };
  if (!splitChart) {
    splitChart = new Chart(document.getElementById("splitChart"), {
      type: "bar",
      data: splitData,
      options: {
        maintainAspectRatio: false,
        animation: chartAnim,
        transitions: chartTransitions,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              color: textColor,
              font: { size: isMobile ? 10 : 11 },
              boxWidth: 12,
              padding: isMobile ? 8 : 12
            }
          },
          tooltip: { mode: "index", intersect: false, ...chartTooltipWan }
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: textColor,
              font: { size: isMobile ? 10 : 12 },
              maxRotation: 0,
              minRotation: 0
            },
            grid: { display: false }
          },
          y: {
            stacked: true,
            ticks: { color: textColor, callback: chartMoneyTick },
            grid: { color: gridColor }
          }
        }
      }
    });
  } else {
    splitChart.data.labels = splitData.labels;
    splitChart.data.datasets.forEach((ds, i) => {
      ds.data = splitData.datasets[i].data;
      ds.borderRadius = splitData.datasets[i].borderRadius;
    });
    splitChart.options.plugins.legend.labels.color = textColor;
    splitChart.options.scales.x.ticks.color = textColor;
    splitChart.options.scales.y.ticks.color = textColor;
    splitChart.options.scales.y.grid.color = gridColor;
    splitChart.update("active");
  }

  const enabledEvents = (state.timelineEvents || []).filter((e) => e.enabled !== false).length;
  document.getElementById("curveNote").textContent = `${state.horizon}年 · ${viewLabel} · ${state.afterTax ? "税后" : "税前"} · 万美元 · 含基线${enabledEvents ? ` · 事件${enabledEvents}个` : ""}${result.buyYear ? ` · 购房 Y${result.buyYear}` : ""}`;
  document.body.style.backgroundColor = bgColor;
}

function renderText(result) {
  const o = selectedOutcome(result);
  const vA = valueByState(o, "A");
  const vB = valueByState(o, "B");
  const viewLabel = state.view === "ken" ? "Ken" : "Kevin";
  const winner = vA >= vB ? "租房 + 投资" : "买房 + 投资";
  const diff = Math.abs(vA - vB);
  const breakEven = findBreakEven(state.p, {
    view: state.view,
    afterTax: state.afterTax,
    horizon: state.horizon
  });
  const homeKey = `home${state.view === "ken" ? "Ken" : "Kevin"}${state.afterTax ? "Aft" : "Pre"}`;
  const portKey = `${state.view}PortB${state.afterTax ? "Aft" : "Pre"}`;

  renderDecisionHeader(result, state.p, modelOptsFromState());
  renderCashflowRunway(result);
  syncFamilySupport3520();

  const portKeyA = `${state.view}PortA${state.afterTax ? "Aft" : "Pre"}`;
  const rentEl = document.getElementById("rentValue");
  const buyEl = document.getElementById("buyValue");
  const winnerEl = document.getElementById("winnerLine");
  const winnerRent = vA >= vB;

  motionUI.tweenKpi(rentEl, state.kpiCache.rent, vA, fmtMoneyShort);
  motionUI.tweenKpi(buyEl, state.kpiCache.buy, vB, fmtMoneyShort);

  document.getElementById("metricRentCard")?.classList.toggle("metric-card--lead", winnerRent);
  document.getElementById("metricBuyCard")?.classList.toggle("metric-card--lead", !winnerRent);

  if (state.kpiCache.winner != null && state.kpiCache.winner !== winner) {
    motionUI.pulse(winnerEl);
    motionUI.pulse(document.getElementById("metricKeyCard"));
  }
  state.kpiCache = { rent: vA, buy: vB, winner };

  const buyTimingText = result.buyYear ? `第${result.buyYear}年购入（约 ${fmtUSD(result.buyPrice)}）` : `${state.p.maxYears}年内未达购房阈值`;
  motionUI.setSubline(
    document.getElementById("rentSubline"),
    `${viewLabel}股票资产约 ${fmtMoneyShort(o[portKeyA])} · ${state.horizon}年末`
  );
  motionUI.setSubline(
    document.getElementById("buySubline"),
    `${viewLabel}房屋 ${fmtMoneyShort(o[homeKey])} · 股票 ${fmtMoneyShort(o[portKey])} · ${buyTimingText}`
  );
  document.getElementById("kpiContextLabel").textContent = `${state.horizon}年 · ${viewLabel} · ${state.afterTax ? "税后" : "税前"}`;
  winnerEl.textContent = winner;
  motionUI.setSubline(
    document.getElementById("metaLine"),
    `领先 ${fmtMoneyShort(diff)} · 平衡标普 ${breakEven ? fmtPercent(breakEven) : "—"}`
  );

  const dpPct = state.p.downPaymentPct ?? 0.20;
  const dpPctLabel = `${(dpPct * 100).toFixed(dpPct * 100 % 1 === 0 ? 0 : 1)}%`;
  const targetDPNow = state.p.housePrice * dpPct;
  const dp20pct = targetDPNow > 0 ? result.houseDP / targetDPNow : 0;
  const dpAlert = document.getElementById("dpAlert");
  if (!result.buyYear) {
    motionUI.setDpAlert(
      dpAlert,
      true,
      `当前模型下，${state.p.maxYears}年内仍无法满足“${dpPctLabel}首付+closing”净现金门槛，因此买房方案将持续租住并投资。可通过提高储蓄、降低房价、降低首付比例或延长周期来触发购房。`
    );
  } else if (dp20pct < 0.995) {
    motionUI.setDpAlert(
      dpAlert,
      true,
      `已在第${result.buyYear}年购入：目标首付 ${fmtUSD(result.targetDPAtBuy)}，closing约 ${fmtUSD(result.houseClose)}，为满足净现金 ${fmtUSD(result.upfrontNeedAtBuy)} 实际卖出约 ${fmtUSD(result.dpGrossSale)}，税负约 ${fmtUSD(result.dpLiqTax)}。`
    );
  } else {
    motionUI.setDpAlert(dpAlert, false);
  }

  const insights = state.privacyMode
    ? [
        `${viewLabel}视角下，${state.horizon}年口径${winner}领先（${state.afterTax ? "税后" : "税前"}，金额已隐藏）。`,
        `Ken/Kevin 薪资、初始存款与父母赞助已隐藏；模型仍按内部假设运行。`,
        `当前报税身份：${result.filingStatus.toUpperCase()}；权益模型：${state.p.ownershipModel === "capital" ? "Capital account" : "Deed split"}。`,
        `房价情景：${state.p.houseScenario.toUpperCase()}，有效房价涨幅约 ${fmtPercent(result.adjustedHouseApp)}。`,
        `持房费用与薪资路径的具体美元数已隐藏；费用结构仍计入模型。`,
        `地点预设保留城市与涨跌假设，市场美元数值已脱敏。`,
        `标普名义收益 ${fmtPercent(state.p.stockReturn)}，行为折损 ${fmtPercent(state.p.behaviorGap)}，模型有效收益约 ${fmtPercent(state.p.stockReturn - state.p.behaviorGap)}。`,
        `税后口径为快照年假设清算净额，不等同真实报税现金流。`,
        `长期税务参数属于模型假设，不代表未来税法承诺。`
      ]
    : [
        `${viewLabel}视角下，${state.horizon}年口径${winner}领先约 ${fmtMoneyShort(diff)}（${state.afterTax ? "税后" : "税前"}）。`,
        `父母赞助（当前 ${fmtUSD(state.p.familySupport)}）按“前 1 万美元归 Ken，其余 Ken/Kevin 平分”进入 A/B 两方案，比较只反映住房策略差异。`,
        `当前报税身份：${result.filingStatus.toUpperCase()}；权益模型：${state.p.ownershipModel === "capital" ? "Capital account" : "Deed split"}。`,
        `房价情景：${state.p.houseScenario.toUpperCase()}（Bear=-2.0pp，Base=0，Bull=+1.2pp），有效房价涨幅约 ${fmtPercent(result.adjustedHouseApp)}。`,
        `持有成本拆解：HOA ${fmtUSD(state.p.houseHOA)}/月、房屋险 ${fmtUSD(state.p.homeownersIns)}/月、地震险 ${fmtUSD(state.p.earthquakeIns)}/月、水电杂费 ${fmtUSD(state.p.houseUtilities)}/月。`,
        `Ken薪资路径：2023起薪 ${fmtUSD(state.p.kenStartSalary)}，按UX平均年增 ${(state.p.kenCareerGrowth * 100).toFixed(1)}%。`,
        `Kevin薪资路径：2028年末入职（按2029全年起算），起薪 ${fmtUSD(state.p.kevinStartSalary)}，按药师平均年增 ${(state.p.kevinCareerGrowth * 100).toFixed(1)}%。`,
        `地点预设会联动房价、租金与 2030 年后 2B1B 切换锚点，属近似假设并非投资建议，可随时手动覆盖。`,
        `标普名义收益 ${fmtPercent(state.p.stockReturn)}，行为折损 ${fmtPercent(state.p.behaviorGap)}，模型有效收益约 ${fmtPercent(state.p.stockReturn - state.p.behaviorGap)}。`,
        `税后口径=在所选快照年“假设清算”后的净额，不等同于该年度真实报税现金流。`,
        `长期税务参数（阈值、扣除、通胀）属于模型假设，不代表未来税法承诺。`
      ];
  if (state.p.incomeShockEnable) {
    const who = state.p.incomeShockTarget === "both" ? "Ken + Kevin" : state.p.incomeShockTarget === "kevin" ? "Kevin" : "Ken";
    const { start, endIncl } = incomeShockWindow(state.p);
    const sevPct = Math.round(clamp(Number(state.p.incomeShockSeverity ?? 1), 0, 1) * 100);
    const lossWord = sevPct >= 100 ? "收入归零" : `损失 ${sevPct}% 收入`;
    insights.unshift(
      state.privacyMode
        ? `收入冲击情景已启用：${who} 第 ${start}–${endIncl} 年收入按设定削减，已计入现金流与跑道判定。`
        : `⚠️ 收入冲击：${who} 第 ${start}–${endIncl} 年${lossWord}，已计入月现金流与流动性跑道；可观察是否击穿安全垫。`
    );
  }
  if (state.p.relocationEnable) {
    const yr = Math.max(1, Math.round(Number(state.p.relocationYear) || 1));
    const sell = (state.p.relocationMode || "sell") === "sell";
    const houseWord = sell ? "卖房清算、净额转入投资组合" : "保留房产出租（假设租金覆盖持房成本）";
    insights.unshift(
      state.privacyMode
        ? `搬迁/离场情景已启用：第 ${yr} 年起切换为海外收入与住房口径，买房路径${sell ? "卖房" : "保留出租"}。`
        : `⚑ 搬迁/离场：第 ${yr} 年起收入换算为海外水平、住房改按设定支出，买房路径${houseWord}；跨境税务按现有美国口径近似，非税务建议。`
    );
  }
  const insightsEl = document.getElementById("insights");
  insightsEl.innerHTML = insights.map((item) => `<li>${item}</li>`).join("");
  motionUI.refreshInsights(insightsEl);
  syncRent2B1BHint();

  const tableData = [5, 7, 20].map((y) => ({ y, row: result.outcomes[y] }));
  const refLeadA = vA >= vB;
  const buyYearLabel = result.buyYear ? `Y${result.buyYear}` : "—";
  const tbody = document.getElementById("horizonTableBody");
  tbody.innerHTML = tableData.map(({ y, row }) => {
    const a = valueByState(row, "A");
    const b = valueByState(row, "B");
    const leadA = a >= b;
    const d = Math.abs(a - b);
    const base = Math.max(a, b, 1);
    const pct = ((d / base) * 100).toFixed(1);
    const rowClasses = [
      y === state.horizon ? "row-horizon-active" : "",
      leadA !== refLeadA ? "row-reversal" : ""
    ]
      .filter(Boolean)
      .join(" ");
    return `
      <tr class="${rowClasses}">
        <td>${y}年</td>
        <td>${fmtMoneyShort(a)}</td>
        <td>${fmtMoneyShort(b)}</td>
        <td>${fmtMoneyShort(d)}</td>
        <td>${pct}%</td>
        <td><span class="badge text-bg-${leadA ? "success" : "primary"}">${leadA ? "租房 + 投资" : "买房 + 投资"}</span></td>
        <td>${buyYearLabel}</td>
      </tr>
    `;
  }).join("");
}

const PRESET_PARAM_KEYS = ["housePrice", "houseApp", "rentGrowth", "rentStart", "rent2BR", "rent2B1B", "propTaxRate", "hoaGrowth"];

function applyPreset(presetKey, opts = {}) {
  const preset = LOCATION_PRESETS[presetKey];
  if (!preset) return;
  state.selectedPreset = presetKey;
  const housePriceInput = document.getElementById("housePrice");
  if (housePriceInput) {
    const currMax = Number(housePriceInput.max || 0);
    if (preset.housePrice > currMax) {
      housePriceInput.max = String(Math.ceil(preset.housePrice / 100000) * 100000);
    }
  }
  PRESET_PARAM_KEYS.forEach((k) => {
    if (preset[k] !== undefined) state.p[k] = preset[k];
  });
  if (preset.rent2BR !== undefined && preset.rent2B1B === undefined) {
    state.p.rent2B1B = Math.round(preset.rent2BR * (state.p.rent2b1bTo2brRatio ?? 0.92));
  }
  syncPresetPanel();
  if (opts.skipSync) return;
  syncInputs();
  rerender();
  requestAnimationFrame(() => scrollActivePresetIntoView());
}

function syncInputs() {
  const map = [
    ["stockReturn", "stockReturnVal", (v) => fmtPercent(v)],
    ["mortgageRate", "mortgageRateVal", (v) => fmtPercent(v)],
    ["houseApp", "houseAppVal", (v) => fmtPercent(v)],
    ["rentGrowth", "rentGrowthVal", (v) => fmtPercent(v)],
    ["housePrice", "housePriceVal", (v) => fmtUSD(v)],
    ["familySupport", "familySupportVal", (v) => fmtUSD(v)],
    ["downPaymentPct", "downPaymentPctVal", (v) => fmtPercent(v)],
    ["deedKenShare", "deedKenShareVal", (v) => fmtPercent(v)],
    ["kevinBuyInPct", "kevinBuyInPctVal", (v) => fmtPercent(v)],
    ["incomeShockStartYear", "incomeShockStartYearVal", (v) => `第${Math.round(v)}年`],
    ["incomeShockDurationYears", "incomeShockDurationYearsVal", (v) => `${Math.round(v)}年`],
    ["incomeShockSeverity", "incomeShockSeverityVal", (v) => fmtPercent(v)],
    ["relocationYear", "relocationYearVal", (v) => `第${Math.round(v)}年`],
    ["relocationKenSalary", "relocationKenSalaryVal", (v) => fmtUSD(v)],
    ["relocationKevinSalary", "relocationKevinSalaryVal", (v) => fmtUSD(v)],
    ["relocationHousingMonthly", "relocationHousingMonthlyVal", (v) => `${fmtUSD(v)}/月`]
  ];
  map.forEach(([id, valId, fmt]) => {
    const input = document.getElementById(id);
    if (id === "housePrice" && state.p.housePrice > Number(input.max || 0)) {
      input.max = String(Math.ceil(state.p.housePrice / 100000) * 100000);
    }
    input.value = state.p[id];
    const valEl = document.getElementById(valId);
    valEl.textContent = fmt(Number(input.value));
    valEl.classList.add("param-value-live");
    input.oninput = () => {
      state.p[id] = Number(input.value);
      valEl.textContent = fmt(Number(input.value));
      motionUI.flashParamValue(valEl);
      if (id === "housePrice" || id === "houseApp" || id === "rentGrowth") {
        state.selectedPreset = "";
        if (id === "rentGrowth") syncRent2B1BHint();
      }
      if (id === "familySupport") syncFamilySupport3520();
      if (id.startsWith("incomeShock")) syncIncomeShockHint();
      if (id.startsWith("relocation")) syncRelocationHint();
      syncPresetPanel();
      scheduleRerender();
    };
  });

  ["applyWACGT", "applyTxCosts", "mortgageDeduction", "enableKevinBuyIn", "enforceHomeSaleEligibility", "capitalTrackLargeRepairs", "enableRent2B1BSwitch", "incomeShockEnable", "relocationEnable"].forEach((id) => {
    const el = document.getElementById(id);
    el.checked = Boolean(state.p[id]);
    el.onchange = () => {
      state.p[id] = el.checked;
      syncRent2B1BHint();
      if (id === "incomeShockEnable") syncIncomeShockHint();
      if (id === "relocationEnable") syncRelocationHint();
      rerender();
    };
  });

  ["filingStatus", "houseScenario", "ownershipModel", "incomeShockTarget", "relocationMode"].forEach((id) => {
    const el = document.getElementById(id);
    el.value = state.p[id];
    el.onchange = () => {
      state.p[id] = el.value;
      if (id === "ownershipModel") syncOwnershipMode();
      if (id === "incomeShockTarget") syncIncomeShockHint();
      if (id === "relocationMode") syncRelocationHint();
      syncParamSectionHints();
      rerender();
    };
  });
  syncRent2B1BHint();
  syncIncomeShockHint();
  syncRelocationHint();
}

function rerender() {
  motionUI.setWorkspaceUpdating(true);
  appStore?.setState(state);
  if (LOCK_CURVE_TO_HORIZON) state.curveYears = state.horizon;
  ensureGoalControls();
  renderTimelinePanel();
  const result = runModel(state.p);
  runEngineRegressionFixture(result);
  renderText(result);
  renderCharts(result);
  syncPresetPanel();
  requestAnimationFrame(() => motionUI.setWorkspaceUpdating(false));
  persistState();
}

let rerenderTimer = null;
function scheduleRerender(delayMs = 140) {
  if (rerenderTimer) clearTimeout(rerenderTimer);
  motionUI.setWorkspaceUpdating(true);
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    rerender();
  }, delayMs);
}

let viewportMode = window.matchMedia("(max-width: 576px)").matches ? "mobile" : "desktop";
function handleViewportResize() {
  const nextMode = window.matchMedia("(max-width: 576px)").matches ? "mobile" : "desktop";
  if (nextMode !== viewportMode) {
    viewportMode = nextMode;
    state.chartSkin = null;
  }
  scheduleRerender(80);
}

function bindEvents() {
  document.querySelectorAll(".horizon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.horizon = Number(btn.dataset.horizon);
      if (LOCK_CURVE_TO_HORIZON) state.curveYears = state.horizon;
      syncHorizonButtons();
      rerender();
    });
  });

  document.querySelectorAll(".curve-years-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.curveYears = Number(btn.dataset.years);
      syncCurveYearButtons();
      rerender();
    });
  });

  document.getElementById("presetSearch")?.addEventListener("input", (e) => {
    filterPresetSearch(e.target.value);
  });

  document.getElementById("viewKenBtn").addEventListener("click", () => {
    state.view = "ken";
    syncViewButtons();
    rerender();
  });

  document.getElementById("viewKevinBtn").addEventListener("click", () => {
    state.view = "kevin";
    syncViewButtons();
    rerender();
  });

  document.getElementById("taxModeBtn").addEventListener("click", () => {
    state.afterTax = !state.afterTax;
    syncTaxModeButtonText();
    rerender();
  });

  document.getElementById("exportAssumptionsBtn")?.addEventListener("click", exportAssumptionsSnapshot);

  document.getElementById("privacyBtn").addEventListener("click", () => {
    state.privacyMode = !state.privacyMode;
    state.kpiCache = { rent: null, buy: null, winner: null };
    syncPrivacyMode();
    syncInputs();
    renderSnapshotPanel();
    rerender();
  });

  document.getElementById("themeBtn").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-bs-theme") || "dark";
    setTheme(current === "dark" ? "light" : "dark");
    rerender();
  });

  document.getElementById("bandBtn")?.addEventListener("click", () => {
    state.showBand = !state.showBand;
    syncBandButton();
    rerender();
  });

  document.getElementById("snapshotSaveForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("snapshotNameInput");
    addSnapshot((input?.value || "").trim());
    if (input) input.value = "";
  });

  document.getElementById("relocationTemplateBtn")?.addEventListener("click", () => {
    Object.assign(state.p, {
      relocationEnable: true,
      relocationMode: "sell",
      relocationYear: 5,
      relocationKenSalary: 60000,
      relocationKevinSalary: 50000,
      relocationHousingMonthly: 1500
    });
    const section = document.querySelector('.param-section[data-section="relocation"]');
    if (section) section.open = true;
    syncInputs();
    rerender();
  });

  window.addEventListener("resize", handleViewportResize);
}

(function init() {
  const savedTheme = localStorage.getItem("rb_theme");
  setTheme(savedTheme || "dark");
  const paramDetails = document.getElementById("paramDetails");
  if (window.matchMedia("(max-width: 576px)").matches && paramDetails) {
    paramDetails.open = false;
  }

  renderLocationPresets();

  const restored = loadPersistedState();
  if (!restored) {
    applyPreset(state.selectedPreset || "lynnwood", { skipSync: true });
  }

  syncTaxModeButtonText();
  syncPrivacyMode();
  syncBandButton();
  syncHorizonButtons();
  syncViewButtons();
  syncCurveYearButtons();
  syncPresetPanel();
  syncOwnershipMode();
  initParamSections();
  ensureGoalControls();
  syncInputs();
  loadSnapshots();
  renderSnapshotPanel();
  bindEvents();
  bindParamSections();
  rerender();
  requestAnimationFrame(() => scrollActivePresetIntoView());
  requestAnimationFrame(() => {
    document.getElementById("kpiRow")?.classList.add("is-entered");
  });
})();
