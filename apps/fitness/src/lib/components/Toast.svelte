<script>
  import { toastState } from '$lib/ui.svelte.js';
</script>

<div class="toast" class:show={toastState.show} role="status" aria-live="polite" aria-atomic="true">{toastState.msg}</div>
