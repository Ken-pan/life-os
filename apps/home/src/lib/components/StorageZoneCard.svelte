<script>
  /** @type {{ code: string, nameZh: string, locationZh: string, formZh: string, items: string[], inferred?: boolean, selected?: boolean, onSelect?: () => void, id?: string }} */
  let {
    code,
    nameZh,
    locationZh,
    formZh,
    items,
    inferred = false,
    selected = false,
    onSelect,
    id = undefined,
  } = $props()
</script>

{#snippet body()}
  <header>
    <span class="tag">{code}</span>
    <h3>{nameZh}</h3>
    {#if inferred}<span class="badge">推测</span>{/if}
  </header>
  <p class="meta"><b>位置</b> {locationZh} · <b>形式</b> {formZh}</p>
  <ul>
    {#each items as item}
      <li>{item}</li>
    {/each}
  </ul>
{/snippet}

{#if onSelect}
  <button
    type="button"
    class="storage-card"
    class:selected
    {id}
    onclick={() => onSelect()}
  >
    {@render body()}
  </button>
{:else}
  <article class="storage-card" class:selected {id}>
    {@render body()}
  </article>
{/if}

<style>
  .storage-card {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  button.storage-card {
    cursor: pointer;
  }

  .storage-card.selected {
    border-color: var(--storage-accent, #5c758c);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--storage-accent, #5c758c) 40%, transparent);
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .tag {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 12px;
    color: #f5f8fa;
    background: var(--storage-accent, #5c758c);
    padding: 3px 8px;
    border-radius: 6px;
  }

  h3 {
    font-size: 15px;
    margin: 0;
    font-weight: 650;
    color: var(--t1);
  }

  .badge {
    font-size: 10px;
    font-family: var(--mono);
    color: var(--t3);
    border: 1px solid var(--border);
    padding: 2px 6px;
    border-radius: 999px;
  }

  .meta {
    font-size: 12px;
    color: var(--t3);
    margin: 0 0 9px;
  }

  .meta b {
    color: var(--t2);
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding-left: 17px;
    font-size: 13px;
    color: var(--t2);
  }

  li {
    margin: 2px 0;
  }
</style>
