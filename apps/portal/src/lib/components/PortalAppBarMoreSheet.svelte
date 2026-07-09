<script>
  import { tick } from 'svelte'
  import { LogOut, Monitor, Moon, Sun } from '@lucide/svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { activateFocusTrap } from '@life-os/theme'
  import { abbreviateEmail, getUserInitial } from '$lib/userDisplay.js'
  import { themePreferenceLabel } from '$lib/theme.svelte.js'

  /** @typedef {'light' | 'dark' | 'auto'} ThemePreference */

  /** @type {{
   *   open: boolean,
   *   userEmail?: string | null,
   *   themePreference: ThemePreference,
   *   onClose: () => void,
   *   onThemeCycle?: () => void,
   *   onSignOut?: () => void,
   * }} */
  let {
    open,
    userEmail = null,
    themePreference,
    onClose,
    onThemeCycle,
    onSignOut,
  } = $props()

  /** @type {HTMLDivElement | null} */
  let sheetEl = $state(null)

  const userInitial = $derived(getUserInitial(userEmail))
  const userShort = $derived(abbreviateEmail(userEmail))

  const ThemeIcon = $derived(
    themePreference === 'dark'
      ? Moon
      : themePreference === 'light'
        ? Sun
        : Monitor,
  )

  $effect(() => {
    if (!open) return
    /** @type {(() => void) | null} */
    let releaseFocus = null
    let cancelled = false

    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    tick().then(() => {
      if (cancelled || !sheetEl) return
      releaseFocus = activateFocusTrap(sheetEl)
    })

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
      releaseFocus?.()
    }
  })
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="mobile-more-backdrop" onclick={onClose} aria-hidden="true"></div>
  <div
    bind:this={sheetEl}
    class="mobile-more-sheet portal-appbar-more-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="portal-appbar-more-title"
  >
    <div class="mobile-more-handle" aria-hidden="true"></div>
    <div class="mobile-more-header">
      <h2 id="portal-appbar-more-title" class="mobile-more-title">更多</h2>
      <button
        type="button"
        class="mobile-more-close"
        onclick={onClose}
        aria-label="关闭"
      >
        <Icon name="x" size={20} strokeWidth={1.75} />
      </button>
    </div>
    <div class="mobile-more-body">
      {#if userEmail}
        <div class="mobile-more-section">
          <p class="mobile-more-section-label">账号</p>
          <div class="portal-more-user-row" title={userEmail}>
            <span class="portal-more-user-avatar" aria-hidden="true"
              >{userInitial}</span
            >
            <span class="portal-more-user-email">{userShort}</span>
          </div>
        </div>
      {/if}
      <div class="mobile-more-section">
        <p class="mobile-more-section-label">设置</p>
        {#if onThemeCycle}
          <button
            type="button"
            class="mobile-more-row portal-more-action"
            onclick={() => {
              onThemeCycle()
            }}
          >
            <span class="mobile-more-row-icon" aria-hidden="true">
              <ThemeIcon size={20} strokeWidth={1.75} />
            </span>
            <span class="mobile-more-row-label"
              >主题：{themePreferenceLabel(themePreference)}</span
            >
            <Icon
              name="chevron-right"
              size={18}
              strokeWidth={1.75}
              class="mobile-more-row-chevron"
            />
          </button>
        {/if}
        {#if onSignOut}
          <button
            type="button"
            class="mobile-more-row portal-more-action portal-more-action--danger"
            onclick={() => {
              onClose()
              onSignOut()
            }}
          >
            <span class="mobile-more-row-icon" aria-hidden="true">
              <LogOut size={20} strokeWidth={1.75} />
            </span>
            <span class="mobile-more-row-label">退出登录</span>
            <Icon
              name="chevron-right"
              size={18}
              strokeWidth={1.75}
              class="mobile-more-row-chevron"
            />
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
