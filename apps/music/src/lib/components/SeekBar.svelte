<script>
  import {
    player,
    seek,
    formatTime,
    getProgressPct,
    getSeekMax,
    isSeekable,
    formatSeekAriaText,
  } from '$lib/player.svelte.js'
  import { t } from '$lib/i18n/index.js'

  /**
   * @type {{
   *   variant?: 'mini-top' | 'mini-inline' | 'quiet' | 'mobile' | 'hero',
   *   quiet?: boolean,
   *   showTimes?: boolean,
   * }}
   */
  let {
    variant = 'quiet',
    quiet = false,
    showTimes = false,
  } = $props()

  const seekable = $derived(isSeekable())
  const max = $derived(getSeekMax())
  const ariaText = $derived(formatSeekAriaText(player.currentTime, player.duration))

  const rangeMax = $derived(seekable ? max : 0)
  const rangeValue = $derived(seekable ? player.currentTime : 0)

  const wrapperClass = $derived.by(() => {
    switch (variant) {
      case 'mini-top':
        return 'mini-player-top-progress'
      case 'mini-inline':
        return 'mini-player-progress mini-player-progress--inline'
      case 'mobile':
        return 'np-mobile-progress'
      case 'hero':
        return 'np-desktop-hero-seek'
      default:
        return quiet ? 'player-progress player-progress--quiet' : 'player-progress'
    }
  })

  const timesClass = $derived(
    variant === 'mobile' ? 'np-mobile-progress-times' : 'player-progress-times',
  )

  /** @param {Event} e */
  function onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.currentTarget)
    seek(Number(el.value))
  }
</script>

{#if variant === 'mini-top'}
  <div class="{wrapperClass} mini-player-top-progress--mobile-only">
    <input
      type="range"
      class="seek-bar-input"
      min="0"
      max={rangeMax || 1}
      step="0.1"
      value={rangeValue}
      disabled={!seekable}
      style={`--progress-pct: ${getProgressPct()}`}
      aria-label={t('player.seek')}
      aria-valuetext={ariaText}
      aria-valuemin={0}
      aria-valuemax={player.duration || 0}
      aria-valuenow={player.currentTime}
      oninput={onInput}
    />
  </div>
{:else}
  <div class="{wrapperClass} seek-bar" class:seek-bar--disabled={!seekable}>
    {#if showTimes && variant === 'mini-inline'}
      <span class="mini-player-time">{formatTime(player.currentTime)}</span>
    {/if}
    <input
      type="range"
      class="seek-bar-input"
      min="0"
      max={rangeMax || 1}
      step="0.1"
      value={rangeValue}
      disabled={!seekable}
      style={`--progress-pct: ${getProgressPct()}`}
      aria-label={t('player.seek')}
      aria-valuetext={ariaText}
      aria-valuemin={0}
      aria-valuemax={player.duration || 0}
      aria-valuenow={player.currentTime}
      oninput={onInput}
    />
    {#if showTimes && variant === 'mini-inline'}
      <span class="mini-player-time">{formatTime(player.duration)}</span>
    {/if}
    {#if showTimes && variant !== 'mini-inline'}
      <div class={timesClass}>
        <span>{formatTime(player.currentTime)}</span>
        <span>{formatTime(player.duration)}</span>
      </div>
    {/if}
  </div>
{/if}
