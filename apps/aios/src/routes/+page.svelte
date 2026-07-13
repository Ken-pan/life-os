<script>
  import { tick } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import {
    C,
    startNewChat,
    sendMessage,
    conversationToMarkdown,
  } from '$lib/chat.svelte.js'
  import Composer from '$lib/components/Composer.svelte'
  import Message from '$lib/components/Message.svelte'
  import ModelPicker from '$lib/components/ModelPicker.svelte'

  const conversation = $derived(
    C.conversations.find((c) => c.id === C.activeId) ?? null,
  )
  const isEmpty = $derived(!conversation || conversation.messages.length === 0)

  const suggestions = $derived([
    { icon: 'search', text: t('chat.suggestSearch') },
    { icon: 'code', text: t('chat.suggestCode') },
    { icon: 'lightbulb', text: t('chat.suggestBrainstorm') },
    { icon: 'calculator', text: t('chat.suggestMath') },
  ])

  let scroller = $state(null)
  let nearBottom = $state(true)
  let exported = $state(false)

  function onScroll() {
    if (!scroller) return
    nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140
  }

  function scrollToBottom() {
    nearBottom = true
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }

  async function exportConversation() {
    if (!conversation) return
    try {
      await navigator.clipboard.writeText(conversationToMarkdown(conversation))
      exported = true
      setTimeout(() => (exported = false), 1500)
    } catch {
      /* ignore */
    }
  }

  // 流式输出时跟随滚动(用户上翻后停止跟随)
  $effect(() => {
    const last = conversation?.messages.at(-1)
    void last?.content
    void last?.reasoning
    void conversation?.messages.length
    if (!scroller || !nearBottom) return
    tick().then(() => {
      scroller?.scrollTo({ top: scroller.scrollHeight })
    })
  })

  // 切换会话时直接跳到底部
  $effect(() => {
    void C.activeId
    nearBottom = true
    tick().then(() => {
      scroller?.scrollTo({ top: scroller.scrollHeight })
    })
  })
</script>

<div class="chat">
  <div class="chat-top">
    <ModelPicker />
    <div class="chat-top-actions">
      {#if !isEmpty}
        <button
          type="button"
          class="top-btn"
          title={exported ? t('chat.exported') : t('chat.export')}
          aria-label={exported ? t('chat.exported') : t('chat.export')}
          onclick={exportConversation}
        >
          <Icon name={exported ? 'check' : 'download'} size={18} strokeWidth={1.75} />
        </button>
      {/if}
      <button
        type="button"
        class="top-btn"
        title={t('chat.newChat')}
        aria-label={t('chat.newChat')}
        onclick={startNewChat}
      >
        <Icon name="compose" size={19} strokeWidth={1.75} />
      </button>
    </div>
  </div>

  {#if isEmpty}
    <div class="hero">
      <h1>{t('chat.greeting')}</h1>
      <Composer autofocus />
      <div class="suggestions">
        {#each suggestions as item (item.text)}
          <button type="button" class="chip" onclick={() => sendMessage(item.text)}>
            <Icon name={item.icon} size={14} strokeWidth={1.75} />
            {item.text}
          </button>
        {/each}
      </div>
      <p class="hint">{t('chat.hintLocal')}</p>
    </div>
  {:else}
    <div class="thread" bind:this={scroller} onscroll={onScroll}>
      <div class="thread-col">
        {#each conversation.messages as message, i (i)}
          <Message {message} index={i} isLast={i === conversation.messages.length - 1} />
        {/each}
      </div>
    </div>
    <div class="dock">
      <div class="dock-col">
        {#if !nearBottom}
          <button
            type="button"
            class="to-bottom"
            title={t('chat.scrollToBottom')}
            aria-label={t('chat.scrollToBottom')}
            onclick={scrollToBottom}
          >
            <Icon name="arrow-down" size={16} strokeWidth={2} />
          </button>
        {/if}
        <Composer />
        <p class="hint">{t('chat.hintLocal')}</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .chat {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* —— 顶部工具行(替代 AppBar,ChatGPT 式)—— */
  .chat-top {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(var(--safe-top-effective, 0px) + 8px) 12px 8px;
  }
  .chat-top-actions {
    display: flex;
    gap: 2px;
  }
  .top-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }
  .top-btn:hover {
    background: var(--card);
    color: var(--t1);
  }

  /* —— 空态建议 —— */
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-l);
    border-radius: 999px;
    background: var(--bg);
    color: var(--t2);
    padding: 8px 14px;
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    transition: all var(--dur-fast, 120ms) var(--ease, ease);
  }
  .chip:hover {
    background: var(--card);
    color: var(--t1);
    border-color: var(--border-l);
  }

  /* —— 回到底部 —— */
  .to-bottom {
    position: absolute;
    top: -46px;
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border-l);
    border-radius: 50%;
    background: var(--bg);
    color: var(--t1);
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    z-index: 5;
  }
  .to-bottom:hover {
    background: var(--card);
  }

  /* —— 空态:居中问候 + 输入框 —— */
  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-5, 20px);
    width: min(100% - 32px, 704px);
    margin-inline: auto;
    padding-bottom: 12vh;
  }
  .hero h1 {
    margin: 0;
    font-size: clamp(22px, 3.2vw, 30px);
    font-weight: 600;
    color: var(--t1);
    text-align: center;
    letter-spacing: -0.01em;
  }
  .hero :global(.composer) {
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  }

  /* —— 消息流 —— */
  .thread {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  .thread-col {
    width: min(100% - 32px, 704px);
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6, 24px);
    padding-block: var(--space-5, 20px) var(--space-4, 16px);
  }

  /* —— 底部输入区 —— */
  .dock {
    flex: 0 0 auto;
    background: linear-gradient(to top, var(--bg) 70%, transparent);
  }
  .dock-col {
    position: relative;
    width: min(100% - 32px, 704px);
    margin-inline: auto;
    padding-bottom: max(var(--space-2, 8px), var(--safe-bottom, 0px));
  }

  .hint {
    margin: 8px 0 0;
    text-align: center;
    font-size: var(--text-xs, 11px);
    color: var(--t3);
  }
</style>
