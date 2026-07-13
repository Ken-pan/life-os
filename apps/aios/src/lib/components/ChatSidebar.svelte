<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { C, startNewChat, selectConversation, deleteConversation } from '$lib/chat.svelte.js'
  import { AG, openAgent, closeAgent } from '$lib/agents.svelte.js'

  const onChatRoute = $derived(page.url.pathname === '/')

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

  function openConversation(id) {
    closeAgent()
    selectConversation(id)
    if (!onChatRoute) goto('/')
  }

  function newChat() {
    closeAgent()
    startNewChat()
    if (!onChatRoute) goto('/')
  }

  function openAgentThread(key) {
    openAgent(key)
    if (!onChatRoute) goto('/')
  }
</script>

<aside class="sidebar chat-sidebar" aria-label={t('nav.mainAria')}>
  <div class="sidebar-head">
    <span class="brand-word">AI<span class="brand-dot">.</span>OS</span>
    <button
      type="button"
      class="icon-btn"
      title={t('chat.newChat')}
      aria-label={t('chat.newChat')}
      onclick={newChat}
    >
      <Icon name="compose" size={18} strokeWidth={1.75} />
    </button>
  </div>

  {#if AG.available.length}
    <div class="agent-section" role="list" aria-label="外部代理">
      <p class="agent-label">外部代理</p>
      {#each AG.available as a (a.key)}
        <button
          type="button"
          class="agent-entry"
          class:active={onChatRoute && AG.active === a.key}
          role="listitem"
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

  {#if C.conversations.length > 3}
    <div class="sidebar-search">
      <input
        type="search"
        placeholder={t('chat.searchChats')}
        bind:value={query}
        aria-label={t('chat.searchChats')}
      />
    </div>
  {/if}

  <div class="sidebar-body chat-list" role="list">
    {#if filtered.length === 0}
      <p class="chat-list-empty">{query ? t('chat.searchNoResults') : t('history.empty')}</p>
    {:else}
      {#each filtered as conversation (conversation.id)}
        <div
          class="chat-item"
          class:active={onChatRoute && !AG.active && C.activeId === conversation.id}
          role="listitem"
        >
          <button
            type="button"
            class="chat-item-main"
            onclick={() => openConversation(conversation.id)}
            title={conversation.title}
          >
            <span class="chat-item-title">{conversation.title || t('chat.newChat')}</span>
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

  .brand-word {
    font-family: var(--font-brand, var(--font));
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 0.04em;
    color: var(--sidebar-foreground);
  }
  .brand-dot {
    color: var(--sidebar-muted);
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
    border: none;
    background: transparent;
    text-align: start;
    padding: 8px 10px;
    cursor: pointer;
    color: var(--sidebar-foreground);
    border-radius: 8px;
  }

  .chat-item-title {
    display: block;
    font-size: var(--text-sm, 13px);
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
