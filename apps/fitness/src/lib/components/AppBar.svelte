<script>
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar';
  import AppBrand from '@life-os/platform-web/svelte/brand';
  import { t } from '$lib/i18n/index.js';
  import { toast } from '$lib/ui.svelte.js';
  import ReportBugButton from '@life-os/platform-web/svelte/feedback';
  import { supabase } from '$lib/supabase.js';
  import { auth } from '$lib/auth.svelte.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { openFitnessContinue } from '$lib/kenos/fitnessSpaceAdapter.js';

  /** @type {{ title?: string, subtitle?: string, meta?: string, backHref?: string, backLabel?: string, hidden?: boolean }} */
  let { title, subtitle, meta, backHref, backLabel, hidden = false } = $props();

  function onContinue() {
    openFitnessContinue({ handoffToKenos: true });
  }
</script>

<LifeOsAppBar
  {title}
  {subtitle}
  {backHref}
  backLabel={backLabel ?? t('common.back')}
  {hidden}
>
  {#snippet leading()}
    <AppBrand appId="fitness" variant="appbar" ariaLabel={t('common.brand')} />
  {/snippet}
  {#snippet trailing()}
    <button
      type="button"
      class="appbar-continue"
      data-testid="fitness-kenos-continue"
      aria-label={t('nav.continue')}
      title={t('nav.continue')}
      onclick={onContinue}
    >
      <Icon name="history" size={18} strokeWidth={1.75} />
      <span>{t('nav.continue')}</span>
    </button>
    <ReportBugButton app="fitness" {supabase} user={auth.user} {toast} />
    {#if meta}
      <span class="appbar-meta">{meta}</span>
    {/if}
  {/snippet}
</LifeOsAppBar>

<style>
  .appbar-continue {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 8px;
    background: transparent;
    color: var(--t1);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
