<script>
  import { SET_SCHEMES, SCHEME_GROUPS, schemeMeta } from '$lib/data/setSchemes.js';
  import { t } from '$lib/i18n/index.js';

  /** @type {{
   *   inline?: boolean,
   *   scheme?: string,
   *   pairWith?: string,
   *   pairOptions?: { id: string, name: string }[],
   *   exerciseName?: string,
   *   onSchemeChange?: (scheme: string) => void,
   *   onPairChange?: (pairWith: string | undefined) => void
   * }} */
  let {
    inline = false,
    scheme = 'straight',
    pairWith = undefined,
    pairOptions = [],
    exerciseName = '',
    onSchemeChange,
    onPairChange
  } = $props();

  const currentScheme = $derived(scheme || 'straight');
  const currentSchemeMeta = $derived(schemeMeta(currentScheme));
  const isStraight = $derived(currentScheme === 'straight');

  function optionLabel(schemeId) {
    const meta = schemeMeta(schemeId);
    return inline ? meta.short : meta.label;
  }

  function handleSchemeChange(e) {
    onSchemeChange?.(e.currentTarget.value);
  }

  function handlePairChange(e) {
    onPairChange?.(e.currentTarget.value || undefined);
  }
</script>

<div
  class="scheme-picker"
  class:scheme-picker--inline={inline}
  class:scheme-picker--active={!isStraight}
>
  <label
    class="scheme-picker__field scheme-picker__field--scheme"
    class:pe-inline={inline}
    class:pe-inline--scheme={inline}
  >
    {#if inline}
      <span class="pe-inline-label">{t('schemes.schemeLabel')}</span>
    {:else}
      <span class="scheme-picker__label">{t('schemes.schemeLabel')}</span>
    {/if}
    <div class="scheme-picker__select-wrap">
      <select
        class="scheme-picker__select"
        value={currentScheme}
        aria-label={t('schemes.schemeAria', { name: exerciseName })}
        onchange={handleSchemeChange}
      >
        {#each SCHEME_GROUPS as group (group.labelKey)}
          <optgroup label={t(`schemes.${group.labelKey}`)}>
            {#each group.schemes as schemeId (schemeId)}
              <option value={schemeId} title={schemeMeta(schemeId).description}>
                {optionLabel(schemeId)}
              </option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>
  </label>

  {#if !isStraight}
    <span class="scheme-picker__hint" class:scheme-picker__hint--inline={inline}>
      {currentSchemeMeta.description}
    </span>
  {/if}

  {#if currentScheme === 'superset'}
    <label class="scheme-picker__field scheme-picker__field--pair">
      <span class="scheme-picker__label">{t('schemes.pair')}</span>
      <div class="scheme-picker__select-wrap">
        <select
          class="scheme-picker__select"
          value={pairWith || ''}
          aria-label={t('schemes.pairAria', { name: exerciseName })}
          onchange={handlePairChange}
        >
          <option value="">{t('schemes.pickPair')}</option>
          {#each pairOptions as peer (peer.id)}
            <option value={peer.id}>{peer.name}</option>
          {/each}
        </select>
      </div>
    </label>
  {/if}
</div>
