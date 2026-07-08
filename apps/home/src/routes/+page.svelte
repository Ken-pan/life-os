<script>
  import { goto } from '$app/navigation'
  import { getActiveProject } from '$lib/state.svelte.js'
  import { projectStats } from '$lib/spatial/model.js'
  import FloorPlanPreview from '$lib/components/FloorPlanPreview.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'
  import StorageZoneCard from '$lib/components/StorageZoneCard.svelte'
  import {
    exportAuditHtml,
    exportAuditMhtml,
    downloadBlob,
  } from '$lib/spatial/export-html.js'
  import { toast } from '$lib/ui.svelte.js'
  import { isSpatialStudioEnabled } from '$lib/spatial-studio.js'

  const project = $derived(getActiveProject())
  const stats = $derived(projectStats(project))
  const studio = $derived(isSpatialStudioEnabled())
  const roomCount = $derived(project.rooms.filter((r) => r.kind !== 'circulation').length)
  const previewZones = $derived(
    ['s6', 's5', 's8']
      .map((id) => project.storageZones.find((z) => z.id === id))
      .filter(Boolean),
  )

  function exportHtml() {
    const filename = `${project.meta.id}-audit.html`
    downloadBlob(
      exportAuditHtml(project, { includeFurniture: studio }),
      filename,
      'text/html;charset=utf-8',
    )
    toast(`已下载 ${filename}`)
  }

  function exportMhtml() {
    const filename = `${project.meta.id}-audit.mhtml`
    downloadBlob(
      exportAuditMhtml(project, { includeFurniture: studio }),
      filename,
      'multipart/related',
    )
    toast(`已下载 ${filename}`)
  }
</script>

<p class="page-sub home-lead">
  {stats.storageZones} 个储藏区 · {roomCount} 个房间 · 青灰斜纹 = 储藏区{#if studio} · 灰底 = 家具（工坊）{/if}
</p>

<div class="home-chips">
  <span class="home-chip"><b>户型</b> {project.meta.layoutType}</span>
  <span class="home-chip"><b>面积</b> {project.meta.sqft} sqft</span>
  <span class="home-chip"><b>状态</b> {project.meta.status}</span>
</div>

<div class="home-actions">
  <button type="button" class="home-btn primary" onclick={exportHtml}
    >导出 HTML</button
  >
  <button type="button" class="home-btn" onclick={exportMhtml}
    >导出 MHTML</button
  >
  <a class="home-btn" href="/storage">储藏清单</a>
</div>

<FloorPlanPreview {project} />

<PlanLegend showFurniture={studio} />

<h2 class="home-section-title">储藏区速览</h2>
<p class="page-sub" style="margin: 0 0 12px">
  <a href="/storage">查看全部 S1–S{stats.storageZones} →</a>
</p>
<div class="home-grid-cards">
  {#each previewZones as zone (zone.id)}
    <StorageZoneCard
      code={zone.code}
      nameZh={zone.nameZh}
      locationZh={zone.locationZh}
      formZh={zone.formZh}
      items={zone.items.slice(0, 3)}
      inferred={zone.inferred}
      onSelect={() => goto(`/storage?zone=${zone.code}`)}
    />
  {/each}
</div>

<div class="home-notes" style="margin-top: 24px">
  <b>按开发商 769 sqft 户型图等比重建。</b> Living 11'10"×16'9"、Bedroom 12'6"×10'11" 等为图面标注；储藏区为物品审计映射。
  {#if project.meta.floorplanUrl}
    <a
      class="home-inline-link"
      href={project.meta.floorplanUrl}
      target="_blank"
      rel="noopener"
    >
      对照开发商户型图
    </a>
  {/if}
</div>

<style>
  .home-lead {
    margin: 0 0 14px;
  }

  .home-inline-link {
    display: inline-block;
    margin-left: 8px;
    color: var(--accent);
    font-weight: 600;
  }
</style>
