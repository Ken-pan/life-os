<script>
  import { onMount } from 'svelte'
  import { createSyncErrorPresentation } from '../../syncErrorPresentation.js'

  /**
   * @type {{
   *   subscribe: (onError: (msg: string) => void) => () => void;
   *   formatMessage: (reason: string) => string;
   *   dismissLabel: string;
   * }}
   */
  let { subscribe, formatMessage, dismissLabel } = $props()

  let reason = $state(null)

  const presentation = $derived(
    createSyncErrorPresentation(reason, {
      message: formatMessage(reason ?? ''),
      dismissLabel,
    }),
  )

  onMount(() => subscribe((msg) => {
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
