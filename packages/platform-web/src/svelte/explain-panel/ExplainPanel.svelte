<script>
  // 共享「内联展开说明」：长解释文字用点击展开的内联面板，替代塞满整段的浮层 tooltip
  // （移动端读整段更友好）。任何有解释性文案的 app 都可复用。样式在 @life-os/theme。
  /**
   * @type {{
   *   label: string,
   *   hideLabel?: string,
   *   open?: boolean,
   *   class?: string,
   *   children: import('svelte').Snippet,
   * }}
   */
  let { label, hideLabel, open = $bindable(false), class: klass = '', children } = $props()
</script>

<button
  type="button"
  class={`explain-toggle ${klass}`.trim()}
  aria-expanded={open}
  onclick={() => (open = !open)}
>
  {open ? (hideLabel ?? label) : label}
</button>
{#if open}
  <div class="explain-panel">{@render children()}</div>
{/if}
