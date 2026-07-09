<script>
  /** @type {{ title: string, desc?: string, testId?: string, children?: import('svelte').Snippet }} */
  let { title, desc, testId, children } = $props()
</script>

<div class="card settings-section" data-testid={testId}>
  <h3>{title}</h3>
  {#if desc}
    <p class="muted-note">{desc}</p>
  {/if}
  {@render children?.()}
</div>
