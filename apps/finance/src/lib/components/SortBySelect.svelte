<script>
  // 端口自 src/components/SortBySelect.tsx。
  let { label = '排序', value, onChange, options, className, compact = false } = $props()

  const classes = $derived(
    ['field', 'sort-select', compact ? 'compact' : '', className].filter(Boolean).join(' '),
  )
</script>

<div class={classes}>
  {#if !compact}<label>{label}</label>{/if}
  <select class="input" {value} aria-label={label} onchange={(e) => onChange(e.currentTarget.value)}>
    {#each options as option (option.id)}
      <option value={option.id}>{option.label}</option>
    {/each}
  </select>
</div>
