<script>
  import { syncPortraitLockEnabled } from '@life-os/theme'

  /** @type {{ enabled?: boolean, title: string, hint: string, ariaLabel?: string }} */
  let { enabled = true, title, hint, ariaLabel } = $props()

  $effect(() => {
    syncPortraitLockEnabled(enabled)
    return () => syncPortraitLockEnabled(false)
  })
</script>

<div
  class="life-os-portrait-gate"
  role="dialog"
  aria-modal="true"
  aria-label={ariaLabel || title}
>
  <div class="life-os-portrait-gate-inner">
    <span class="life-os-portrait-gate-icon" aria-hidden="true">↻</span>
    <p class="life-os-portrait-gate-title">{title}</p>
    <p class="life-os-portrait-gate-hint">{hint}</p>
  </div>
</div>
