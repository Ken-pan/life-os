<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  const stars = [1, 2, 3, 4, 5]
</script>

<section class="catalog-section" data-testid="showcase-display">
  <h2 class="catalog-section__title">Display primitives</h2>
  <p class="catalog-section__lead">
    展示型原语，为未来 app 预铺：<code>.avatar</code>（尺寸 / 首字母 / 组叠）·
    <code>.rating</code>（星级，shopos 评价）· <code>.timeline</code>
    （healthos 病程 / brainos 日志）· <code>.breadcrumbs</code>（noteos 层级）。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="avatar" label="Avatar (sizes / group)">
      <div class="catalog-display-row">
        <span class="avatar avatar--sm">KP</span>
        <span class="avatar">KP</span>
        <span class="avatar avatar--lg">KP</span>
        <span class="avatar avatar--xl">KP</span>
        <div class="avatar-group">
          <span class="avatar">A</span>
          <span class="avatar">B</span>
          <span class="avatar">C</span>
          <span class="avatar avatar--count">+3</span>
        </div>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="rating" label="Rating">
      <div class="catalog-display-col">
        <span class="rating" role="img" aria-label="4 out of 5 stars">
          {#each stars as s (s)}
            {@render star(s <= 4)}
          {/each}
          <span class="rating__value">4.0</span>
        </span>
        <span class="rating rating--lg" role="img" aria-label="3 out of 5 stars">
          {#each stars as s (s)}
            {@render star(s <= 3)}
          {/each}
        </span>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="timeline" label="Timeline">
      <ol class="timeline catalog-display-col">
        <li class="timeline__item timeline__item--success">
          <span class="timeline__time">08:12</span>
          <span class="timeline__title">Morning run · 5.2 km</span>
          <span class="timeline__desc">Avg pace 5'40" · HR 148</span>
        </li>
        <li class="timeline__item">
          <span class="timeline__time">12:30</span>
          <span class="timeline__title">Medication taken</span>
        </li>
        <li class="timeline__item timeline__item--warn">
          <span class="timeline__time">15:04</span>
          <span class="timeline__title">Blood pressure elevated</span>
          <span class="timeline__desc">135/88 · re-check scheduled</span>
        </li>
        <li class="timeline__item timeline__item--muted">
          <span class="timeline__time">22:00</span>
          <span class="timeline__title">Sleep started</span>
        </li>
      </ol>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="breadcrumbs" label="Breadcrumbs">
      <nav aria-label="Breadcrumb">
        <ol class="breadcrumbs">
          <li><a href="?showcase=display">Notes</a></li>
          <li><a href="?showcase=display">Projects</a></li>
          <li><a href="?showcase=display">Life OS</a></li>
          <li><span aria-current="page">Design system</span></li>
        </ol>
      </nav>
    </CatalogStateBlock>
  </div>
</section>

{#snippet star(filled)}
  <svg
    class="rating__star {filled ? '' : 'rating__star--empty'}"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M12 2.5 14.9 8.6l6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.5l1.3-6.5-4.9-4.6 6.6-.8Z"
    />
  </svg>
{/snippet}

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
  .catalog-display-row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .catalog-display-col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 420px;
  }
</style>
