<script>
  /**
   * Life OS QuantityStepper — ± 数量步进（shopos 数量 / healthos 剂量组数预铺，2026-07-16）。
   * 外观来自 theme components.css 的 .stepper 族。
   */

  /**
   * @type {{
   *   value: number,
   *   onChange: (value: number) => void,
   *   min?: number,
   *   max?: number,
   *   step?: number,
   *   label?: string,
   *   format?: (value: number) => string,
   *   disabled?: boolean,
   *   decrementLabel?: string,
   *   incrementLabel?: string
   * }}
   */
  let {
    value,
    onChange,
    min = 0,
    max = Infinity,
    step = 1,
    label = '',
    format,
    disabled = false,
    decrementLabel = 'Decrease',
    incrementLabel = 'Increase',
  } = $props()

  const safe = $derived(Number.isFinite(value) ? value : min)
  const canDec = $derived(!disabled && safe - step >= min)
  const canInc = $derived(!disabled && safe + step <= max)

  function nudge(delta) {
    const next = Math.min(max, Math.max(min, safe + delta))
    if (next !== safe) onChange(next)
  }
</script>

<div
  class="stepper"
  role="group"
  aria-label={label || undefined}
>
  <button
    type="button"
    class="stepper__btn"
    aria-label={decrementLabel}
    disabled={!canDec}
    onclick={() => nudge(-step)}
  >
    −
  </button>
  <span class="stepper__value" aria-live="polite">{format ? format(safe) : safe}</span>
  <button
    type="button"
    class="stepper__btn"
    aria-label={incrementLabel}
    disabled={!canInc}
    onclick={() => nudge(step)}
  >
    +
  </button>
</div>
