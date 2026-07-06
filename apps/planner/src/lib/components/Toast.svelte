<script>
  import { toastState, dismissToast } from '$lib/ui.svelte.js';

  function handleAction() {
    toastState.onAction?.();
    dismissToast();
  }

  const isAssertive = $derived(toastState.tone === 'error' || toastState.tone === 'warn');
</script>

<div
  class="toast toast--{toastState.tone}"
  class:toast--action={toastState.actionLabel}
  class:show={toastState.show}
  role={isAssertive ? 'alert' : 'status'}
  aria-live={isAssertive ? 'assertive' : 'polite'}
  aria-atomic="true"
>
  <span class="toast-msg">{toastState.msg}</span>
  {#if toastState.actionLabel && toastState.onAction}
    <button type="button" class="toast-action" onclick={handleAction}>{toastState.actionLabel}</button>
  {/if}
</div>
