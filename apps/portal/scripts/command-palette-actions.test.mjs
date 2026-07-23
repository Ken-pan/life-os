import assert from 'node:assert/strict'
import {
  PORTAL_DEEP_LINKS,
  buildPortalDeepLinkUrl,
  buildPlannerInboxUrl,
  buildPortalCommandActions,
  recordRecentSearch,
  loadRecentSearches,
} from '../src/lib/commandPaletteActions.js'

assert.ok(PORTAL_DEEP_LINKS.length >= 10, 'deep links registry')

const plannerToday = PORTAL_DEEP_LINKS.find((l) => l.id === 'planner-today')
assert.ok(plannerToday)
assert.equal(
  buildPortalDeepLinkUrl('planner', '/'),
  'https://plan.kenos.space/',
)
assert.equal(buildPlannerInboxUrl(), 'https://plan.kenos.space/inbox')

const financeToday = PORTAL_DEEP_LINKS.find((l) => l.id === 'finance-today')
assert.ok(financeToday)
assert.equal(
  buildPortalDeepLinkUrl('finance', '/home/today'),
  'https://money.kenos.space/home/today',
)

const filtered = buildPortalCommandActions({
  signOut: async () => {},
  query: '曲库',
  allowedAppKeys: ['music'],
})
assert.ok(filtered.some((a) => a.id === 'music-library'))
assert.ok(!filtered.some((a) => a.id === 'planner-inbox'))

const all = buildPortalCommandActions({
  signOut: async () => {},
  query: '',
  allowedAppKeys: ['planner', 'finance', 'fitness', 'music', 'home', 'aios'],
})
assert.ok(all.some((a) => a.id === 'sign-out'))
assert.ok(all.some((a) => a.id.startsWith('app-')))
assert.ok(all.some((a) => a.id === 'assistant-today'))
assert.ok(all.some((a) => a.id === 'assistant-approvals'))

if (typeof localStorage !== 'undefined') {
  localStorage.removeItem('portal_cp_recent_v1')
  recordRecentSearch('今日', 'planner-today', 'Planner · 今日')
  const recent = loadRecentSearches()
  assert.equal(recent.length, 1)
  assert.equal(recent[0].actionId, 'planner-today')
  localStorage.removeItem('portal_cp_recent_v1')
}

console.log('command-palette-actions.test.mjs: all passed')
