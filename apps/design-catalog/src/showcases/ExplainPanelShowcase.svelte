<script>
  import ExplainPanel from '@life-os/platform-web/svelte/explain-panel'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  // 用法照 apps/finance 的真实调用（TodayView「今日可花」解释）：
  //   <ExplainPanel label={t('today.showExplain')} hideLabel={t('today.hideExplain')}>…
  // open 是 bindable；这里各状态用固定值，保证截图确定性。
  const EXPLAIN_TEXT =
    'Safe to spend = liquid cash − upcoming bills before payday − earmarked goal cash. Recurring income is not counted until it lands.'
</script>

<section class="catalog-section" data-testid="showcase-explain-panel">
  <h2 class="catalog-section__title">Explain panel</h2>
  <p class="catalog-section__lead">
    内联展开说明，来自
    <code>@life-os/platform-web/svelte/explain-panel</code>：长解释用点击展开的内联面板，
    替代塞满整段的浮层 tooltip（移动端读整段更友好）。样式
    <code>.explain-toggle</code> / <code>.explain-panel</code> 在
    <code>@life-os/theme</code>。
  </p>

  <div class="catalog-panel catalog-grid catalog-doc-preview">
    <CatalogStateBlock stateId="collapsed" label="Collapsed — 默认">
      <div class="explain-demo">
        <p class="explain-demo__value">$1,240</p>
        <ExplainPanel
          label="How is this calculated?"
          hideLabel="Hide explanation"
          open={false}
        >
          {EXPLAIN_TEXT}
        </ExplainPanel>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="expanded" label="Expanded — 展开">
      <div class="explain-demo">
        <p class="explain-demo__value">$1,240</p>
        <ExplainPanel
          label="How is this calculated?"
          hideLabel="Hide explanation"
          open={true}
        >
          {EXPLAIN_TEXT}
        </ExplainPanel>
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
  .explain-demo {
    width: 100%;
  }
  .explain-demo__value {
    margin: 0 0 var(--space-1, 4px);
    font-size: var(--text-3xl, 28px);
    font-weight: 600;
  }
</style>
