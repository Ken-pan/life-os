import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LIFE_OS_SHELL,
  LIFE_OS_SHELL_COLUMN_SCROLL_SELECTORS,
  getScrollRootSelector,
  getScrollRootSelectorForShell,
  getScrollRootSelectorsForShell,
} from './shell.js'

test('shell column compound selectors target scroll child not column', () => {
  for (const sel of LIFE_OS_SHELL_COLUMN_SCROLL_SELECTORS) {
    assert.match(sel, />/)
    assert.doesNotMatch(sel, /^\.life-os-shell-column,/)
  }
})

test('getScrollRootSelectorForShell matches shell types', () => {
  assert.match(getScrollRootSelectorForShell('main-wrap-main'), /#main-content/)
  assert.match(getScrollRootSelectorForShell('main-wrap-content'), /\.content/)
  assert.match(
    getScrollRootSelectorForShell('main-col-wrap'),
    /life-os-page-workspace/,
  )
})

test('getScrollRootSelectorsForShell returns arrays', () => {
  const planner = getScrollRootSelectorsForShell('main-col-wrap')
  assert.ok(Array.isArray(planner))
  assert.ok(planner.length >= 4)
})

test('getScrollRootSelector includes explicit scroll surface class', () => {
  const sel = getScrollRootSelector()
  assert.match(sel, /\.life-os-scroll-surface/)
  assert.ok(sel.includes(LIFE_OS_SHELL.pageWorkspaceClass))
})
