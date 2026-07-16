<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  // 结构照 apps/fitness 的真实用法（SkipModal / WeightModal）：
  //   .modal-bg.show > .modal[role=dialog] > .modal-title / .modal-sub / .modal-actions
  // .modal-bg 是 position: fixed，靠 .catalog-doc-preview--modal 收容进预览框。
</script>

<section class="catalog-section" data-testid="showcase-modal">
  <h2 class="catalog-section__title">Modal</h2>
  <p class="catalog-section__lead">
    居中确认对话框，来自 <code>@life-os/theme</code> 的 <code>modal.css</code>：
    <code>.modal-bg</code> · <code>.modal</code> · <code>.modal-title</code> ·
    <code>.modal-sub</code> · <code>.modal-actions</code>。用于 Fitness 跳过/重量录入等确认流。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Default — 确认">
      <div class="catalog-doc-preview catalog-doc-preview--modal">
        <div class="modal-bg show" role="presentation">
          <div
            class="modal"
            role="dialog"
            aria-label="Skip exercise"
            aria-modal="true"
          >
            <div class="modal-title">Skip exercise?</div>
            <div class="modal-sub">It stays in your plan for next session.</div>
            <div class="modal-actions">
              <button type="button" class="btn-secondary">Cancel</button>
              <button type="button" class="btn-primary">Skip</button>
            </div>
          </div>
        </div>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="destructive" label="Destructive — 危险确认">
      <div class="catalog-doc-preview catalog-doc-preview--modal">
        <div class="modal-bg show" role="presentation">
          <div
            class="modal"
            role="dialog"
            aria-label="Delete workout"
            aria-modal="true"
          >
            <div class="modal-title">Delete workout?</div>
            <div class="modal-sub">This can't be undone.</div>
            <div class="modal-actions">
              <button type="button" class="btn-secondary">Cancel</button>
              <button type="button" class="btn-danger">Delete</button>
            </div>
          </div>
        </div>
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
    font-size: var(--text-md);
  }
</style>
