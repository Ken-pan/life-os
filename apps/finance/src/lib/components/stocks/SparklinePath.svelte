<script>
  // Port of SparklinePath / DayReturnBar from src/components/stocks/MiniPricePath.tsx.
  import { normalizeSparkline } from '../../../engine/sparkline'
  import { t } from '$lib/i18n.svelte.js'

  /** @type {{ values: number[], up: boolean, width?: number, height?: number, class?: string }} */
  let { values, up, width = 48, height = 18, class: klass } = $props()

  const spark = $derived(normalizeSparkline(values, { w: width, h: height }))
</script>

{#if spark.points}
  <svg
    class={klass ?? 'mini-price-path'}
    viewBox="0 0 {spark.w} {spark.h}"
    width={spark.w}
    height={spark.h}
    aria-hidden="true"
  >
    <polyline
      fill="none"
      stroke={up ? 'var(--positive)' : 'var(--critical)'}
      stroke-width="1.5"
      stroke-linejoin="round"
      points={spark.points}
    />
  </svg>
{/if}
