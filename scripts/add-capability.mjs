#!/usr/bin/env node
/**
 * PLAT.GEN.5 — 按「能力模块」给已有 Life OS app 幂等接线（+ --check 漂移守卫）。
 *
 *   node scripts/add-capability.mjs <app-id> auth              # SSO + Supabase 客户端 + auth store
 *   node scripts/add-capability.mjs <app-id> supabase-table <t> # <id>.<t> 表 + RLS migration 骨架
 *   node scripts/add-capability.mjs <app-id> portal-card       # Portal 今日摘要卡：只打印真实锚点（不生成文件）
 *   node scripts/add-capability.mjs <app-id> mcp-server        # 暴露 AIOS 可发现的 MCP server（/api/mcp）
 *   … 任意命令加 --check 只报告不写。
 *
 * 与 promote-life-os-app.mjs 同构：文件类产物只创建从不覆盖；文本/JSON 接线 upsert。
 * starter 是模板本体，不接能力。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest } from './lib/app-manifest.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(p, 'utf8')

/**
 * app id 允许连字符（create-life-os-app 的 /^[a-z][a-z0-9-]*$/），但连字符在
 * Postgres 标识符里非法（`meal-log` 会被解析成 `meal` 减 `log`），必须归一化。
 * `sqlIdent('meal-log') → 'meal_log'` —— schema 名；**auth 生成的 supabase.js 与
 * supabase-table 生成的 migration 必须用同一个值**，否则前端连不上自己的表。
 */
const sqlIdent = (s) => s.replace(/-/g, '_')

/** 从现役 app 取依赖版本，避免脚本里的硬编码版本随时间漂移落后。 */
function fleetDepVersion(pkgName, fallback) {
  for (const app of ['fitness', 'planner', 'music', 'home']) {
    const p = join(ROOT, 'apps', app, 'package.json')
    if (!existsSync(p)) continue
    const v = JSON.parse(read(p)).dependencies?.[pkgName]
    if (v) return v
  }
  return fallback
}

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const positional = argv.filter((a) => !a.startsWith('--'))
const [id, capability, extra] = positional

const CAPS = ['auth', 'supabase-table', 'portal-card', 'mcp-server']

if (!id || !capability || !CAPS.includes(capability)) {
  console.error(`用法：node scripts/add-capability.mjs <app-id> <${CAPS.join('|')}> [extra] [--check]`)
  process.exit(1)
}
if (id === 'starter') {
  console.error('starter 是模板本体，不接能力。')
  process.exit(1)
}

const { manifest: m, errors } = loadManifest(ROOT, id)
if (errors.length) {
  console.error(`✖ ${id} manifest 校验失败：\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}

/* —————————————————————— 通用 step 助手（同 promote 语义） —————————————————————— */

/** 文件产物：只创建从不覆盖；--check 仅验存在。 */
function fileStep(label, path, content) {
  return {
    label,
    run(write) {
      if (existsSync(path)) return { status: 'ok' }
      if (write) {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, content())
      }
      return { status: 'missing' }
    },
  }
}

/** package.json 依赖 upsert。 */
function depStep(label, pkgPath, deps) {
  return {
    label,
    run(write) {
      const pkg = JSON.parse(read(pkgPath))
      pkg.dependencies ||= {}
      const missing = Object.keys(deps).filter((d) => !pkg.dependencies[d])
      if (!missing.length) return { status: 'ok' }
      if (write) {
        for (const d of missing) pkg.dependencies[d] = deps[d]
        pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)))
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
      }
      return { status: 'missing', detail: missing.join('、') }
    },
  }
}

/* —————————————————————— 能力模块 —————————————————————— */

const appDir = join(ROOT, 'apps', id)
const libDir = join(appDir, 'src', 'lib')

function capAuth() {
  const schema = sqlIdent(id)
  return [
    fileStep(
      'src/lib/supabase.js',
      join(libDir, 'supabase.js'),
      () => `import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'

// Life OS 统一 Supabase 项目（${id} 数据在 ${schema} schema）
export const { supabase } = createLifeOsSupabaseClient(createClient, {
  env: import.meta.env,
  schema: '${schema}',
})
`,
    ),
    fileStep(
      'src/lib/auth.svelte.js',
      join(libDir, 'auth.svelte.js'),
      () => `import { createAppAuthStore } from '@life-os/sync/svelte/auth-store'
import { supabase } from './supabase.js'

// createAppAuthStore 自带缺省 zh 错误文案；接了 i18n 后可传 errorLabels 覆盖。
// 有本地同步引擎时补 onSyncSession / onSignedOut（照 apps/fitness/src/lib/auth.svelte.js）。
export const { auth, initAuth, authErrorMessage, signUp, signIn, signOut } =
  createAppAuthStore(supabase, { appId: '${id}' })
`,
    ),
    fileStep(
      '.env.example',
      join(appDir, '.env.example'),
      () => `# Life OS 统一 Supabase 项目（可选；未设置时用 src/lib/supabase.js 内默认值）
VITE_SUPABASE_URL=https://iueozzuctstwvzbcxcyh.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
`,
    ),
    depStep('package.json deps', join(appDir, 'package.json'), {
      '@life-os/sync': '*',
      '@supabase/supabase-js': fleetDepVersion('@supabase/supabase-js', '^2.110.0'),
    }),
  ]
}

function capSupabaseTable() {
  const table = extra
  if (!table || !/^[a-z][a-z0-9_]*$/.test(table)) {
    console.error('supabase-table 需要一个表名参数：node scripts/add-capability.mjs ' + id + ' supabase-table <table>（小写下划线）')
    process.exit(1)
  }
  const migDir = join(appDir, 'supabase', 'migrations')
  return [
    {
      label: `migration ${id}.${table}`,
      run(write) {
        const suffix = `_${id}_${table}.sql`
        if (existsSync(migDir) && readdirSync(migDir).some((f) => f.endsWith(suffix))) return { status: 'ok' }
        if (write) {
          mkdirSync(migDir, { recursive: true })
          const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
          writeFileSync(join(migDir, `${ts}${suffix}`), migrationSql(sqlIdent(id), table, id))
        }
        return { status: 'missing' }
      },
    },
  ]
}

function migrationSql(schema, table, appId = schema) {
  return `-- ${schema}.${table} — ${appId} app 业务表（RLS 逐用户）
-- 安全推送见 docs/ops/supabase.md（勿直接 db push；共享库多 app 迁移会互卡）

create schema if not exists ${schema};
grant usage on schema ${schema} to authenticated;

create table if not exists ${schema}.${table} (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on ${schema}.${table} to authenticated;
alter table ${schema}.${table} enable row level security;

create policy "${table}_select_own" on ${schema}.${table}
  for select using (auth.uid() = user_id);
create policy "${table}_insert_own" on ${schema}.${table}
  for insert with check (auth.uid() = user_id);
create policy "${table}_update_own" on ${schema}.${table}
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "${table}_delete_own" on ${schema}.${table}
  for delete using (auth.uid() = user_id);
`
}

/**
 * Portal 卡刻意「只引导不生成」：Portal 的卡片不是一 app 一文件，而是
 * todaySummaryFormat.js 里的 copy 函数 + 两处重复的 SummaryAppId 联合类型 +
 * 一个硬编码可见列表；卡片显示什么完全是 app 专属产品决策。
 * 生成一个形状不对的 stub 比不生成更糟（会把人往错方向带），所以这里只打印真实锚点。
 */
function printPortalCardGuide() {
  console.log(`ℹ️  ${id} · portal-card —— 引导式（本能力不生成文件，见下）

Portal 的今日摘要卡是「共享文件 + 联合类型」结构，不是一 app 一文件；卡片显示
什么是 app 专属产品决策。照下面五处改（锚点已核对 2026-07-14）：

  1. migration：portal_today_summary RPC 里聚合 ${sqlIdent(id)} 的读模型 / core_*
     （安全推送见 docs/ops/supabase.md）
  2. apps/portal/src/lib/todaySummaryFormat.js:1
     SummaryAppId 联合类型加 '${id}'
  3. apps/portal/src/lib/todaySummaryFormat.js
     加一个 copy 函数，返回 { kicker, value, detail, empty }（照 fitness/finance 的写法）
  4. apps/portal/src/lib/components/PortalTodaySummary.svelte:14
     TS 侧 SummaryAppId 联合类型同步加 '${id}'（**与第 2 步重复定义，两处都要改**）
  5. apps/portal/src/lib/components/PortalTodaySummary.svelte:53
     visibleSummaryAppIds 的硬编码数组加 '${id}'

  验收：npm run qa:smoke -w portal（或 Portal 冒烟）+ 卡片在生产 Portal 可见`)
}

function capMcpServer() {
  const fnPath = join(appDir, 'netlify', 'functions', 'mcp.js')
  return [
    fileStep(
      'netlify/functions/mcp.js',
      fnPath,
      () => `import { createMcpHandler } from '@life-os/mcp-server'

// ${m.name} 的 MCP server —— AIOS 配 URL \`https://${m.domain}/api/mcp\` 即可发现这些工具。
// 数据类工具：从 request 的 Authorization: Bearer <jwt> 取用户 JWT 转发 Supabase，靠 RLS 鉴权。
export default createMcpHandler({
  name: '${id}',
  tools: [
    {
      name: 'ping',
      description: '连通性自检，返回 app 标识',
      inputSchema: { type: 'object', properties: {} },
      handler() {
        return '${id} MCP server ok'
      },
    },
    // TODO 加真实工具：包一层本 app 的 Supabase RPC（读/写走 life_events 收件箱）。
  ],
})
`,
    ),
    depStep('package.json deps', join(appDir, 'package.json'), { '@life-os/mcp-server': '*' }),
  ]
}

const BUILDERS = {
  auth: capAuth,
  'supabase-table': capSupabaseTable,
  'mcp-server': capMcpServer,
}

/* —————————————————————— 执行 —————————————————————— */

// portal-card 无接线点（纯引导），不走 step 机制
if (capability === 'portal-card') {
  printPortalCardGuide()
  process.exit(0)
}

const steps = BUILDERS[capability]()
const results = steps.map((st) => ({ label: st.label, ...st.run(!CHECK) }))

if (CHECK) {
  const missing = results.filter((r) => r.status === 'missing')
  if (!missing.length) {
    console.log(`✓ ${id} · ${capability} — ${results.length} 个接线点已就位`)
    process.exit(0)
  }
  console.error(`✖ ${id} · ${capability} — 未接线：`)
  for (const r of missing) console.error(`  missing  ${r.label}${r.detail ? `（${r.detail}）` : ''}`)
  console.error(`  修复：node scripts/add-capability.mjs ${id} ${capability}${extra ? ` ${extra}` : ''}`)
  process.exit(1)
}

const created = results.filter((r) => r.status === 'missing').map((r) => r.label)
console.log(`✅ ${id} · ${capability} 接线完成
  新接线：${created.length ? created.join('、') : '无（已就位）'}
  未变：${results.length - created.length} 项`)

/* —————————————————————— 各能力的收尾提示 —————————————————————— */

if (capability === 'auth') {
  console.log(`
下一步：
  1. npm install                                  # 链接 @life-os/sync + @supabase/supabase-js
  2. 在 +layout.svelte 里 import { initAuth } from '$lib/auth.svelte.js' 并调用
  3. 加登录路由 / settings 登出卡（参考 apps/fitness/src/routes）
  4. 需要业务表：node scripts/add-capability.mjs ${id} supabase-table <table>`)
} else if (capability === 'supabase-table') {
  console.log(`
下一步：
  1. 编辑 apps/${id}/supabase/migrations/*_${id}_${extra}.sql 补业务列
  2. 安全推送（勿直接 db push）：见 docs/ops/supabase.md`)
} else if (capability === 'mcp-server') {
  console.log(`
下一步：
  1. npm install
  2. 编辑 apps/${id}/netlify/functions/mcp.js，把 ping 换成包一层 Supabase RPC 的真实工具
  3. 接 /api/mcp 重定向（依站点 base dir，可能落 repo 根 netlify.toml；参考 planner /api/paper）：
       [[redirects]]
         from = "/api/mcp"
         to = "/.netlify/functions/mcp"
         status = 200
  4. 部署后在 AIOS 设置 → MCP server 加 URL：https://${m.domain}/api/mcp（+ 可选 token）`)
}

process.exit(0)
