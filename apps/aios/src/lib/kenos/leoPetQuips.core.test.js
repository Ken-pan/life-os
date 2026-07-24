import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  LEO_PET_QUIPS,
  LEO_PET_QUIP_COOLDOWN_MS,
  LEO_PET_QUIP_MIN_GAP_MS,
  LEO_PET_QUIP_POSES,
  canShowLeoPetQuip,
  createLeoPetPetting,
  leoPetGreetTrigger,
  leoPetQuipPose,
  pickLeoPetQuip,
  pickLeoPetSayQuip,
} from './leoPetQuips.core.js'

describe('leoPetQuips', () => {
  it('has non-empty SFW pools for every trigger', () => {
    for (const [trigger, pool] of Object.entries(LEO_PET_QUIPS)) {
      assert.ok(pool.length >= 2, `${trigger} pool too small`)
      for (const text of pool) {
        assert.ok(text.trim().length > 0)
        assert.ok(text.length <= 80, `${trigger} quip too long: ${text}`)
      }
    }
  })

  it('maps hours to greeting triggers', () => {
    assert.equal(leoPetGreetTrigger(6), 'greet_morning')
    assert.equal(leoPetGreetTrigger(12), 'greet_afternoon')
    assert.equal(leoPetGreetTrigger(19), 'greet_evening')
    assert.equal(leoPetGreetTrigger(23), 'greet_night')
    assert.equal(leoPetGreetTrigger(2), 'greet_night')
    // 兜底:非法输入回早午段而不是崩
    assert.equal(leoPetGreetTrigger(NaN), 'greet_morning')
  })

  it('picks from pool, avoids repeating lastId, unknown trigger → null', () => {
    const first = pickLeoPetQuip('petted', { rand: () => 0 })
    assert.equal(first.id, 'petted:0')
    assert.equal(first.text, LEO_PET_QUIPS.petted[0])
    const next = pickLeoPetQuip('petted', { rand: () => 0, lastId: 'petted:0' })
    assert.notEqual(next.id, 'petted:0')
    assert.equal(pickLeoPetQuip('nope'), null)
  })

  it('maps quip triggers (and quip ids) to context poses', () => {
    assert.equal(leoPetQuipPose('greet_morning'), 'coffee')
    assert.equal(leoPetQuipPose('greet_afternoon'), 'shake')
    assert.equal(leoPetQuipPose('greet_evening'), 'cook')
    assert.equal(leoPetQuipPose('greet_night'), 'soft')
    assert.equal(leoPetQuipPose('wake:1'), 'smirk')
    assert.equal(leoPetQuipPose('idle_ambient:2'), 'stretch')
    assert.equal(leoPetQuipPose('oops'), 'oops')
    assert.equal(leoPetQuipPose('nope'), '')
    assert.equal(leoPetQuipPose(''), '')
    // 每个映射的触发源都真实存在于台词池
    for (const trigger of Object.keys(LEO_PET_QUIP_POSES)) {
      assert.ok(LEO_PET_QUIPS[trigger], `${trigger} 无台词池`)
    }
  })

  it('say-quip mixes greeting and ambient pools', () => {
    const greet = pickLeoPetSayQuip(8, { rand: () => 0.1 })
    assert.ok(greet.id.startsWith('greet_morning:'))
    const ambient = pickLeoPetSayQuip(8, { rand: () => 0.9 })
    assert.ok(ambient.id.startsWith('idle_ambient:'))
  })

  it('gates auto triggers with long cooldown, interactive with min gap', () => {
    const now = 100_000
    assert.equal(
      canShowLeoPetQuip('idle_ambient', {
        now,
        lastQuipAt: now - LEO_PET_QUIP_COOLDOWN_MS + 1,
      }),
      false,
    )
    assert.equal(
      canShowLeoPetQuip('idle_ambient', {
        now,
        lastQuipAt: now - LEO_PET_QUIP_COOLDOWN_MS,
      }),
      true,
    )
    assert.equal(
      canShowLeoPetQuip('petted', {
        now,
        lastQuipAt: now - LEO_PET_QUIP_MIN_GAP_MS + 1,
      }),
      false,
    )
    assert.equal(
      canShowLeoPetQuip('petted', {
        now,
        lastQuipAt: now - LEO_PET_QUIP_MIN_GAP_MS,
      }),
      true,
    )
    // 从未出过话 → 都放行
    assert.equal(canShowLeoPetQuip('greet_morning', { now, lastQuipAt: 0 }), true)
  })

  it('petting detector: accumulates within window, fires once, cools down', () => {
    const pet = createLeoPetPetting({
      thresholdPx: 100,
      windowMs: 500,
      cooldownMs: 5000,
    })
    assert.equal(pet.move(40, 0, 1000), false)
    assert.equal(pet.move(40, 0, 1200), false)
    assert.equal(pet.move(30, 0, 1400), true)
    // 冷却内继续摸不再触发
    assert.equal(pet.move(200, 0, 1600), false)
    // 窗口断开重计:两段各 60px 不该触发
    const pet2 = createLeoPetPetting({
      thresholdPx: 100,
      windowMs: 500,
      cooldownMs: 5000,
    })
    assert.equal(pet2.move(60, 0, 1000), false)
    assert.equal(pet2.move(60, 0, 2000), false)
    // 冷却结束后可再次触发
    assert.equal(pet.move(120, 0, 7000), true)
  })
})
