<script>
  // 薄封装：共享 DateField（@life-os/platform-web/svelte/form）+ finance 的
  // 本地化日期回显（note）与 .input 视觉。
  import { DateField } from '@life-os/platform-web/svelte/form'
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import { formatDateLocalized } from '$lib/format.js'

  let { label, value, onChange, min } = $props()

  const note = $derived(formatDateLocalized(value ? value.slice(0, 10) : ''))
</script>

<DateField
  {label}
  {value}
  {onChange}
  {min}
  lang={intlLocaleTag()}
  placeholder={t('common.datePlaceholder')}
  note={note || ''}
  inputClass="input"
/>
