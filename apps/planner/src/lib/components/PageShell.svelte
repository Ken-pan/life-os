<script>
  /**
   * PageShell —— 核心页统一外壳。页面只声明布局类型,不再手写 workspace/grid/gutter/居中,
   * 从根上杜绝"每页各拼一套导致 gutter 错位 / 断点错位 / 幽灵空列"这一类布局 bug。
   * 由 tests/layout-invariants.spec.js 的 INV-1..4 兜底。
   *
   * layout:
   *   'list'  —— 单栏(收件箱/即将/洞察/搜索等)。正文走 .wrap 的 --content-inline-pad。
   *   'split' —— 主 + 侧栏(今天/已完成/日历)。两栏只在真桌面(视口840)出现,
   *              侧栏经 aside snippet 传入;移动端塌单栏。断点/gutter 见 app.css。
   *
   * 有意的独立版式(/settings 返回栏+设置卡、/triage 居中卡片)不走此壳,见 layout-invariants 豁免。
   */
  import AppBar from './AppBar.svelte'

  /**
   * @type {{
   *   title?: string,
   *   subtitle?: string,
   *   backHref?: string,
   *   backLabel?: string,
   *   historyBack?: boolean,
   *   layout?: 'list' | 'split',
   *   split?: boolean,
   *   asideWide?: boolean,
   *   gridClass?: string,
   *   mainClass?: string,
   *   main: import('svelte').Snippet,
   *   aside?: import('svelte').Snippet,
   * }}
   */
  let {
    title,
    subtitle,
    backHref,
    backLabel,
    historyBack = false,
    layout = 'list',
    split = true,
    asideWide = false,
    gridClass = '',
    mainClass = '',
    main,
    aside,
  } = $props()
</script>

<div class="life-os-page-workspace">
  <AppBar {title} {subtitle} {backHref} {backLabel} {historyBack} />

  {#if layout === 'split'}
    <div
      class="life-os-grid desktop-split-layout {gridClass}"
      class:life-os-grid--split={split}
      class:life-os-grid--aside-wide={asideWide}
    >
      <div class="life-os-grid__main desktop-split-main {mainClass}">
        {@render main()}
      </div>
      {#if aside}{@render aside()}{/if}
    </div>
  {:else}
    <div class="wrap {mainClass}">
      {@render main()}
    </div>
  {/if}
</div>
