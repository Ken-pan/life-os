<script>
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t, localeTag } from '$lib/i18n/index.js'
  import {
    C,
    startNewChat,
    selectConversation,
    deleteConversation,
  } from '$lib/chat.svelte.js'
  import { buildAssistantHref } from '$lib/kenos/assistantShell.core.js'
  import { page } from '$app/state'

  function formatTime(ts) {
    const date = new Date(ts)
    const now = new Date()
    const sameDay = date.toDateString() === now.toDateString()
    if (sameDay) {
      return date.toLocaleTimeString(localeTag(), {
        hour: '2-digit',
        minute: '2-digit',
      })
    }
    return date.toLocaleDateString(localeTag(), {
      month: 'short',
      day: 'numeric',
    })
  }

  function preview(conversation) {
    const last = [...conversation.messages]
      .reverse()
      .find((m) => m.content && !m.error)
    return last?.content.slice(0, 80) ?? ''
  }

  function open(id) {
    selectConversation(id)
    void goto(
      buildAssistantHref({
        conversationId: id,
        currentSearch: page.url.search,
      }),
    )
  }

  function newChat() {
    startNewChat()
    void goto(
      buildAssistantHref({
        conversationId: null,
        currentSearch: page.url.search,
      }),
    )
  }
</script>

<div class="wrap">
  <button type="button" class="new-chat" onclick={newChat}>
    <Icon name="plus" size={17} strokeWidth={2} />
    {t('chat.newChat')}
  </button>

  {#if C.conversations.length === 0}
    <p class="empty">{t('history.empty')}</p>
  {:else}
    <div class="list" role="list">
      {#each C.conversations as conversation (conversation.id)}
        <div class="item" role="listitem">
          <button type="button" class="item-main" onclick={() => open(conversation.id)}>
            <span class="item-head">
              <span class="item-title">{conversation.title || t('chat.newChat')}</span>
              <span class="item-time">{formatTime(conversation.updatedAt)}</span>
            </span>
            <span class="item-preview">{preview(conversation)}</span>
          </button>
          <button
            type="button"
            class="item-del"
            title={t('history.delete')}
            aria-label={t('history.delete')}
            onclick={() => deleteConversation(conversation.id)}
          >
            <Icon name="trash" size={15} strokeWidth={1.75} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .new-chat {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-block: var(--space-4, 16px) var(--space-3, 12px);
    padding: 12px;
    border: 1px solid var(--border-l);
    border-radius: 14px;
    background: var(--bg);
    color: var(--t1);
    font-size: var(--text-base, 15px);
    font-weight: 550;
    cursor: pointer;
  }
  .new-chat:hover {
    background: var(--card);
  }

  .empty {
    color: var(--t3);
    text-align: center;
    padding-block: var(--space-8, 32px);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
    padding-bottom: var(--space-4, 16px);
  }

  .item {
    display: flex;
    align-items: stretch;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
  }
  .item:hover {
    border-color: var(--border-l);
  }

  .item-main {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 4px;
    border: none;
    background: transparent;
    text-align: start;
    padding: 12px 14px;
    cursor: pointer;
    color: var(--t1);
  }

  .item-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3, 12px);
  }
  .item-title {
    font-size: var(--text-base, 15px);
    font-weight: 550;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-time {
    flex: 0 0 auto;
    font-size: var(--text-xs, 11px);
    color: var(--t3);
  }
  .item-preview {
    font-size: var(--text-sm, 13px);
    color: var(--t3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-del {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 44px;
    border: none;
    background: transparent;
    color: var(--t4);
    cursor: pointer;
  }
  .item-del:hover {
    color: var(--t1);
  }
</style>
