<script>
  // 薄封装：共享 SliderField（@life-os/platform-web/svelte/form）；finance 默认 step=25。
  import { SliderField } from '@life-os/platform-web/svelte/form'

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
</script>

<SliderField {label} {value} {onChange} {onCommit} {min} {max} {step} {format} {hint} />
