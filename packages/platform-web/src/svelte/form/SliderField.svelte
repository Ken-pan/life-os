<script>
  /**
   * Life OS SliderField — 受控 range 滑杆（从 finance fields 下沉，2026-07-16）。
   * 外观来自 theme 的 .slider 族；填充比例经 --pct 传给轨道渐变。
   */

  /**
   * @type {{
   *   label?: string,
   *   value: number,
   *   onChange: (value: number) => void,
   *   onCommit?: (value: number) => void,
   *   min?: number,
   *   max: number,
   *   step?: number,
   *   format?: (value: number) => string,
   *   hint?: string,
   *   disabled?: boolean
   * }}
   */
  let {
    label = '',
    value,
    onChange,
    onCommit,
    min = 0,
    max,
    step = 1,
    format,
    hint = '',
    disabled = false,
  } = $props()

  const safe = $derived(Number.isFinite(value) ? value : 0)
  const clamped = $derived(Math.min(max, Math.max(min, safe)))
  const pct = $derived(max > min ? ((clamped - min) / (max - min)) * 100 : 0)

  /** @param {Event} e */
  function commit(e) {
    onCommit?.(Number(/** @type {HTMLInputElement} */ (e.currentTarget).value))
  }
</script>

<div class="field">
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
    {disabled}
    value={clamped}
    style="--pct: {pct}%"
    oninput={(e) => onChange(Number(e.currentTarget.value))}
    onpointerup={commit}
    onkeyup={commit}
    ontouchend={commit}
  />
  {#if hint}<p class="field-hint">{hint}</p>{/if}
</div>
