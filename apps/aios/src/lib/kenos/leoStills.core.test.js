import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEO_STILLS,
  getLeoStill,
  leoPresenceStill,
  leoStillCaption,
  leoStillChipHint,
  leoStillPickerGroups,
  resolveLeoStill,
} from './leoStills.core.js'

describe('leoStills.core', () => {
  it('catalog ids are unique and paths under /leo/scenes/', () => {
    const ids = new Set()
    for (const s of LEO_STILLS) {
      assert.equal(ids.has(s.id), false)
      ids.add(s.id)
      assert.match(s.src, /^\/leo\/scenes\/[\w-]+\.png$/)
      assert.ok(s.group)
    }
    assert.ok(ids.size >= 20)
  })

  it('maps scenarios to presence stills (scene hero order)', () => {
    assert.equal(leoPresenceStill({ scenarioId: 'gym_after' }).id, 'gym')
    assert.equal(leoPresenceStill({ scenarioId: 'couch' }).id, 'couch')
    assert.equal(leoPresenceStill({ scenarioId: 'late_night' }).id, 'night_text')
    assert.equal(leoPresenceStill({ scenarioId: 'shower' }).id, 'shower')
    assert.equal(leoPresenceStill({ scenarioId: 'none' }).id, 'home')
    assert.equal(leoPresenceStill({ scenarioId: 'nope' }).id, 'home')
  })

  it('resolves stills from text cues over scenario', () => {
    assert.equal(
      resolveLeoStill({ scenarioId: 'couch', text: '刚练完，出汗' }).id,
      'gym',
    )
    assert.equal(
      resolveLeoStill({ scenarioId: 'none', text: '沙发挤一下' }).id,
      'couch',
    )
    assert.equal(
      resolveLeoStill({ scenarioId: 'none', text: '给你倒杯咖啡' }).id,
      'coffee',
    )
    assert.equal(
      resolveLeoStill({ scenarioId: 'none', text: '蒸汽房' }).id,
      'shower',
    )
    assert.equal(getLeoStill('smug')?.src, '/leo/scenes/smug.png')
    assert.equal(getLeoStill('nope'), null)
  })

  it('builds picker groups and captions', () => {
    const groups = leoStillPickerGroups({ locale: 'zh', scenarioId: 'gym_after' })
    assert.ok(groups.length >= 4)
    assert.ok(groups.some((g) => g.items.some((i) => i.preferred)))
    const gym = getLeoStill('gym')
    assert.match(leoStillCaption(gym, { locale: 'zh' }), /练完/)
    assert.match(leoStillCaption(gym, { locale: 'en' }), /finished/i)
    assert.match(leoStillChipHint({ locale: 'zh' }), /现成/)
    assert.match(leoStillChipHint({ locale: 'en' }), /instant/i)
  })
})
