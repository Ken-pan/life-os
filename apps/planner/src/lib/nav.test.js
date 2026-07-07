import { describe, it, expect } from 'vitest'
import { isMoreNavActive, resolvePrimaryNavTab, resolveFabMode } from './nav.js'

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

  it('assigns FAB modes by route', () => {
    expect(resolveFabMode('/')).toBe('large')
    expect(resolveFabMode('/', '?view=timeline')).toBe('none')
    expect(resolveFabMode('/inbox')).toBe('none')
    expect(resolveFabMode('/upcoming')).toBe('compact')
    expect(resolveFabMode('/calendar')).toBe('compact')
    expect(resolveFabMode('/lists/work')).toBe('compact')
    expect(resolveFabMode('/completed')).toBe('none')
    expect(resolveFabMode('/search')).toBe('none')
    expect(resolveFabMode('/settings')).toBe('none')
  })
})
