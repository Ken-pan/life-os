<script>
  import { page } from '$app/state'
  import { browser } from '$app/environment'
  import {
    addStorageItem,
    getActiveProject,
    moveStorageItem,
    removeStorageItem,
    syncContainerScans,
    updateStorageItem,
  } from '$lib/state.svelte.js'
  import {
    countStorageItems,
    searchStorageItems,
  } from '$lib/spatial/storage-items.js'
  import { levelLabel } from '$lib/spatial/container-scan.js'
  import { planStorageZones } from '$lib/spatial/storage-plan.js'
  import { listEvents } from '$lib/event-log.js'
  import { daysAgoLabel, lastObservedAt } from '$lib/spatial/event-derive.js'
  import { ICONS } from '$lib/iconRegistry.js'

  // 组件标签里不能写 ICONS['chevron-left'],先取出来
  const IconBack = ICONS['chevron-left']
  import StorageZoneCard from '$lib/components/StorageZoneCard.svelte'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'

  const project = $derived(getActiveProject())

  // 每个区「该放什么」是算出来的,不落库:它只依赖几何 + 家具高度,
  // 户型一变就该跟着变。存进 storageZones 反而会留下一份过期的副本。
  const storagePlan = $derived(planStorageZones(project))
  const specByCode = $derived(new Map(storagePlan.zones.map((z) => [z.code, z.spec])))
  const itemCount = $derived(countStorageItems(project.storageZones))

  let selected = $state('')
  let query = $state('')
  let focusedItemId = $state('')
  /** 移动端底部抽屉展开态;桌面端面板常驻,这个值不参与布局 */
  let sheetOpen = $state(false)
  /**
   * 桌面端双视图:空间(地图 + 右侧面板)/ 清单(库存优先,全宽列表)。
   * 移动端始终是空间视图 + 底部抽屉,切换器由 CSS 收起。
   * @type {'map' | 'list'}
   */
  let view = $state('map')

  /** 地图定位飞行(Google Maps 的「点结果飞过去」) */
  let focusRequest = $state({ token: 0, x: 0, y: 0, zoom: undefined })
  /** @type {HTMLElement | null} */
  let stageEl = $state(null)
  /** @type {HTMLElement | null} */
  let panelEl = $state(null)
  /** @type {HTMLInputElement | null} */
  let searchEl = $state(null)

  // 事件流(能力17):柜子「上次被扫描确认」的时刻 —— 找东西答案的可信度事实
  /** @type {Map<string, number>} placementId → ts */
  let observedAt = $state(new Map())
  $effect(() => {
    listEvents().then((events) => {
      observedAt = lastObservedAt(events)
    })
  })

  /** @param {import('$lib/spatial/types.js').SpatialStorageZone} zone */
  function zoneConfirmedLabel(zone) {
    if (!zone.placementId) return ''
    const ts = observedAt.get(zone.placementId)
    return ts ? daysAgoLabel(ts) : ''
  }

  // ---- 柜内实测同步(iOS 柜内扫描 → 储藏区.container) ----
  /** @type {'idle'|'running'|'done'|'error'} */
  let containerSync = $state('idle')
  let containerSyncMsg = $state('')

  async function runContainerSync() {
    if (containerSync === 'running') return
    containerSync = 'running'
    containerSyncMsg = ''
    try {
      const res = await syncContainerScans()
      const parts = []
      if (res.bound.length) parts.push(`${res.bound.length} 个柜子已挂内腔实测`)
      if (res.noZone.length) {
        // 匹配到了家具但它还没有储藏区 —— 让用户去绑定,而不是静默丢掉
        const names = res.noZone
          .map((b) => b.placementLabel || '未命名家具')
          .slice(0, 3)
          .join('、')
        parts.push(`${res.noZone.length} 份数据对应的家具(${names})还没绑定储藏区`)
      }
      if (res.unmatched) parts.push(`${res.unmatched} 份对不上当前户型`)
      containerSyncMsg = parts.length ? parts.join(' · ') : '云端还没有柜内扫描数据'
      containerSync = 'done'
    } catch (e) {
      containerSyncMsg = e instanceof Error ? e.message : String(e)
      containerSync = 'error'
    }
  }

  // 进页面静默同步一次:iPhone 刚扫完柜内,打开储物页就该看到
  $effect(() => {
    if (containerSync === 'idle') void runContainerSync()
  })

  /** @param {Event} e */
  function onQueryInput(e) {
    query = /** @type {HTMLInputElement} */ (e.currentTarget).value
    // 改词后旧的高亮项多半已不在结果里，留着就是误导
    focusedItemId = ''
    // 搜索是对全屋提问,答案列表在面板里 —— 停在某一个区的详情里会盖住它
    if (query.trim()) selected = ''
  }

  const search = $derived(searchStorageItems(project.storageZones, query))
  const hits = $derived(search.hits)
  /** 命中总数可能超过 hits 长度（结果列表有上限），不静默截断 */
  const hiddenHits = $derived(search.total - search.hits.length)

  /**
   * 命中项在卡片里也要标出来 —— 否则筛出的卡片仍是整区清单，
   * 用户还得自己在里面找哪一条匹配。
   */
  const matchedByZone = $derived.by(() => {
    /** @type {Map<string, string[]>} */
    const m = new Map()
    for (const h of hits) {
      const list = m.get(h.zoneCode)
      if (list) list.push(h.item.id)
      else m.set(h.zoneCode, [h.item.id])
    }
    return m
  })

  const moveTargetsByZone = $derived.by(() => {
    const all = project.storageZones.map((z) => ({
      code: z.code,
      nameZh: z.nameZh,
    }))
    /** @type {Map<string, { code: string, nameZh: string }[]>} */
    const m = new Map()
    for (const z of project.storageZones) {
      m.set(
        z.code,
        all.filter((o) => o.code !== z.code),
      )
    }
    return m
  })

  /** @type {string[]} */
  const NO_MATCHES = []

  /**
   * 区列表按位置分组(locationZh 「·」前段):21 个区平铺一列扫不过来,
   * 而找东西的第一反应是「在厨房还是卧室」。分组是纯展示,行结构不变。
   */
  const zoneGroups = $derived.by(() => {
    /** @type {Map<string, { zones: typeof project.storageZones, itemCount: number }>} */
    const groups = new Map()
    for (const z of project.storageZones) {
      const head = (z.locationZh ?? '').split('·')[0].trim() || '其他'
      let g = groups.get(head)
      if (!g) {
        g = { zones: [], itemCount: 0 }
        groups.set(head, g)
      }
      g.zones.push(z)
      g.itemCount += z.items.length
    }
    return [...groups.entries()]
  })

  const selectedZone = $derived(
    project.storageZones.find((z) => z.code === selected) ?? null,
  )

  /** @param {string} code 储藏区在图上的锚点(hydrate 算好的 marker/bounds) */
  function zoneAnchor(code) {
    const z = project.storageZones.find((x) => x.code === code)
    if (!z) return null
    if (z.marker) return z.marker
    if (z.bounds) {
      return { x: z.bounds.x + z.bounds.w / 2, y: z.bounds.y + z.bounds.h / 2 }
    }
    return null
  }

  /** @param {string} code */
  function flyTo(code) {
    const a = zoneAnchor(code)
    if (!a) return
    // 面板盖住一块画布(桌面在左,移动端抽屉在下),目标点要居中到
    // **露出来的那块**,不然飞完正好停在面板底下 —— Google Maps 同款偏移
    let centerX = 0.5
    let centerY = 0.5
    if (browser && stageEl && panelEl) {
      const stage = stageEl.getBoundingClientRect()
      const panel = panelEl.getBoundingClientRect()
      if (window.matchMedia('(max-width: 767px)').matches) {
        // 抽屉即将展开(focusZone 先置 sheetOpen);translateY 不改 rect 高度,
        // 收起状态量到的也是展开后的遮挡高度
        centerY = Math.max(0.14, (stage.height - panel.height) / 2 / stage.height)
      } else if (stage.width > 0) {
        // 面板在右侧:目标点居中到面板左侧那块露出来的画布
        const panelLeft = panel.left - stage.left
        centerX = Math.max(0.28, panelLeft / 2 / stage.width)
      }
    }
    focusRequest = {
      token: focusRequest.token + 1,
      x: a.x,
      y: a.y,
      zoom: 1.35,
      centerX,
      centerY,
    }
  }

  /** @param {string} code */
  function focusZone(code) {
    selected = code
    sheetOpen = true
    // 清单视图里点区 = 问「它在哪」:切回空间视图,等画布有了尺寸再飞
    if (view === 'list') {
      view = 'map'
      setTimeout(() => flyTo(code), 120)
      return
    }
    flyTo(code)
  }

  function backToList() {
    selected = ''
    focusedItemId = ''
  }

  /**
   * 搜索结果 → 平面图。这是 HomeOS 相对纯列表型库存工具的差异点：
   * 找到东西的同时直接看到它在户型里的位置。
   * @param {import('$lib/spatial/storage-items.js').StorageSearchHit} hit
   */
  function jumpToHit(hit) {
    focusedItemId = hit.item.id
    focusZone(hit.zoneCode)
  }

  function clearQuery() {
    query = ''
    focusedItemId = ''
  }

  /** @param {string | null} zone */
  function applyZoneFromUrl(zone) {
    if (!zone || !project.storageZones.some((z) => z.code === zone)) return
    selected = zone
    sheetOpen = true
    // 挂载首帧 viewer 还在自动 fit(双 rAF),飞行要排在它后面才不被盖掉
    setTimeout(() => flyTo(zone), 120)
  }

  $effect(() => {
    applyZoneFromUrl(page.url.searchParams.get('zone'))
  })

  // Esc:详情 → 列表 → 收起抽屉。地图页的退出阶梯和 /plan 保持一个手感。
  $effect(() => {
    if (!browser) return
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      const tag = e.target instanceof Element ? e.target.tagName : ''
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      // 「/」聚焦搜索 —— 找东西是这页的主动作,不该先伸手摸鼠标
      if (e.key === '/' && !inField && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        sheetOpen = true
        searchEl?.focus()
        return
      }
      if (e.key !== 'Escape') return
      if (inField) return
      if (selected) {
        backToList()
        return
      }
      if (query) {
        clearQuery()
        return
      }
      sheetOpen = false
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div class="storage-page">
  <!-- 统一页面顶栏(与 /plan 同一套骨架):标题 + 统计在左,视图切换在右 -->
  <header class="storage-topbar" aria-label="储藏工具栏">
    <div class="storage-topbar-lead">
      <h1 class="storage-topbar-title">储藏</h1>
      <p class="storage-topbar-sub">
        {project.storageZones.length} 个储藏区 · {itemCount} 件物品
      </p>
    </div>
    <div class="storage-view-seg" role="group" aria-label="空间或清单视图">
      <button
        type="button"
        class="view-btn"
        class:active={view === 'map'}
        aria-pressed={view === 'map'}
        onclick={() => (view = 'map')}
      >
        空间
      </button>
      <button
        type="button"
        class="view-btn"
        class:active={view === 'list'}
        aria-pressed={view === 'list'}
        onclick={() => (view = 'list')}
      >
        清单
      </button>
    </div>
  </header>

  <div class="storage-body" class:list-mode={view === 'list'} bind:this={stageEl}>
  <div class="storage-canvas">
    <FloorPlanViewer
      {project}
      canvasPriority
      hideFurniture={false}
      highlightZone={selected}
      onZoneSelect={focusZone}
      {focusRequest}
    />
    <PlanLegend interactive overlay />
  </div>

  <section
    class="storage-panel"
    class:open={sheetOpen}
    aria-label="储藏搜索与清单"
    bind:this={panelEl}
  >
    <button
      type="button"
      class="sheet-handle"
      aria-label={sheetOpen ? '收起清单' : '展开清单'}
      aria-expanded={sheetOpen}
      onclick={() => (sheetOpen = !sheetOpen)}
    >
      <span class="sheet-grip" aria-hidden="true"></span>
    </button>

    <div class="panel-search">
      <span class="search-icon"><ICONS.search size={16} /></span>
      <input
        class="search-input"
        type="search"
        bind:this={searchEl}
        value={query}
        oninput={onQueryInput}
        onfocus={() => (sheetOpen = true)}
        placeholder="搜物品 / 标签 / 备注,例如「咖啡」"
        aria-label="搜索储藏物品"
      />
      {#if !query}
        <kbd class="search-kbd" aria-hidden="true">/</kbd>
      {/if}
      {#if query}
        <button
          type="button"
          class="clear-btn"
          onclick={clearQuery}
          aria-label="清除搜索"
        >
          <ICONS.x size={14} />
        </button>
      {/if}
    </div>

    <div class="panel-body">
      {#if selectedZone}
        <div class="detail-head">
          <button type="button" class="back-btn" onclick={backToList}>
            <IconBack size={15} />
            {query.trim() ? '返回结果' : '返回列表'}
          </button>
          <span class="detail-crumb">点击平面图其他标注可切换</span>
        </div>
        <div class="detail-card">
          <StorageZoneCard
            id={`zone-${selectedZone.code}`}
            code={selectedZone.code}
            nameZh={selectedZone.nameZh}
            locationZh={selectedZone.locationZh}
            formZh={selectedZone.formZh}
            items={selectedZone.items}
            inferred={selectedZone.inferred}
            container={selectedZone.container}
            spec={selectedZone.spec ?? specByCode.get(selectedZone.code)}
            confirmedLabel={zoneConfirmedLabel(selectedZone)}
            selected
            editable
            moveTargets={moveTargetsByZone.get(selectedZone.code) ?? []}
            highlightItemId={focusedItemId}
            matchedItemIds={matchedByZone.get(selectedZone.code) ?? NO_MATCHES}
            onAddItem={(name) => addStorageItem(selectedZone.code, name)}
            onUpdateItem={(itemId, patch) =>
              updateStorageItem(selectedZone.code, itemId, patch)}
            onRemoveItem={(itemId) => removeStorageItem(selectedZone.code, itemId)}
            onMoveItem={(itemId, toCode) =>
              moveStorageItem(selectedZone.code, itemId, toCode)}
          />
        </div>
      {:else if query.trim()}
        <div class="hits" role="status">
          {#if hits.length}
            <p class="hits-lead">
              {search.total} 个结果 · 点击定位{#if hiddenHits > 0}<span
                  class="hits-more"
                  >（只列前 {hits.length} 个，还有 {hiddenHits} 个未显示 ·
                  再输入几个字缩小范围）</span
                >{/if}
            </p>
            <ul class="hit-list">
              {#each hits as hit (hit.item.id)}
                <li>
                  <button
                    type="button"
                    class="hit"
                    class:active={focusedItemId === hit.item.id}
                    onclick={() => jumpToHit(hit)}
                  >
                    <span class="hit-name">{hit.item.name}</span>
                    {#if hit.item.qty && hit.item.qty > 1}
                      <span class="hit-qty">×{hit.item.qty}</span>
                    {/if}
                    <span class="hit-where">
                      <span class="hit-code">{hit.zoneCode}</span>
                      {hit.zoneNameZh}{#if hit.item.level !== undefined}<span
                          class="hit-level">{levelLabel(hit.item.level)}</span
                        >{/if}{#if hit.item.updatedAt}<span class="hit-when"
                          >· 登记于{daysAgoLabel(hit.item.updatedAt)}</span
                        >{/if}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="hits-empty">没有匹配「{query}」的物品</p>
          {/if}
        </div>
      {:else}
        <header class="panel-head">
          <div class="panel-sync">
            <button
              type="button"
              class="sync-btn"
              onclick={runContainerSync}
              disabled={containerSync === 'running'}
            >
              {containerSync === 'running' ? '同步柜内实测…' : '同步柜内实测'}
            </button>
            {#if containerSyncMsg}
              <span
                class="sync-msg"
                class:error={containerSync === 'error'}
                role="status"
              >
                {containerSyncMsg}
              </span>
            {/if}
          </div>
        </header>
        <ul class="zone-list">
          {#each zoneGroups as [group, g] (group)}
            <li class="zone-group" aria-hidden="true">
              <span class="zone-group-name">{group}</span>
              <span class="zone-group-stats"
                >{g.zones.length} 区{#if g.itemCount}
                  · {g.itemCount} 件{/if}</span
              >
            </li>
            {#each g.zones as zone (zone.id)}
              <li>
                <!-- 编号(S1…)是内部主键,不进列表;data-code 只做定位锚 -->
                <button
                  type="button"
                  class="zone-row"
                  class:empty={!zone.items.length}
                  data-code={zone.code}
                  onclick={() => focusZone(zone.code)}
                >
                  <span class="zone-main">
                    <span class="zone-name">{zone.nameZh}</span>
                    <span class="zone-meta"
                      >{zone.locationZh}{#if zone.container}<span
                          class="zone-scan">· 内腔实测</span
                        >{/if}</span
                    >
                  </span>
                  <span class="zone-count"
                    >{zone.items.length ? `${zone.items.length} 件` : '空置'}</span
                  >
                  <span class="zone-go" aria-hidden="true">›</span>
                </button>
              </li>
            {/each}
          {/each}
        </ul>
      {/if}
    </div>
  </section>
  </div>
</div>

<style>
  .storage-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    height: 0;
  }

  /* 统一页面顶栏(与 /plan 的 plan-topbar 同一套语言) */
  .storage-topbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    min-height: 54px;
    padding: 8px max(14px, var(--safe-right-effective)) 8px
      max(14px, var(--safe-left-effective));
    padding-top: calc(var(--safe-top-effective) + 8px);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: var(--bg);
  }

  .storage-topbar-lead {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .storage-topbar-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--t1);
    line-height: 1.2;
  }

  .storage-topbar-sub {
    margin: 0;
    font-size: 11.5px;
    color: var(--t3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .storage-view-seg {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    gap: 3px;
    flex-shrink: 0;
  }

  .view-btn {
    font-size: 13px;
    font-weight: 650;
    min-height: 32px;
    min-width: 64px;
    padding: 5px 16px;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .view-btn.active {
    background: var(--storage-accent);
    color: #f5f8fa;
  }

  .view-btn:focus-visible {
    outline: 2px solid var(--storage-accent);
    outline-offset: 2px;
  }

  /* 画布 + 面板的横向骨架:中间空间画布,右侧情境面板 */
  .storage-body {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .storage-canvas {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .storage-canvas :global(.plan-shell) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* ---- 情境面板(桌面 = 右侧驻留列,移动 = 底部抽屉) ---- */

  .storage-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sheet-handle {
    display: none;
    border: 0;
    background: none;
    padding: 8px 0 2px;
    cursor: pointer;
  }

  .sheet-grip {
    display: block;
    width: 40px;
    height: 4px;
    margin: 0 auto;
    border-radius: 999px;
    background: color-mix(in srgb, var(--t3) 55%, transparent);
  }

  .panel-search {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    margin: 12px 12px 10px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    display: flex;
    color: var(--t3);
    pointer-events: none;
  }

  .search-input {
    font: inherit;
    font-size: 16px;
    width: 100%;
    padding: 10px 36px;
    color: var(--t1);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    transition: border-color 0.15s ease;
  }

  .search-input:focus {
    outline: 2px solid var(--storage-accent);
    outline-offset: -1px;
  }

  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .search-kbd {
    position: absolute;
    right: 12px;
    display: none;
    padding: 1px 7px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
    border: 1px solid var(--border);
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    pointer-events: none;
  }

  /* 触屏没有「/」可按,提示只在桌面出现 */
  @media (min-width: 768px) {
    .search-kbd {
      display: block;
    }

    .search-input:focus ~ .search-kbd {
      display: none;
    }
  }

  .clear-btn {
    position: absolute;
    right: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--t3);
    background: none;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
  }

  .clear-btn:hover {
    color: var(--t1);
  }

  .panel-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 12px 12px;
  }

  /* ---- 概览(同步行 + 区列表;标题与统计在页面顶栏) ---- */

  .panel-head {
    padding: 2px 4px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    margin-bottom: 8px;
  }

  .panel-sync {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sync-btn {
    font: inherit;
    font-size: 12px;
    padding: 3px 12px;
    color: var(--t2);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
  }

  .sync-btn:hover:not(:disabled) {
    color: var(--t1);
    border-color: var(--storage-accent);
  }

  .sync-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .sync-msg {
    font-size: 12px;
    color: var(--t3);
  }

  .sync-msg.error {
    color: var(--warn, #c46a3f);
  }

  .zone-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* 分组小标题:吸在滚动容器顶上,滚到哪都知道自己在哪个房间 */
  .zone-group {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 8px 4px;
    background: color-mix(in srgb, var(--card) 96%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .zone-group:not(:first-child) {
    margin-top: 6px;
  }

  .zone-group-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--t2);
  }

  .zone-group-stats {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--t3);
    white-space: nowrap;
  }

  .zone-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 8px;
    font: inherit;
    text-align: left;
    color: var(--t1);
    background: none;
    border: 0;
    border-radius: 10px;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }

  .zone-row:hover {
    background: color-mix(in srgb, var(--bg) 75%, transparent);
  }

  /* 空区整体退后一步:有货的区才是「找东西」时该跳出来的 */
  .zone-row.empty .zone-name {
    font-weight: 500;
    color: var(--t2);
  }

  .zone-row.empty .zone-count {
    opacity: 0.6;
  }

  .zone-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }

  .zone-name {
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .zone-meta {
    font-size: 11.5px;
    color: var(--t3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .zone-scan {
    color: var(--storage-accent);
  }

  .zone-count {
    margin-left: auto;
    flex: 0 0 auto;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
  }

  .zone-go {
    flex: 0 0 auto;
    font-size: 16px;
    line-height: 1;
    color: var(--t3);
  }

  /* ---- 详情 ---- */

  .detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0 8px;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 5px 10px 5px 6px;
    color: var(--t2);
    background: none;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
  }

  .back-btn:hover {
    color: var(--t1);
    background: color-mix(in srgb, var(--bg) 75%, transparent);
  }

  .detail-crumb {
    font-size: 11px;
    color: var(--t3);
    text-align: right;
  }

  .detail-card :global(.storage-card) {
    box-shadow: none;
  }

  /* ---- 搜索结果 ---- */

  .hits {
    padding: 2px 0;
  }

  .hits-lead {
    margin: 2px 4px 8px;
    font-size: 12px;
    color: var(--t3);
  }

  .hits-more {
    color: var(--t2);
  }

  .hits-empty {
    margin: 8px 4px;
    font-size: 13px;
    color: var(--t3);
  }

  .hit-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hit {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    width: 100%;
    padding: 8px 8px;
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--t1);
    background: none;
    border: 1px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }

  .hit:hover,
  .hit.active {
    border-color: color-mix(in srgb, var(--border) 80%, transparent);
    background: color-mix(in srgb, var(--bg) 75%, transparent);
  }

  .hit-name {
    font-weight: 600;
  }

  .hit-qty {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
  }

  .hit-where {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--t3);
  }

  /* 编号在命中行降为技术性描边 chip:定位时偶尔有用,但不抢名字的戏 */
  .hit-code {
    font-family: var(--mono);
    font-weight: 600;
    color: var(--t3);
    border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
    padding: 0 5px;
    border-radius: 4px;
  }

  .hit-level {
    margin-left: 4px;
    font-weight: 600;
    color: var(--storage-accent);
  }

  .hit-when {
    margin-left: 4px;
    color: var(--t3);
  }

  /* ---- 桌面:右侧驻留情境面板 —— 画布是主角,列表/详情只占右列 ---- */
  @media (min-width: 768px) {
    .storage-panel {
      flex: 0 0 380px;
      width: 380px;
      border-left: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      background: var(--bg);
    }

    /* 清单视图:库存优先 —— 面板铺满,画布收起,区列表变多列网格 */
    .storage-body.list-mode .storage-canvas {
      display: none;
    }

    .storage-body.list-mode .storage-panel {
      flex: 1 1 auto;
      width: auto;
      border-left: none;
    }

    .storage-body.list-mode .panel-search {
      max-width: 520px;
    }

    .storage-body.list-mode .zone-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 2px 16px;
    }

    .storage-body.list-mode .zone-group {
      grid-column: 1 / -1;
    }
  }

  /* ---- 移动:底部抽屉(Apple Maps 的搜索位),收起时只剩把手 + 搜索框 ---- */
  @media (max-width: 767px) {
    /* 移动端没有清单视图(底部抽屉就是清单),切换器收起 */
    .storage-view-seg {
      display: none;
    }

    .storage-panel {
      position: absolute;
      z-index: 5;
      left: 0;
      right: 0;
      bottom: 0;
      height: min(68%, 560px);
      border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-radius: 18px 18px 0 0;
      border-bottom: 0;
      background: color-mix(in srgb, var(--card) 96%, transparent);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 -8px 32px -16px rgba(0, 0, 0, 0.4);
      transform: translateY(calc(100% - 116px));
      transition: transform 0.32s cubic-bezier(0.3, 0.9, 0.3, 1);
      touch-action: manipulation;
    }

    .storage-panel.open {
      transform: translateY(0);
    }

    .sheet-handle {
      display: block;
      flex: 0 0 auto;
    }

    .panel-search {
      margin-top: 2px;
    }

    /* 收起时抽屉大部分在屏外,内部不该还能滚动 */
    .storage-panel:not(.open) .panel-body {
      overflow: hidden;
    }

    /* 图例给抽屉的收起头让位 */
    .storage-canvas :global(.plan-legend-wrap.overlay) {
      bottom: 128px;
    }
  }
</style>
