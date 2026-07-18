/**
 * Design Governance 静态指标（真实数据，不臆造）：
 *  - styleDebt: 各 app 的样式债务（从 scripts/lifeos-styles-baseline.json 求和，按规则拆分）。
 *  - sharedAdoption: 共享 UI 采用率（app 源码里「@life-os 共享 UI import」占「共享+本地组件 import」的比例，
 *    是可复现的 import 占比代理指标，非语义级组件树分析）。
 *  - triageHint: 由主导债务规则给出「改 Token / 收敛共享组件 / 局部命名」的方向提示（规则式，非玄学）。
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** raw-* 数值类违规 → 应走 Design Token；reserved-ds-class → 命名冲突。 */
const RULE_LABEL = {
  'raw-hex': '硬编码色值',
  'raw-font-size': '硬编码字号',
  'raw-motion': '硬编码动效',
  'reserved-ds-class': '占用设计系统保留类名',
}

/**
 * @param {string} repoRoot
 * @param {string} appId
 * @returns {{ total: number, byRule: Record<string, number>, topRule: string|null, triage: string }}
 */
export function computeStyleDebt(repoRoot, appId) {
  /** @type {Record<string, number>} */
  let baseline = {}
  try {
    baseline = JSON.parse(readFileSync(join(repoRoot, 'scripts/lifeos-styles-baseline.json'), 'utf8'))
  } catch {
    /* 无 baseline */
  }
  const prefix = `apps/${appId}/src|`
  /** @type {Record<string, number>} */
  const byRule = {}
  let total = 0
  for (const [key, n] of Object.entries(baseline)) {
    if (!key.startsWith(prefix)) continue
    const rule = key.slice(prefix.length)
    byRule[rule] = (byRule[rule] ?? 0) + Number(n)
    total += Number(n)
  }
  const topRule = Object.keys(byRule).sort((a, b) => byRule[b] - byRule[a])[0] ?? null
  let triage = '无已知样式债务'
  if (topRule === 'reserved-ds-class') triage = `${RULE_LABEL[topRule]} → 局部改名或收敛到共享组件`
  else if (topRule) triage = `${RULE_LABEL[topRule] ?? topRule} → 收敛到 Design Token`
  return { total, byRule, topRule, triage }
}

/**
 * 共享 UI 采用率（import 占比代理）。统计 app src 里：
 *  - 共享 UI import：from '@life-os/platform-web' | '@life-os/theme'
 *  - 本地组件 import：$lib 下的 .svelte，或相对路径 .svelte
 * @param {string} repoRoot @param {string} appId
 * @returns {{ pct: number|null, shared: number, local: number }}
 */
export function computeSharedAdoption(repoRoot, appId) {
  const src = join(repoRoot, 'apps', appId, 'src')
  const countMatches = (/** @type {string} */ pattern) => {
    try {
      const out = execSync(
        `grep -rEc ${JSON.stringify(pattern)} --include='*.svelte' --include='*.ts' --include='*.js' ${JSON.stringify(src)} 2>/dev/null || true`,
        { encoding: 'utf8' },
      )
      // grep -c 每文件一行 file:count；求和
      return out
        .split('\n')
        .filter(Boolean)
        .reduce((s, line) => s + Number(line.split(':').pop() || 0), 0)
    } catch {
      return 0
    }
  }
  const shared = countMatches("from '@life-os/(platform-web|theme)")
  const local = countMatches("from '(\\$lib/[^']*\\.svelte|\\.{1,2}/[^']*\\.svelte)'")
  const denom = shared + local
  const pct = denom > 0 ? Math.round((shared / denom) * 100) : null
  return { pct, shared, local }
}

/** 分数 → 字母等级（设计系统成熟度惯例）。 */
export function grade(score) {
  if (score == null) return '—'
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

/**
 * 综合健康分（0-100）+ 等级 —— 设计系统成熟度四维加权：无障碍 / Token 卫生 / 共享采用 / 捕获覆盖。
 * 缺某维（null）则按剩余权重归一，不臆造。
 * @param {{ a11yPass?: number, a11yChecked?: number, debt?: number, adoptionPct?: number|null, coveragePct?: number|null }} i
 */
export function computeHealth(i) {
  const dims = {
    a11y: i.a11yChecked ? Math.round((100 * i.a11yPass) / i.a11yChecked) : null,
    // Token 卫生：raw-* 硬编码越多越低（饱和曲线，不至于把高债务 app 直接归零）。
    token: i.debt == null ? null : Math.round(100 * (1 - i.debt / (i.debt + 150))),
    adoption: i.adoptionPct ?? null,
    coverage: i.coveragePct ?? null,
  }
  const W = { a11y: 0.35, token: 0.3, adoption: 0.2, coverage: 0.15 }
  let sum = 0
  let wsum = 0
  for (const k of Object.keys(W)) {
    if (dims[k] == null) continue
    sum += dims[k] * W[k]
    wsum += W[k]
  }
  const score = wsum > 0 ? Math.round(sum / wsum) : null
  return { score, grade: grade(score), dims }
}

const ALTITUDE = {
  'raw-hex': { altitude: 'token', advice: '补齐色板 Design Token，替换硬编码 hex' },
  'raw-font-size': { altitude: 'token', advice: '补齐字号 Token（type scale）' },
  'raw-motion': { altitude: 'token', advice: '补齐动效 Token（duration/easing）' },
  'reserved-ds-class': { altitude: 'shared/local', advice: '局部改名，或把该模式收敛为共享组件' },
}

/**
 * 组合治理发现（跨全部 app 分析样式债务基线）：哪些规则是系统性（多 app）该动 Token/共享，
 * 哪些是局部（少数 app）该局部修 —— 直接回答「改 Token / 共享组件 / 局部页面」。
 * @param {string} repoRoot
 * @param {number} systemicThreshold ≥ 多少个 app 视为系统性
 */
export function systemicFindings(repoRoot, systemicThreshold = 4) {
  /** @type {Record<string, number>} */
  let baseline = {}
  try {
    baseline = JSON.parse(readFileSync(join(repoRoot, 'scripts/lifeos-styles-baseline.json'), 'utf8'))
  } catch {
    return []
  }
  /** @type {Record<string, { total: number, apps: Set<string> }>} */
  const byRule = {}
  for (const [key, n] of Object.entries(baseline)) {
    const m = key.match(/^apps\/([^/]+)\/src\|(.+)$/)
    if (!m) continue
    const [, appId, rule] = m
    byRule[rule] = byRule[rule] ?? { total: 0, apps: new Set() }
    byRule[rule].total += Number(n)
    byRule[rule].apps.add(appId)
  }
  return Object.entries(byRule)
    .map(([rule, { total, apps }]) => {
      const scope = apps.size >= systemicThreshold ? 'systemic' : 'local'
      const meta = ALTITUDE[rule] ?? { altitude: 'local', advice: '局部修正' }
      return {
        rule,
        label: RULE_LABEL[rule] ?? rule,
        appCount: apps.size,
        apps: [...apps],
        total,
        scope,
        altitude: scope === 'systemic' && meta.altitude.includes('token') ? 'token' : meta.altitude,
        advice: meta.advice,
      }
    })
    .sort((a, b) => b.total - a.total)
}
