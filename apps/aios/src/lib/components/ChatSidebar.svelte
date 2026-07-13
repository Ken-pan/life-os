<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { C, startNewChat, selectConversation, deleteConversation } from '$lib/chat.svelte.js'

  const onChatRoute = $derived(page.url.pathname === '/')

  function openConversation(id) {
    selectConversation(id)
    if (!onChatRoute) goto('/')
  }

  function newChat() {
    startNewChat()
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

  <div class="sidebar-body chat-list" role="list">
    {#if C.conversations.length === 0}
      <p class="chat-list-empty">{t('history.empty')}</p>
    {:else}
      {#each C.conversations as conversation (conversation.id)}
        <div
          class="chat-item"
          class:active={onChatRoute && C.activeId === conversation.id}
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
