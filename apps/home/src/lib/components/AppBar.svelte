<script>
  import AppBrand from '@life-os/platform-web/svelte/brand';

  /** @type {{ title?: string, subtitle?: string, meta?: string, backHref?: string, backLabel?: string, hidden?: boolean }} */
  let { title, subtitle, meta, backHref, backLabel = '返回', hidden = false } = $props();

  const hasBack = $derived(Boolean(backHref));
</script>

{#if !hidden}
  <header class="appbar" class:appbar--back={hasBack}>
    <div class="appbar-inner">
      <div class="appbar-leading">
        {#if backHref}
          <a class="appbar-back" href={backHref}>
            <span class="appbar-back-label">{backLabel}</span>
          </a>
        {:else}
          <AppBrand appId="home" variant="appbar" ariaLabel="HOME.OS" />
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
