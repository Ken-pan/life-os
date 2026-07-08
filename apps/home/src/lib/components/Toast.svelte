<script>
  import SharedToast from '@life-os/platform-web/svelte/toast'
  import { toastState, dismissToast } from '$lib/ui.svelte.js'
</script>

<SharedToast state={toastState} ondismiss={dismissToast} />
