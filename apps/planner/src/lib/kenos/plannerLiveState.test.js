import { describe, it, expect, beforeEach } from 'vitest'
import {
  taskEditor,
  taskDrawer,
  schedulePopover,
  scheduleSlot,
  closeTaskEditor,
  closeTaskDrawer,
  closeSchedulePopover,
  closeScheduleSlot,
} from '$lib/ui.svelte.js'
import { resolvePlannerLiveState } from './plannerSpaceAdapter.js'

describe('resolvePlannerLiveState', () => {
  beforeEach(() => {
    closeTaskEditor()
    closeTaskDrawer()
    closeSchedulePopover()
    closeScheduleSlot()
  })

  it('reports idle by default', () => {
    expect(resolvePlannerLiveState()).toBe('idle')
  })

  it('prioritizes editing over drawer/sheet', () => {
    taskDrawer.open = true
    schedulePopover.open = true
    taskEditor.open = true
    expect(resolvePlannerLiveState()).toBe('editing')
  })

  it('reports drawer when lists menu is open', () => {
    taskDrawer.open = true
    expect(resolvePlannerLiveState()).toBe('drawer')
  })

  it('reports sheet for schedule overlays', () => {
    scheduleSlot.open = true
    expect(resolvePlannerLiveState()).toBe('sheet')
    closeScheduleSlot()
    schedulePopover.open = true
    expect(resolvePlannerLiveState()).toBe('sheet')
  })
})
