import { test, expect } from '@playwright/test'
import {
  APPS,
  MODES,
} from './design-catalog.helpers.js'
import {
  WCAG_AA_UI,
  assertContrast,
  assertFocusRing,
  assertMinTouchTarget,
  assertReducedMotion,
  gotoCatalog,
  parseDurationMs,
  readPairContrast,
} from './design-catalog.a11y.helpers.js'

test.describe('design-catalog a11y gates @a11y', () => {
  test.describe('contrast (WCAG AA UI ≥ 3:1)', () => {
    for (const app of APPS) {
      for (const mode of MODES) {
        test(`btn-primary — ${app} / ${mode}`, async ({ page }) => {
          await gotoCatalog(page, 'buttons', app, mode)
          const btn = page.locator('.btn-primary').first()
          const { color, backgroundColor } = await readPairContrast(btn)
          assertContrast(
            `btn-primary ${app}/${mode}`,
            color,
            backgroundColor,
            WCAG_AA_UI,
          )
        })

        test(`btn-danger — ${app} / ${mode}`, async ({ page }) => {
          await gotoCatalog(page, 'buttons', app, mode)
          const btn = page.locator('.btn-danger').first()
          const { color, backgroundColor } = await readPairContrast(btn)
          assertContrast(
            `btn-danger ${app}/${mode}`,
            color,
            backgroundColor,
            WCAG_AA_UI,
          )
        })

        test(`toast message — ${app} / ${mode}`, async ({ page }) => {
          await gotoCatalog(page, 'toast', app, mode)
          const toast = page.locator('.toast.show, .toast').first()
          const msg = toast.locator('.toast-msg').first()
          const toastBg = await toast.evaluate(
            (el) => getComputedStyle(el).backgroundColor,
          )
          const msgColor = await msg.evaluate((el) => getComputedStyle(el).color)
          assertContrast(
            `toast ${app}/${mode}`,
            msgColor,
            toastBg,
            WCAG_AA_UI,
          )
        })
      }
    }
  })

  test.describe('focus-visible rings', () => {
    for (const mode of MODES) {
      test(`btn-primary — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'buttons', 'planner', mode)
        await assertFocusRing(page.locator('.btn-primary').first(), 'btn-primary')
      })

      test(`segment control — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'segments', 'planner', mode)
        await assertFocusRing(
          page.locator('[aria-label="Demo segment"] button').first(),
          'segment',
        )
      })

      test(`toast dismiss — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'toast', 'planner', mode)
        await assertFocusRing(
          page.locator('.toast-dismiss').first(),
          'toast-dismiss',
        )
      })

      test(`settings action — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'settings', 'planner', mode)
        await assertFocusRing(
          page
            .locator('.catalog-state-block')
            .filter({ hasText: 'Default' })
            .locator('.settings-row .btn-secondary')
            .first(),
          'settings-btn',
        )
      })
    }
  })

  test.describe('touch targets (≥ 44px)', () => {
    for (const app of APPS) {
      test(`btn-primary — ${app}`, async ({ page }) => {
        await gotoCatalog(page, 'buttons', app, 'light')
        await assertMinTouchTarget(
          page.locator('.btn-primary').first(),
          `btn-primary ${app}`,
        )
      })

      test(`segment option — ${app}`, async ({ page }) => {
        await gotoCatalog(page, 'segments', app, 'light')
        await assertMinTouchTarget(
          page.locator('[aria-label="Demo segment"] button').first(),
          `segment ${app}`,
        )
      })

      test(`toast dismiss — ${app}`, async ({ page }) => {
        await gotoCatalog(page, 'toast', app, 'light')
        await assertMinTouchTarget(
          page.locator('.toast-dismiss').first(),
          `toast-dismiss ${app}`,
        )
      })
    }
  })

  test.describe('prefers-reduced-motion', () => {
    test('global transitions collapse', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await gotoCatalog(page, 'buttons', 'planner', 'light')
      await assertReducedMotion(page, '.btn-primary')
    })

    test('toast transition disabled', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await gotoCatalog(page, 'toast', 'planner', 'light')
      await assertReducedMotion(page, '.toast')
    })

    test('command palette animation disabled', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await gotoCatalog(page, 'command-palette', 'planner', 'light')
      const ms = await page.locator('.cp-container').first().evaluate((el) => {
        const s = getComputedStyle(el)
        return s.animationDuration
      })
      expect(parseDurationMs(ms)).toBeLessThanOrEqual(1)
    })
  })
})
