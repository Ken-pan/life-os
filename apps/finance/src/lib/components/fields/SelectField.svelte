<script>
  // Port of SelectField from src/components/fields.tsx.
  /** @type {{ label?: string, value: string, options: { value: string, label: string }[], onChange: (v: string) => void }} */
  let { label, value, options, onChange } = $props()
</script>

<div class="field">
  {#if label}<label>{label}</label>{/if}
  <select class="input" {value} onchange={(e) => onChange(e.currentTarget.value)}>
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
</div>
