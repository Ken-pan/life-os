<script>
  import Menu from '@life-os/platform-web/svelte/menu'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  let lastAction = $state('')

  const ITEMS = [
    { id: 'rename', label: '重命名' },
    { id: 'move', label: '移动到…' },
    { id: 'copy', label: '复制链接', disabled: true },
    { id: 'delete', label: '删除', danger: true },
  ]
</script>

<section class="catalog-section" data-testid="showcase-menu">
  <h2 class="catalog-section__title">Menu (platform-web)</h2>
  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Default trigger">
      <div class="demo-row">
        <Menu
          label="更多操作"
          items={ITEMS}
          onselect={(id) => (lastAction = id)}
        />
        {#if lastAction}
          <span class="badge badge--accent">onselect: {lastAction}</span>
        {/if}
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:align" label="Align end + custom trigger">
      <div class="demo-row demo-row--end">
        <Menu items={ITEMS} align="end" ariaLabel="更多操作" onselect={(id) => (lastAction = id)}>
          {#snippet trigger({ open, toggle })}
            <button
              type="button"
              class="btn-ghost"
              aria-haspopup="menu"
              aria-expanded={open}
              onclick={toggle}
            >
              ⋯
            </button>
          {/snippet}
        </Menu>
      </div>
    </CatalogStateBlock>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 20px;
    font-size: var(--text-2xl);
  }
  .demo-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 220px;
    align-items: flex-start;
  }
  .demo-row--end {
    justify-content: flex-end;
  }
</style>
