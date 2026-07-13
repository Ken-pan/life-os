<script>
  import { tick } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { C, startNewChat } from '$lib/chat.svelte.js'
  import Composer from '$lib/components/Composer.svelte'
  import Message from '$lib/components/Message.svelte'
  import ModelPicker from '$lib/components/ModelPicker.svelte'

  const conversation = $derived(
    C.conversations.find((c) => c.id === C.activeId) ?? null,
  )
  const isEmpty = $derived(!conversation || conversation.messages.length === 0)

  let scroller = $state(null)
  let nearBottom = true

  function onScroll() {
    if (!scroller) return
    nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140
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
    <button
      type="button"
      class="new-chat-btn"
      title={t('chat.newChat')}
      aria-label={t('chat.newChat')}
      onclick={startNewChat}
    >
      <Icon name="compose" size={19} strokeWidth={1.75} />
    </button>
  </div>

  {#if isEmpty}
    <div class="hero">
      <h1>{t('chat.greeting')}</h1>
      <Composer autofocus />
      <p class="hint">{t('chat.hintLocal')}</p>
    </div>
  {:else}
    <div class="thread" bind:this={scroller} onscroll={onScroll}>
      <div class="thread-col">
        {#each conversation.messages as message, i (i)}
          <Message {message} isLast={i === conversation.messages.length - 1} />
        {/each}
      </div>
    </div>
    <div class="dock">
      <div class="dock-col">
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
  .new-chat-btn {
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
  .new-chat-btn:hover {
    background: var(--card);
    color: var(--t1);
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
