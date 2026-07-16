<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  const rows = [
    { label: 'Today', value: 62 },
    { label: 'Weekly volume', value: 38 },
  ]
</script>

<section class="catalog-section" data-testid="showcase-progress">
  <h2 class="catalog-section__title">Progress (.progress)</h2>
  <p class="catalog-section__lead">
    determinate 进度条原语：<code>.progress</code> + <code>.progress__fill</code>，
    填充经 <code>--progress-value</code> 传入；配 <code>.progress-label</code> 标题行。
    尺寸 <code>--sm/--lg</code>；语义色 <code>--success/--warn/--danger</code>；
    总量未知用 <code>--indeterminate</code>（reduced-motion 降级半透明满条）。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Default / sizes">
      <div class="catalog-progress-col">
        {#each rows as row}
          <div>
            <div class="progress-label">
              <span>{row.label}</span>
              <span class="progress-label__value">{row.value}%</span>
            </div>
            <div
              class="progress"
              role="progressbar"
              aria-label={row.label}
              aria-valuenow={row.value}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="progress__fill" style="--progress-value: {row.value}%"></div>
            </div>
          </div>
        {/each}
        <div
          class="progress progress--sm"
          role="progressbar"
          aria-label="Small"
          aria-valuenow="45"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress__fill" style="--progress-value: 45%"></div>
        </div>
        <div
          class="progress progress--lg"
          role="progressbar"
          aria-label="Large"
          aria-valuenow="80"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress__fill" style="--progress-value: 80%"></div>
        </div>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="status" label="Semantic (success / warn / danger)">
      <div class="catalog-progress-col">
        {#each [['progress--success', 'Budget on track', 72], ['progress--warn', 'Approaching limit', 88], ['progress--danger', 'Over budget', 100]] as [variant, label, value]}
          <div>
            <div class="progress-label">
              <span>{label}</span>
              <span class="progress-label__value">{value}%</span>
            </div>
            <div
              class="progress {variant}"
              role="progressbar"
              aria-label={label}
              aria-valuenow={value}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="progress__fill" style="--progress-value: {value}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="steps" label="Steps (wizard)">
      <ol class="steps catalog-steps">
        <li class="steps__item steps__item--done">
          <span class="steps__dot" aria-hidden="true">✓</span>
          <span class="steps__label">Profile</span>
        </li>
        <li class="steps__item steps__item--done">
          <span class="steps__dot" aria-hidden="true">✓</span>
          <span class="steps__label">Goals</span>
        </li>
        <li class="steps__item steps__item--current" aria-current="step">
          <span class="steps__dot" aria-hidden="true">3</span>
          <span class="steps__label">Schedule</span>
        </li>
        <li class="steps__item">
          <span class="steps__dot" aria-hidden="true">4</span>
          <span class="steps__label">Review</span>
        </li>
      </ol>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="indeterminate" label="Indeterminate">
      <div class="catalog-progress-col">
        <div>
          <div class="progress-label">
            <span>Repairing metadata…</span>
          </div>
          <div class="progress progress--indeterminate" role="progressbar" aria-label="Repairing metadata">
            <div class="progress__fill"></div>
          </div>
        </div>
      </div>
    </CatalogStateBlock>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 8px;
    font-size: var(--text-2xl);
  }
  .catalog-section__lead {
    margin: 0 0 20px;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
  }
  .catalog-progress-col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 360px;
  }
  .catalog-steps {
    max-width: 480px;
  }
</style>
