import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { KENOS_SPACES } from './controlCenter.core.js'
import {
  HOSTED_SPACES,
  assignUniqueListKeys,
  buildSpacesList,
  spaceListKey,
} from './spacesList.core.js'

describe('spacesList.core', () => {
  it('namespaces listKeys so same id/displayName from different sources stay unique', () => {
    const list = buildSpacesList({
      hosted: [{ id: 'training', label: 'Training', detail: 'hosted', href: '/spaces/training' }],
      external: [{ id: 'training', label: 'Training', detail: 'external', href: 'https://fitness.kenos.space' }],
      warn() {},
    })
    const keys = list.map((s) => s.listKey)
    assert.deepEqual(keys, ['hosted:training', 'external:training'])
    assert.equal(new Set(keys).size, keys.length)
    assert.equal(list[0].label, 'Training')
    assert.equal(list[1].label, 'Training')
  })

  it('keeps both hosted Training Focus and external Fitness Training', () => {
    const list = buildSpacesList({ warn() {} })
    const trainings = list.filter((s) => s.id === 'training')
    assert.equal(trainings.length, 2)
    assert.equal(trainings[0].listKey, 'hosted:training')
    assert.equal(trainings[0].external, false)
    assert.equal(trainings[0].href, '/spaces/training')
    assert.equal(trainings[1].listKey, 'external:training')
    assert.equal(trainings[1].external, true)
    assert.match(trainings[1].href, /fitness\.kenos\.space/)
  })

  it('list length equals hosted + KENOS_SPACES length', () => {
    const list = buildSpacesList({ warn() {} })
    assert.equal(list.length, HOSTED_SPACES.length + KENOS_SPACES.length)
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
