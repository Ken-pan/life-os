<script>
  import { toastState } from '$lib/ui.svelte.js';
</script>

<div class="toast" class:show={toastState.show} role="status" aria-live="polite">{toastState.msg}</div>
