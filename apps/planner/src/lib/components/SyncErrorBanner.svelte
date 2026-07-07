<script>
  import { onMount } from 'svelte'
  import { createPlannerSyncErrorPresentation } from '$lib/syncErrorPresentation.js'
  import { subscribeSyncError } from '$lib/syncNotify.js'
  import { t } from '$lib/i18n/index.js'

  let reason = $state(null)

  const presentation = $derived(
    createPlannerSyncErrorPresentation(reason, {
      message: t('sync.banner', { reason }),
      dismissLabel: t('common.close'),
    }),
  )

  onMount(() => subscribeSyncError((msg) => {
    reason = msg
  }))

  function dismiss() {
    reason = null
  }
</script>

{#if presentation}
  <div class="banner critical banner--row banner--fixed" role="alert" aria-live="assertive">
    <span class="banner__text">{presentation.message}</span>
    <button type="button" class="btn-ghost banner-close" onclick={dismiss}>{presentation.dismissAction?.label}</button>
  </div>
{/if}
