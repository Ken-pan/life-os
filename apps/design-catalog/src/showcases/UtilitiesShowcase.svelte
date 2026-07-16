<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'
</script>

<section class="catalog-section" data-testid="showcase-utilities">
  <h2 class="catalog-section__title">Banners & utilities</h2>
  <div class="catalog-panel catalog-grid catalog-doc-preview">
    <CatalogStateBlock stateId="info" label="Info">
      <div class="banner info" role="status">Info banner</div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="positive" label="Success">
      <div class="banner positive" role="status">Success banner</div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="warn" label="Warning">
      <div class="banner warn" role="alert">Warning banner</div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="critical" label="Critical">
      <div class="banner critical banner--row" role="alert">
        <span class="banner__text">Critical banner with action</span>
        <button type="button" class="btn-ghost banner-close">Dismiss</button>
      </div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="text" label="Divider / Kbd">
      <div style="max-width: 420px">
        <p style="margin: 0">上方内容</p>
        <div class="divider">或</div>
        <p style="margin: 0 0 16px">
          按 <span class="kbd">⌘</span><span class="kbd">K</span> 打开命令面板，
          <span class="kbd">Esc</span> 关闭
        </p>
        <hr class="divider" />
      </div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="portrait-gate" label="Portrait gate">
      <div class="utilities-portrait-preview" aria-hidden="true">
        <div class="life-os-portrait-gate utilities-portrait-preview__gate">
          <div class="life-os-portrait-gate-inner">
            <span class="life-os-portrait-gate-icon">↻</span>
            <p class="life-os-portrait-gate-title">请旋转至竖屏</p>
            <p class="life-os-portrait-gate-hint">Life OS 针对竖屏使用优化</p>
          </div>
        </div>
      </div>
    </CatalogStateBlock>
  </div>
  <div class="catalog-panel" style="margin-top: 16px;">
    <p
      class="life-os-pad-inline"
      style="background: var(--card); padding-block: 12px;"
    >
      .life-os-pad-inline
    </p>
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
  .utilities-portrait-preview {
    position: relative;
    min-height: 180px;
    border-radius: var(--radius-control, 8px);
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .utilities-portrait-preview__gate {
    display: flex !important;
    position: relative;
    inset: auto;
    min-height: 180px;
    z-index: 0;
    padding: 24px;
  }
</style>
