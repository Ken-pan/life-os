<script>
  // 薄封装：共享 NumberField（@life-os/platform-web/svelte/form）+ finance 的 .input 视觉。
  import { NumberField } from '@life-os/platform-web/svelte/form'

  /** @type {{ label?: string, value: number, onChange: (v: number) => void, step?: number, min?: number, suffix?: string, placeholder?: string }} */
  let { label, value, onChange, step = 1, min, suffix, placeholder } = $props()
</script>

<NumberField {label} {value} {onChange} {step} {min} {suffix} {placeholder} inputClass="input" />
