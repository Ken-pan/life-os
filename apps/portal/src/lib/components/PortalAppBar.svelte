<script>
  import { Monitor, Moon, Sun } from '@lucide/svelte'
  import AppBrand from '@life-os/platform-web/svelte/brand'
  import { getCommandPaletteShortcutLabel } from '$lib/keyboardShortcut.js'
  import { abbreviateEmail, getUserInitial } from '$lib/userDisplay.js'
  import {
    cycleThemePreference,
    portalTheme,
    themePreferenceLabel,
  } from '$lib/theme.svelte.js'

  /** @type {{
   *   userEmail?: string | null,
   *   pendingEvents?: number | null,
   *   onSignOut?: () => void,
   *   onOpenCommandPalette?: () => void,
   * }} */
  let {
    userEmail = null,
    pendingEvents = null,
    onSignOut,
    onOpenCommandPalette,
  } = $props()

  const pendingBadge = $derived(
    pendingEvents != null && pendingEvents > 0 ? pendingEvents : null,
  )

  const shortcutLabel = getCommandPaletteShortcutLabel()
  const userInitial = $derived(getUserInitial(userEmail))
  const userShort = $derived(abbreviateEmail(userEmail))

  const ThemeIcon = $derived(
    portalTheme.preference === 'dark'
      ? Moon
      : portalTheme.preference === 'light'
        ? Sun
        : Monitor,
  )

  function handleThemeCycle() {
    cycleThemePreference()
  }
</script>

<header class="appbar portal-appbar">
  <div class="appbar-inner">
    <div class="appbar-leading">
      <AppBrand appId="portal" variant="appbar" ariaLabel="PORTAL.OS" />
    </div>
    <div class="appbar-trailing">
      {#if pendingBadge != null}
        <a
          href="https://planner.kenos.space"
          class="portal-events-badge"
          title="待处理跨应用事件"
          aria-label="{pendingBadge} 条待处理事件，打开 Planner"
        >
          {pendingBadge > 99 ? '99+' : pendingBadge}
        </a>
      {/if}
      {#if onOpenCommandPalette}
        <button
          type="button"
          class="btn-secondary portal-cmd-btn"
          onclick={onOpenCommandPalette}
          aria-label="打开命令面板（{shortcutLabel}）"
        >
          <span class="portal-cmd-label">搜索</span>
          <kbd class="portal-cmd-kbd">{shortcutLabel}</kbd>
        </button>
      {/if}
      <button
        type="button"
        class="btn-secondary portal-theme-btn"
        onclick={handleThemeCycle}
        aria-label="切换主题，当前：{themePreferenceLabel(
          portalTheme.preference,
        )}"
        title="主题：{themePreferenceLabel(portalTheme.preference)}"
      >
        <ThemeIcon size={16} strokeWidth={2} aria-hidden="true" />
        <span class="portal-theme-label"
          >{themePreferenceLabel(portalTheme.preference)}</span
        >
      </button>
      {#if userEmail}
        <span class="portal-user-chip" title={userEmail}>
          <span class="portal-user-avatar" aria-hidden="true"
            >{userInitial}</span
          >
          <span class="portal-user-email">{userShort}</span>
        </span>
      {/if}
      {#if onSignOut}
        <button
          type="button"
          class="btn-secondary portal-signout-btn"
          onclick={onSignOut}
        >
          退出
        </button>
      {/if}
    </div>
  </div>
</header>
