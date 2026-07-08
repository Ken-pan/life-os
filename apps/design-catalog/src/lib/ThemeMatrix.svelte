<script>
  import { APPS, MODES, VIEWPORTS, MATRIX_SHOWCASES } from './catalogNav.js'
  import { VIEWPORT_SIZES } from './catalogState.js'
  import { getShowcaseStates } from './showcaseStates.js'
  import { CATALOG_STATE_ALL } from './showcaseStateFilter.js'

  /** @type {{
   *   app: string,
   *   mode: string,
   *   viewport: string,
   *   showcase: string,
   *   catalogState: string,
   *   onApp: (v: string) => void,
   *   onMode: (v: string) => void,
   *   onViewport: (v: string) => void,
   *   onState: (v: string) => void,
   * }} */
  let {
    app,
    mode,
    viewport,
    showcase,
    catalogState,
    onApp,
    onMode,
    onViewport,
    onState,
  } = $props()

  const matrixShowcaseIds = new Set(MATRIX_SHOWCASES.map((s) => s.id))

  const stateOptions = $derived.by(() => {
    const states = getShowcaseStates(showcase)
    return [{ id: CATALOG_STATE_ALL, label: 'All states' }, ...states]
  })

  const showStatePicker = $derived(
    matrixShowcaseIds.has(showcase) || catalogState !== CATALOG_STATE_ALL,
  )
</script>

<div class="theme-matrix" data-testid="theme-matrix">
  <label>
    App
    <select value={app} onchange={(e) => onApp(e.currentTarget.value)}>
      {#each APPS as id}
        <option value={id}>{id}</option>
      {/each}
    </select>
  </label>
  <label>
    Mode
    <select value={mode} onchange={(e) => onMode(e.currentTarget.value)}>
      {#each MODES as id}
        <option value={id}>{id}</option>
      {/each}
    </select>
  </label>
  <label>
    Viewport
    <select
      value={viewport}
      onchange={(e) => onViewport(e.currentTarget.value)}
    >
      {#each VIEWPORTS as id}
        <option value={id}>{VIEWPORT_SIZES[id].label}</option>
      {/each}
    </select>
  </label>
  {#if showStatePicker}
    <label data-testid="theme-matrix-state">
      State
      <select
        value={catalogState}
        onchange={(e) => onState(e.currentTarget.value)}
      >
        {#each stateOptions as option}
          <option value={option.id}>{option.label}</option>
        {/each}
      </select>
    </label>
  {/if}
</div>

<style>
  .theme-matrix {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    background: var(--catalog-chrome-surface);
    border-bottom: 1px solid var(--catalog-chrome-border);
    color: var(--catalog-chrome-text);
    font-size: 13px;
  }

  .theme-matrix label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-matrix select {
    background: var(--catalog-chrome-control-bg);
    color: var(--catalog-chrome-control-text);
    border: 1px solid var(--catalog-chrome-border-strong);
    border-radius: 6px;
    padding: 4px 8px;
  }
</style>
