<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'
</script>

<section class="catalog-section" data-testid="showcase-disclosure">
  <h2 class="catalog-section__title">Disclosure</h2>
  <p class="catalog-section__lead">
    <code>.accordion</code>（native <code>details</code> 组，零 JS）与
    <code>[data-life-os-tooltip]</code>（纯 CSS 悬停提示，仅 hover 指针环境；
    长解释仍用 ExplainPanel）。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="accordion" label="Accordion (.accordion)">
      <div class="accordion catalog-disclosure-col">
        <details open>
          <summary>数据存在哪里？</summary>
          <div class="accordion__body">
            本地优先：IndexedDB 存主数据，登录后经统一 Supabase 双向同步，
            冲突按最后写入赢（LWW）+ 墓碑解决。
          </div>
        </details>
        <details>
          <summary>如何导出备份？</summary>
          <div class="accordion__body">
            设置 → 备份，一键导出 JSON 快照；导入时校验 schema 版本。
          </div>
        </details>
        <details>
          <summary>离线可用吗？</summary>
          <div class="accordion__body">
            可以。Service Worker 缓存应用壳，数据操作全部本地完成，联网后补同步。
          </div>
        </details>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="tooltip" label="Tooltip (hover / focus)">
      <div class="catalog-disclosure-row">
        <button
          type="button"
          class="icon-btn"
          data-life-os-tooltip="重新同步"
          aria-label="重新同步"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
          </svg>
        </button>
        <button type="button" class="btn-secondary" data-life-os-tooltip="保存当前方案">
          Save
        </button>
        <span class="catalog-disclosure-hint">悬停或键盘聚焦上方控件查看提示</span>
      </div>
    </CatalogStateBlock>
  </div>
</section>

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
  .catalog-disclosure-col {
    max-width: 480px;
  }
  .catalog-disclosure-row {
    display: flex;
    align-items: center;
    gap: 16px;
    /* 给 tooltip 露出的头部空间 */
    padding-top: 40px;
  }
  .catalog-disclosure-hint {
    font-size: var(--text-sm);
    color: var(--t3, var(--text-muted));
  }
</style>
