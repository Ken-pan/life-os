<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  const orders = [
    { id: 'LO-1042', item: 'Whey protein 2kg', qty: 1, total: '¥289', status: 'Shipped' },
    { id: 'LO-1041', item: 'Resistance bands', qty: 2, total: '¥98', status: 'Delivered' },
    { id: 'LO-1039', item: 'Foam roller', qty: 1, total: '¥129', status: 'Delivered' },
  ]
</script>

<section class="catalog-section" data-testid="showcase-lists">
  <h2 class="catalog-section__title">Lists &amp; Table</h2>
  <p class="catalog-section__lead">
    通用列表行 <code>.list</code> / <code>.list-item</code>（leading / body /
    trailing，button/a 元素自动可点）与数据表 <code>.table</code>
    （<code>--striped/--hover/--sticky</code>，数字列 <code>.num</code>，横向溢出包
    <code>.table-wrap</code>）。为 noteos/shopos 类未来 app 预铺。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="list" label="List (.list)">
      <ul class="list catalog-lists-col">
        <li class="list-item">
          <span class="list-item__leading">{@render noteIcon()}</span>
          <span class="list-item__body">
            <span class="list-item__title">Weekly review</span>
            <span class="list-item__desc">Edited 2 hours ago · 843 words</span>
          </span>
          <span class="list-item__trailing">2h</span>
        </li>
        <li style="display: contents">
          <button type="button" class="list-item">
            <span class="list-item__leading">{@render noteIcon()}</span>
            <span class="list-item__body">
              <span class="list-item__title">Reading notes — Deep Work</span>
              <span class="list-item__desc">Interactive row (hover / focus)</span>
            </span>
            <span class="list-item__trailing">
              <span class="badge">draft</span>
            </span>
          </button>
        </li>
        <li class="list-item">
          <span class="list-item__leading">{@render noteIcon()}</span>
          <span class="list-item__body">
            <span class="list-item__title">A very long note title that should truncate gracefully instead of wrapping</span>
          </span>
          <span class="list-item__trailing">7/12</span>
        </li>
      </ul>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="pagination" label="Pagination">
      <nav aria-label="Pagination">
        <ul class="pagination">
          <li>
            <button type="button" class="pagination__btn" aria-label="Previous page" disabled>‹</button>
          </li>
          <li><button type="button" class="pagination__btn" aria-current="page">1</button></li>
          <li><button type="button" class="pagination__btn">2</button></li>
          <li><button type="button" class="pagination__btn">3</button></li>
          <li><span class="pagination__ellipsis">…</span></li>
          <li><button type="button" class="pagination__btn">12</button></li>
          <li>
            <button type="button" class="pagination__btn" aria-label="Next page">›</button>
          </li>
        </ul>
      </nav>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="table" label="Table (.table--striped --hover)">
      <div class="table-wrap catalog-lists-col">
        <table class="table table--striped table--hover">
          <thead>
            <tr>
              <th>Order</th>
              <th>Item</th>
              <th class="num">Qty</th>
              <th class="num">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each orders as o (o.id)}
              <tr>
                <td>{o.id}</td>
                <td>{o.item}</td>
                <td class="num">{o.qty}</td>
                <td class="num">{o.total}</td>
                <td><span class="badge badge--success">{o.status}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </CatalogStateBlock>
  </div>
</section>

{#snippet noteIcon()}
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
    <path d="M14 3v6h6" />
  </svg>
{/snippet}

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 8px;
    font-size: var(--text-2xl);
  }
  .catalog-section__lead {
    margin: 0 0 20px;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
  }
  .catalog-lists-col {
    max-width: 560px;
  }
</style>
