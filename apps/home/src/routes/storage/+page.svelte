<script>
  import { page } from '$app/state'
  import { getActiveProject } from '$lib/state.svelte.js'
  import StorageZoneCard from '$lib/components/StorageZoneCard.svelte'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'

  const project = $derived(getActiveProject())
  let selected = $state('')

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
  平面图与清单联动：点击标注或卡片可高亮对应储藏区。
</p>

<FloorPlanViewer
  {project}
  compact
  hideFurniture
  highlightZone={selected}
  onZoneSelect={focusZone}
/>

<PlanLegend interactive />

<h2 class="home-section-title">逐区清单</h2>
{#if selected}
  <p class="zone-focus" role="status">
    当前高亮 <b>{selected}</b> · 点击平面图或其他卡片可切换
  </p>
{/if}
<div class="home-grid-cards">
  {#each project.storageZones as zone (zone.id)}
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
    />
  {/each}
</div>

<style>
  .home-lead {
    margin: 0 0 14px;
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
