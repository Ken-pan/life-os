<script>
  /** @type {{ title: string, desc?: string, testId?: string, children }} */
  let { title, desc = '', testId = '', children } = $props();
</script>

<div class="settings-block set-group" data-testid={testId || undefined}>
  <h3 class="block-title sg-title">{title}</h3>
  {#if desc}
    <p class="block-desc">{desc}</p>
  {/if}
  {@render children?.()}
</div>
