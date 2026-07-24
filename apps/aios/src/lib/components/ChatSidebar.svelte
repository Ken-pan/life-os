<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { C, startNewChat, selectConversation, deleteConversation } from '$lib/chat.svelte.js'
  import { AG, openAgent, closeAgent } from '$lib/agents.svelte.js'
  import { S } from '$lib/state.svelte.js'
  import {
    isLeoConversation,
    isLeoPersona,
  } from '$lib/kenos/leoPersona.core.js'
  import { leoAvatarSrc } from '$lib/kenos/leoAvatar.core.js'
  import { isSystemNavActive, systemNavItems, SYSTEM_NAV_HREFS } from '$lib/kenos/systemNav.js'
  import { TODAY_SPACE_SHORTCUTS, spaceListKey } from '$lib/kenos/spacesList.core.js'
  import { clearAssistantContext } from '$lib/kenos/assistantContext.svelte.js'
  import { SPACE_SWITCHER, launchSpace } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { buildAssistantHref } from '$lib/kenos/assistantShell.core.js'
  import {
    beginAssistantUrlApply,
    endAssistantUrlApply,
  } from '$lib/kenos/assistantUrlSync.svelte.js'

  /** @type {{ onCapture?: () => void, onSpaceSwitcher?: (e?: Event) => void, onSwitchSpace?: (e?: Event) => void }} */
  let {
    onCapture = undefined,
    onSpaceSwitcher = undefined,
    onSwitchSpace = undefined,
  } = $props()

  const onChatRoute = $derived(page.url.pathname === '/assistant')
  const leoOn = $derived(isLeoPersona(S.settings))
  const leoListAvatar = $derived(leoAvatarSrc({ expression: 'smile' }))
  const primaryItems = $derived(systemNavItems(t))
  const recentSpaces = $derived.by(() => {
    const fromStore = SPACE_SWITCHER.recentItems
    if (fromStore.length) return fromStore
    return TODAY_SPACE_SHORTCUTS.slice(0, 3).map((space) => ({
      ...space,
      listKey: spaceListKey('hosted', space.id),
      external: false,
      namespace: 'hosted',
    }))
  })

  /**
   * @param {import('$lib/kenos/spaceSwitcher.core.js').SpaceEntry} space
   * @param {MouseEvent} event
   */
  function onRecentSpace(space, event) {
    event.preventDefault()
    launchSpace(space, { goto })
  }

  let query = $state('')
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase()
    if (!q) return C.conversations
    return C.conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content?.toLowerCase().includes(q)),
    )
  })

  async function openConversation(id) {
    closeAgent()
    beginAssistantUrlApply()
    selectConversation(id)
    try {
      await goto(
        buildAssistantHref({
          conversationId: id,
          currentSearch: page.url.search,
        }),
        { keepFocus: true, noScroll: true },
      )
    } finally {
      endAssistantUrlApply()
    }
  }

  function newChat() {
    closeAgent()
    startNewChat({ seedLeo: true })
    void goto(
      buildAssistantHref({
        conversationId: C.activeId,
        currentSearch: page.url.search,
      }),
      { keepFocus: true, noScroll: true },
    )
  }

  function openAgentThread(key) {
    openAgent(key)
    if (!onChatRoute) goto('/assistant')
  }

  /** Global Assistant nav entry — leave soft Work context. */
  function onSystemNavClick(href) {
    if (href === SYSTEM_NAV_HREFS.assistant) clearAssistantContext()
  }
</script>

<aside class="sidebar chat-sidebar" aria-label={t('nav.mainAria')}>
  <div class="sidebar-head">
    <span class="brand-lockup">
      <span class="brand-mark" aria-hidden="true">
        <img src="/brand-square-light-96.png" class="mark-light" width="24" height="24" alt="" />
        <img src="/brand-square-dark-96.png" class="mark-dark" width="24" height="24" alt="" />
      </span>
      <span class="brand-word">Korben</span>
    </span>
    <div class="sidebar-head-actions">
      <button
        type="button"
        class="icon-btn"
        title="Continue"
        aria-label="Continue to a recent Space"
        data-testid="kenos-space-switcher-sidebar"
        onclick={(e) => onSpaceSwitcher?.(e)}
      >
        <Icon name="history" size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="icon-btn"
        title="{t('nav.capture')} (⌘K)"
        aria-label={t('nav.capture')}
        onclick={() => onCapture?.()}
      >
        <Icon name="plus" size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="icon-btn new-chat-btn"
        title={leoOn ? t('chat.newLeoChat') : t('chat.newChat')}
        aria-label={leoOn ? t('chat.newLeoChat') : t('chat.newChat')}
        onclick={newChat}
      >
        <Icon name="compose" size={18} strokeWidth={1.75} />
        {#if leoOn}
          <img
            class="new-chat-leo-dot"
            src={leoListAvatar}
            alt=""
            width="10"
            height="10"
            aria-hidden="true"
            decoding="async"
          />
        {/if}
      </button>
    </div>
  </div>

  <nav class="workspace-nav" aria-label="Korben System">
    {#each primaryItems as item (item.href)}
      <a
        class="workspace-nav-item"
        class:active={isSystemNavActive(page.url.pathname, item.href)}
        href={item.href}
        aria-current={isSystemNavActive(page.url.pathname, item.href) ? 'page' : undefined}
        onclick={() => onSystemNavClick(item.href)}
      >
        <Icon name={item.icon} size={17} strokeWidth={1.75} />
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>

  {#if !onChatRoute}
    <div class="recent-spaces" aria-label="Recent spaces">
      <div class="recent-head">
        <p class="recent-label">Recent</p>
        <button
          type="button"
          class="recent-all"
          data-testid="kenos-switch-space-trigger"
          aria-label="Switch Space"
          onclick={(e) => (onSwitchSpace ?? onSpaceSwitcher)?.(e)}
        >
          All
        </button>
      </div>
      {#each recentSpaces as space (space.listKey || space.id)}
        <a
          class="recent-link"
          href={space.href}
          onclick={(e) => onRecentSpace(space, e)}
          >{space.label}</a
        >
      {/each}
    </div>
  {/if}

  {#if onChatRoute && AG.available.length}
    <div class="agent-section" role="list" aria-label="外部代理">
      <p class="agent-label">外部代理</p>
      {#each AG.available as a (a.key)}
        <button
          type="button"
          class="agent-entry"
          class:active={onChatRoute && AG.active === a.key}
          title={a.label}
          onclick={() => openAgentThread(a.key)}
        >
          <Icon name={a.icon} size={15} strokeWidth={1.75} />
          <span class="agent-entry-name">{a.short}</span>
          {#if AG.threads[a.key]?.messages.length}
            <span class="agent-entry-count">{AG.threads[a.key].messages.length}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if onChatRoute && C.conversations.length > 3}
    <div class="sidebar-search">
      <input
        type="search"
        placeholder={t('chat.searchChats')}
        bind:value={query}
        aria-label={t('chat.searchChats')}
      />
    </div>
  {/if}

  {#if onChatRoute}
    <div class="sidebar-body chat-list" role="list">
      {#if filtered.length === 0}
        <p class="chat-list-empty">{query ? t('chat.searchNoResults') : t('history.empty')}</p>
      {:else}
        {#each filtered as conversation (conversation.id)}
          {@const isActiveChat = !AG.active && C.activeId === conversation.id}
          {@const conversationIsLeo = isLeoConversation(conversation)}
          <div class="chat-item" class:active={isActiveChat} role="listitem">
            <button
              type="button"
              class="chat-item-main"
              onclick={() => openConversation(conversation.id)}
              title={conversation.title}
            >
              {#if conversationIsLeo}
                <img
                  class="chat-item-leo"
                  src={leoListAvatar}
                  alt=""
                  width="18"
                  height="18"
                  decoding="async"
                  loading="lazy"
                />
              {/if}
              <span class="chat-item-title">{conversation.title || t('chat.newChat')}</span>
              {#if isActiveChat && conversationIsLeo}
                <span class="chat-item-leo-badge">{t('chat.leoBadge')}</span>
              {/if}
            </button>
            <button
              type="button"
              class="chat-item-del"
              title={t('history.delete')}
              aria-label={t('history.delete')}
              onclick={() => deleteConversation(conversation.id)}
            >
              <Icon name="trash" size={14} strokeWidth={1.75} />
            </button>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="sidebar-body sidebar-context">
      <p>Assistant 协调动作；数据仍由各 Space 拥有。</p>
    </div>
  {/if}

  <a
    class="nav-item sidebar-foot-item"
    class:active={page.url.pathname.startsWith('/history')}
    href="/history"
    data-sveltekit-noscroll
    aria-current={page.url.pathname.startsWith('/history') ? 'page' : undefined}
  >
    <Icon name="history" size={18} strokeWidth={1.75} />
    <span class="nav-lbl">{t('nav.history')}</span>
  </a>

  <a
    class="nav-item sidebar-foot-item"
    class:active={page.url.pathname.startsWith('/settings')}
    href="/settings"
    data-sveltekit-noscroll
    aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}
  >
    <Icon name="settings" size={18} strokeWidth={1.75} />
    <span class="nav-lbl">{t('nav.settings')}</span>
  </a>
</aside>

<style>
  .chat-sidebar {
    display: flex;
    flex-direction: column;
  }

  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3, 12px) var(--space-3, 12px) var(--space-2, 8px);
  }

  .sidebar-head-actions {
    display: inline-flex;
    gap: 2px;
  }

  .brand-lockup {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .brand-mark {
    position: relative;
    display: block;
    flex: none;
    width: 24px;
    height: 24px;
  }
  .brand-mark img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    object-fit: cover;
  }
  .brand-mark .mark-dark {
    display: none;
  }
  :global([data-theme='dark']) .brand-mark .mark-light {
    display: none;
  }
  :global([data-theme='dark']) .brand-mark .mark-dark {
    display: block;
  }
  .brand-word {
    font-family: var(--font-brand, var(--font));
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.02em;
    color: var(--sidebar-foreground);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--sidebar-foreground);
    cursor: pointer;
  }
  .icon-btn:hover {
    background: var(--sidebar-accent);
  }

  .new-chat-btn {
    position: relative;
  }
  .new-chat-leo-dot {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    object-fit: cover;
    object-position: center 18%;
    border: 1.5px solid var(--sidebar);
    background: var(--sidebar-accent);
  }

  .workspace-nav {
    display: grid;
    gap: 2px;
    padding: 4px 8px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--sidebar-foreground) 10%, transparent);
  }
  .workspace-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--sidebar-muted);
    font-size: 14px;
    font-weight: 550;
    text-decoration: none;
  }
  .workspace-nav-item:hover,
  .workspace-nav-item.active {
    background: var(--sidebar-accent);
    color: var(--sidebar-foreground);
  }
  .workspace-nav-item.active {
    font-weight: 580;
  }

  .recent-spaces {
    display: grid;
    gap: 2px;
    padding: 8px 8px 4px;
  }
  .recent-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-inline: 2px;
  }
  .recent-label {
    margin: 0;
    padding: 2px 10px 4px;
    font-size: var(--text-xs);
    letter-spacing: 0.05em;
    color: var(--sidebar-muted);
    text-transform: uppercase;
  }
  .recent-all {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--sidebar-muted);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    padding: 4px 8px;
    cursor: pointer;
  }
  .recent-link {
    padding: 6px 10px;
    border-radius: 8px;
    color: var(--sidebar-muted);
    font-size: var(--text-sm);
    text-decoration: none;
  }
  .recent-link:hover {
    background: var(--sidebar-accent);
    color: var(--sidebar-foreground);
  }

  .sidebar-context {
    padding: 16px 18px;
  }
  .sidebar-context p {
    margin: 0;
    color: var(--sidebar-muted);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .agent-section {
    padding: 0 var(--space-2, 8px) var(--space-1, 4px);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .agent-label {
    margin: 0;
    padding: 2px 10px 4px;
    font-size: 11px;
    letter-spacing: 0.05em;
    color: var(--sidebar-muted);
  }

  .agent-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--sidebar-foreground);
    font: inherit;
    font-size: var(--text-sm, 13px);
    text-align: start;
    cursor: pointer;
  }

  .agent-entry:hover,
  .agent-entry.active {
    background: var(--sidebar-accent);
  }

  .agent-entry-name {
    flex: 1;
    min-width: 0;
  }

  .agent-entry-count {
    font-size: 10px;
    color: var(--sidebar-muted);
  }

  .sidebar-search {
    padding: 0 var(--space-2, 8px) var(--space-1, 4px);
  }
  .sidebar-search input {
    width: 100%;
    border: 1px solid var(--sidebar-border);
    border-radius: 8px;
    background: transparent;
    color: var(--sidebar-foreground);
    font: inherit;
    font-size: var(--text-sm, 13px);
    padding: 6px 10px;
    outline: none;
  }
  .sidebar-search input::placeholder {
    color: var(--sidebar-muted);
  }
  .sidebar-search input:focus {
    border-color: var(--sidebar-muted);
  }

  .chat-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-1, 4px) var(--space-2, 8px);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chat-list-empty {
    padding: var(--space-3, 12px) var(--space-2, 8px);
    font-size: var(--text-sm, 13px);
    color: var(--sidebar-muted);
  }

  .chat-item {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 8px;
  }
  .chat-item:hover,
  .chat-item.active {
    background: var(--sidebar-accent);
  }

  .chat-item-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    text-align: start;
    padding: 8px 10px;
    cursor: pointer;
    color: var(--sidebar-foreground);
    border-radius: 8px;
  }

  .chat-item-leo {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    object-fit: cover;
    object-position: center 18%;
    border: 1px solid color-mix(in srgb, var(--sidebar-foreground) 18%, transparent);
    background: var(--sidebar-accent);
  }

  .chat-item-title {
    display: block;
    min-width: 0;
    flex: 1;
    font-size: var(--text-sm, 13px);
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-item-leo-badge {
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.02em;
    color: var(--sidebar-foreground);
    background: color-mix(in srgb, var(--sidebar-foreground) 14%, transparent);
  }

  .chat-item-del {
    display: none;
    place-items: center;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    margin-inline-end: 4px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--sidebar-muted);
    cursor: pointer;
  }
  .chat-item:hover .chat-item-del,
  .chat-item.active .chat-item-del {
    display: grid;
  }
  .chat-item-del:hover {
    color: var(--sidebar-foreground);
  }
</style>
