import { describe, expect, it, vi } from 'vitest'
import { getLifeEventSource } from './lifeEventSource.js'

vi.mock('@life-os/theme', () => ({
  getLifeOsAppOrigin: (appId) => `https://${appId}.example.test`,
}))

const t = (key) =>
  ({
    'task.lifeEventFinance': '来自 Money',
    'task.lifeEventFitness': '来自 Fitness',
  })[key] ?? key

describe('getLifeEventSource', () => {
  it('returns finance deep link', () => {
    const source = getLifeEventSource(
      {
        meta: { lifeEventRef: { domain: 'finance', occurrenceId: 'occ_1' } },
      },
      t,
    )
    expect(source).toEqual({
      domain: 'finance',
      label: '来自 Money',
      href: 'https://finance.example.test/#/today',
    })
  })

  it('returns fitness deep link', () => {
    const source = getLifeEventSource(
      {
        meta: { lifeEventRef: { domain: 'fitness', sessionId: 'sess_1' } },
      },
      t,
    )
    expect(source?.href).toBe('https://fitness.example.test')
  })

  it('returns null without lifeEventRef', () => {
    expect(getLifeEventSource({ meta: {} }, t)).toBeNull()
  })
})
