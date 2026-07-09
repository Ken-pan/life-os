<script>
  // DueDayField — from AccountsView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { DUE_DAY_LAST_OF_MONTH } from '../../types.js'

  /** @type {{ value?: number, onChange: (v: number) => void }} */
  let { value, onChange } = $props()

  const isLastDay = $derived(value === DUE_DAY_LAST_OF_MONTH || (value != null && value >= 29))
</script>

<div class="field">
  <label>{t('accounts.dueDayLabel')}</label>
  {#if isLastDay}
    <input class="input" type="text" value={t('accounts.dueDayDisabled')} disabled />
  {:else}
    <input
      class="input"
      type="number"
      inputmode="numeric"
      value={value ?? 15}
      step={1}
      min={1}
      max={28}
      oninput={(e) => {
        const raw = e.currentTarget.value
        onChange(
          raw === '' ? 15 : Math.min(28, Math.max(1, Math.round(Number(raw)))),
        )
      }}
    />
  {/if}
  <label class="field-inline-check mt-1 text-sm" title={t('accounts.dueDayAppleHint')}>
    <input
      type="checkbox"
      checked={isLastDay}
      onchange={(e) => onChange(e.currentTarget.checked ? DUE_DAY_LAST_OF_MONTH : 15)}
    />
    {t('accounts.dueDayLastOption')}
  </label>
</div>
