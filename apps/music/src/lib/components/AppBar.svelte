<script>
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ title?: string, subtitle?: string, backHref?: string, backLabel?: string, hidden?: boolean }} */
  let { title, subtitle, backHref, backLabel, hidden = false } = $props();
  const resolvedBackLabel = $derived(backLabel ?? t('common.back'));
</script>

{#if !hidden}
  <header class="appbar" class:appbar--back={Boolean(backHref)}>
    <div class="appbar-inner">
      <div class="appbar-leading">
        {#if backHref}
          <a class="appbar-back" href={backHref}>
            <Icon name="chevron-left" size={16} strokeWidth={2.5} />
            <span class="appbar-back-label">{resolvedBackLabel}</span>
          </a>
        {:else}
          <div class="brand appbar-brand" aria-label={t('common.brand')}>
            <img src="/icon.svg" alt="" class="appbar-brand-mark" width="24" height="24" />
            <span class="appbar-brand-name">
              MUSIC<span class="brand-dot">.</span>OS
            </span>
          </div>
        {/if}
      </div>
      {#if title}
        <div class="appbar-titles">
          <h1 class="page-title">{title}</h1>
          {#if subtitle}<p class="page-sub">{subtitle}</p>{/if}
        </div>
      {/if}
    </div>
  </header>
{/if}
