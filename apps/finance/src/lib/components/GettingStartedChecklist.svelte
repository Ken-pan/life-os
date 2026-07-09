<script>
  import { t } from '$lib/i18n.svelte.js'
  import { trackFunnel, FUNNEL_EVENTS } from '$lib/analytics'

  /** @typedef {import('$lib/goTab.js').GoTab} GoTab */

  /** @type {{ onGoTab: GoTab }} */
  let { onGoTab } = $props()

  const STEPS = [
    { key: 'accounts', tab: 'accounts' },
    { key: 'fixed', tab: 'history', section: 'fixed' },
    { key: 'import', tab: 'review', section: 'import' },
  ]
</script>

<div class="card getting-started">
  <h3 class="mb-2">{t('onboarding.title')}</h3>
  <p class="muted-note mb-3">{t('onboarding.subtitle')}</p>
  <ol class="getting-started-steps">
    {#each STEPS as step, index (step.key)}
      <li>
        <button
          type="button"
          class="getting-started-step"
          onclick={() => {
            trackFunnel(FUNNEL_EVENTS.onboardingStep, { step: step.key })
            onGoTab(step.tab, 'section' in step ? step.section : undefined)
          }}
        >
          <span class="getting-started-step-index">{index + 1}</span>
          <span>
            <strong>{t(`onboarding.step.${step.key}.title`)}</strong>
            <span class="meta block">{t(`onboarding.step.${step.key}.hint`)}</span>
          </span>
        </button>
      </li>
    {/each}
  </ol>
</div>
