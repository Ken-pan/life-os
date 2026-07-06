<script>
  import { t } from '$lib/i18n/index.js';

  /** @type {{ mode: 'list' | 'timeline', onChange: (mode: 'list' | 'timeline') => void }} */
  let { mode, onChange } = $props();
</script>

<div class="today-view-toggle" role="tablist" aria-label={t('home.viewToggleLabel')}>
  <button
    type="button"
    role="tab"
    class="today-view-toggle-btn"
    aria-selected={mode === 'list'}
    class:on={mode === 'list'}
    onclick={() => onChange('list')}
  >
    {t('home.viewList')}
  </button>
  <button
    type="button"
    role="tab"
    class="today-view-toggle-btn"
    aria-selected={mode === 'timeline'}
    class:on={mode === 'timeline'}
    onclick={() => onChange('timeline')}
  >
    {t('home.viewTimeline')}
  </button>
</div>
