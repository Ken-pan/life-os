<script>
  import { APPS, MODES, MATRIX_SHOWCASES } from './catalogNav.js'
  import { matrixEmbedUrl } from './catalogState.js'
  import { getShowcaseStates, getMatrixIframeHeight } from './showcaseStates.js'

  /** @type {{ showcase: string, onShowcase: (id: string) => void, onOpenDetail: (app: string, mode: string, state: string) => void }} */
  let { showcase, onShowcase, onOpenDetail } = $props()

  const matrixMeta = $derived(
    MATRIX_SHOWCASES.find((s) => s.id === showcase) ?? MATRIX_SHOWCASES[0],
  )

  const matrixStates = $derived(getShowcaseStates(showcase))
</script>

<section class="catalog-matrix" data-testid="catalog-matrix">
  <header class="catalog-matrix__head">
    <div>
      <h2 class="catalog-matrix__title">Matrix — {matrixMeta.label}</h2>
      <p class="catalog-matrix__lead">
        States × 4 apps × 2 modes. Click a cell to open detail view with that state.
      </p>
    </div>
    <label class="catalog-matrix__picker">
      Showcase
      <select value={showcase} onchange={(e) => onShowcase(e.currentTarget.value)}>
        {#each MATRIX_SHOWCASES as section}
          <option value={section.id}>{section.label}</option>
        {/each}
      </select>
    </label>
  </header>

  {#each matrixStates as stateDef, stateIndex (stateDef.id)}
    <details
      class="catalog-matrix__state"
      data-testid="matrix-state-{showcase}-{stateDef.id}"
      open={stateIndex === 0}
    >
      <summary class="catalog-matrix__state-title">{stateDef.label}</summary>
      <div class="catalog-matrix__grid" role="grid" aria-label="{stateDef.label} matrix">
        <div class="catalog-matrix__corner" aria-hidden="true"></div>
        {#each APPS as app}
          <div class="catalog-matrix__col-head" role="columnheader">{app}</div>
        {/each}

        {#each MODES as mode}
          <div class="catalog-matrix__row-head" role="rowheader">{mode}</div>
          {#each APPS as app}
            <button
              type="button"
              class="catalog-matrix__cell"
              data-testid="matrix-cell-{showcase}-{stateDef.id}-{app}-{mode}"
              aria-label="Open {matrixMeta.label} — {stateDef.label} — {app} {mode}"
              onclick={() => onOpenDetail(app, mode, stateDef.id)}
            >
              <iframe
                title="{matrixMeta.label} {stateDef.label} {app} {mode}"
                src={matrixEmbedUrl(showcase, app, mode, stateDef.id)}
                style:height="{getMatrixIframeHeight(showcase, stateDef.id)}px"
                loading="lazy"
                tabindex="-1"
              ></iframe>
              <span class="catalog-matrix__cell-label">{app} · {mode}</span>
            </button>
          {/each}
        {/each}
      </div>
    </details>
  {/each}
</section>

<style>
  .catalog-matrix {
    padding: var(--space-6);
    min-height: 100%;
    box-sizing: border-box;
  }

  .catalog-matrix__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .catalog-matrix__title {
    margin: 0 0 var(--space-1);
    font-size: 22px;
  }

  .catalog-matrix__lead {
    margin: 0;
    color: var(--t2, var(--text-secondary));
    font-size: 13px;
  }

  .catalog-matrix__picker {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
    color: var(--t2, var(--text-secondary));
  }

  .catalog-matrix__picker select {
    padding: 6px 10px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1, var(--text));
  }

  .catalog-matrix__state {
    margin-bottom: var(--space-8);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 8px);
    padding: var(--space-3);
    background: color-mix(in srgb, var(--card) 88%, var(--bg));
  }

  .catalog-matrix__state-title {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm, 13px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3, var(--text-muted));
    cursor: pointer;
    list-style: none;
  }

  .catalog-matrix__state-title::-webkit-details-marker {
    display: none;
  }

  details[open] > .catalog-matrix__state-title {
    margin-bottom: var(--space-3);
  }

  details:not([open]) > .catalog-matrix__state-title {
    margin-bottom: 0;
  }

  .catalog-matrix__grid {
    display: grid;
    grid-template-columns: 72px repeat(4, minmax(220px, 1fr));
    gap: var(--space-3);
    align-items: stretch;
  }

  .catalog-matrix__corner {
    min-height: 0;
  }

  .catalog-matrix__col-head,
  .catalog-matrix__row-head {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs, 11px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3, var(--text-muted));
  }

  .catalog-matrix__row-head {
    justify-content: flex-end;
    padding-right: var(--space-2);
  }

  .catalog-matrix__cell {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 8px);
    background: var(--card);
    cursor: pointer;
    text-align: left;
    transition:
      border-color var(--dur-fast, 150ms) ease,
      box-shadow var(--dur-fast, 150ms) ease;
  }

  .catalog-matrix__cell:hover {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    box-shadow: 0 8px 24px color-mix(in srgb, var(--t1, var(--text)) 8%, transparent);
  }

  .catalog-matrix__cell:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .catalog-matrix__cell iframe {
    width: 100%;
    min-height: 120px;
    border: 0;
    border-radius: var(--radius-sm, 6px);
    background: var(--bg);
    pointer-events: none;
  }

  .catalog-matrix__cell-label {
    font-size: var(--text-xs, 11px);
    color: var(--t3, var(--text-muted));
  }

  @media (max-width: 1100px) {
    .catalog-matrix__grid {
      grid-template-columns: 56px repeat(2, minmax(180px, 1fr));
    }
  }
</style>
