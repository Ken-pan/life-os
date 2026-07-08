<script>
  import { renderFloorPlanSvg } from '$lib/spatial/render-svg.js'
  import { isSpatialStudioEnabled } from '$lib/spatial-studio.js'

  /** @type {{ project: import('$lib/spatial/types.js').SpatialProject }} */
  let { project } = $props()

  const studio = $derived(isSpatialStudioEnabled())
  const svgHtml = $derived(
    renderFloorPlanSvg(project, { compact: true, hideFurniture: !studio }),
  )
</script>

<a class="plan-preview" href="/plan" data-sveltekit-noscroll>
  <div class="plan-preview-frame" aria-hidden="true">
    {@html svgHtml}
  </div>
  <span class="plan-preview-cta">打开交互平面图 →</span>
</a>

<style>
  .plan-preview {
    display: block;
    text-decoration: none;
    color: inherit;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--plan-paper, #eef1f4);
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .plan-preview:hover {
    border-color: var(--accent);
    box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.2);
  }

  .plan-preview-frame {
    padding: 10px 10px 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .plan-preview-frame :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    min-width: 0;
    max-height: 340px;
  }

  .plan-preview-cta {
    display: block;
    padding: 12px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    background: var(--card);
    border-top: 1px solid var(--border);
  }
</style>
