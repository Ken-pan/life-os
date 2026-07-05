<script>
  /**
   * @typedef {{ value: string, label: string }} SegmentOption
   * @type {{ options: SegmentOption[], value: string, onchange: (value: string) => void, ariaLabel?: string }}
   */
  let { options, value, onchange, ariaLabel = '' } = $props();
</script>

<div class="seg seg--wrap" role="group" aria-label={ariaLabel || undefined}>
  {#each options as opt (opt.value)}
    <button
      type="button"
      class:on={value === opt.value}
      class:active={value === opt.value}
      aria-pressed={value === opt.value}
      onclick={() => onchange(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>
