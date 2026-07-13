<script>
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar';
  import AppBrand from '@life-os/platform-web/svelte/brand';
  import { t } from '$lib/i18n/index.js';
  import { toast } from '$lib/ui.svelte.js';
  import ReportBugButton from '@life-os/platform-web/svelte/feedback';
  import { supabase } from '$lib/supabase.js';
  import { auth } from '$lib/auth.svelte.js';

  /** @type {{ title?: string, subtitle?: string, meta?: string, backHref?: string, backLabel?: string, hidden?: boolean }} */
  let { title, subtitle, meta, backHref, backLabel, hidden = false } = $props();
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
    <ReportBugButton app="fitness" {supabase} user={auth.user} {toast} />
    {#if meta}
      <span class="appbar-meta">{meta}</span>
    {/if}
  {/snippet}
</LifeOsAppBar>
