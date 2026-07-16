<script>
  /**
   * Life OS BottomNav — 移动端底栏骨架。
   * 外观由 theme shell.css 的 .nav / .nav-inner / .nav-item 提供；
   * 本组件只负责结构与 ARIA。active 判定 / IA 内容 / More sheet 全部留 app 侧
   * （More sheet 作为兄弟节点由 app 渲染，见 planner/music 用法）。
   */
  import Icon from '../icon/Icon.svelte'

  /**
   * @typedef {{ key?: string, href: string, icon: string, label: string, active?: boolean }} BottomNavItem
   * @type {{
   *   items: BottomNavItem[],
   *   hidden?: boolean,
   *   ariaLabel: string,
   *   navClass?: string,
   *   backgrounded?: boolean,
   *   labelDecor?: boolean,
   *   iconSize?: number,
   *   iconStrokeWidth?: number,
   *   more?: { label: string, active?: boolean, open?: boolean, icon?: string, onToggle: () => void }
   * }}
   */
  let {
    items = [],
    hidden = false,
    ariaLabel,
    navClass = '',
    backgrounded = false,
    labelDecor = false,
    iconSize = 21,
    iconStrokeWidth = 1.5,
    more,
  } = $props()
</script>

{#if !hidden}
  <nav
    class="nav {navClass}"
    class:is-backgrounded={backgrounded}
    aria-label={ariaLabel}
  >
    <div class="nav-inner">
      {#each items as item (item.key ?? item.href)}
        <a
          class="nav-item"
          class:on={item.active}
          href={item.href}
          data-sveltekit-noscroll
          aria-current={item.active ? 'page' : undefined}
          aria-label={item.label}
        >
          <Icon name={item.icon} size={iconSize} strokeWidth={iconStrokeWidth} />
          <span class="nav-lbl" data-ui-decor={labelDecor ? 'nav-label' : undefined}
            >{item.label}</span
          >
        </a>
      {/each}
      {#if more}
        <button
          type="button"
          class="nav-item nav-item-more"
          class:on={Boolean(more.open || more.active)}
          aria-expanded={more.open}
          aria-haspopup="dialog"
          aria-label={more.label}
          onclick={more.onToggle}
        >
          <Icon
            name={more.icon ?? 'ellipsis'}
            size={iconSize}
            strokeWidth={iconStrokeWidth}
          />
          <span class="nav-lbl" data-ui-decor={labelDecor ? 'nav-label' : undefined}
            >{more.label}</span
          >
        </button>
      {/if}
    </div>
  </nav>
{/if}
