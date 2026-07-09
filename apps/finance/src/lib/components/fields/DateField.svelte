<script>
  // 端口自 src/components/fields.tsx 的 DateField。
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import { formatDateLocalized } from '$lib/format.js'

  let { label, value, onChange, min } = $props()

  // input[type=date] 需要 "YYYY-MM-DD"；裁掉可能带的时间部分。
  const dateOnly = $derived(value ? value.slice(0, 10) : '')
  const displayLocalized = $derived(formatDateLocalized(dateOnly))
</script>

<div class="field">
  {#if label}<label>{label}</label>{/if}
  <div class="date-field-wrap{dateOnly ? '' : ' is-empty'}">
    <input
      class="input"
      type="date"
      lang={intlLocaleTag()}
      value={dateOnly}
      {min}
      onchange={(e) => onChange(e.currentTarget.value)}
    />
    {#if !dateOnly}
      <span class="date-field-placeholder">{t('common.datePlaceholder')}</span>
    {/if}
  </div>
  {#if displayLocalized}
    <span class="muted-note date-field-zh">{displayLocalized}</span>
  {/if}
</div>
