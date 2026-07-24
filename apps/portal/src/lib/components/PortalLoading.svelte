<script>
  import { getLifeOsBrand } from '@life-os/theme/brand'
  import BrandMark from '@life-os/platform-web/svelte/brand/mark'

  const portalBrand = getLifeOsBrand('portal')
</script>

<div class="portal-loading" role="status" aria-live="polite" aria-label="正在初始化 Korben">
  <div class="portal-loading-inner">
    <BrandMark
      size={56}
      lightSrc={portalBrand.light}
      darkSrc={portalBrand.dark}
      lightSrcSet={portalBrand.lightSrcSet}
      darkSrcSet={portalBrand.darkSrcSet}
    />
    <p class="portal-loading-brand">PORTAL.OS</p>
    <div class="portal-loading-skeleton" aria-hidden="true">
      <span class="portal-loading-bar"></span>
      <span class="portal-loading-bar portal-loading-bar--short"></span>
    </div>
    <p class="portal-loading-text">正在初始化…</p>
  </div>
</div>
