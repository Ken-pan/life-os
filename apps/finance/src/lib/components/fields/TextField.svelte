<script>
  // 端口自 src/components/fields.tsx 的 TextField。
  let { label, value, onChange, placeholder } = $props()
</script>

<div class="field">
  {#if label}<label>{label}</label>{/if}
  <input
    class="input"
    type="text"
    {value}
    {placeholder}
    onchange={(e) => onChange(e.currentTarget.value)}
  />
</div>
