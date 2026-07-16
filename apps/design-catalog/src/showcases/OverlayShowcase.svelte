<script>
  import { LifeOsSheet, LifeOsDialog } from '@life-os/platform-web/svelte/overlay'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  // 行为组件预览：manageFocus / lockBackgroundScroll 关掉，避免 catalog 页面
  // 被 focus trap / scroll lock 劫持；固定定位由 .catalog-doc-preview--* 收容。
  let interactiveSheetOpen = $state(false)
  let interactiveDialogOpen = $state(false)
</script>

<section class="catalog-section" data-testid="showcase-overlay">
  <h2 class="catalog-section__title">Sheet &amp; Dialog</h2>
  <p class="catalog-section__lead">
    弹层行为组件，来自 <code>@life-os/platform-web/svelte/overlay</code>：
    <code>LifeOsSheet</code>（底部弹层）与 <code>LifeOsDialog</code>（居中对话框）。
    外观走 theme 的 <code>.sheet-*</code> / <code>.modal-*</code> 壳；行为
    （backdrop 关闭 / Escape / focus trap / 滚动锁 / ARIA）由组件内置。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="sheet" label="LifeOsSheet — 底部弹层">
      <div class="catalog-doc-preview catalog-doc-preview--bottom-sheet">
        <LifeOsSheet
          open
          title="Edit task"
          manageFocus={false}
          lockBackgroundScroll={false}
        >
          <p class="catalog-overlay-copy">
            Sheet body content — form fields, pickers, tool panels.
          </p>
          {#snippet actions()}
            <button type="button" class="btn-secondary">Cancel</button>
            <button type="button" class="btn-primary">Save</button>
          {/snippet}
        </LifeOsSheet>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="dialog" label="LifeOsDialog — 确认">
      <div class="catalog-doc-preview catalog-doc-preview--modal">
        <LifeOsDialog
          open
          title="Skip exercise?"
          subtitle="It stays in your plan for next session."
          manageFocus={false}
          lockBackgroundScroll={false}
        >
          {#snippet actions()}
            <button type="button" class="btn-secondary">Cancel</button>
            <button type="button" class="btn-primary">Skip</button>
          {/snippet}
        </LifeOsDialog>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="destructive" label="LifeOsDialog — 危险确认（alertdialog）">
      <div class="catalog-doc-preview catalog-doc-preview--modal">
        <LifeOsDialog
          open
          destructive
          title="Delete workout?"
          subtitle="This can't be undone."
          manageFocus={false}
          lockBackgroundScroll={false}
        >
          {#snippet actions()}
            <button type="button" class="btn-secondary">Cancel</button>
            <button type="button" class="btn-danger">Delete</button>
          {/snippet}
        </LifeOsDialog>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:interactive" label="Interactive（真实行为：trap + 滚动锁）">
      <div class="catalog-overlay-triggers">
        <button
          type="button"
          class="btn-secondary"
          onclick={() => (interactiveSheetOpen = true)}
        >
          Open sheet
        </button>
        <button
          type="button"
          class="btn-secondary"
          onclick={() => (interactiveDialogOpen = true)}
        >
          Open dialog
        </button>
      </div>
      <LifeOsSheet
        open={interactiveSheetOpen}
        title="Interactive sheet"
        onClose={() => (interactiveSheetOpen = false)}
      >
        <p class="catalog-overlay-copy">Escape / backdrop 关闭，focus trap 生效。</p>
        {#snippet actions()}
          <button
            type="button"
            class="btn-primary"
            onclick={() => (interactiveSheetOpen = false)}
          >
            Done
          </button>
        {/snippet}
      </LifeOsSheet>
      <LifeOsDialog
        open={interactiveDialogOpen}
        title="Interactive dialog"
        subtitle="Escape / backdrop 关闭。"
        onClose={() => (interactiveDialogOpen = false)}
      >
        {#snippet actions()}
          <button
            type="button"
            class="btn-primary"
            onclick={() => (interactiveDialogOpen = false)}
          >
            Done
          </button>
        {/snippet}
      </LifeOsDialog>
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
  .catalog-overlay-copy {
    margin: 0 0 16px;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-md);
    line-height: 1.5;
  }
  .catalog-overlay-triggers {
    display: flex;
    gap: 10px;
  }
</style>
