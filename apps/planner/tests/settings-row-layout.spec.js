import { expect, test } from '@playwright/test'
import { waitForPlannerShell } from './e2e.helpers.js'

/*
  护栏：设置行(.pref-copy)在任何视口下都不得被控件挤成 0 宽。

  背景(2026-07-16)：桌面多栏设置(.settings-page--planner 双栏)把卡片压到 ~289px 时，
  非 toggle 行里的多按钮 seg(每日目标 1–7，固有 311px)因 .pref-control{flex-shrink:0}
  溢出，把 .pref-copy 挤成 0 宽 → 中文描述逐字竖排。修复走 @container(按卡片宽度堆叠)。
  静态 CSS 检查器(check-lifeos-styles.mjs)照不到渲染盒宽，故用此运行时断言兜底。

  失败特征：copy 盒 width→0、height 数百 px(逐字竖排)。健康：width≥200、height≤60。
  这里对多档宽度(含双栏把卡片压最窄的 840–1000px 区间)断言每个 copy width≥48 且 height≤200。
*/

const WIDTHS = [860, 900, 1000, 1280]

test.describe('settings 行布局护栏', () => {
  for (const width of WIDTHS) {
    test(`@${width}px 设置行不被控件挤成竖排`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 })
      await page.goto('/settings')
      await waitForPlannerShell(page)
      await page.waitForSelector('.settings-page .set-row', { timeout: 15_000 })

      const collapsed = await page.evaluate(() => {
        /** @type {{label:string,w:number,h:number}[]} */
        const bad = []
        for (const copy of document.querySelectorAll('.settings-page .pref-copy')) {
          const box = copy.getBoundingClientRect()
          const label =
            copy.querySelector('.pref-label, .sr-label')?.textContent?.trim() ??
            '(无标签)'
          // width→0 或 height 异常高 = 文本被挤成逐字竖排
          if (box.width < 48 || box.height > 200) {
            bad.push({ label, w: Math.round(box.width), h: Math.round(box.height) })
          }
        }
        return bad
      })

      expect(
        collapsed,
        `以下设置行被挤成竖排(width<48 或 height>200): ${JSON.stringify(collapsed)}`,
      ).toEqual([])
    })
  }
})
