<script>
  import BrandMark from '@life-os/platform-web/svelte/brand/mark'
  import { PORTAL_APPS } from '$lib/apps.js'
  import {
    fetchPortalTodaySummary,
    formatShortDate,
    formatUsd,
    fitnessDayLabel,
  } from '$lib/todaySummary.js'

  /** @type {{ userId: string }} */
  let { userId } = $props()

  /** @type {import('$lib/todaySummary.js').PortalTodaySummaryPayload | null} */
  let summary = $state(null)
  /** @type {boolean} */
  let loading = $state(true)
  /** @type {string | null} */
  let error = $state(null)

  const appById = $derived(Object.fromEntries(PORTAL_APPS.map((app) => [app.id, app])))

  $effect(() => {
    if (!userId) {
      summary = null
      loading = false
      return
    }

    let cancelled = false
    loading = true
    error = null

    void (async () => {
      try {
        const payload = await fetchPortalTodaySummary()
        if (cancelled) return
        summary = payload?.ok ? payload : null
      } catch (err) {
        if (cancelled) return
        error = err instanceof Error ? err.message : '摘要加载失败'
        summary = null
      } finally {
        if (!cancelled) loading = false
      }
    })()

    return () => {
      cancelled = true
    }
  })

  /** @param {import('$lib/todaySummary.js').SummaryAppId} id */
  function appMeta(id) {
    return appById[id]
  }
</script>

{#if userId}
  <section class="portal-summary" aria-labelledby="portal-summary-title">
    <h2 id="portal-summary-title" class="portal-section-label">今日摘要</h2>

    {#if loading}
      <div class="portal-summary-grid" aria-busy="true" aria-live="polite">
        {#each ['planner', 'finance', 'fitness'] as id (id)}
          <div class="portal-summary-card portal-summary-card--loading">
            <span class="portal-summary-skeleton" aria-hidden="true"></span>
          </div>
        {/each}
      </div>
    {:else if error}
      <p class="portal-summary-error" role="status">{error}</p>
    {:else if summary}
      <div class="portal-summary-grid">
        {@render summaryCard(
          'planner',
          '今日待办',
          summary.planner?.todayOpen === 0
            ? '今天没有到期任务'
            : `${summary.planner?.todayOpen ?? 0} 项今日到期`,
          summary.planner?.overdue
            ? `${summary.planner.overdue} 项逾期`
            : 'Planner 任务清单',
        )}

        {@render summaryCard(
          'finance',
          '本月结余',
          formatUsd(summary.finance?.monthSurplus ?? 0, { signed: true }),
          `收入 ${formatUsd(summary.finance?.monthIncome ?? 0)} · 支出 ${formatUsd(summary.finance?.monthExpense ?? 0)}`,
        )}

        {@render summaryCard(
          'fitness',
          '最近训练',
          summary.fitness
            ? `${fitnessDayLabel(summary.fitness.dayId)} · ${formatShortDate(summary.fitness.sessionDate)}`
            : '本周尚未记录完练',
          summary.fitness ? '已同步到云端' : '打开 Fitness 开始训练',
        )}
      </div>
    {/if}
  </section>
{/if}

{#snippet summaryCard(id, title, value, detail)}
  {@const app = appMeta(id)}
  {#if app}
    <a
      href={app.url}
      class="settings-block portal-summary-card"
      style="--portal-app-accent: {app.accent}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${title}：${value}（打开 ${id}，新标签页）`}
    >
      <span class="portal-summary-mark" aria-hidden="true">
        <BrandMark size={32} lightSrc={app.iconLight} darkSrc={app.iconDark} />
      </span>
      <div class="portal-summary-copy">
        <p class="portal-summary-kicker">{title}</p>
        <p class="portal-summary-value">{value}</p>
        <p class="portal-summary-detail">{detail}</p>
      </div>
    </a>
  {/if}
{/snippet}
