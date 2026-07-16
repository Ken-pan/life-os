<script>
  // 三页(平面/储藏/整理)共享顶栏:标题+副标题在左,操作簇在右 —— 统一高度/字号/间距,
  // 不再各页各写一份「同一套语言」的顶栏 CSS。
  // 注意:packages/theme/src/shell.css 里「页面自带 header,.wrap 顶部 padding
  // 归零」那条规则只认 .wrap 的**直接子元素**,这个组件通常嵌在页面自己的根
  // 容器里(不是 .wrap 的直接子元素),命中不了那条规则 —— 需要的页面(如
  // /tidy)要在自己的根容器上另加 plan-top class,不能指望这里加了就生效。
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
</script>

<header class={`home-topbar ${klass}`.trim()} aria-label={ariaLabel ?? title}>
  <div class="home-topbar-lead">
    <h1 class="home-topbar-title">{title}</h1>
    {#if subtitle}
      <p class="home-topbar-sub">{subtitle}</p>
    {/if}
  </div>
  {#if actions}
    <div class="home-topbar-actions">
      {@render actions()}
    </div>
  {/if}
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

  .home-topbar-title {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    letter-spacing: 0.01em;
    color: var(--t1);
    line-height: 1.2;
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
</style>
