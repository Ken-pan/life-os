import { describe, it, expect } from 'vitest'
import {
  isMoreNavActive,
  resolvePrimaryNavTab,
  resolveFabMode,
  isTaskModuleRoute,
} from './nav.js'

describe('nav', () => {
  it('treats smart lists and user lists as task module', () => {
    expect(isTaskModuleRoute('/')).toBe(true)
    expect(isTaskModuleRoute('/inbox')).toBe(true)
    expect(isTaskModuleRoute('/upcoming')).toBe(true)
    expect(isTaskModuleRoute('/completed')).toBe(true)
    expect(isTaskModuleRoute('/lists/work')).toBe(true)
    expect(isTaskModuleRoute('/calendar')).toBe(false)
    expect(isTaskModuleRoute('/search')).toBe(false)
  })

  it('highlights tasks tab for all task-module routes including timeline', () => {
    expect(resolvePrimaryNavTab('/')).toBe('tasks')
    expect(resolvePrimaryNavTab('/inbox')).toBe('tasks')
    expect(resolvePrimaryNavTab('/lists/abc')).toBe('tasks')
    expect(isMoreNavActive('/', '?view=timeline')).toBe(false)
  })

  it('highlights calendar and search as primary; more only for settings', () => {
    expect(resolvePrimaryNavTab('/calendar')).toBe('calendar')
    expect(resolvePrimaryNavTab('/search')).toBe('search')
    expect(isMoreNavActive('/calendar')).toBe(false)
    expect(isMoreNavActive('/search')).toBe(false)
    expect(isMoreNavActive('/lists/work')).toBe(false)
    expect(isMoreNavActive('/settings')).toBe(true)
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
