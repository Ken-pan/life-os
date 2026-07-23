#!/usr/bin/env node
/**
 * PLAT.GEN.2 — 按 AppManifest 供给 Netlify 部署（day-2）。
 *
 *   node scripts/netlify-provision.mjs <app-id>            # dry-run：只打印计划，不创建任何资源
 *   node scripts/netlify-provision.mjs <app-id> --apply    # 真正创建 site + 克隆 env + 写接线
 *
 * --apply 做四件事：
 *   1. `netlify sites:create --name <id>os-ken`（需已 `netlify login`）
 *   2. `netlify env:clone` 从 fitness 站复制 4 个 Supabase 环境变量
 *   3. scripts/deploy-all-netlify.sh 追加 deploy_one（真实 site id）
 *   4. docs/ops/netlify.md 站点表加行
 * DNS（GoDaddy CNAME）与 Netlify Git 构建接线（Deploy Key，走 UI）保持手动，
 * 结尾打印精确指令。CLI 部署路径（deploy-all-netlify.sh）不依赖 Git 接线。
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest } from './lib/app-manifest.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** env 克隆源：fitness 站（4 个 Supabase 变量齐全，见 docs/ops/netlify.md） */
const ENV_SOURCE_SITE = '0394cf19-7fb7-4fea-81d7-d4a9d025fab3'

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const id = argv.find((a) => !a.startsWith('--'))
if (!id) {
  console.error('用法：node scripts/netlify-provision.mjs <app-id> [--apply]')
  process.exit(1)
}
const { manifest: m, errors } = loadManifest(ROOT, id)
if (errors.length) {
  console.error(`✖ ${id} manifest 校验失败：\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}

const siteName = `${id}os-ken`
const deployShPath = join(ROOT, 'scripts', 'deploy-all-netlify.sh')
const netlifyDocPath = join(ROOT, 'docs', 'ops', 'netlify.md')
const DEPLOY_ANCHOR = '# [app-generator:deploy-one]'

// 幂等预检：已接线则拒绝重复供给
const deploySh = readFileSync(deployShPath, 'utf8')
if (new RegExp(`deploy_one \\S+ ${m.workspace} `).test(deploySh)) {
  console.error(`✖ ${m.workspace} 已在 deploy-all-netlify.sh 接线，疑似已供给过。`)
  process.exit(1)
}

function wireDeployScript(siteId) {
  const line = `deploy_one ${siteId} ${m.workspace} apps/${id}/build`
  writeFileSync(deployShPath, readFileSync(deployShPath, 'utf8').replace(DEPLOY_ANCHOR, () => `${line}\n${DEPLOY_ANCHOR}`))
  return line
}

function wireNetlifyDoc(siteId) {
  const row = `| ${siteName} | \`apps/${id}\` | \`npm run build -w ${m.workspace}\` | \`apps/${id}/build\` | https://${m.domain} | 新站（site id \`${siteId}\`） |`
  const s = readFileSync(netlifyDocPath, 'utf8')
  const homeRow = s.match(/\n\| kenos-home[^\n]*/)
  if (!homeRow) return null
  writeFileSync(netlifyDocPath, s.replace(homeRow[0], () => `${homeRow[0]}\n${row}`))
  return row
}

const manualSteps = (siteId) => `
剩余手动步骤：
  1. DNS：GoDaddy 加 CNAME  ${m.domain} → ${siteName}.netlify.app，
     然后 Netlify UI → Domain management → Add domain ${m.domain}（自动出 TLS 证书）
  2. Git 自动构建（可选，CLI 部署已可用）：Netlify UI → Build settings →
     连接 Ken-pan/life-os（Deploy Key 模式，参照其他五站）；
     Package directory apps/${id} · Build "npm run build -w ${m.workspace}" · Publish apps/${id}/build
  3. 首次部署验证：npm run build:${id} &&
     CI=1 npx netlify deploy --prod --no-build --site=${siteId} --filter ${m.workspace} --dir=apps/${id}/build
     然后 curl -sI https://${siteName}.netlify.app | head -1`

if (!APPLY) {
  console.log(`── netlify-provision ${id} · DRY-RUN（--apply 才会执行）──

将执行：
  1. CI=1 npx netlify sites:create --name ${siteName} --disable-linking
  2. CI=1 npx netlify env:clone --force --from ${ENV_SOURCE_SITE} --to <SITE_ID>
     （4 个 Supabase 变量，源 = fitness 站）
  3. scripts/deploy-all-netlify.sh 追加：
       deploy_one <SITE_ID> ${m.workspace} apps/${id}/build
  4. docs/ops/netlify.md 站点表加行（${siteName} · https://${m.domain}）
${manualSteps('<SITE_ID>')}`)
  process.exit(0)
}

// —— APPLY ——
const run = (cmd) => {
  console.log(`→ ${cmd}`)
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CI: '1' } })
}

let siteId
try {
  const out = run(`npx netlify sites:create --name ${siteName} --disable-linking --json`)
  siteId = JSON.parse(out.slice(out.indexOf('{'))).id
} catch (err) {
  console.error(`✖ sites:create 失败：${err.message}\n  手动创建后重跑，或检查 netlify login 状态。`)
  process.exit(1)
}
console.log(`✅ site 已创建：${siteName}（${siteId}）`)

try {
  run(`npx netlify env:clone --force --from ${ENV_SOURCE_SITE} --to ${siteId}`)
  console.log('✅ 环境变量已从 fitness 站克隆')
} catch (err) {
  console.error(`⚠️ env:clone 失败（${err.message}），手动补 4 个 Supabase 变量。`)
}

console.log(`✅ ${wireDeployScript(siteId)}`)
const row = wireNetlifyDoc(siteId)
console.log(row ? `✅ docs/ops/netlify.md 已加行` : '⚠️ docs/ops/netlify.md 找不到 kenos-home 参照行，手动加。')
console.log(manualSteps(siteId))
