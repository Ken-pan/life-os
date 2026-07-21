/**
 * State Engine v1 — 六维状态推导(纯函数,零依赖,可直接跑 node --test)。
 *
 * 纯信号驱动:六维全部从 Apple Health 测量(HRV、静息心率、睡眠、步数、活动能量、
 * 锻炼/Workout)相对个人基线,加 Focus 代理负荷推导——**不需要任何手动输入**。
 * 缺测量数据时如实 unknown 并引导 Kenos iOS → Apple Health,绝不退回手动表单。
 *
 * 原则:Raw observation ≠ Interpretation。本文件只做 Interpretation;原始测量的采集
 * 在 Kenos iOS HealthKit → Mac 代理 health.jsonl。每维输出 level + 结构化 reasons
 * (来源可解释),绝不给无法追溯的裸分数。
 *
 * level:good(好)/ ok(正常)/ watch(开始恶化)/ bad(该干预)/ unknown(缺数据,不编)。
 */

export const DIMENSION_ORDER = [
  'energy',
  'focus',
  'recovery',
  'stress',
  'sleepDebt',
  'physical',
]

/** 综合结论排查优先级:先看谁最需要处理 */
const HEADLINE_PRIORITY = [
  'stress',
  'sleepDebt',
  'recovery',
  'energy',
  'physical',
  'focus',
]

const HOUR = 3600 * 1000
const MIN_BASELINE = 4 // 建立个人基线所需的最少历史天数

// ---------- 测量数据选择器(纯) ----------

function isoDate(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** 今日该指标的测量值:优先今天的 health 条目,否则回落到 1 天内最近一条 */
function pickToday(health, key, now) {
  const todayStr = isoDate(now)
  const withKey = health.filter((d) => typeof d?.[key] === 'number' && d.date)
  const today = withKey.find((d) => d.date === todayStr)
  if (today) return { value: today[key], date: today.date, fresh: true }
  const sorted = [...withKey].sort((a, b) => (a.date < b.date ? 1 : -1))
  const last = sorted[0]
  if (last && Date.parse(`${last.date}T23:59:59`) >= now - 36 * HOUR) {
    return { value: last[key], date: last.date, fresh: false }
  }
  return null
}

/** 个人基线:排除今天,取该指标历史中位数;样本不足返回 {value:null,n} */
function baselineOf(health, key, now) {
  const todayStr = isoDate(now)
  const vals = health
    .filter(
      (d) => typeof d?.[key] === 'number' && d.date && d.date !== todayStr,
    )
    .map((d) => d[key])
  return {
    value: vals.length >= MIN_BASELINE ? median(vals) : null,
    n: vals.length,
  }
}

/** Apple Health 天数据 → 睡眠观察(measured) */
export function healthDaysToSleepObs(days) {
  if (!Array.isArray(days)) return []
  return days
    .filter((d) => d && d.date && typeof d.sleepHours === 'number')
    .map((d) => ({
      ts: new Date(`${d.date}T08:00:00`).getTime(),
      type: 'sleep',
      hours: d.sleepHours,
    }))
}

/** 最近的睡眠(今天/昨天算“昨晚”)+ 近几晚(用于均值) */
export function recentSleeps(days, now, n = 3) {
  const obs = healthDaysToSleepObs(days).sort((a, b) => a.ts - b.ts)
  const recent = obs.slice(-n).reverse()
  const last = recent[0] && now - recent[0].ts <= 36 * HOUR ? recent[0] : null
  return { last, recent }
}

// ---------- HLT-4 跨日趋势 ----------

/**
 * 把某指标对齐到最近 days 个连续日历日(含今天),缺的天填 null。
 * 返回 { labels:['7-10',…], iso:['2026-07-10',…], values:[7.2,null,…] } 供图表用。
 * @param {Array} health [{date, [key]:number}]
 * @param {string} key   'sleepHours' | 'hrv' | 'restingHR' | 'steps'
 * @param {number} days
 * @param {number} now   epoch ms(锚定“今天”)
 */
export function metricSeries(health, key, days, now) {
  const byDate = new Map()
  for (const d of health ?? []) {
    if (d?.date && typeof d[key] === 'number') byDate.set(d.date, d[key])
  }
  const labels = []
  const iso = []
  const values = []
  const base = new Date(now)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const p = (n) => String(n).padStart(2, '0')
    const key2 = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    iso.push(key2)
    labels.push(`${d.getMonth() + 1}-${d.getDate()}`)
    values.push(byDate.has(key2) ? byDate.get(key2) : null)
  }
  return { labels, iso, values }
}

const avg = (nums) => {
  const v = nums.filter((n) => typeof n === 'number')
  return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null
}

/**
 * 近 window 天均值 + 相对前 window 天的变化方向。
 * @returns { recent:number|null, prior:number|null, delta:number|null, dir:'up'|'down'|'flat'|'na', n:number }
 */
export function trendSummary(values, window = 7) {
  const recent = avg(values.slice(-window))
  const prior = avg(values.slice(-2 * window, -window))
  if (recent == null)
    return { recent: null, prior, delta: null, dir: 'na', n: 0 }
  const n = values.slice(-window).filter((v) => typeof v === 'number').length
  if (prior == null) return { recent, prior: null, delta: null, dir: 'na', n }
  const delta = recent - prior
  const rel = Math.abs(delta) / (Math.abs(prior) || 1)
  const dir = rel < 0.03 ? 'flat' : delta > 0 ? 'up' : 'down'
  return { recent, prior, delta, dir, n }
}

/**
 * HLT-3 自适应专注窗口:睡眠债/压力/恢复/精力/身体准备度越差,窗口越紧。
 * @param {Record<string,{level:string}>} dims
 * @param {number} baseMinutes 代理基准窗口
 */
export function recommendPolicy(dims, baseMinutes = 20) {
  const rank = { good: 0, ok: 0, unknown: 0, watch: 1, bad: 2 }
  let sev = 0
  let driver = null
  for (const k of ['sleepDebt', 'stress', 'recovery', 'energy', 'physical']) {
    const r = rank[dims?.[k]?.level] ?? 0
    if (r > sev) {
      sev = r
      driver = k
    }
  }
  if (sev === 0) return { limitMinutes: baseMinutes, driver: null }
  const limitMinutes = Math.min(baseMinutes, sev >= 2 ? 12 : 16)
  return { limitMinutes, driver }
}

/**
 * 今日活动 / 训练对账(纯函数)。供 Now 页与后续 Fitness 摘要消费。
 * @returns {{
 *   trained: boolean,
 *   workoutCount: number,
 *   workoutMinutes: number|null,
 *   exerciseMinutes: number|null,
 *   activeEnergyKcal: number|null,
 *   standMinutes: number|null,
 *   steps: number|null,
 * }}
 */
export function todayTrainingLedger(health, now) {
  const workoutCount = pickToday(health, 'workoutCount', now)
  const workoutMinutes = pickToday(health, 'workoutMinutes', now)
  const exerciseMinutes = pickToday(health, 'exerciseMinutes', now)
  const activeEnergy = pickToday(health, 'activeEnergyKcal', now)
  const standMinutes = pickToday(health, 'standMinutes', now)
  const steps = pickToday(health, 'steps', now)
  const wc = workoutCount?.value ?? 0
  const wm = workoutMinutes?.value ?? null
  const em = exerciseMinutes?.value ?? null
  const trained =
    wc >= 1 || (wm != null && wm >= 15) || (em != null && em >= 30)
  return {
    trained,
    workoutCount: wc,
    workoutMinutes: wm,
    exerciseMinutes: em,
    activeEnergyKcal: activeEnergy?.value ?? null,
    standMinutes: standMinutes?.value ?? null,
    steps: steps?.value ?? null,
  }
}

/**
 * 今日训练建议码(不读明细跨 OS,只消费 dims + ledger)。
 * @returns {{ code: 'recover'|'already_trained'|'easy'|'ok_to_train'|'unknown', k: string }}
 */
export function trainingRecommendation(dims, ledger) {
  const phys = dims?.physical?.level
  const rec = dims?.recovery?.level
  const debt = dims?.sleepDebt?.level
  if (phys === 'bad' || rec === 'bad' || debt === 'bad') {
    return { code: 'recover', k: 'now.trainRecover' }
  }
  if (ledger?.trained) {
    return { code: 'already_trained', k: 'now.trainAlready' }
  }
  if (
    phys === 'unknown' &&
    ledger?.steps == null &&
    ledger?.exerciseMinutes == null
  ) {
    return { code: 'unknown', k: 'now.trainUnknown' }
  }
  if (phys === 'watch' || rec === 'watch') {
    return { code: 'easy', k: 'now.trainEasy' }
  }
  return { code: 'ok_to_train', k: 'now.trainOk' }
}

/**
 * 活动量相对个人基线(或绝对阈值)→ level。无信号返回 null。
 * @param {{ value:number }|null} stepsToday
 * @param {{ value:number|null, n:number }} stepsBase
 * @param {{ value:number }|null} energyToday
 * @param {{ value:number|null, n:number }} energyBase
 * @param {{ value:number }|null} exerciseToday
 */
export function activityLevel(
  stepsToday,
  stepsBase,
  energyToday,
  energyBase,
  exerciseToday,
) {
  const ratios = []
  if (stepsToday && stepsBase?.value)
    ratios.push(stepsToday.value / stepsBase.value)
  if (energyToday && energyBase?.value)
    ratios.push(energyToday.value / energyBase.value)
  if (ratios.length) {
    const r = ratios.reduce((s, n) => s + n, 0) / ratios.length
    if (r >= 0.85) return 'good'
    if (r >= 0.55) return 'ok'
    if (r >= 0.35) return 'watch'
    return 'bad'
  }
  const ex = exerciseToday?.value
  const steps = stepsToday?.value
  if (ex != null && ex >= 30) return 'good'
  if (steps != null) {
    if (steps >= 8000) return 'good'
    if (steps >= 5000) return 'ok'
    if (steps >= 2500) return 'watch'
    return 'bad'
  }
  if (ex != null) {
    if (ex >= 20) return 'ok'
    if (ex >= 10) return 'watch'
    return 'bad'
  }
  if (energyToday?.value != null) {
    if (energyToday.value >= 500) return 'good'
    if (energyToday.value >= 300) return 'ok'
    if (energyToday.value >= 150) return 'watch'
    return 'bad'
  }
  return null
}

// ---------- 推导 ----------

/** HRV 相对基线:高 = 恢复好/压力低 */
function hrvRatioLevel(ratio) {
  if (ratio >= 0.95) return 'good'
  if (ratio >= 0.85) return 'ok'
  if (ratio >= 0.75) return 'watch'
  return 'bad'
}

/** 静息心率相对基线的升高幅度:升得越多 = 恢复越差 */
function rhrDeltaLevel(delta) {
  if (delta <= 2) return 'good'
  if (delta <= 5) return 'ok'
  if (delta <= 9) return 'watch'
  return 'bad'
}

const RANK = { good: 0, ok: 1, watch: 2, bad: 3 }
const worseOf = (...levels) =>
  levels.reduce((w, l) => (RANK[l] > RANK[w] ? l : w), 'good')

function sleepLevel(h) {
  return h >= 7 ? 'good' : h >= 6 ? 'ok' : h >= 5 ? 'watch' : 'bad'
}
function stepDown(level) {
  const order = ['good', 'ok', 'watch', 'bad']
  return order[Math.min(order.length - 1, order.indexOf(level) + 1)]
}

/**
 * @param {object} input
 * @param {number} input.now      epoch ms
 * @param {Array}  input.health   [{date, sleepHours?, restingHR?, hrv?, steps?, activeEnergyKcal?, exerciseMinutes?, standMinutes?, workoutCount?, workoutMinutes?}]
 * @param {object} input.agent    { online, phase, score, limitSeconds, note, breaksToday, todayNetMinutes, warnsToday }
 * @returns {{ dims: Record<string,{level,reasons}>, headline: {k,p?} }}
 */
export function deriveState({ now, health, agent }) {
  const H = Array.isArray(health) ? health : []
  const a = agent ?? { online: false }
  const netMin = Math.max(0, Math.round(a.todayNetMinutes ?? 0))
  const dims = {}

  // 共用测量信号
  const { last: sleepLast, recent: sleeps } = recentSleeps(H, now)
  const hrvToday = pickToday(H, 'hrv', now)
  const hrvBase = baselineOf(H, 'hrv', now)
  const rhrToday = pickToday(H, 'restingHR', now)
  const rhrBase = baselineOf(H, 'restingHR', now)
  const stepsToday = pickToday(H, 'steps', now)
  const stepsBase = baselineOf(H, 'steps', now)
  const energyToday = pickToday(H, 'activeEnergyKcal', now)
  const energyBase = baselineOf(H, 'activeEnergyKcal', now)
  const exerciseToday = pickToday(H, 'exerciseMinutes', now)
  const standToday = pickToday(H, 'standMinutes', now)
  const workoutMinutesToday = pickToday(H, 'workoutMinutes', now)
  const ledger = todayTrainingLedger(H, now)

  const hrvRatio =
    hrvToday && hrvBase.value ? hrvToday.value / hrvBase.value : null
  const rhrDelta =
    rhrToday && rhrBase.value ? rhrToday.value - rhrBase.value : null

  // ---- Focus:代理实时相位 ----
  if (!a.online) {
    dims.focus = { level: 'unknown', reasons: [{ k: 'state.r_agentOffline' }] }
  } else if (a.phase === 'breaking') {
    dims.focus = { level: 'ok', reasons: [{ k: 'state.r_break' }] }
  } else {
    const limit = Math.max(1, a.limitSeconds ?? 1200)
    const frac = (a.score ?? 0) / limit
    const p = {
      min: Math.floor((a.score ?? 0) / 60),
      limit: Math.floor(limit / 60),
    }
    const reasons = [
      frac >= 0.85 || a.phase === 'warning'
        ? { k: 'state.r_nearLimit', p }
        : { k: 'state.r_headroom', p },
    ]
    if (a.note) reasons.push({ k: 'state.r_focusLive', p: { note: a.note } })
    dims.focus = {
      level:
        a.phase === 'warning' || frac >= 0.85
          ? 'watch'
          : frac >= 0.5
            ? 'ok'
            : 'good',
      reasons,
    }
  }

  // ---- Sleep debt:昨晚时长 + 近几晚均值 ----
  if (!sleepLast) {
    dims.sleepDebt = {
      level: 'unknown',
      reasons: [{ k: 'state.r_needWatchSleep' }],
    }
  } else {
    const h = sleepLast.hours
    const reasons = [{ k: 'state.r_sleepLastMeasured', p: { hours: h } }]
    let level = sleepLevel(h)
    if (sleeps.length >= 2) {
      const avg = sleeps.reduce((s, o) => s + o.hours, 0) / sleeps.length
      reasons.push({
        k: 'state.r_sleepAvg',
        p: { n: sleeps.length, avg: avg.toFixed(1) },
      })
      if (avg < 6.5 && level === 'good') level = 'ok'
    }
    dims.sleepDebt = { level, reasons }
  }

  // ---- Stress:HRV 相对基线(低 HRV = 高压力),叠加当天逼近强制休息次数 ----
  if (hrvRatio == null) {
    const reasons = [
      {
        k: hrvToday ? 'state.r_needBaseline' : 'state.r_needWatchHrv',
        p: { n: hrvBase.n, need: MIN_BASELINE },
      },
    ]
    dims.stress = { level: 'unknown', reasons }
  } else {
    let level = hrvRatioLevel(hrvRatio)
    const reasons = [
      {
        k: 'state.r_hrvToday',
        p: { hrv: Math.round(hrvToday.value), base: Math.round(hrvBase.value) },
      },
    ]
    const warns = a.warnsToday ?? 0
    if (warns >= 2) {
      level = stepDown(level)
      reasons.push({ k: 'state.r_warns', p: { n: warns } })
    }
    dims.stress = { level, reasons }
  }

  // ---- Recovery:HRV + 静息心率 + 睡眠;都缺则回落到 Focus 负荷 ----
  {
    const signals = []
    const reasons = []
    if (hrvRatio != null) {
      signals.push(hrvRatioLevel(hrvRatio))
      reasons.push({
        k: 'state.r_hrvToday',
        p: { hrv: Math.round(hrvToday.value), base: Math.round(hrvBase.value) },
      })
    }
    if (rhrDelta != null) {
      signals.push(rhrDeltaLevel(rhrDelta))
      reasons.push({
        k: 'state.r_rhrToday',
        p: {
          rhr: Math.round(rhrToday.value),
          base: Math.round(rhrBase.value),
          delta:
            rhrDelta > 0 ? `+${Math.round(rhrDelta)}` : Math.round(rhrDelta),
        },
      })
    }
    if (sleepLast) signals.push(sleepLevel(sleepLast.hours))

    if (signals.length) {
      let level = worseOf(...signals)
      // 高负荷少休息再压一档
      const breaks = a.breaksToday ?? 0
      if (netMin >= 60 && breaks < Math.floor(netMin / 60)) {
        level = stepDown(level)
        reasons.push({ k: 'state.r_fewBreaks', p: { min: netMin, n: breaks } })
      }
      dims.recovery = { level, reasons }
    } else if (a.online) {
      // 无生理信号:退回负荷启发式(HLT-2 行为)
      if (netMin < 30)
        dims.recovery = {
          level: 'good',
          reasons: [{ k: 'state.r_netToday', p: { min: netMin } }],
        }
      else {
        const breaks = a.breaksToday ?? 0
        dims.recovery =
          breaks >= Math.floor(netMin / 60)
            ? {
                level: 'ok',
                reasons: [
                  { k: 'state.r_netToday', p: { min: netMin } },
                  { k: 'state.r_breaks', p: { n: breaks } },
                ],
              }
            : {
                level: 'watch',
                reasons: [
                  { k: 'state.r_fewBreaks', p: { min: netMin, n: breaks } },
                ],
              }
      }
    } else {
      dims.recovery = {
        level: 'unknown',
        reasons: [
          {
            k: 'state.r_needWatchHrv',
            p: { n: hrvBase.n, need: MIN_BASELINE },
          },
        ],
      }
    }
  }

  // ---- Energy:睡眠为主,静息心率升高与高负荷各下调一档 ----
  if (!sleepLast) {
    dims.energy = {
      level: 'unknown',
      reasons: [{ k: 'state.r_needWatchSleep' }],
    }
  } else {
    let level = sleepLevel(sleepLast.hours)
    const reasons = [
      { k: 'state.r_sleepLastMeasured', p: { hours: sleepLast.hours } },
    ]
    if (rhrDelta != null && rhrDelta > 5) {
      level = stepDown(level)
      reasons.push({
        k: 'state.r_rhrElevated',
        p: { delta: `+${Math.round(rhrDelta)}` },
      })
    }
    if (netMin >= 150) {
      level = stepDown(level)
      reasons.push({ k: 'state.r_highLoad', p: { min: netMin } })
    }
    dims.energy = { level, reasons }
  }

  // ---- Physical readiness:睡眠 + 静息心率 + 活动量(+ 训练对账) ----
  {
    const act = activityLevel(
      stepsToday,
      stepsBase,
      energyToday,
      energyBase,
      exerciseToday,
    )
    const hasPhysio = Boolean(sleepLast) || rhrDelta != null
    const hasActivity = act != null
    if (!hasPhysio && !hasActivity) {
      dims.physical = {
        level: 'unknown',
        reasons: [{ k: 'state.r_needHealth' }],
      }
    } else {
      const signals = []
      const reasons = [{ k: 'state.r_derivedPhysio' }]
      if (sleepLast) signals.push(sleepLevel(sleepLast.hours))
      if (rhrDelta != null) signals.push(rhrDeltaLevel(rhrDelta))
      let level = signals.length ? worseOf(...signals) : act

      // 久坐相对个人基线:只把 good/ok 往下拖,不掩盖已经偏差的生理信号
      if (act === 'watch' || act === 'bad') {
        if (level === 'good') level = act === 'bad' ? 'watch' : 'ok'
        else if (level === 'ok') level = 'watch'
        reasons.push({
          k: act === 'bad' ? 'state.r_activityLow' : 'state.r_activitySoft',
        })
      } else if (act === 'good' || act === 'ok') {
        reasons.push({ k: 'state.r_activityOk' })
      }

      if (stepsToday) {
        reasons.push({
          k: 'state.r_stepsToday',
          p: { steps: Math.round(stepsToday.value) },
        })
      }
      if (energyToday) {
        reasons.push({
          k: 'state.r_energyToday',
          p: { kcal: Math.round(energyToday.value) },
        })
      }
      if (exerciseToday) {
        reasons.push({
          k: 'state.r_exerciseToday',
          p: { min: Math.round(exerciseToday.value) },
        })
      }
      if (standToday) {
        reasons.push({
          k: 'state.r_standToday',
          p: { min: Math.round(standToday.value) },
        })
      }

      // 训练对账:今日已练 / 大负荷 + 静息心率升高 → 不宜再上高强度
      if (ledger.trained) {
        const mins = Math.round(
          ledger.workoutMinutes ?? ledger.exerciseMinutes ?? 0,
        )
        reasons.push({
          k: 'state.r_workoutToday',
          p: { n: ledger.workoutCount || 1, min: mins },
        })
        const hard =
          (ledger.workoutMinutes ?? 0) >= 40 ||
          (ledger.exerciseMinutes ?? 0) >= 40
        if (hard && level === 'good') {
          level = 'ok'
          reasons.push({ k: 'state.r_alreadyLoaded' })
        }
      }
      if (
        ((workoutMinutesToday?.value ?? 0) >= 45 ||
          (exerciseToday?.value ?? 0) >= 45) &&
        rhrDelta != null &&
        rhrDelta > 5
      ) {
        level = stepDown(level)
        reasons.push({ k: 'state.r_overreach' })
      }

      // 理由过多时保留最有信息量的前几条(UI 只展示 2 条,测试仍可读全量)
      dims.physical = { level, reasons }
    }
  }

  // ---- 综合结论 ----
  let headline
  if (a.online && a.phase === 'breaking') {
    headline = { k: 'state.h_breaking' }
  } else {
    const firstAt = (lvl) =>
      HEADLINE_PRIORITY.find((k) => dims[k].level === lvl)
    const worst = firstAt('bad') ?? firstAt('watch')
    const unknowns = DIMENSION_ORDER.filter(
      (k) => dims[k].level === 'unknown',
    ).length
    if (worst) headline = { k: `state.h_${worst}` }
    else if (unknowns >= 3) headline = { k: 'state.h_noData' }
    else headline = { k: 'state.h_allGood' }
  }

  return { dims, headline }
}
