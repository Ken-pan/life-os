import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildKenosStranglerRouteMatrix,
  buildPortalTodayRedirectUrl,
  filterKenosExperimentalAccess,
  isPortalTodayRedirectCohortMember,
  isPortalTodayRedirectEnabled,
  KENOS_STRANGLER_DEFAULT_ENABLED,
  KENOS_TODAY_ORIGIN,
  resolveKenosExperimentFlag,
} from '../src/lib/kenosStrangler.js'
import { buildPortalDeepLinkUrl } from '../src/lib/commandPaletteActions.js'

assert.equal(KENOS_STRANGLER_DEFAULT_ENABLED, false)
assert.equal(resolveKenosExperimentFlag(), false)
assert.equal(resolveKenosExperimentFlag({ search: '?kenos=1', hostname: 'portal.kenos.space' }), false)
assert.equal(resolveKenosExperimentFlag({ search: '?kenos=1', hostname: 'localhost' }), true)
assert.equal(resolveKenosExperimentFlag({ search: '?kenos=0', hostname: 'localhost' }), false)
assert.equal(resolveKenosExperimentFlag({ environmentFlag: '1', hostname: 'portal.kenos.space' }), true)

assert.equal(isPortalTodayRedirectEnabled({}), false)
assert.equal(isPortalTodayRedirectEnabled({ VITE_KENOS_PORTAL_TODAY_REDIRECT: '1' }), true)
assert.equal(
  isPortalTodayRedirectCohortMember('334452284ken@gmail.com', {
    VITE_KENOS_PORTAL_TODAY_REDIRECT_OWNER_EMAILS: '334452284ken@gmail.com',
  }),
  true,
)
assert.equal(
  isPortalTodayRedirectCohortMember('other@example.com', {
    VITE_KENOS_PORTAL_TODAY_REDIRECT_OWNER_EMAILS: '334452284ken@gmail.com',
  }),
  false,
)
assert.equal(
  buildPortalTodayRedirectUrl({ search: '?utm=1', hash: '#focus' }),
  `${KENOS_TODAY_ORIGIN}/?utm=1#focus`,
)

assert.deepEqual(filterKenosExperimentalAccess(['planner', 'aios'], false), ['planner'])
assert.deepEqual(filterKenosExperimentalAccess(['planner', 'aios'], true), ['planner', 'aios'])

const off = buildKenosStranglerRouteMatrix(false)
const on = buildKenosStranglerRouteMatrix(true)
assert.equal(off.find((row) => row.source === 'portal_home').destination, 'portal_home')
assert.equal(off.find((row) => row.source === 'portal_experimental_entry').visible, false)
assert.equal(on.find((row) => row.source === 'portal_experimental_entry').visible, true)
assert.equal(on.find((row) => row.source === 'portal_experimental_entry').destination, `${KENOS_TODAY_ORIGIN}/`)
assert.equal(on.find((row) => row.source === 'kenos_today').destination, '/')
assert.equal(on.find((row) => row.source === 'kenos_assistant').destination, '/assistant')
assert.equal(on.find((row) => row.source === 'legacy_assistant').destination, '/assistant')
assert.equal(on.find((row) => row.source === 'invalid_kenos_route').destination, '/404-safe-fallback')
assert.equal(on.find((row) => row.source === 'portal_today_soft_redirect').visible, true)

assert.equal(
  buildPortalDeepLinkUrl('aios', '/assistant?return=%2Finbox'),
  'https://aios.kenos.space/assistant?return=%2Finbox',
)

const aiosManifest = JSON.parse(readFileSync(new URL('../../aios/app.manifest.json', import.meta.url)))
const webManifest = JSON.parse(readFileSync(new URL('../../aios/static/manifest.webmanifest', import.meta.url)))
assert.ok(aiosManifest.routes.some((route) => route.path === '/' && route.name === 'today'))
assert.ok(aiosManifest.routes.some((route) => route.path === '/assistant'))
assert.equal(webManifest.start_url, '/')
assert.equal(webManifest.display, 'standalone')

console.log('kenos-strangler-routing.test.mjs: ok')
