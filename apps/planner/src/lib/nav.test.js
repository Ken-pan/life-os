import { describe, it, expect } from 'vitest'
import {
  isMoreNavActive,
  resolvePrimaryNavTab,
  resolveFabMode,
  isTaskModuleRoute,
  isDomainComposeVisible,
  buildBrowseNavItems,
  buildPrimaryNavItems,
} from './nav.js'

const tr = (key) => key

describe('nav', () => {
  it('treats today/triage as task module; inbox is its own tab', () => {
    expect(isTaskModuleRoute('/')).toBe(true)
    expect(isTaskModuleRoute('/triage')).toBe(true)
    expect(isTaskModuleRoute('/inbox')).toBe(false)
    expect(isTaskModuleRoute('/upcoming')).toBe(false)
    expect(isTaskModuleRoute('/completed')).toBe(false)
    expect(isTaskModuleRoute('/lists/work')).toBe(false)
    expect(isTaskModuleRoute('/calendar')).toBe(false)
    expect(isTaskModuleRoute('/search')).toBe(false)
  })

  it('primary tabs are tasks · calendar · inbox', () => {
    expect(buildPrimaryNavItems(tr).map((i) => i.tab)).toEqual([
      'tasks',
      'calendar',
      'inbox',
    ])
    expect(resolvePrimaryNavTab('/')).toBe('tasks')
    expect(resolvePrimaryNavTab('/inbox')).toBe('inbox')
    expect(resolvePrimaryNavTab('/calendar')).toBe('calendar')
  })

  it('browse group has projects, insights, calendar and search', () => {
    const items = buildBrowseNavItems(tr)
    expect(items.map((i) => i.tab)).toEqual([
      'projects',
      'insights',
      'calendar',
      'search',
    ])
  })

  it('puts search / lists / secondary destinations under More', () => {
    expect(resolvePrimaryNavTab('/search')).toBe('')
    expect(isMoreNavActive('/calendar')).toBe(false)
    expect(isMoreNavActive('/inbox')).toBe(false)
    expect(isMoreNavActive('/search')).toBe(true)
    expect(isMoreNavActive('/lists/work')).toBe(true)
    expect(isMoreNavActive('/projects')).toBe(true)
    expect(isMoreNavActive('/upcoming')).toBe(true)
    expect(isMoreNavActive('/settings')).toBe(true)
  })

  it('assigns FAB modes by route', () => {
    expect(resolveFabMode('/')).toBe('large')
    expect(resolveFabMode('/inbox')).toBe('none')
    expect(resolveFabMode('/upcoming')).toBe('compact')
    expect(resolveFabMode('/calendar')).toBe('compact')
    expect(resolveFabMode('/lists/work')).toBe('compact')
    expect(resolveFabMode('/completed')).toBe('none')
    expect(resolveFabMode('/search')).toBe('none')
    expect(resolveFabMode('/settings')).toBe('none')
  })

  it('domain compose is broader than FAB (inbox / projects)', () => {
    expect(isDomainComposeVisible('/')).toBe(true)
    expect(isDomainComposeVisible('/inbox')).toBe(true)
    expect(isDomainComposeVisible('/projects')).toBe(true)
    expect(isDomainComposeVisible('/projects/abc')).toBe(true)
    expect(isDomainComposeVisible('/calendar')).toBe(true)
    expect(isDomainComposeVisible('/settings')).toBe(false)
    expect(isDomainComposeVisible('/search')).toBe(false)
    expect(isDomainComposeVisible('/triage')).toBe(false)
    expect(isDomainComposeVisible('/insights')).toBe(false)
  })
})
