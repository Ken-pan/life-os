<script>
  /**
   * Life OS SideNav — 桌面侧栏骨架。
   * 外观由 theme shell.css 的 .sidebar / .nav-item 提供；品牌位经 brand snippet
   * 注入（通常是 AppBrandSwitcher）。active 判定 / IA 内容留 app 侧。
   */
  import Icon from '../icon/Icon.svelte'

  /**
   * @typedef {{ key?: string, href: string, icon: string, label: string, active?: boolean }} SideNavItem
   * @type {{
   *   groups: Array<{ label?: string, items: SideNavItem[] }>,
   *   footItem?: SideNavItem,
   *   hidden?: boolean,
   *   ariaLabel: string,
   *   sideClass?: string,
   *   labelDecor?: boolean,
   *   iconSize?: number,
   *   iconStrokeWidth?: number,
   *   brand?: import('svelte').Snippet
   * }}
   */
  let {
    groups = [],
    footItem,
    hidden = false,
    ariaLabel,
    sideClass = '',
    labelDecor = false,
    iconSize = 18,
    iconStrokeWidth = 1.75,
    brand,
  } = $props()
</script>

{#if !hidden}
  <aside class="sidebar {sideClass}" aria-label={ariaLabel}>
    {@render brand?.()}

    <div class="sidebar-body">
      {#each groups as group, groupIndex (group.label ?? groupIndex)}
        <div class="nav-group">
          {#if group.label}
            <p class="nav-group-label">{group.label}</p>
          {/if}
          {#each group.items as item (item.key ?? item.href)}
            <a
              class="nav-item"
              class:active={item.active}
              href={item.href}
              data-sveltekit-noscroll
              aria-current={item.active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={iconSize} strokeWidth={iconStrokeWidth} />
              <span class="nav-lbl" data-ui-decor={labelDecor ? 'nav-label' : undefined}
                >{item.label}</span
              >
            </a>
          {/each}
        </div>
      {/each}
    </div>

    {#if footItem}
      <a
        class="nav-item sidebar-foot-item"
        class:active={footItem.active}
        href={footItem.href}
        data-sveltekit-noscroll
        aria-current={footItem.active ? 'page' : undefined}
      >
        <Icon name={footItem.icon} size={iconSize} strokeWidth={iconStrokeWidth} />
        <span class="nav-lbl" data-ui-decor={labelDecor ? 'nav-label' : undefined}
          >{footItem.label}</span
        >
      </a>
    {/if}
  </aside>
{/if}
