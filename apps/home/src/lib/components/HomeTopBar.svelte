<script>
  // 三页(平面/储藏/整理)共享顶栏:标题+副标题在左,操作簇在右 —— 统一高度/字号/间距,
  // 不再各页各写一份「同一套语言」的顶栏 CSS。
  // 注意:packages/theme/src/shell.css 里「页面自带 header,.wrap 顶部 padding
  // 归零」那条规则只认 .wrap 的**直接子元素**,这个组件通常嵌在页面自己的根
  // 容器里(不是 .wrap 的直接子元素),命中不了那条规则 —— 需要的页面(如
  // /tidy)要在自己的根容器上另加 plan-top class,不能指望这里加了就生效。
  import { isIosNativeShell } from '@life-os/platform-web/ios-native-shell'

  /**
   * @type {{
   *   title: string,
   *   subtitle?: string,
   *   ariaLabel?: string,
   *   class?: string,
   *   actions?: import('svelte').Snippet,
   * }}
   */
  let { title, subtitle = '', ariaLabel, class: klass = '', actions } = $props()

  const nativeShell = $derived(isIosNativeShell())

  function openQuickSwitch() {
    try {
      window.location.href = 'kenos://quick-switch'
    } catch {
      /* ignore */
    }
  }
</script>

<header class={`home-topbar ${klass}`.trim()} aria-label={ariaLabel ?? title}>
  <div class="home-topbar-lead">
    {#if nativeShell}
      <button
        type="button"
        class="home-topbar-title-btn"
        onclick={openQuickSwitch}
        aria-label="Home: 快速切换"
      >
        <h1 class="home-topbar-title">{title}</h1>
        <span class="home-topbar-chevron" aria-hidden="true">⌄</span>
      </button>
    {:else}
      <h1 class="home-topbar-title">{title}</h1>
    {/if}
    {#if subtitle}
      <p class="home-topbar-sub">{subtitle}</p>
    {/if}
  </div>
  <div class="home-topbar-actions">
    {#if actions}
      {@render actions()}
    {/if}
    {#if nativeShell}
      <div class="home-qs-bubble" role="toolbar" aria-label="Domain actions">
        <button
          type="button"
          class="home-qs-btn"
          onclick={openQuickSwitch}
          aria-label="快速切换"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
      </div>
    {/if}
  </div>
</header>

<style>
  .home-topbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    min-height: 56px;
    padding: 8px max(14px, var(--safe-right-effective)) 8px
      max(14px, var(--safe-left-effective));
    padding-top: calc(var(--safe-top-effective) + 8px);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: var(--bg);
  }

  .home-topbar-lead {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .home-topbar-title-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    max-width: 100%;
    padding: 0;
    cursor: pointer;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .home-topbar-title-btn:active .home-topbar-title {
    opacity: 0.82;
  }

  .home-topbar-title {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 16px;
    font-weight: 650;
    letter-spacing: 0.01em;
    color: var(--t1);
    line-height: 1.2;
  }

  .home-topbar-chevron {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--t1) 48%, transparent);
    margin-top: 1px;
  }

  .home-topbar-sub {
    margin: 0;
    font-size: 12px;
    color: var(--t3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .home-topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .home-qs-bubble {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 1px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg, #fff) 70%, transparent);
    border: 1px solid color-mix(in srgb, var(--t1, #111) 10%, transparent);
    backdrop-filter: blur(24px) saturate(1.45);
    -webkit-backdrop-filter: blur(24px) saturate(1.45);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, var(--t1, #111) 6%, transparent),
      0 1px 0 color-mix(in srgb, #fff 75%, transparent) inset,
      0 2px 8px color-mix(in srgb, var(--t1, #111) 6%, transparent);
  }

  :global(html[data-theme='dark']) .home-qs-bubble {
    background: color-mix(in srgb, #fff 14%, transparent);
    border-color: color-mix(in srgb, #fff 18%, transparent);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, #000 28%, transparent),
      0 1px 0 color-mix(in srgb, #fff 10%, transparent) inset;
  }

  .home-qs-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--t1, #f5f5f7);
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .home-qs-btn:active {
    background: color-mix(in srgb, var(--t1) 12%, transparent);
    opacity: 0.92;
  }
</style>
