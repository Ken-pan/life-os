<script>
  import { Bell, Ellipsis, LogOut, Monitor, Moon, Sun } from '@lucide/svelte'
  import { lockScroll, unlockScroll } from '@life-os/theme'
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar'
  import AppBrand from '@life-os/platform-web/svelte/brand'
  import ReportBugButton from '@life-os/platform-web/svelte/feedback'
  import { supabase } from '$lib/supabase.js'
  import { auth } from '$lib/auth.svelte.js'
  import PortalAppBarMoreSheet from '$lib/components/PortalAppBarMoreSheet.svelte'
  import { getCommandPaletteShortcutLabel } from '$lib/keyboardShortcut.js'
  import { abbreviateEmail, getUserInitial } from '$lib/userDisplay.js'
  import { buildPlannerInboxUrl } from '$lib/commandPaletteActions.js'
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

  const plannerInboxUrl = buildPlannerInboxUrl()
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

  let moreOpen = $state(false)

  function handleThemeCycle() {
    cycleThemePreference()
  }

  $effect(() => {
    if (moreOpen) {
      lockScroll()
      return () => unlockScroll()
    }
  })
</script>

<LifeOsAppBar barClass="portal-appbar">
  {#snippet leading()}
    <AppBrand appId="portal" variant="appbar" ariaLabel="PORTAL.OS" />
  {/snippet}
  {#snippet trailing()}
      {#if pendingBadge != null}
        <a
          href={plannerInboxUrl}
          class="btn-secondary portal-inbox-btn"
          title="待处理跨应用事件 — 打开 Planner 收件箱"
          aria-label="{pendingBadge} 条待处理事件，打开 Planner 收件箱"
        >
          <Bell size={18} strokeWidth={2} aria-hidden="true" />
          <span class="portal-events-badge" aria-hidden="true">
            {pendingBadge > 99 ? '99+' : pendingBadge}
          </span>
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
      <span class="portal-appbar-overflow">
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
            aria-label="退出登录"
          >
            <LogOut size={18} strokeWidth={2} aria-hidden="true" />
            <span class="portal-signout-label">退出</span>
          </button>
        {/if}
      </span>
      <ReportBugButton app="portal" {supabase} user={auth.user} />
      <button
        type="button"
        class="btn-secondary portal-appbar-more-btn"
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        aria-controls="portal-appbar-more-title"
        aria-label="更多设置"
        onclick={() => {
          moreOpen = !moreOpen
        }}
      >
        <Ellipsis size={18} strokeWidth={2} aria-hidden="true" />
      </button>
  {/snippet}
</LifeOsAppBar>

<PortalAppBarMoreSheet
  open={moreOpen}
  {userEmail}
  themePreference={portalTheme.preference}
  onClose={() => {
    moreOpen = false
  }}
  onThemeCycle={handleThemeCycle}
  {onSignOut}
/>
