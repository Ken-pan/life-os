import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HOSTED_SPACES,
  assignUniqueListKeys,
  buildLegacyExternalSpaces,
  buildSpacesList,
  spaceListKey,
} from './spacesList.core.js'

describe('spacesList.core', () => {
  it('namespaces listKeys so same id/displayName from different sources stay unique', () => {
    const list = buildSpacesList({
      hosted: [
        {
          id: 'training',
          label: 'Training',
          detail: 'hosted',
          href: '/spaces/training',
        },
      ],
      external: [
        {
          id: 'training',
          label: 'Training',
          detail: 'external',
          href: 'https://fitness.kenos.space',
        },
      ],
      warn() {},
    })
    const keys = list.map((s) => s.listKey)
    assert.deepEqual(keys, ['hosted:training', 'external:training'])
    assert.equal(new Set(keys).size, keys.length)
    assert.equal(list[0].label, 'Training')
    assert.equal(list[1].label, 'Training')
  })

  it('default list uses domain deep links (no empty bridge hop)', () => {
    const list = buildSpacesList({ warn() {} })
    const trainings = list.filter((s) => s.id === 'training')
    assert.equal(trainings.length, 1)
    assert.equal(trainings[0].listKey, 'hosted:training')
    assert.equal(trainings[0].external, false)
    assert.match(trainings[0].href, /^https:\/\/fitness\.kenos\.space/)
    const plan = list.find((s) => s.listKey === 'hosted:plan')
    assert.ok(plan)
    assert.match(plan.href, /\/upcoming$/)
    assert.ok(list.some((s) => s.listKey === 'hosted:money'))
  })

  it('hides shellOnly spaces by default, includes them when shellAllowed', () => {
    const shellCount = HOSTED_SPACES.filter((s) => s.shellOnly).length
    assert.ok(shellCount >= 1, 'expected at least one shellOnly space (code)')
    // 默认(普通浏览器):不含 shellOnly
    const web = buildSpacesList({ warn() {} })
    assert.equal(web.length, HOSTED_SPACES.length - shellCount)
    assert.ok(!web.some((s) => s.id === 'code'))
    // 壳内:含 shellOnly
    const shell = buildSpacesList({ shellAllowed: true, warn() {} })
    assert.equal(shell.length, HOSTED_SPACES.length)
    assert.ok(shell.some((s) => s.id === 'code'))
  })

  it('can still build legacy external rows when requested', () => {
    const external = buildLegacyExternalSpaces()
    const nonShell = HOSTED_SPACES.filter((s) => !s.shellOnly).length
    const list = buildSpacesList({ external, warn() {} })
    assert.equal(list.length, nonShell + external.length)
    assert.ok(list.some((s) => s.listKey === 'external:plan'))
  })

  it('spaceListKey builds stable namespaced keys', () => {
    assert.equal(spaceListKey('hosted', 'training'), 'hosted:training')
    assert.equal(spaceListKey('external', 'training'), 'external:training')
  })

  it('assignUniqueListKeys warns and disambiguates on duplicate listKey without dropping items', () => {
    const warnings = []
    const input = [
      { id: 'a', listKey: 'hosted:dup' },
      { id: 'b', listKey: 'hosted:dup' },
      { id: 'c', listKey: 'external:ok' },
    ]
    const out = assignUniqueListKeys(input, {
      warn(...args) {
        warnings.push(args.join(' '))
      },
    })
    assert.equal(out.length, 3)
    assert.deepEqual(
      out.map((s) => s.listKey),
      ['hosted:dup', 'hosted:dup#2', 'external:ok'],
    )
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /duplicate listKey: hosted:dup/)
    assert.ok(!warnings[0].includes('href'))
  })

  it('does not silently dedupe when construction would collide within a namespace', () => {
    const warnings = []
    const list = buildSpacesList({
      hosted: [
        { id: 'training', label: 'A', detail: 'a', href: '/a' },
        { id: 'training', label: 'B', detail: 'b', href: '/b' },
      ],
      external: [],
      warn(...args) {
        warnings.push(args.join(' '))
      },
    })
    assert.equal(list.length, 2)
    assert.deepEqual(
      list.map((s) => s.listKey),
      ['hosted:training', 'hosted:training#2'],
    )
    assert.equal(warnings.length, 1)
  })
})
