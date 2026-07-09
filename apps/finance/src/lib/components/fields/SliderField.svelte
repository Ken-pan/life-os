<script>
  // Port of SliderField from src/components/fields.tsx.
  /** @type {{
   *   label?: string,
   *   value: number,
   *   onChange: (v: number) => void,
   *   onCommit?: (v: number) => void,
   *   min?: number,
   *   max: number,
   *   step?: number,
   *   format?: (v: number) => string,
   *   hint?: string,
   * }} */
  let {
    label,
    value,
    onChange,
    onCommit,
    min = 0,
    max,
    step = 25,
    format,
    hint,
  } = $props()

  const safe = $derived(Number.isFinite(value) ? value : 0)
  const clamped = $derived(Math.min(max, Math.max(min, safe)))
  const pct = $derived(max > min ? ((clamped - min) / (max - min)) * 100 : 0)

  /** @param {Event} e */
  function commit(e) {
    onCommit?.(Number(/** @type {HTMLInputElement} */ (e.currentTarget).value))
  }
</script>

<div class="field slider-field">
  {#if label}
    <label class="slider-label">
      <span>{label}</span>
      <span class="slider-value">{format ? format(safe) : safe}</span>
    </label>
  {/if}
  <input
    class="slider"
    type="range"
    {min}
    {max}
    {step}
    value={clamped}
    style="--pct: {pct}%"
    oninput={(e) => onChange(Number(e.currentTarget.value))}
    onpointerup={commit}
    onkeyup={commit}
    ontouchend={commit}
  />
  {#if hint}<span class="slider-hint">{hint}</span>{/if}
</div>
