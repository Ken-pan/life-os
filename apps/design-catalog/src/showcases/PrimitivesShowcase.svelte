<script>
  import { EmptyState, ErrorState } from '@life-os/platform-web/svelte/status'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'
</script>

<section class="catalog-section" data-testid="showcase-primitives">
  <h2 class="catalog-section__title">Status primitives</h2>
  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Skeleton（加载骨架）">
      <div class="demo-card">
        <div class="demo-row">
          <span class="skeleton skeleton--circle" style="width:36px"></span>
          <div class="demo-col">
            <span class="skeleton skeleton--title"></span>
            <span class="skeleton skeleton--text" style="max-width:24ch"></span>
          </div>
        </div>
        <span class="skeleton skeleton--text"></span>
        <span class="skeleton skeleton--text" style="max-width:60%"></span>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:spinner" label="Spinner">
      <div class="demo-row">
        <span class="spinner" aria-label="加载中"></span>
        <span class="spinner spinner--lg" aria-label="加载中"></span>
        <button type="button" class="btn-primary" disabled>
          <span class="spinner"></span>
          保存中…
        </button>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:badge" label="Badge tones">
      <div class="demo-row demo-row--wrap">
        <span class="badge">默认</span>
        <span class="badge badge--accent">强调</span>
        <span class="badge badge--success">已同步</span>
        <span class="badge badge--warn">待处理 3</span>
        <span class="badge badge--danger">超期</span>
        <span class="badge badge--info">Beta</span>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="empty" label="Empty state（EmptyState 组件）">
      <EmptyState
        title="还没有任何记录"
        description="导入数据或创建第一条记录后，这里会展示你的内容。"
      >
        {#snippet media()}
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M3 11h18M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
        {/snippet}
        {#snippet actions()}
          <button type="button" class="btn-primary">新建记录</button>
          <button type="button" class="btn-secondary">导入</button>
        {/snippet}
      </EmptyState>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="error" label="Error state（ErrorState 组件）">
      <ErrorState
        title="同步失败"
        description="网络不可达，稍后可以重试；本地改动不会丢失。"
        retryLabel="重试"
        onRetry={() => {}}
      >
        {#snippet media()}
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </svg>
        {/snippet}
      </ErrorState>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:popover" label="Popover 面板基座（静态外观）">
      <div class="life-os-popover demo-popover-static" role="presentation">
        <button type="button" class="life-os-popover__item">重命名</button>
        <button type="button" class="life-os-popover__item" data-active>移动到…</button>
        <button type="button" class="life-os-popover__item" disabled>复制链接</button>
        <div class="life-os-popover__divider"></div>
        <button type="button" class="life-os-popover__item life-os-popover__item--danger">删除</button>
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
  .demo-card {
    display: grid;
    gap: 10px;
    max-width: 360px;
    padding: var(--card-padding, 16px);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--card-radius, 12px);
  }
  .demo-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .demo-row--wrap {
    flex-wrap: wrap;
  }
  .demo-col {
    display: grid;
    gap: 8px;
    flex: 1;
  }
  .demo-popover-static {
    position: static;
    max-width: 220px;
  }
</style>
