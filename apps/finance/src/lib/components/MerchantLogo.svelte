<script>
  // 账本行的商户标识。有官方 logo 就显示官方 logo；否则（本地小店、手续费行、
  // 或资源加载失败）一律回落到中性灰占位符——不猜、不编、不用彩色首字母。
  import { merchantLogoSrc } from '$lib/merchantLogos.js'

  /** @type {{ merchant?: string, size?: number }} */
  let { merchant, size = 28 } = $props()

  const src = $derived(merchantLogoSrc(merchant))
  let failed = $state(false)

  // 商户变了要重置失败态，否则复用行会一直显示占位符。
  $effect(() => {
    void merchant
    failed = false
  })
</script>

<span class="merchant-logo" style="--merchant-logo-size: {size}px" aria-hidden="true">
  {#if src && !failed}
    <img
      class="merchant-logo-img"
      {src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onerror={() => (failed = true)}
    />
  {:else}
    <!-- 中性占位符：极简店面剪影，只用灰阶，不暗示任何品牌 -->
    <svg class="merchant-logo-fallback" viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect width="32" height="32" rx="8" class="merchant-logo-fallback-bg" />
      <path
        class="merchant-logo-fallback-mark"
        d="M9 14.5V22a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M8 13l1.2-3.4A1 1 0 0 1 10.14 9h11.72a1 1 0 0 1 .94.6L24 13a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0Z"
        fill="none"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  {/if}
</span>
