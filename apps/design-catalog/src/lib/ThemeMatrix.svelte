<script>
  import { APPS, MODES, VIEWPORTS } from './catalogNav.js'
  import { VIEWPORT_SIZES } from './catalogState.js'

  /** @type {{ app: string, mode: string, viewport: string, onApp: (v: string) => void, onMode: (v: string) => void, onViewport: (v: string) => void }} */
  let { app, mode, viewport, onApp, onMode, onViewport } = $props()
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
</div>

<style>
  .theme-matrix {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    background: #1a1a1a;
    border-bottom: 1px solid #2a2a2a;
    color: #e8e8e8;
    font-size: 13px;
  }

  .theme-matrix label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-matrix select {
    background: #2a2a2a;
    color: #fff;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 4px 8px;
  }
</style>
