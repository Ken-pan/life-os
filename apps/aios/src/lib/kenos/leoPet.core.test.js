import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEO_PET_SLEEP_AFTER_MS,
  leoPetAllSrcs,
  leoPetDesktopShouldOpen,
  leoPetShouldAnimate,
  leoPetShouldShow,
  cycleLeoPetSize,
  leoPetSizePx,
  leoPetSrc,
  normalizeLeoPetPose,
  normalizeLeoPetPosition,
  normalizeLeoPetSize,
  resolveLeoPetPose,
} from './leoPet.core.js'

describe('leoPet.core', () => {
  it('normalizes pose and maps src', () => {
    assert.equal(normalizeLeoPetPose('nope'), 'idle')
    assert.equal(normalizeLeoPetPose('think'), 'think')
    // 交互反馈专属帧
    assert.equal(normalizeLeoPetPose('petted'), 'petted')
    assert.equal(normalizeLeoPetPose('celebrate'), 'celebrate')
    assert.equal(normalizeLeoPetPose('stretch'), 'stretch')
    assert.equal(leoPetSrc('idle'), '/leo/pet/idle_a.png')
    assert.equal(leoPetSrc('idle', { idleFrame: 1 }), '/leo/pet/idle_b.png')
    assert.equal(leoPetSrc('wave'), '/leo/pet/wave.png')
    assert.equal(leoPetSrc('busy'), '/leo/pet/busy.png')
    assert.equal(leoPetSrc('petted'), '/leo/pet/petted.png')
    assert.equal(leoPetSrc('celebrate'), '/leo/pet/celebrate.png')
    assert.equal(leoPetSrc('stretch'), '/leo/pet/stretch.png')
    assert.equal(leoPetSrc('coffee'), '/leo/pet/coffee.png')
    assert.equal(leoPetSrc('smirk'), '/leo/pet/smirk.png')
    assert.equal(leoPetSrc('shake'), '/leo/pet/shake.png')
    assert.equal(leoPetSrc('cook'), '/leo/pet/cook.png')
    assert.equal(leoPetSrc('speak'), '/leo/pet/speak.png')
    assert.equal(leoPetSrc('draw'), '/leo/pet/draw.png')
    assert.equal(leoPetSrc('oops'), '/leo/pet/oops.png')
    assert.equal(leoPetSrc('yawn'), '/leo/pet/yawn.png')
    assert.ok(leoPetAllSrcs().includes('/leo/pet/soft.png'))
    assert.ok(leoPetAllSrcs().includes('/leo/pet/stretch.png'))
    assert.ok(leoPetAllSrcs().includes('/leo/pet/cook.png'))
  })

  it('resolves pose by priority', () => {
    assert.equal(
      resolveLeoPetPose({
        clickRemainingMs: 500,
        clickPose: 'happy',
        streaming: true,
      }),
      'happy',
    )
    assert.equal(resolveLeoPetPose({ softMode: true, streaming: true }), 'soft')
    // 生图 > 工具 > 流式 > 朗读 > 聆听
    assert.equal(
      resolveLeoPetPose({ imageGen: true, toolRunning: true, streaming: true }),
      'draw',
    )
    assert.equal(resolveLeoPetPose({ toolRunning: true, streaming: true }), 'busy')
    assert.equal(resolveLeoPetPose({ streaming: true, speaking: true }), 'think')
    assert.equal(resolveLeoPetPose({ speaking: true, listening: true }), 'speak')
    assert.equal(resolveLeoPetPose({ listening: true }), 'listen')
    assert.equal(
      resolveLeoPetPose({ idleMs: LEO_PET_SLEEP_AFTER_MS + 1 }),
      'sleep',
    )
    // 睡前窗口打哈欠
    assert.equal(
      resolveLeoPetPose({ idleMs: LEO_PET_SLEEP_AFTER_MS - 30_000 }),
      'yawn',
    )
    assert.equal(
      resolveLeoPetPose({ idleMs: LEO_PET_SLEEP_AFTER_MS - 90_000 }),
      'idle',
    )
    assert.equal(resolveLeoPetPose({}), 'idle')
  })

  it('gates visibility and desktop window (desktop is explicit opt-in)', () => {
    assert.equal(leoPetShouldShow({ assistantPersona: 'korben' }), false)
    assert.equal(leoPetShouldShow({ assistantPersona: 'leo' }), true)
    assert.equal(
      leoPetShouldShow({ assistantPersona: 'leo', leoPetEnabled: false }),
      false,
    )
    assert.equal(
      leoPetShouldShow({ assistantPersona: 'leo' }, { tucked: true }),
      false,
    )
    assert.equal(
      leoPetDesktopShouldOpen({
        assistantPersona: 'leo',
        leoPetDesktop: false,
      }),
      false,
    )
    assert.equal(
      leoPetDesktopShouldOpen({ assistantPersona: 'leo' }),
      false,
    )
    assert.equal(
      leoPetDesktopShouldOpen({ assistantPersona: 'leo', leoPetDesktop: true }),
      true,
    )
  })

  it('normalizes position, size, and animation gates', () => {
    assert.deepEqual(normalizeLeoPetPosition(null), { right: 24, bottom: 96 })
    assert.deepEqual(normalizeLeoPetPosition({ right: 12.7, bottom: 40 }), {
      right: 13,
      bottom: 40,
    })
    assert.deepEqual(normalizeLeoPetPosition({ x: -30, y: -80 }), {
      right: 30,
      bottom: 80,
    })
    assert.deepEqual(
      normalizeLeoPetPosition(
        { right: 9999, bottom: 9999 },
        {
          maxRight: 200,
          maxBottom: 300,
        },
      ),
      { right: 200, bottom: 300 },
    )
    assert.equal(normalizeLeoPetSize('lg'), 'lg')
    assert.equal(normalizeLeoPetSize('nope'), 'md')
    assert.equal(leoPetSizePx('sm'), 88)
    assert.equal(cycleLeoPetSize('sm'), 'md')
    assert.equal(cycleLeoPetSize('md'), 'lg')
    assert.equal(cycleLeoPetSize('lg'), 'sm')
    assert.equal(cycleLeoPetSize('nope'), 'lg')
    assert.equal(leoPetShouldAnimate({ hidden: true }), false)
    assert.equal(leoPetShouldAnimate({ reducedMotion: true }), false)
    assert.equal(leoPetShouldAnimate({}), true)
  })
})
