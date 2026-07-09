<script>
  import { onMount, untrack } from 'svelte'
  import { lifeOsMobileMq } from '@life-os/theme'
  import Icon from '../icon/Icon.svelte'

  const MOBILE_MQ = lifeOsMobileMq()

  /** @type {{
    title: string,
    desc?: string,
    testId?: string,
    collapsible?: boolean,
    defaultExpanded?: boolean,
    collapseOnMobile?: boolean,
    children
  }} */
  let {
    title,
    desc = '',
    testId = '',
    collapsible = false,
    defaultExpanded = true,
    collapseOnMobile = false,
    children,
  } = $props()

  let expanded = $state(untrack(() => defaultExpanded))

  onMount(() => {
    if (collapseOnMobile && window.matchMedia(MOBILE_MQ).matches) {
      expanded = false
    }
  })
</script>

<div
  class="settings-block set-group"
  class:settings-block--collapsed={collapsible && !expanded}
  data-testid={testId || undefined}
>
  {#if collapsible}
    <button
      type="button"
      class="settings-block-toggle"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <span class="settings-block-toggle-copy">
        <span class="block-title sg-title">{title}</span>
        {#if desc && !expanded}
          <span class="settings-block-toggle-hint">{desc}</span>
        {/if}
      </span>
      <Icon
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={18}
        strokeWidth={2}
      />
    </button>
  {:else}
    <h3 class="block-title sg-title">{title}</h3>
  {/if}
  {#if desc && (!collapsible || expanded)}
    <p class="block-desc">{desc}</p>
  {/if}
  {#if !collapsible || expanded}
    {@render children?.()}
  {/if}
</div>
