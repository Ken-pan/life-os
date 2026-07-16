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

        test(`chip tag — ${app} / ${mode}`, async ({ page }) => {
          await gotoCatalog(page, 'chips', app, mode)
          const chip = page.locator('.chip.tag').first()
          const { color, backgroundColor } = await readPairContrast(chip)
          assertContrast(
            `chip.tag ${app}/${mode}`,
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
    test('app shell skip link targets the main landmark', async ({ page }) => {
      await gotoCatalog(page, 'app-shell', 'planner', 'light')
      const skipLink = page.getByRole('link', { name: 'Skip to fixture content' })
      await assertFocusRing(skipLink, 'app-shell skip link')
      await skipLink.press('Enter')
      await expect(
        page.getByRole('main', { name: 'Shell fixture content' }),
      ).toBeFocused()
    })

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

      test(`checkbox — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'selection', 'planner', mode)
        await assertFocusRing(page.locator('.checkbox').first(), 'checkbox')
      })

      test(`tab — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'tabs', 'planner', mode)
        await assertFocusRing(page.locator('[role="tab"]').first(), 'tab')
      })

      test(`filter chip — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'chips', 'planner', mode)
        await assertFocusRing(page.locator('button.chip').first(), 'filter-chip')
      })

      test(`pagination — planner / ${mode}`, async ({ page }) => {
        await gotoCatalog(page, 'lists', 'planner', mode)
        await assertFocusRing(
          page.locator('.pagination__btn[aria-current="page"]').first(),
          'pagination-current',
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

      test(`option row — ${app}`, async ({ page }) => {
        await gotoCatalog(page, 'selection', app, 'light')
        await assertMinTouchTarget(
          page.locator('.option-row').first(),
          `option-row ${app}`,
        )
      })

      test(`list item — ${app}`, async ({ page }) => {
        await gotoCatalog(page, 'lists', app, 'light')
        await assertMinTouchTarget(
          page.locator('.list-item').first(),
          `list-item ${app}`,
        )
      })

      test(`accordion summary — ${app}`, async ({ page }) => {
        await gotoCatalog(page, 'disclosure', app, 'light')
        await assertMinTouchTarget(
          page.locator('.accordion summary').first(),
          `accordion-summary ${app}`,
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

    test('indeterminate progress animation disabled', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await gotoCatalog(page, 'progress', 'planner', 'light')
      await assertReducedMotion(
        page,
        '.progress--indeterminate .progress__fill',
      )
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
