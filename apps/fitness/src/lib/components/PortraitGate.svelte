<script>
  import { syncPortraitLockEnabled } from '@life-os/theme'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ enabled?: boolean }} */
  let { enabled = true } = $props()

  $effect(() => {
    syncPortraitLockEnabled(enabled)
    return () => syncPortraitLockEnabled(false)
  })
</script>

<div
  class="life-os-portrait-gate"
  role="dialog"
  aria-modal="true"
  aria-label={t('settings.rotatePortrait')}
>
  <div class="life-os-portrait-gate-inner">
    <span class="life-os-portrait-gate-icon" aria-hidden="true">↻</span>
    <p class="life-os-portrait-gate-title">{t('settings.rotatePortrait')}</p>
    <p class="life-os-portrait-gate-hint">{t('settings.rotatePortraitHint')}</p>
  </div>
</div>
