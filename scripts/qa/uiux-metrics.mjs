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
