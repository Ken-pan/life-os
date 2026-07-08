import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildBackupPayload, parseBackup } from '../src/backup.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixture = (name) => readFileSync(join(fixturesDir, name), 'utf8')

// ── envelope 组装 ──
{
  const payload = buildBackupPayload({
    app: 'planner-os',
    schemaVersion: 7,
    data: { settings: { locale: 'zh' } },
    exportedAt: '2026-07-01T08:00:00.000Z',
  })
  assert.deepEqual(payload, {
    schemaVersion: 7,
    exportedAt: '2026-07-01T08:00:00.000Z',
    app: 'planner-os',
    data: { settings: { locale: 'zh' } },
  })
}
{
  const payload = buildBackupPayload({
    app: 'fitness-os',
    schemaVersion: 4,
    data: { settings: {} },
  })
  assert.ok(!Number.isNaN(Date.parse(payload.exportedAt)), '默认 exportedAt 为合法 ISO 时间')
}

// ── 解析：planner / fitness envelope 备份 ──
{
  const { meta, data } = parseBackup(fixture('backup-planner-v1.json'))
  assert.equal(meta.app, 'planner-os')
  assert.equal(meta.schemaVersion, 7)
  assert.equal(data.tasks.length, 1)
  assert.equal(data.settings.locale, 'zh')
}
{
  const { meta, data } = parseBackup(fixture('backup-fitness-v1.json'))
  assert.equal(meta.app, 'fitness-os')
  assert.equal(data.activeProgramId, 'ppl')
  assert.equal(data.logs[0].sets[0].weight, 100)
}

// ── 解析：兼容裸数据（无 envelope 的旧备份）──
{
  const { meta, data } = parseBackup(fixture('backup-legacy-bare.json'))
  assert.equal(data.settings.locale, 'zh')
  assert.equal(meta.data, undefined, '裸数据时 meta 即原始对象')
}

// ── 校验失败路径 + 可注入错误文案 ──
assert.throws(() => parseBackup('{"data":{"tasks":[]}}'), /invalid backup/)
assert.throws(
  () => parseBackup('{"data":{}}', { invalidMessage: '无效的备份文件：缺少 settings 字段' }),
  /无效的备份文件：缺少 settings 字段/,
)
assert.throws(() => parseBackup('not json'), SyntaxError)
assert.throws(() => parseBackup('null'))
assert.throws(() => parseBackup('{"data": 42}'))

// ── 导出→导入 round-trip ──
{
  const original = { settings: { locale: 'en' }, tasks: [{ id: 't9' }] }
  const payload = buildBackupPayload({ app: 'planner-os', schemaVersion: 7, data: original })
  const { data } = parseBackup(JSON.stringify(payload, null, 2))
  assert.deepEqual(data, original)
}

console.log('backup.test.mjs — OK')
