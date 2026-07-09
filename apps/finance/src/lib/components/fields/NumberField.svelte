<script>
  // Port of NumberField from src/components/fields.tsx.
  /** @type {{ label?: string, value: number, onChange: (v: number) => void, step?: number, min?: number, suffix?: string, placeholder?: string }} */
  let { label, value, onChange, step = 1, min, suffix, placeholder } = $props()

  function handleInput(e) {
    const raw = e.currentTarget.value
    onChange(raw === '' ? 0 : Number(raw))
  }
</script>

<div class="field">
  {#if label}<label>{label}</label>{/if}
  <div class="field-affix">
    <input
      class="input"
      type="number"
      inputmode="decimal"
      value={Number.isFinite(value) ? value : ''}
      {step}
      {min}
      {placeholder}
      oninput={handleInput}
    />
    {#if suffix}
      <span class="field-affix__suffix">{suffix}</span>
    {/if}
  </div>
</div>
