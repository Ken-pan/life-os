<script lang="ts">
  import BrandMark from '@life-os/platform-web/svelte/brand/mark'
  import { PORTAL_APPS } from '$lib/apps.js'
  import {
    fetchPortalTodaySummary,
    formatShortDate,
    formatUsd,
    fitnessDayLabel,
    formatPlayedAgo,
    musicTrackLabel,
    formatHomeStorageZones,
    formatReportedAgo,
  } from '$lib/todaySummary.js'

  type SummaryAppId = 'planner' | 'finance' | 'fitness' | 'music' | 'home'

  type PortalTodaySummaryPayload = {
    ok: boolean
    asOf?: string
    planner?: { todayOpen: number; overdue: number }
    finance?: { monthSurplus: number; monthIncome: number; monthExpense: number }
    fitness?: { sessionDate: string; dayId: string } | null
    music?: { trackTitle: string; trackArtist: string; playedAt: string } | null
    home?: { storageZoneCount: number; reportedAt: string } | null
  }

  let { userId }: { userId: string } = $props()

  let summary = $state<PortalTodaySummaryPayload | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)

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

  function appMeta(id: SummaryAppId) {
    return appById[id]
  }

  function summaryHref(id: SummaryAppId, url: string) {
    return id === 'home' ? `${url.replace(/\/$/, '')}/storage` : url
  }
</script>

{#if userId}
  <section class="portal-summary" aria-labelledby="portal-summary-title">
    <h2 id="portal-summary-title" class="portal-section-label">今日摘要</h2>

    {#if loading}
      <div class="portal-summary-grid" aria-busy="true" aria-live="polite">
        {#each ['planner', 'finance', 'fitness', 'music', 'home'] as id (id)}
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

        {@render summaryCard(
          'music',
          '最近播放',
          summary.music
            ? musicTrackLabel(summary.music.trackTitle, summary.music.trackArtist)
            : '尚未记录播放',
          summary.music
            ? formatPlayedAgo(summary.music.playedAt)
            : '打开 Music 开始听',
        )}

        {@render summaryCard(
          'home',
          '储藏审计',
          summary.home
            ? formatHomeStorageZones(summary.home.storageZoneCount)
            : '尚未同步储藏数据',
          summary.home
            ? `已上报 · ${formatReportedAgo(summary.home.reportedAt) || '最近'}`
            : '打开 Home 同步本地清单',
          true,
        )}
      </div>
    {/if}
  </section>
{/if}

{#snippet summaryCard(
  id: SummaryAppId,
  title: string,
  value: string,
  detail: string,
  experimental = false,
)}
  {@const app = appMeta(id)}
  {#if app}
    <a
      href={summaryHref(id, app.url)}
      class="settings-block portal-summary-card"
      class:portal-summary-card--experimental={experimental || app.experimental}
      style="--portal-app-accent: {app.accent}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${title}：${value}（打开 ${id}，新标签页）`}
    >
      <span class="portal-summary-mark" aria-hidden="true">
        <BrandMark size={40} lightSrc={app.iconLight} darkSrc={app.iconDark} />
      </span>
      <div class="portal-summary-copy">
        <p class="portal-summary-kicker">
          {title}
          {#if experimental || app.experimental}
            <span class="portal-summary-exp-badge">实验</span>
          {/if}
        </p>
        <p class="portal-summary-value">{value}</p>
        <p class="portal-summary-detail">{detail}</p>
      </div>
    </a>
  {/if}
{/snippet}
