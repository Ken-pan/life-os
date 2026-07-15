<script>
  import { page } from '$app/state'
  import {
    addStorageItem,
    getActiveProject,
    moveStorageItem,
    removeStorageItem,
    updateStorageItem,
  } from '$lib/state.svelte.js'
  import {
    countStorageItems,
    searchStorageItems,
  } from '$lib/spatial/storage-items.js'
  import { ICONS } from '$lib/iconRegistry.js'
  import StorageZoneCard from '$lib/components/StorageZoneCard.svelte'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'

  const project = $derived(getActiveProject())
  const itemCount = $derived(countStorageItems(project.storageZones))

  let selected = $state('')
  let query = $state('')
  let focusedItemId = $state('')

  /** @param {Event} e */
  function onQueryInput(e) {
    query = /** @type {HTMLInputElement} */ (e.currentTarget).value
    // 改词后旧的高亮项多半已不在结果里，留着就是误导
    focusedItemId = ''
  }

  const search = $derived(searchStorageItems(project.storageZones, query))
  const hits = $derived(search.hits)
  /** 命中总数可能超过 hits 长度（结果列表有上限），不静默截断 */
  const hiddenHits = $derived(search.total - search.hits.length)

  /** 搜索时只留有命中的区，平面图和清单一起收敛到结果上。 */
  const visibleZones = $derived(
    query.trim()
      ? project.storageZones.filter((z) => search.zoneCodes.has(z.code))
      : project.storageZones,
  )

  /**
   * 命中项在卡片里也要标出来 —— 否则筛出的卡片仍是整区清单，
   * 用户还得自己在里面找哪一条匹配。
   *
   * 预先按区建表：这些在模板里当函数调用会每次渲染都新建数组，
   * prop 引用一变就让每张卡片白重算一遍。
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

  /** @param {string} code */
  function focusZone(code) {
    selected = code
    scrollToZone(code)
  }

  /** @param {string} code */
  function toggle(code) {
    if (selected === code) {
      selected = ''
      return
    }
    focusZone(code)
  }

  /** @param {string} code */
  function scrollToZone(code) {
    requestAnimationFrame(() => {
      document.getElementById(`zone-${code}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
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
    focusZone(zone)
  }

  $effect(() => {
    applyZoneFromUrl(page.url.searchParams.get('zone'))
  })
</script>

<p class="page-sub home-lead">
  {project.storageZones.length} 个储藏区 · {itemCount} 件物品 ·
  搜索或点击标注可定位到平面图。
</p>

<div class="search-bar">
  <span class="search-icon"><ICONS.search size={15} /></span>
  <input
    class="search-input"
    type="search"
    value={query}
    oninput={onQueryInput}
    placeholder="搜物品 / 标签 / 备注,例如「咖啡」"
    aria-label="搜索储藏物品"
  />
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

{#if query.trim()}
  <div class="hits" role="status">
    {#if hits.length}
      <p class="hits-lead">
        {search.total} 个结果 · 点击定位{#if hiddenHits > 0}<span class="hits-more"
            >（只列前 {hits.length} 个，还有 {hiddenHits} 个未显示 · 再输入几个字缩小范围）</span
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
                {hit.zoneNameZh}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hits-empty">没有匹配「{query}」的物品</p>
    {/if}
  </div>
{/if}

<FloorPlanViewer
  {project}
  compact
  hideFurniture
  highlightZone={selected}
  onZoneSelect={focusZone}
/>

<PlanLegend interactive />

<h2 class="home-section-title">
  逐区清单{#if query.trim()}<span class="filtered"
      >· 已按「{query}」筛选</span
    >{/if}
</h2>
{#if selected}
  <p class="zone-focus" role="status">
    当前高亮 <b>{selected}</b> · 点击平面图或其他卡片可切换
  </p>
{/if}
<div class="life-os-grid life-os-grid--autofill home-grid-cards">
  {#each visibleZones as zone (zone.id)}
    <StorageZoneCard
      id={`zone-${zone.code}`}
      code={zone.code}
      nameZh={zone.nameZh}
      locationZh={zone.locationZh}
      formZh={zone.formZh}
      items={zone.items}
      inferred={zone.inferred}
      selected={selected === zone.code}
      onSelect={() => toggle(zone.code)}
      editable
      moveTargets={moveTargetsByZone.get(zone.code) ?? NO_MATCHES}
      highlightItemId={focusedItemId}
      matchedItemIds={matchedByZone.get(zone.code) ?? NO_MATCHES}
      onAddItem={(name) => addStorageItem(zone.code, name)}
      onUpdateItem={(itemId, patch) =>
        updateStorageItem(zone.code, itemId, patch)}
      onRemoveItem={(itemId) => removeStorageItem(zone.code, itemId)}
      onMoveItem={(itemId, toCode) =>
        moveStorageItem(zone.code, itemId, toCode)}
    />
  {/each}
</div>

<style>
  .home-lead {
    margin: 0 0 14px;
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
    margin: 0 0 14px;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    display: flex;
    color: var(--t3);
    pointer-events: none;
  }

  .search-input {
    font: inherit;
    font-size: 14px;
    width: 100%;
    padding: 9px 34px;
    color: var(--t1);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .search-input:focus {
    outline: 2px solid var(--storage-accent);
    outline-offset: -1px;
  }

  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .clear-btn {
    position: absolute;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    color: var(--t3);
    background: none;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }

  .clear-btn:hover {
    color: var(--t1);
  }

  .hits {
    margin: 0 0 14px;
    padding: 10px 12px;
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 3px solid var(--storage-accent);
    border-radius: 10px;
  }

  .hits-lead {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--t3);
  }

  .hits-more {
    color: var(--t2);
  }

  .hits-empty {
    margin: 0;
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
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--t1);
    background: none;
    border: 1px solid transparent;
    border-radius: 7px;
    cursor: pointer;
  }

  .hit:hover,
  .hit.active {
    border-color: var(--border);
    background: var(--bg);
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

  .hit-code {
    font-family: var(--mono);
    font-weight: 700;
    color: #f5f8fa;
    background: var(--storage-accent);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .filtered {
    margin-left: 6px;
    font-size: 12px;
    font-weight: 400;
    color: var(--t3);
  }

  .zone-focus {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--t2);
  }

  .zone-focus b {
    color: var(--storage-accent);
    font-family: var(--mono);
  }
</style>
