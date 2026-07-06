<script>
  import { toastState, dismissToast } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';
</script>

<div
  class="toast toast--{toastState.tone}"
  class:show={toastState.show}
  role={toastState.tone === 'error' || toastState.tone === 'warn' ? 'alert' : 'status'}
  aria-live={toastState.tone === 'error' || toastState.tone === 'warn' ? 'assertive' : 'polite'}
  aria-atomic="true"
>
  <span class="toast-msg">{toastState.msg}</span>
  {#if toastState.show}
    <button class="toast-dismiss" type="button" aria-label={t('common.close')} onclick={dismissToast}>×</button>
  {/if}
</div>
