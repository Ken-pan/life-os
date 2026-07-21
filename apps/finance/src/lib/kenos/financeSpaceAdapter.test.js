import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MONEY_SPACE_ID,
  buildMoneyNavManifest,
  clearMoneyOverlay,
  resolveMoneyLiveState,
  sanitizeMoneySubtitle,
  setMoneyOverlay,
  suspendMoneySpace,
} from './financeSpaceAdapter.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('financeSpaceAdapter (Money)', () => {
  beforeEach(() => {
    clearMoneyOverlay()
  })

  it('uses frozen money space id', () => {
    expect(MONEY_SPACE_ID).toBe('money')
  })

  it('sanitizes amounts from resume subtitles', () => {
    expect(sanitizeMoneySubtitle('Spent ¥1,234.50 today')).toBe(
      'Spent [amount] today',
    )
    expect(sanitizeMoneySubtitle('Today')).toBe('Today')
  })

  it('suspends without balance amounts in descriptor', () => {
    const d = suspendMoneySpace({
      pathname: '/home/today',
      sectionLabel: 'Balance $12,345',
    })
    expect(d.spaceId).toBe('money')
    expect(d.displaySubtitle).toBe('Balance [amount]')
    expect(JSON.stringify(d)).not.toMatch(/\$12/)
  })

  it('builds nav manifest without amount leakage', () => {
    const m = buildMoneyNavManifest()
    expect(m.domainId).toBe('money')
    expect(m.title).toBe('Money')
    expect(m.liveState).toBe('idle')
    expect(JSON.stringify(m)).not.toMatch(/\$|¥|€|£/)
  })

  it('resolveMoneyLiveState reports overlay kinds', () => {
    expect(resolveMoneyLiveState()).toBe('idle')
    setMoneyOverlay('drawer')
    expect(resolveMoneyLiveState()).toBe('drawer')
    expect(buildMoneyNavManifest().liveState).toBe('drawer')
    setMoneyOverlay('compose')
    expect(resolveMoneyLiveState()).toBe('compose')
    clearMoneyOverlay()
    expect(resolveMoneyLiveState()).toBe('idle')
  })

  it('wires compose to History insights with compose=1', () => {
    const src = readFileSync(join(dir, 'financeSpaceAdapter.js'), 'utf8')
    expect(src).toMatch(/\/history\/insights\?compose=1/)
    expect(src).toMatch(/__KENOS_DOMAIN_COMPOSE__/)
  })
})
