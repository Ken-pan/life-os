<script>
  // Port of LiveStatusBar from src/components/stocks/LiveStatusBar.tsx.
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'

  /** @typedef {'idle' | 'loading' | 'live' | 'partial' | 'stale' | 'error' | 'paused'} LiveTrackStatus */

  /** @type {{ status: LiveTrackStatus, updatedAt: string | null, pollIntervalSec: number, error: string | null }} */
  let { status, updatedAt, pollIntervalSec, error } = $props()

  const STATUS_DOT = {
    idle: 'dot',
    loading: 'dot warn',
    live: 'dot ok',
    partial: 'dot warn',
    stale: 'dot warn',
    error: 'dot critical',
    paused: 'dot',
  }

  const timeLabel = $derived(
    updatedAt
      ? new Date(updatedAt).toLocaleTimeString(intlLocaleTag(), {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '--',
  )
</script>

<div class="stocks-live-status">
  <span class={STATUS_DOT[status]} aria-hidden="true"></span>
  <span>
    {t('stocks.liveStatus.barTemplate', {
      status: t(`stocks.liveStatus.${status}`),
      time: timeLabel,
      interval: pollIntervalSec,
    })}
  </span>
  {#if error && status !== 'live'}
    <span class="stocks-live-status-note">{error}</span>
  {/if}
</div>
