<script>
  import { t } from '$lib/i18n.svelte.js'
  import {
    finalizeTransactionImport,
    loadReviewItems,
    updateReviewItemStatus,
  } from '$lib/repo.js'
  import { reviewFilters, matchReviewFilter, truncate } from './reviewUtils.js'
  import { isDemoMode } from '$lib/demoMode'
  import { buildDemoReviewItems } from '$lib/demoData'

  /** @typedef {import('./reviewUtils.js').ReviewFilterId} ReviewFilterId */

  /** @type {{ onOpenCountChange: (n: number) => void }} */
  let { onOpenCountChange } = $props()

  const filters = $derived(reviewFilters(t))

  /** @type {import('$lib/repo.js').ReviewItemRecord[]} */
  let rows = $state([])
  let loading = $state(false)
  /** @type {ReviewFilterId} */
  let filter = $state('all')
  let error = $state(/** @type {string | null} */ (null))

  async function load() {
    loading = true
    error = null
    try {
      const status = filter === 'resolved' ? 'resolved' : 'open'
      // 演示模式：云端无会话，直接注入模拟审查项（见 demoData.ts）。
      const data = isDemoMode()
        ? buildDemoReviewItems().filter((r) =>
            status === 'resolved' ? r.status !== 'open' : r.status === 'open',
          )
        : await loadReviewItems(status)
      rows = data
      onOpenCountChange(data.filter((r) => r.status === 'open').length)
    } catch (e) {
      error = e instanceof Error ? e.message : t('review.loadFailed')
    } finally {
      loading = false
    }
  }

  $effect(() => {
    filter
    void load()
  })

  const filtered = $derived(rows.filter((r) => matchReviewFilter(r, filter)))

  /** @param {import('$lib/repo.js').ReviewItemRecord} row @param {'resolved' | 'ignored'} status */
  async function applyStatus(row, status) {
    // 演示模式：不触云端，仅在本地把该行移出「待审查」。
    if (isDemoMode()) {
      rows = rows.filter((r) => r.id !== row.id)
      onOpenCountChange(rows.filter((r) => r.status === 'open').length)
      return
    }
    await updateReviewItemStatus(
      row.id,
      status,
      status === 'resolved' ? 'user-confirmed' : 'user-ignored',
    )
    await load()
  }
</script>

<div class="card">
  <div class="card-head">
    <h3>{t('review.queueTitle')}</h3>
    <button class="btn ghost" type="button" onclick={() => void load()}>
      {t('review.refresh')}
    </button>
  </div>
  {#if error}
    <div class="banner">{error}</div>
  {/if}
  <div class="seg wrap">
    {#each filters as f (f.id)}
      <button
        type="button"
        class={filter === f.id ? 'active' : ''}
        onclick={() => (filter = f.id)}
      >
        {f.label}
      </button>
    {/each}
  </div>
  {#if loading}
    <p class="muted-note">{t('review.loadingQueue')}</p>
  {:else}
    <div class="life-os-scroll-x mt-3">
      <table class="review-table">
        <thead>
          <tr>
            <th>{t('review.colDate')}</th>
            <th>{t('review.colReason')}</th>
            <th>{t('review.colSeverity')}</th>
            <th>{t('review.colSuggested')}</th>
            <th>{t('review.colStatus')}</th>
            <th>{t('review.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as r (r.id)}
            <tr>
              <td>{r.createdAt.slice(0, 10)}</td>
              <td>{truncate(r.reason, 64)}</td>
              <td>
                {r.severity === 'high'
                  ? t('review.severityHigh')
                  : r.severity === 'medium'
                    ? t('review.severityMedium')
                    : t('review.severityLow')}
              </td>
              <td>{truncate(r.suggestedAction, 54)}</td>
              <td>
                {r.status === 'open'
                  ? t('review.statusOpen')
                  : r.status === 'resolved'
                    ? t('review.statusResolved')
                    : t('review.statusIgnored')}
              </td>
              <td>
                <div class="flex-row-tight">
                  <button
                    class="btn ghost"
                    type="button"
                    onclick={() => void applyStatus(r, 'resolved')}
                  >
                    {t('review.confirm')}
                  </button>
                  <button
                    class="btn ghost"
                    type="button"
                    onclick={() => void applyStatus(r, 'ignored')}
                  >
                    {t('review.ignore')}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if filtered.length === 0}
        <p class="muted-note">{t('review.noItemsInFilter')}</p>
      {/if}
    </div>
  {/if}
  <p class="muted-note">{t('review.queueFootnote')}</p>
</div>
