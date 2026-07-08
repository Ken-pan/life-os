<script>
  /** @type {{ base: string, accent?: string, class?: string }} */
  let { base, accent = 'OS', class: className = '' } = $props();
</script>

<span class={className}>
  <span class="brand-name-base">{base}</span><span class="brand-name-accent">{accent}</span>
</span>
