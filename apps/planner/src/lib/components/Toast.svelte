<script>
  import { toastState, dismissToast } from '$lib/ui.svelte.js';

  function handleAction() {
    toastState.onAction?.();
    dismissToast();
  }
</script>

<div
  class="toast toast--{toastState.tone}"
  class:toast--action={toastState.actionLabel}
  class:show={toastState.show}
  role="status"
  aria-live="polite"
>
  <span>{toastState.msg}</span>
  {#if toastState.actionLabel && toastState.onAction}
    <button type="button" class="toast-action" onclick={handleAction}>{toastState.actionLabel}</button>
  {/if}
</div>
