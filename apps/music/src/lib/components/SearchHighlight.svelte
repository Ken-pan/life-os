<script>
  import { highlightParts } from '$lib/search.svelte.js'

  /** @type {{ text: string; query?: string; class?: string }} */
  let { text, query = '', class: className = '' } = $props()

  const parts = $derived(highlightParts(text, query))
</script>

<span class={className}>
  {#each parts as part, i (i)}
    {#if part.match}<mark class="search-highlight">{part.text}</mark
      >{:else}{part.text}{/if}
  {/each}
</span>

<style>
  :global(.search-highlight) {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: inherit;
    font-weight: 600;
    border-radius: 2px;
    padding-inline: 1px;
    box-decoration-break: clone;
  }
</style>
