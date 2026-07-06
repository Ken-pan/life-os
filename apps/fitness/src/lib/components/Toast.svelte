<script>
  import { toastState } from '$lib/ui.svelte.js';

  const isAssertive = $derived(toastState.tone === 'error' || toastState.tone === 'warn');
</script>

<div
  class="toast toast--{toastState.tone}"
  class:show={toastState.show}
  role={isAssertive ? 'alert' : 'status'}
  aria-live={isAssertive ? 'assertive' : 'polite'}
  aria-atomic="true"
>
  <span class="toast-msg">{toastState.msg}</span>
</div>
