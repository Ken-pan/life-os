<script>
  /** @type {{ viewport: 'desktop' | 'tablet' | 'mobile', children }} */
  let { viewport = 'desktop', children } = $props()

  const widths = { desktop: 1440, tablet: 768, mobile: 390 }
</script>

<div
  class="responsive-frame"
  style="--frame-width: {widths[viewport]}px"
  data-viewport={viewport}
  data-testid="responsive-frame"
>
  <div class="responsive-frame__canvas">
    {@render children?.()}
  </div>
</div>

<style>
  .responsive-frame {
    padding: 16px;
    display: flex;
    justify-content: center;
    min-height: 100%;
    box-sizing: border-box;
  }

  .responsive-frame__canvas {
    width: min(100%, var(--frame-width));
    border: 1px solid #ccc;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
    background: var(--bg);
  }
</style>
