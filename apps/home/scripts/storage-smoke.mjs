/**
 * Storage inventory smoke test for /storage (schema v4).
 * Usage: node apps/home/scripts/storage-smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5874'
const SKEY = 'homeos_spatial_v1'

/** @typedef {{ name: string, ok: boolean, detail: string }} Row */
/** @type {Row[]} */
const rows = []

/** @param {Row} row */
function push(row) {
  rows.push(row)
  console.log(`${row.ok ? '✅' : '❌'} ${row.name} — ${row.detail}`)
}

/**
 * Read a zone's items from the DOM — that is what the user actually sees, and
 * it works before the app has written localStorage for the first time.
 * @param {import('playwright').Page} page
 */
const items = (page, code) =>
  page.$$eval(`#zone-${code} .item-name`, (els) =>
    els.map((e) => e.textContent ?? ''),
  )

/** @param {import('playwright').Page} page */
const layoutMode = (page) =>
  page.evaluate(
    (k) =>
      JSON.parse(localStorage.getItem(k) ?? '{}')?.projects?.['avalon-508']
        ?.layoutMode ?? null,
    SKEY,
  )

/** @param {import('playwright').Page} page */
async function addItem(page, code, name) {
  const card = page.locator(`#zone-${code}`)
  await card.locator('.add-row .field').fill(name)
  await card.locator('.add-row .icon-btn.add').click()
  await page.waitForTimeout(200)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  /** @type {string[]} */
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // Seed a genuine schema-v3 save (bare string items) so the reload below
  // exercises the real migration path, not just a fresh default project.
  await page.goto(`${BASE}/storage`, { waitUntil: 'networkidle' })
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({
        schemaVersion: 1,
        settings: { theme: 'auto', locale: 'zh', lockPortraitOnPhone: false },
        activeProjectId: 'avalon-508',
        projects: {
          'avalon-508': {
            schemaVersion: 3,
            layoutMode: 'parametric508',
            storageZones: [
              { id: 's1', code: 'S1', items: ['旧版外套', '旧版拖鞋'] },
              { id: 's3', code: 'S3', items: ['旧版收纳盒'] },
            ],
          },
        },
      }),
    )
  }, SKEY)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#zone-S1')

  // --- v3 → v4 migration from a legacy save ---
  const s1Legacy = await items(page, 'S1')
  const entityCheck = await page.evaluate(async () => {
    const mod = await import('/src/lib/state.svelte.js')
    const p = mod.getActiveProject()
    return {
      schemaVersion: p.schemaVersion,
      allEntities: p.storageZones.every((z) =>
        z.items.every((i) => typeof i === 'object' && Boolean(i.id)),
      ),
      firstId: p.storageZones.find((z) => z.code === 'S1')?.items[0]?.id,
    }
  })
  // Assert on entity shape, not the exact version number — normalizeStorageItems
  // is version-agnostic, and SPATIAL_SCHEMA_VERSION moves for unrelated reasons.
  push({
    name: 'migrate v3 strings → item entities (legacy save)',
    ok:
      entityCheck.schemaVersion >= 4 &&
      entityCheck.allEntities &&
      s1Legacy.join('|') === '旧版外套|旧版拖鞋',
    detail: `v${entityCheck.schemaVersion} · entities=${entityCheck.allEntities} · id=${entityCheck.firstId} · S1=[${s1Legacy.join(', ')}]`,
  })

  // Migration ids must be derived, not random, or {#each} keys churn every render.
  push({
    name: 'migrated ids are deterministic',
    ok: entityCheck.firstId === 's1-i0',
    detail: `first id = ${entityCheck.firstId}`,
  })

  const modeBefore = await layoutMode(page)
  const zoneCount = await page.locator('.storage-card').count()

  // --- add ---
  await addItem(page, 'S3', 'QA三脚架')
  let s3 = await items(page, 'S3')
  push({
    name: 'add item persists',
    ok: s3.includes('QA三脚架'),
    detail: `S3=[${s3.join(', ')}]`,
  })

  // --- blank name rejected ---
  const beforeBlank = (await items(page, 'S3')).length
  await addItem(page, 'S3', '   ')
  push({
    name: 'blank name rejected',
    ok: (await items(page, 'S3')).length === beforeBlank,
    detail: `count stayed ${beforeBlank}`,
  })

  // --- edit: qty / tags / note ---
  const row = page.locator('#zone-S3 button.item-row', { hasText: 'QA三脚架' })
  await row.click()
  const form = page.locator('#zone-S3 .edit-form')
  await form.locator('.field').first().fill('QA碳纤三脚架')
  await form.locator('.field.qty').fill('2')
  await form.locator('.field').nth(2).fill('摄影 装备')
  await form.locator('.field').nth(3).fill('云台在包里')
  await form.locator('.mini.primary').click()
  await page.waitForTimeout(200)
  const edited = await page.evaluate(
    (k) =>
      JSON.parse(localStorage.getItem(k))
        .projects['avalon-508'].storageZones.find((z) => z.code === 'S3')
        .items.find((i) => i.name === 'QA碳纤三脚架'),
    SKEY,
  )
  push({
    name: 'edit item fields',
    ok:
      edited?.qty === 2 &&
      edited?.tags?.join(' ') === '摄影 装备' &&
      edited?.note === '云台在包里',
    detail: JSON.stringify({ qty: edited?.qty, tags: edited?.tags, note: edited?.note }),
  })

  // --- search finds it and reports its zone ---
  await page.locator('input[type=search]').fill('云台')
  await page.waitForTimeout(250)
  const hitCount = await page.locator('.hit').count()
  const hitText = hitCount ? await page.locator('.hit').first().innerText() : ''
  push({
    name: 'search matches note, hit names its zone',
    ok: hitCount === 1 && hitText.includes('S3'),
    detail: `${hitCount} hit · ${hitText.replace(/\s+/g, ' ')}`,
  })

  // --- search filters the zone list ---
  const visible = await page.locator('.storage-card').count()
  push({
    name: 'search filters zone cards',
    ok: visible === 1,
    detail: `${visible} card visible`,
  })

  // --- clicking a hit highlights the zone + the matched item ---
  await page.locator('.hit').first().click()
  await page.waitForTimeout(250)
  const highlighted = await page.locator('#zone-S3 li.highlight').count()
  const selected = await page.locator('.storage-card.selected').count()
  push({
    name: 'hit click → zone selected + item highlighted',
    ok: highlighted === 1 && selected === 1,
    detail: `highlight=${highlighted} selected=${selected}`,
  })

  // --- no results state ---
  await page.locator('input[type=search]').fill('不存在的东西zzz')
  await page.waitForTimeout(250)
  push({
    name: 'empty result state',
    ok: await page.locator('.hits-empty').isVisible(),
    detail: await page.locator('.hits-empty').innerText(),
  })

  await page.locator('.clear-btn').click()
  await page.waitForTimeout(200)
  const restored = await page.locator('.storage-card').count()
  push({
    name: 'clear restores every zone',
    ok: restored === zoneCount,
    detail: `${restored}/${zoneCount} cards`,
  })

  // --- move between zones ---
  await page.locator('#zone-S3 button.item-row', { hasText: 'QA碳纤三脚架' }).click()
  await page.locator('#zone-S3 .edit-form .move-select').selectOption('S1')
  await page.waitForTimeout(250)
  const s1 = await items(page, 'S1')
  s3 = await items(page, 'S3')
  push({
    name: 'move item across zones',
    ok: s1.includes('QA碳纤三脚架') && !s3.includes('QA碳纤三脚架'),
    detail: `S1 has it=${s1.includes('QA碳纤三脚架')} · gone from S3=${!s3.includes('QA碳纤三脚架')}`,
  })

  // --- the regression that matters: storage edits must not flip layout mode ---
  const modeAfter = await layoutMode(page)
  push({
    name: 'storage CRUD keeps layoutMode (not forced to wallGraph)',
    ok: modeAfter === modeBefore && modeAfter === 'parametric508',
    detail: `${modeBefore} → ${modeAfter}`,
  })

  // --- delete + undo ---
  const beforeDelete = await items(page, 'S1')
  await page.locator('#zone-S1 button.item-row', { hasText: 'QA碳纤三脚架' }).click()
  await page.locator('#zone-S1 .edit-form .icon-btn.danger').click()
  await page.waitForTimeout(250)
  const afterDelete = await items(page, 'S1')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.waitForTimeout(250)
  const afterUndo = await items(page, 'S1')
  push({
    name: 'delete + undo restores at same index',
    ok:
      !afterDelete.includes('QA碳纤三脚架') &&
      afterUndo.join('|') === beforeDelete.join('|'),
    detail: `${beforeDelete.length} → ${afterDelete.length} → ${afterUndo.length}`,
  })

  // --- survives reload ---
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#zone-S1')
  push({
    name: 'survives reload',
    ok: (await items(page, 'S1')).includes('QA碳纤三脚架'),
    detail: 'item still in S1',
  })

  // --- long unbroken name must not blow out the card ---
  await addItem(page, 'S1', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOP')
  const overflow = await page.evaluate(() => {
    const c = document.getElementById('zone-S1')
    return {
      card: c.scrollWidth - c.clientWidth,
      doc:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })
  push({
    name: 'long name does not overflow card or page',
    ok: overflow.card <= 0 && overflow.doc <= 0,
    detail: `card=+${overflow.card}px doc=+${overflow.doc}px`,
  })

  // --- text is escaped, not injected ---
  await addItem(page, 'S1', '<img src=x onerror=alert(1)>XSS')
  const injected = await page.locator('#zone-S1 img[src="x"]').count()
  push({
    name: 'item name rendered as text, not HTML',
    ok: injected === 0,
    detail: `${injected} injected nodes`,
  })

  // --- phone: tap targets + no horizontal scroll ---
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(400)
  const phone = await page.evaluate(() => {
    const rowsEl = [...document.querySelectorAll('button.item-row')]
    const add = document.querySelector('.icon-btn.add')
    return {
      minRow: Math.min(...rowsEl.map((r) => r.getBoundingClientRect().height)),
      addBtn: add.getBoundingClientRect().height,
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })
  push({
    name: 'phone tap targets ≥ 24px (WCAG 2.5.8), no x-overflow',
    ok: phone.minRow >= 24 && phone.addBtn >= 24 && phone.overflowX <= 0,
    detail: `row=${Math.round(phone.minRow)}px add=${Math.round(phone.addBtn)}px overflowX=${phone.overflowX}px`,
  })

  // --- wallGraph mode: storage items must survive a plan ⌘Z ---
  // storageZones is deliberately absent from snapshotEditSource, so graph undo
  // restores walls while carrying storage forward. Guard both halves of that.
  const undoProbe = await page.evaluate(async () => {
    const mod = await import('/src/lib/state.svelte.js')
    const names = () =>
      mod
        .getActiveProject()
        .storageZones.find((z) => z.code === 'S3')
        .items.map((i) => i.name)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    mod.activateWallGraphMode()
    await sleep(150)
    mod.addStorageItem('S3', 'UNDO探针')
    await sleep(150)
    const g = mod.getActiveProject().wallGraph
    const edgesBefore = g.edges.length
    mod.addGraphWall(
      g.margin.x + 500,
      g.margin.y + 500,
      g.margin.x + 600,
      g.margin.y + 500,
    )
    await sleep(150)
    const edgesAfterAdd = mod.getActiveProject().wallGraph.edges.length
    mod.undoGraphEdit()
    await sleep(200)
    return {
      itemSurvives: names().includes('UNDO探针'),
      wallUndone:
        mod.getActiveProject().wallGraph.edges.length === edgesBefore &&
        edgesAfterAdd > edgesBefore,
      mode: mod.getActiveProject().layoutMode,
    }
  })
  push({
    name: 'graph ⌘Z undoes the wall but keeps storage items',
    ok: undoProbe.itemSurvives && undoProbe.wallUndone,
    detail: `item kept=${undoProbe.itemSurvives} · wall undone=${undoProbe.wallUndone} · mode=${undoProbe.mode}`,
  })

  // --- typing must never reach the store ---
  // Wiring an input's oninput straight to the store costs a full hydrate + persist
  // per keystroke, and anything routed through applyEditSource also floods the undo
  // stack (see the viewpoint compass/slider note in README). Search/add/edit fields
  // all bind local $state and only commit on submit — keep it that way.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#zone-S1')
  const typing = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const setVal = (el, v) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    let writes = 0
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (...a) {
      writes++
      return orig.apply(this, a)
    }
    const undoBefore = JSON.parse(
      localStorage.getItem('homeos_wall_graph_undo_v1') ?? '{"undo":[]}',
    ).undo.length

    const search = document.querySelector('input[type=search]')
    for (const q of ['咖', '咖啡', '咖啡机']) {
      setVal(search, q)
      await sleep(25)
    }
    setVal(search, '')
    await sleep(50)

    const add = document.querySelector('#zone-S1 .add-row .field')
    for (const s of ['测', '测试', '测试物']) {
      setVal(add, s)
      await sleep(25)
    }
    setVal(add, '')

    document.querySelector('#zone-S1 button.item-row').click()
    await sleep(100)
    const nameField = document.querySelector('#zone-S1 .edit-form .field')
    for (const s of ['甲', '甲乙', '甲乙丙']) {
      setVal(nameField, s)
      await sleep(25)
    }
    document.querySelector('#zone-S1 .edit-form .mini:not(.primary)').click()
    await sleep(60)

    Storage.prototype.setItem = orig
    const undoAfter = JSON.parse(
      localStorage.getItem('homeos_wall_graph_undo_v1') ?? '{"undo":[]}',
    ).undo.length
    return { writes, undoGrowth: undoAfter - undoBefore }
  })
  push({
    name: 'typing never writes to store or undo stack',
    ok: typing.writes === 0 && typing.undoGrowth === 0,
    detail: `${typing.writes} writes · undo +${typing.undoGrowth}`,
  })

  push({
    name: 'no console errors',
    ok: consoleErrors.length === 0,
    detail: consoleErrors.length ? consoleErrors[0] : 'clean',
  })

  await browser.close()

  const failed = rows.filter((r) => !r.ok).length
  console.log(`\n${rows.length - failed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
