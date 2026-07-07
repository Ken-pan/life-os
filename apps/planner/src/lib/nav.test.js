import { describe, it, expect } from 'vitest'
import { isMoreNavActive, resolvePrimaryNavTab } from './nav.js'

describe('nav', () => {
  it('keeps today as primary tab on timeline view', () => {
    expect(resolvePrimaryNavTab('/')).toBe('today')
    expect(isMoreNavActive('/', '?view=timeline')).toBe(false)
  })

  it('highlights more on calendar and settings routes', () => {
    expect(isMoreNavActive('/calendar')).toBe(true)
    expect(isMoreNavActive('/settings')).toBe(true)
    expect(isMoreNavActive('/search')).toBe(true)
  })
})
