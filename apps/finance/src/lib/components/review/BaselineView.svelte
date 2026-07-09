<script>
  import { t } from '$lib/i18n.svelte.js'
  import { getBaselineConfidenceLabels } from '@life-os/finance-core/copy/terminology'
  import BaselineWindowCard from './BaselineWindowCard.svelte'

  /** @type {{
   *   privacy: boolean,
   *   windows: ReturnType<typeof import('$lib/engine/realityLoop').computeBaselineWindows>,
   *   openReviewCount: number,
   *   onOpenCalibrate: () => void,
   * }} */
  let { privacy, windows, openReviewCount, onOpenCalibrate } = $props()

  const allNotReady = $derived(windows.every((w) => w.confidence === 'Not ready'))
  const sample = $derived(windows[windows.length - 1] ?? windows[0])
</script>

<div class="grid gap-3">
  {#if allNotReady && sample}
    <div class="card">
      <div class="card-head">
        <h3>{t('review.baselineInsufficientTitle')}</h3>
        <span class="tag warn">
          {getBaselineConfidenceLabels()['Not ready']}
        </span>
      </div>
      <p class="muted-note mb-2">
        {t('review.baselineInsufficientNote')}
      </p>
      <BaselineWindowCard w={sample} {privacy} />
    </div>
  {:else}
    {#each windows as w (w.windowMonths)}
      <div class="card">
        <div class="card-head">
          <h3>
            {t('review.baselineWindowTitle', { months: w.windowMonths })}
          </h3>
          <span class="tag{w.confidence === 'Not ready' ? ' warn' : ''}">
            {getBaselineConfidenceLabels()[w.confidence]}
          </span>
        </div>
        <BaselineWindowCard {w} {privacy} />
      </div>
    {/each}
  {/if}
  <div class="card">
    <h3>{t('review.baselineTrustTitle')}</h3>
    <p class="muted-note">
      {t('review.baselineOpenReviewNote', { count: openReviewCount })}
    </p>
    <button class="btn" type="button" onclick={onOpenCalibrate}>
      {t('review.baselineUpdatePlan')}
    </button>
  </div>
</div>
