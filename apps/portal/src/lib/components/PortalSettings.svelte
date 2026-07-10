<script>
  import { LIFE_OS_SITE_META } from '@life-os/theme'
  import { PORTAL_PRODUCTION_APPS } from '$lib/apps.js'
  import {
    portalPreferences,
    saveDefaultApp,
    saveSkipAutoRedirect,
  } from '$lib/portalPreferences.svelte.js'

  /** @typedef {import('$lib/apps.js').LauncherAppId} LauncherAppId */

  /** @type {{
   *   userId: string,
   *   allowedAppKeys?: string[],
   * }} */
  let { userId, allowedAppKeys = [] } = $props()

  let savingDefault = $state(false)
  let savingSkip = $state(false)

  const defaultApp = $derived(portalPreferences.defaultApp)
  const skipAutoRedirect = $derived(portalPreferences.skipAutoRedirect)
  const allowedProductionApps = $derived(
    PORTAL_PRODUCTION_APPS.filter((app) => allowedAppKeys.includes(app.id)),
  )

  /** @param {Event} event */
  async function onDefaultChange(event) {
    const value = /** @type {HTMLSelectElement} */ (event.currentTarget).value
    const next = value ? /** @type {LauncherAppId} */ (value) : null
    savingDefault = true
    try {
      await saveDefaultApp(userId, next)
    } finally {
      savingDefault = false
    }
  }

  /** @param {Event} event */
  async function onSkipChange(event) {
    const checked = /** @type {HTMLInputElement} */ (event.currentTarget)
      .checked
    savingSkip = true
    try {
      await saveSkipAutoRedirect(userId, checked)
    } finally {
      savingSkip = false
    }
  }
</script>

<section class="portal-settings" aria-labelledby="portal-settings-title">
  <h2 id="portal-settings-title" class="portal-section-label">启动偏好</h2>
  <div class="settings-block portal-settings-block">
    <label class="portal-settings-row" for="portal-default-app">
      <span class="portal-settings-label">默认应用</span>
      <select
        id="portal-default-app"
        class="portal-settings-select"
        value={defaultApp ?? ''}
        disabled={savingDefault || !portalPreferences.prefsReady}
        onchange={onDefaultChange}
      >
        <option value="">每次显示 Launcher</option>
        {#each allowedProductionApps as app (app.id)}
          <option value={app.id}>{LIFE_OS_SITE_META[app.id].name}</option>
        {/each}
      </select>
    </label>
    <label class="portal-settings-row portal-settings-row--checkbox">
      <input
        type="checkbox"
        checked={skipAutoRedirect}
        disabled={savingSkip || !portalPreferences.prefsReady}
        onchange={onSkipChange}
      />
      <span class="portal-settings-label"
        >始终显示 Launcher（跳过自动跳转）</span
      >
    </label>
    <p class="portal-settings-hint">
      设置默认应用后，下次从 Portal
      登录可直达该站；勾选上方选项则始终停留在此页。
    </p>
  </div>
</section>

<style>
  .portal-settings-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .portal-settings-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .portal-settings-row--checkbox {
    flex-direction: row;
    align-items: center;
    gap: var(--space-3);
  }

  .portal-settings-label {
    font-size: var(--text-sm);
    color: var(--t2);
  }

  .portal-settings-select {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
  }

  .portal-settings-hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--t3);
    line-height: 1.5;
  }
</style>
