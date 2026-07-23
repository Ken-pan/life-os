#!/usr/bin/env node
// Kenos Train 示范图 API 跑手 — 官方 Images API 版（行业标准路径）
// 与浏览器插件同源:复用 queue.js 的 12 个 job + refs/ 参考图
//
// 用法:
//   node api-runner.mjs --check            # 验证 key + 列出可用生图模型
//   node api-runner.mjs --job sh_latraise  # 跑单张
//   node api-runner.mjs --all              # 串行跑完队列(跳过已存在)
//   环境变量: MODEL=gpt-image-2 覆盖模型; FORCE=1 覆盖已存在文件
//
// key 来源(按序尝试,不打印): $OPENAI_API_KEY → ~/.openclaw/.env → ~/.openclaw/service-env/*.env
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { JOBS, buildPrompt } from './queue.js'

const OUT_DIR = join(homedir(), 'Downloads', 'kenos-train')
const REFS = join(import.meta.dirname, 'refs')
const MODEL = process.env.MODEL || 'gpt-image-1'

function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  const candidates = [join(homedir(), '.openclaw', '.env')]
  const svcDir = join(homedir(), '.openclaw', 'service-env')
  if (existsSync(svcDir)) for (const f of readdirSync(svcDir)) candidates.push(join(svcDir, f))
  for (const file of candidates) {
    try {
      const m = readFileSync(file, 'utf8').match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*["']?([^"'\s]+)/m)
      if (m) return m[1]
    } catch {}
  }
  throw new Error('没找到 OPENAI_API_KEY(env / ~/.openclaw/.env / service-env 都没有)')
}

const KEY = loadKey()
const AUTH = { Authorization: `Bearer ${KEY}` }

async function check() {
  const r = await fetch('https://api.openai.com/v1/models', { headers: AUTH })
  if (!r.ok) {
    console.error(`key 无效或无权限: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    process.exit(1)
  }
  const { data } = await r.json()
  const imgModels = data.map((m) => m.id).filter((id) => /image|dall-e/i.test(id)).sort()
  console.log('key 有效 ✓  可用生图模型:', imgModels.join(', ') || '(列表里没有生图模型,但 gpt-image-1 通常不在列表也可用)')
}

function fileBlob(path) {
  const buf = readFileSync(path)
  const type = path.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return new Blob([buf], { type })
}

async function generateOne(job, { retry = 1 } = {}) {
  const outFile = join(OUT_DIR, `${job.id}.png`)
  if (existsSync(outFile) && !process.env.FORCE) {
    console.log(`⏭  ${job.id} 已存在,跳过(FORCE=1 覆盖)`)
    return 'skipped'
  }
  const form = new FormData()
  form.append('model', MODEL)
  form.append('prompt', buildPrompt(job))
  form.append('image[]', fileBlob(join(REFS, 'turnaround.png')), 'turnaround.png')
  form.append('image[]', fileBlob(join(REFS, job.anchor)), job.anchor)
  form.append('size', '1536x1024')
  form.append('quality', 'high')
  form.append('input_fidelity', 'high')
  form.append('n', '1')

  const t0 = Date.now()
  process.stdout.write(`▶  ${job.id} ${job.name} (${MODEL}, 锚 ${job.anchor}) ... `)
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: AUTH, body: form })
  if (!r.ok) {
    const errText = (await r.text()).slice(0, 400)
    // 参数不被该模型支持时降级重试一次(去掉 input_fidelity)
    if (r.status === 400 && /input_fidelity/.test(errText) && retry > 0) {
      console.log('\n   input_fidelity 不支持,降级重试...')
      form.delete('input_fidelity')
      const r2 = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: AUTH, body: form })
      if (!r2.ok) throw new Error(`HTTP ${r2.status}: ${(await r2.text()).slice(0, 400)}`)
      return await saveResult(r2, outFile, t0, job)
    }
    if ((r.status === 429 || r.status >= 500) && retry > 0) {
      console.log(`\n   HTTP ${r.status},60 秒后重试...`)
      await new Promise((res) => setTimeout(res, 60000))
      return generateOne(job, { retry: retry - 1 })
    }
    throw new Error(`HTTP ${r.status}: ${errText}`)
  }
  return await saveResult(r, outFile, t0, job)
}

async function saveResult(r, outFile, t0, job) {
  const json = await r.json()
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error('响应里没有图片数据: ' + JSON.stringify(json).slice(0, 300))
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(outFile, Buffer.from(b64, 'base64'))
  const kb = Math.round(Buffer.byteLength(b64, 'base64') / 1024)
  console.log(`✓ ${Math.round((Date.now() - t0) / 1000)}s → ${outFile} (${kb}KB)`)
  return 'done'
}

const args = process.argv.slice(2)
if (args.includes('--check')) {
  await check()
} else if (args.includes('--job')) {
  const id = args[args.indexOf('--job') + 1]
  const job = JOBS.find((j) => j.id === id)
  if (!job) { console.error('未知 job:', id, '可选:', JOBS.map((j) => j.id).join(' ')); process.exit(1) }
  await generateOne(job)
} else if (args.includes('--all')) {
  for (const job of JOBS) {
    try {
      const res = await generateOne(job)
      if (res === 'done') await new Promise((r) => setTimeout(r, 15000 + Math.random() * 10000))
    } catch (e) {
      console.error(`✗ ${job.id} 失败:`, e.message)
    }
  }
  console.log('队列跑完。产出目录:', OUT_DIR)
} else {
  console.log('用法: node api-runner.mjs --check | --job <id> | --all')
}
