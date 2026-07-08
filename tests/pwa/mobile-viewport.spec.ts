import { test, expect } from '@playwright/test'
import { getApp, getAppList } from '../../scripts/pwa/apps.config.mjs'
import { readShellMetrics } from './_helpers.mjs'

for (const app of getAppList({ testEnabledOnly: true })) {
  test.describe(`${app.id}`, () => {
    for (const route of app.routes) {
      test(`mobile sanity: ${route.name}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== app.id, 'wrong project')

        await page.goto(route.path, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector(app.waitSelector, { timeout: 45_000 })

        const metrics = await readShellMetrics(page, app, false)
        expect(metrics.innerHeight).toBeGreaterThan(500)

        if (metrics.hasAppShell && metrics.mainClientHeight != null) {
          expect(metrics.mainClientHeight).toBeGreaterThan(120)
        } else if (app.authGate && metrics.hasAuthScreen) {
          expect(
            metrics.mainClientHeight ?? metrics.clientHeight,
          ).toBeGreaterThan(200)
        }

        await page.screenshot({
          path: `screenshots/pwa/${app.id}-${route.name}-mobile.png`,
          fullPage: true,
        })
      })

      test(`standalone shell guard: ${route.name}`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== app.id, 'wrong project')

        await page.goto(route.path, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector(app.waitSelector, { timeout: 45_000 })

        const metrics = await readShellMetrics(page, app, true)

        if (metrics.hasAppShell) {
          expect(metrics.bodyDisplay).toBe('flex')

          if (
            app.shellType === 'main-wrap-main' ||
            app.shellType === 'main-wrap-content'
          ) {
            expect(metrics.mainOverflowY).toBe('auto')
          } else if (app.shellType === 'main-col-wrap') {
            expect(['auto', 'scroll']).toContain(metrics.mainOverflowY ?? '')
          }

          if (app.nestedWrapInMain && metrics.wrapOffsetHeight > 0) {
            expect(metrics.wrapHeight).not.toBe('0px')
            expect(metrics.wrapOverflowY).toBe('visible')
            expect(metrics.mainScrollHeight ?? 0).toBeGreaterThanOrEqual(
              metrics.wrapOffsetHeight - 8,
            )
          }
        } else if (app.authGate && metrics.hasAuthScreen) {
          expect(metrics.clientHeight).toBeGreaterThan(400)
        } else {
          test.skip(true, 'shell not available (auth/loading)')
        }

        await page.screenshot({
          path: `screenshots/pwa/${app.id}-${route.name}-standalone-class.png`,
          fullPage: true,
        })
      })
    }
  })
}

// Sanity: every project name maps to a known app
test('project registry', async ({}, testInfo) => {
  expect(() => getApp(testInfo.project.name)).not.toThrow()
})
