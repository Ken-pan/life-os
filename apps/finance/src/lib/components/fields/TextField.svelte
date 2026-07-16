<script>
  // 薄封装：共享 TextField（@life-os/platform-web/svelte/form）+ finance 的 .input 视觉。
  import { TextField } from '@life-os/platform-web/svelte/form'

  let { label, value, onChange, placeholder } = $props()
</script>

<TextField {label} {value} {onChange} {placeholder} inputClass="input" />
