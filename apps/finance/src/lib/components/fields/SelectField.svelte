<script>
  // 薄封装：共享 SelectField（@life-os/platform-web/svelte/form）+ finance 的 .input 视觉。
  import { SelectField } from '@life-os/platform-web/svelte/form'

  /** @type {{ label?: string, value: string, options: { value: string, label: string }[], onChange: (v: string) => void }} */
  let { label, value, options, onChange } = $props()
</script>

<SelectField {label} {value} {options} {onChange} inputClass="input" />
