<script>
  import { t } from '$lib/i18n.svelte.js'
  import GettingStartedChecklist from './GettingStartedChecklist.svelte'
  import AnalyticsPanel, {
    NAV_ROUTE_SAMPLES,
    buildAppPath,
    analyticsEventForRoute,
  } from './settings/AnalyticsPanel.svelte'

  /** @typedef {import('$lib/goTab.js').GoTab} GoTab */

  /** @type {{ onGoTab: GoTab }} */
  let { onGoTab } = $props()
</script>

<div class="grid gap-4 help-center">
  <div class="card">
    <h3>{t('help.centerTitle')}</h3>
    <p class="muted-note">{t('help.centerIntro')}</p>
  </div>

  <GettingStartedChecklist {onGoTab} />

  <div class="card">
    <h3>{t('help.navMapTitle')}</h3>
    <p class="muted-note">{t('help.navMapIntro')}</p>
    <div class="help-route-table-wrap">
      <table class="help-route-table">
        <thead>
          <tr>
            <th>{t('help.navMapColPath')}</th>
            <th>{t('help.navMapColEvent')}</th>
          </tr>
        </thead>
        <tbody>
          {#each NAV_ROUTE_SAMPLES as route (buildAppPath(route))}
            <tr>
              <td><code>{buildAppPath(route)}</code></td>
              <td><code>{analyticsEventForRoute(route)}</code></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h3>{t('help.treeTestTitle')}</h3>
    <p class="muted-note">{t('help.treeTestIntro')}</p>
    <ul class="help-task-list">
      <li>{t('help.treeTestTask1')}</li>
      <li>{t('help.treeTestTask2')}</li>
      <li>{t('help.treeTestTask3')}</li>
    </ul>
    <p class="muted-note text-sm mt-2">{t('help.treeTestDocHint')}</p>
  </div>
</div>
