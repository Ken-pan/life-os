import { describe, expect, it } from 'vitest'
import {
  buildAppHash,
  buildAppPath,
  migrateLegacyRouteUrl,
  parseAppHash,
  parseAppPath,
  resolveGoTabTarget,
} from './app-route.js'

describe('appRoute', () => {
  it('parses pathname routes with default section', () => {
    expect(parseAppPath('/')).toEqual({ tab: 'home', section: 'today' })
    expect(parseAppPath('/accounts')).toEqual({ tab: 'accounts' })
    expect(parseAppPath('/home')).toEqual({ tab: 'home', section: 'today' })
  })

  it('parses pathname with section', () => {
    expect(parseAppPath('/home/overview')).toEqual({
      tab: 'home',
      section: 'overview',
    })
    expect(parseAppPath('/decision/compare')).toEqual({
      tab: 'decision',
      section: 'compare',
    })
  })

  it('parses legacy hash routes', () => {
    expect(parseAppHash('#/today')).toEqual({ tab: 'home', section: 'today' })
    expect(parseAppHash('#/settings/accounts')).toEqual({ tab: 'accounts' })
  })

  it('rejects invalid routes', () => {
    expect(parseAppPath('/nope')).toBeNull()
    expect(parseAppPath('/history/nope')).toBeNull()
    expect(parseAppPath('/api/stooq')).toBeNull()
  })

  it('builds pathname round-trip', () => {
    const route = { tab: 'review' as const, section: 'baseline' }
    expect(parseAppPath(buildAppPath(route))).toEqual(route)
  })

  it('buildAppHash mirrors pathname as hash', () => {
    expect(buildAppHash({ tab: 'accounts' })).toBe('#/accounts')
    expect(buildAppHash({ tab: 'decision', section: 'log' })).toBe(
      '#/decision/log',
    )
  })

  it('resolveGoTabTarget supports legacy go-tab calls', () => {
    expect(resolveGoTabTarget('today')).toEqual({
      tab: 'home',
      section: 'today',
    })
    expect(resolveGoTabTarget('settings', 'accounts')).toEqual({
      tab: 'accounts',
    })
  })

  it.skipIf(typeof window === 'undefined')('migrateLegacyRouteUrl normalizes hash to pathname', () => {
    window.history.replaceState(null, '', '/?keep=1#/decision/saved')
    migrateLegacyRouteUrl()
    expect(window.location.pathname).toBe('/decision/saved')
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?keep=1')
  })
})
