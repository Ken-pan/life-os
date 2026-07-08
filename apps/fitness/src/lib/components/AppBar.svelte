<script>
  import AppBrand from '@life-os/platform-web/svelte/brand';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ title?: string, subtitle?: string, meta?: string, backHref?: string, backLabel?: string, hidden?: boolean }} */
  let { title, subtitle, meta, backHref, backLabel, hidden = false } = $props();

  const resolvedBackLabel = $derived(backLabel ?? t('common.back'));
  const hasBack = $derived(Boolean(backHref));
</script>

{#if !hidden}
  <header class="appbar" class:appbar--back={hasBack}>
    <div class="appbar-inner">
      <div class="appbar-leading">
        {#if backHref}
          <a class="appbar-back" href={backHref}>
            <Icon name="chevron-left" size={16} strokeWidth={2.5} />
            <span class="appbar-back-label">{resolvedBackLabel}</span>
          </a>
        {:else}
          <AppBrand appId="fitness" variant="appbar" ariaLabel={t('common.brand')} />
        {/if}
      </div>

      {#if title}
        <div class="appbar-titles">
          <h1 class="page-title">{title}</h1>
          {#if subtitle}<p class="page-sub">{subtitle}</p>{/if}
        </div>
      {/if}

      {#if meta}
        <div class="appbar-trailing">
          <span class="appbar-meta">{meta}</span>
        </div>
      {/if}
    </div>
  </header>
{/if}
