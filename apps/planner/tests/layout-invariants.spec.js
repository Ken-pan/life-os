import { expect, test } from '@playwright/test'
import { waitForPlannerShell } from './e2e.helpers.js'

/*
  护栏：核心页布局不变量(2026-07-16 建立)。

  背景：这一轮修了三类"感觉 responsive 坏"的 bug,共性是它们都只在渲染后可见、
  是元素间的关系或跨页的一致性,静态检查(check-lifeos-styles.mjs / svelte-check)
  照不到。此 spec 把每一类固化成运行时断言,commit 即 CI 红线,防复发。

  覆盖的四条不变量:
    INV-1 无横向溢出      —— 页面不横向滚动,且没有元素越过视口右缘"漏出"
                            (排除自带 overflow-x:auto/scroll 滚动壳的固有宽图表,
                             如 charts 的 Heatmap —— 那是几何越界但已滚动收纳)。
    INV-2 标题=正文左缘   —— appbar 标题左缘 === 主内容左缘(桌面)。
                            此前 split 页用 padding:0+max-width+margin 另一套居中,
                            正文比标题少 32px gutter。仅桌面:移动端标题前有汉堡按钮。
    INV-3 gutter 跨页一致 —— 所有核心路由在同一宽度下正文左缘相等。
                            此前收件箱(1201满宽)/今天(857+320)/已完成(817+360)各不同。
    INV-4 侧栏⟺两栏      —— split 页:栅格两栏 当且仅当 侧栏可见。
                            此前栅格容器640裂栏、侧栏视口840才显,640–840 出幽灵空列。

  只在 desktop project 跑(视口由用例显式 setViewportSize 驱动,跑两个 project 是浪费)。
*/

const ROUTES = [
  '/',
  '/inbox',
  '/upcoming',
  '/calendar',
  '/completed',
  '/insights',
  '/projects',
  '/search',
  '/triage',
  '/settings',
]

// 标准内容框架页:appbar 标题在 gutter、正文走 content-inline-pad。
// INV-2(标题=正文)与 INV-3(gutter 跨页一致)只对这批断言。
// 显式豁免(有意的独立版式,非错位):
//   /settings —— appbar 带「返回」按钮顶右标题,正文用 .settings-page 的 --inset-inline
//   /triage   —— .triage-container 是 max-width+margin:auto 的居中专注卡片
const STANDARD_FRAME_ROUTES = [
  '/',
  '/inbox',
  '/upcoming',
  '/calendar',
  '/completed',
  '/insights',
  '/projects',
  '/search',
]

// split 布局页(main + aside)。收件箱/即将/洞察等是单栏,不在此列。
const SPLIT_ROUTES = ['/', '/completed', '/calendar']

const MOBILE_W = [360, 768]
const DESKTOP_W = [1024, 1440]
const ALL_W = [...MOBILE_W, ...DESKTOP_W]

/** 只在 desktop project 跑一遍(视口手动设,避免 mobile project 重复) */
function onceOnly(testInfo) {
  test.skip(
    testInfo.project.name !== 'desktop',
    '视口由用例显式驱动,只需单 project 跑一遍',
  )
}

async function goto(page, route, width) {
  await page.setViewportSize({ width, height: 1100 })
  await page.goto(route)
  await waitForPlannerShell(page)
  // 让栅格/容器查询落定
  await page.waitForTimeout(250)
}

// ── INV-1 无横向溢出 ──────────────────────────────────────────────
test.describe('INV-1 无横向溢出', () => {
  for (const route of ROUTES) {
    for (const width of ALL_W) {
      test(`${route} @${width}`, async ({ page }, testInfo) => {
        onceOnly(testInfo)
        await goto(page, route, width)

        const report = await page.evaluate(() => {
          const vw = window.innerWidth
          const docOver = document.documentElement.scrollWidth - vw
          /** 越界元素:右缘超视口,且没有任何祖先是滚动壳(overflow-x auto/scroll) */
          const bleed = []
          const seen = new Set()
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue
            if (getComputedStyle(el).position === 'fixed') continue
            if (r.right <= vw + 2 || r.left < 0 || r.left >= vw) continue
            // 祖先里有滚动壳 → 已被收纳,合法(如 Heatmap 的 overflow-x:auto 包裹)
            let scrolled = false
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX
              if (ox === 'auto' || ox === 'scroll') { scrolled = true; break }
            }
            if (scrolled) continue
            const key = el.tagName + (el.className || '')
            if (seen.has(key)) continue
            seen.add(key)
            bleed.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className?.toString?.() || '').slice(0, 40),
              over: Math.round(r.right - vw),
              txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
            })
          }
          return { docOver, bleed: bleed.slice(0, 8) }
        })

        expect(report.docOver, `页面横向滚动 ${report.docOver}px`).toBeLessThanOrEqual(1)
        expect(
          report.bleed,
          `有元素漏出视口右缘(非滚动壳内): ${JSON.stringify(report.bleed)}`,
        ).toEqual([])
      })
    }
  }
})

// ── INV-2 标题左缘 === 正文左缘(桌面)────────────────────────────
test.describe('INV-2 标题与正文左缘对齐', () => {
  for (const route of STANDARD_FRAME_ROUTES) {
    for (const width of DESKTOP_W) {
      test(`${route} @${width}`, async ({ page }, testInfo) => {
        onceOnly(testInfo)
        await goto(page, route, width)

        const m = await page.evaluate(() => {
          const h1 = document.querySelector('.appbar h1')
          // 锚在真正承载 gutter 的内容 .wrap:split 页 gutter 在内层 wrap(桌面外层、
          // 移动内层),普通页在 .main-col > .wrap。锚 grid__main 会漏掉移动端内层 padding。
          const main =
            document.querySelector('.life-os-grid__main .wrap') ||
            document.querySelector('.main-col .wrap')
          if (!h1 || !main) return null
          const cs = getComputedStyle(main)
          const contentLeft =
            main.getBoundingClientRect().left + parseFloat(cs.paddingLeft || '0')
          return {
            titleLeft: Math.round(h1.getBoundingClientRect().left),
            contentLeft: Math.round(contentLeft),
          }
        })

        expect(m, `找不到 appbar h1 或主内容容器 @${route}`).not.toBeNull()
        expect(
          Math.abs(m.titleLeft - m.contentLeft),
          `标题(${m.titleLeft})与正文(${m.contentLeft})左缘错位 @${route} @${width}`,
        ).toBeLessThanOrEqual(2)
      })
    }
  }
})

// ── INV-3 gutter 跨路由一致 ───────────────────────────────────────
test.describe('INV-3 正文左缘跨页一致', () => {
  for (const width of ALL_W) {
    test(`@${width} 所有核心页正文左缘相等`, async ({ page }, testInfo) => {
      onceOnly(testInfo)
      /** @type {Record<string, number>} */
      const lefts = {}
      for (const route of STANDARD_FRAME_ROUTES) {
        await goto(page, route, width)
        const left = await page.evaluate(() => {
          // 锚在真正承载 gutter 的内容 .wrap:split 页 gutter 在内层 wrap(桌面外层、
          // 移动内层),普通页在 .main-col > .wrap。锚 grid__main 会漏掉移动端内层 padding。
          const main =
            document.querySelector('.life-os-grid__main .wrap') ||
            document.querySelector('.main-col .wrap')
          if (!main) return null
          const cs = getComputedStyle(main)
          return Math.round(
            main.getBoundingClientRect().left + parseFloat(cs.paddingLeft || '0'),
          )
        })
        if (left != null) lefts[route] = left
      }
      const values = Object.values(lefts)
      const min = Math.min(...values)
      const max = Math.max(...values)
      expect(
        max - min,
        `各页正文左缘不一致(应相等): ${JSON.stringify(lefts)}`,
      ).toBeLessThanOrEqual(2)
    })
  }
})

// ── INV-4 侧栏可见 ⟺ 栅格两栏 ─────────────────────────────────────
test.describe('INV-4 侧栏与两栏同步', () => {
  for (const route of SPLIT_ROUTES) {
    for (const width of ALL_W) {
      test(`${route} @${width}`, async ({ page }, testInfo) => {
        onceOnly(testInfo)
        await goto(page, route, width)

        const s = await page.evaluate(() => {
          const grid = document.querySelector(
            '.life-os-grid--split.today-layout, .life-os-grid--split.desktop-split-layout',
          )
          if (!grid) return { hasGrid: false }
          const tracks = getComputedStyle(grid)
            .gridTemplateColumns.split(' ')
            .filter(Boolean).length
          const aside = grid.querySelector('.life-os-grid__aside')
          const asideVisible =
            !!aside &&
            getComputedStyle(aside).display !== 'none' &&
            aside.getBoundingClientRect().width > 0
          return { hasGrid: true, tracks, asideVisible }
        })

        expect(s.hasGrid, `找不到 split 栅格 @${route}`).toBe(true)
        expect(
          s.tracks >= 2,
          `两栏(${s.tracks}轨)与侧栏可见(${s.asideVisible})不同步 @${route} @${width} —— 幽灵空列风险`,
        ).toBe(s.asideVisible)
      })
    }
  }
})
