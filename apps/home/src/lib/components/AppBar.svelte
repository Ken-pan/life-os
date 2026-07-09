<script>
  import AppBrand from '@life-os/platform-web/svelte/brand';
  import { toast } from '$lib/ui.svelte.js';
  import ReportBugButton from '@life-os/platform-web/svelte/feedback';
  import { supabase } from '$lib/supabase.js';
  import { auth } from '$lib/auth.svelte.js';

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

      <div class="appbar-trailing">
        <ReportBugButton app="home" {supabase} user={auth.user} {toast} />
        {#if meta}
          <span class="appbar-meta">{meta}</span>
        {/if}
      </div>
    </div>
  </header>
{/if}
