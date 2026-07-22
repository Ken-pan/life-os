<script>
  import { onMount } from 'svelte'
  import { buildCockpitModel, buildProjectTodayModel, isProjectSpineWriterEnabled } from '$lib/kenos/projectSpine.core.js'
  import { completePlanTask, loadProjectSpineData } from '$lib/kenos/projectSpine.host.js'

  let model = $state(null)
  let error = $state('')
  let busyTaskId = $state('')
  const writerOn = isProjectSpineWriterEnabled()

  async function refresh() {
    try {
      const raw = await loadProjectSpineData()
      model = buildProjectTodayModel(buildCockpitModel(raw))
      error = ''
    } catch (e) {
      // 未登录/无数据时静默:Today 不为空态加噪音
      model = null
      error = String(e?.message || '')
    }
  }

  onMount(refresh)

  async function completeNext(item) {
    if (!writerOn || busyTaskId) return
    busyTaskId = item.taskId
    try {
      await completePlanTask(item.taskId, true)
      await refresh()
    } catch (e) {
      error = String(e?.message || e)
    } finally {
      busyTaskId = ''
    }
  }

  const hasContent = $derived(
    !!model &&
      (model.activeNextActions.length ||
        model.waitingProjects.length ||
        model.needsReview.length ||
        model.recentlyProgressed.length),
  )
</script>

{#if hasContent}
  <section class="spine-today" aria-label="项目脊柱">
    <header>
      <h2>Projects</h2>
      <a href="/projects">打开 Cockpit</a>
    </header>

    {#if model.activeNextActions.length}
      <ul class="spine-today-list">
        {#each model.activeNextActions as item (item.taskId)}
          <li>
            <span class="what">{item.title}</span>
            <span class="who">{item.projectTitle}</span>
            {#if writerOn}
              <button
                type="button"
                disabled={busyTaskId === item.taskId}
                onclick={() => completeNext(item)}
              >完成</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="spine-today-rows">
      {#if model.needsReview.length}
        <p>待回顾:{model.needsReview.map((p) => p.projectTitle).join('、')}</p>
      {/if}
      {#if model.waitingProjects.length}
        <p>等待中:{model.waitingProjects.map((p) => p.projectTitle).join('、')}</p>
      {/if}
      {#if model.recentlyProgressed.length}
        <p>近 48h 有进展:{model.recentlyProgressed.map((p) => p.projectTitle).join('、')}</p>
      {/if}
    </div>
    {#if error}<p class="spine-today-error">{error}</p>{/if}
  </section>
{/if}

<style>
  .spine-today {
    border: 1px solid color-mix(in oklab, currentColor 10%, transparent);
    border-radius: 14px;
    padding: 12px 14px;
    margin: 12px 0;
  }
  .spine-today header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .spine-today h2 {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }
  .spine-today header a {
    font-size: 0.8rem;
    color: inherit;
  }
  .spine-today-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .spine-today-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    min-width: 0;
  }
  .spine-today-list .what {
    font-weight: 600;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .spine-today-list .who {
    font-size: 0.75rem;
    opacity: 0.6;
    white-space: nowrap;
  }
  .spine-today-list button {
    margin-left: auto;
    font: inherit;
    font-size: 0.78rem;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
    background: transparent;
    color: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .spine-today-list button:disabled { opacity: 0.5; }
  .spine-today-rows p {
    margin: 6px 0 0;
    font-size: 0.8rem;
    opacity: 0.7;
  }
  .spine-today-error {
    font-size: 0.75rem;
    opacity: 0.6;
    margin: 6px 0 0;
  }
</style>
