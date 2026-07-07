// 端到端验证：新增四个页面（RM Net Worth / RM Recurring / Fidelity Summary x2）
// + 回归旧三页（Robinhood / RM Dashboard / RM Transactions）。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXT = path.resolve(__dirname, '../extension/content')

async function runPage(htmlPath, url, script, label) {
  const html = readFileSync(htmlPath, 'utf-8')
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' })
  const { window } = dom
  const out = []
  window.chrome = {
    runtime: {
      sendMessage: async (m) => {
        out.push(m)
        return { ok: true }
      },
      onMessage: { addListener: () => {} },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
    },
  }
  window.eval(readFileSync(`${EXT}/common.js`, 'utf-8'))
  if (script === 'robinhood.js') {
    window.eval(
      readFileSync(
        path.resolve(__dirname, '../extension/rhDetailsShared.js'),
        'utf-8',
      ),
    )
    window.eval(
      readFileSync(
        path.resolve(__dirname, '../extension/rhFinanceProbes.js'),
        'utf-8',
      ),
    )
  }
  if (script === 'rocketmoney.js') {
    window.eval(
      readFileSync(
        path.resolve(__dirname, '../extension/rmFinanceProbes.js'),
        'utf-8',
      ),
    )
    window.eval(readFileSync(`${EXT}/syncPlan.js`, 'utf-8'))
  }
  window.eval(readFileSync(`${EXT}/${script}`, 'utf-8'))
  await new Promise((r) => setTimeout(r, 2500))
  const envs = out.filter((m) => m.type === 'FOS_ENQUEUE').map((m) => m.capture)
  console.log(`== ${label} ==`)
  if (envs.length === 0) {
    console.log('  FAIL: no capture')
    process.exitCode = 1
  }
  for (const env of envs) {
    const d = env.data
    if (env.kind === 'holdings') {
      console.log(`  OK holdings=${d.positions.length} total=${d.totalValue}`)
    } else if (env.kind === 'accounts') {
      console.log(`  OK accounts=${d.accounts.length}`)
      for (const a of d.accounts) {
        console.log(
          `     ${a.name} | ${a.institution ?? '-'} | ${a.balance}${a.approximate ? '~' : ''} | ${a.kindHint ?? '-'}`,
        )
      }
    } else if (env.kind === 'recurring') {
      console.log(`  OK recurring=${d.rows.length}`)
      for (const r of d.rows) {
        console.log(
          `     [${r.group}] ${r.name} | ${r.frequency} | $${r.amount} | ${r.account ?? '-'} | next=${r.nextDate ?? '-'} | id=${(r.platformId ?? '').slice(0, 18)}`,
        )
      }
    } else {
      console.log(
        `  OK txns=${d.rows.length} newest=${d.rows[0].date} pending=${d.rows.filter((r) => r.pending).length}`,
      )
    }
  }
  dom.window.close()
}

await runPage(
  '/tmp/mhtml-analysis/Rocket_Money___Net_Worth.mhtml.0.html',
  'https://app.rocketmoney.com/net-worth',
  'rocketmoney.js',
  'RM Net Worth',
)
await runPage(
  '/tmp/mhtml-analysis/Rocket_Money___Recurring.mhtml.0.html',
  'https://app.rocketmoney.com/recurring',
  'rocketmoney.js',
  'RM Recurring',
)
await runPage(
  '/tmp/mhtml-analysis/Portfolio_Summary.mhtml.0.html',
  'https://digital.fidelity.com/ftgw/digital/portfolio/summary',
  'fidelity.js',
  'Fidelity Summary (all accounts)',
)
await runPage(
  '/tmp/mhtml-analysis/Portfolio_Summary2.mhtml.0.html',
  'https://digital.fidelity.com/ftgw/digital/portfolio/summary#10036',
  'fidelity.js',
  'Fidelity Summary (single account)',
)
// 回归旧页面
await runPage(
  '/tmp/mhtml-analysis/Investing___Robinhood.mhtml.0.html',
  'https://robinhood.com/',
  'robinhood.js',
  'Robinhood (regression)',
)
await runPage(
  '/tmp/mhtml-analysis/Rocket_Money___Dashboard.mhtml.0.html',
  'https://app.rocketmoney.com/dashboard',
  'rocketmoney.js',
  'RM Dashboard (regression)',
)
await runPage(
  '/tmp/mhtml-analysis/Rocket_Money___Transactions.mhtml.0.html',
  'https://app.rocketmoney.com/transactions',
  'rocketmoney.js',
  'RM Transactions (regression)',
)
