<script>
  import { t } from '$lib/i18n.svelte.js'

  /** @type {{ label: string, value: string, headers: string[], onChange: (v: string) => void }} */
  let { label, value, headers, onChange } = $props()
</script>

<label class="field">
  <span>{label}</span>
  <select class="input" {value} onchange={(e) => onChange(e.currentTarget.value)}>
    <option value="">{t('review.unmapped')}</option>
    {#each headers as h (h)}
      <option value={h}>{h}</option>
    {/each}
  </select>
</label>
