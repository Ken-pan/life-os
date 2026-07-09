<script>
  // Port of PercentField from src/components/fields.tsx.
  // 内部用小数 (0.06)，显示百分比 (6)。
  /** @type {{ label?: string, value: number, onChange: (v: number) => void }} */
  let { label, value, onChange } = $props()

  function handleInput(e) {
    const raw = e.currentTarget.value
    onChange(raw === '' ? 0 : Number(raw) / 100)
  }
</script>

<div class="field">
  {#if label}<label>{label}</label>{/if}
  <div class="field-affix">
    <input
      class="input"
      type="number"
      inputmode="decimal"
      step={0.1}
      value={Number.isFinite(value) ? +(value * 100).toFixed(2) : ''}
      oninput={handleInput}
    />
    <span class="field-affix__suffix">%</span>
  </div>
</div>
