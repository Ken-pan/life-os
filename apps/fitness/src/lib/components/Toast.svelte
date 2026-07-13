<script>
  import SharedToast from '@life-os/platform-web/svelte/toast';
  import { toastState, dismissToast } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';
</script>

<SharedToast state={toastState} onDismiss={dismissToast} dismissLabel={t('common.close')} />
