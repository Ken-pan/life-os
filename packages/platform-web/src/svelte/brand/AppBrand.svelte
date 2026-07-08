<script>
  import { getLifeOsBrand, getLifeOsBrandMarkSize } from '@life-os/theme/brand';
  import BrandMark from './BrandMark.svelte';
  import AppBrandWordmark from './AppBrandWordmark.svelte';

  /** @type {{ appId: import('@life-os/theme').LifeOsAppId, variant?: 'sidebar' | 'appbar' | 'header' | 'auth', tagline?: string, ariaLabel?: string, class?: string }} */
  let {
    appId,
    variant = 'sidebar',
    tagline = '',
    ariaLabel = '',
    class: className = '',
  } = $props();

  const brand = $derived(getLifeOsBrand(appId));
  const markSize = $derived(getLifeOsBrandMarkSize(appId, variant));

  const isSidebar = $derived(variant === 'sidebar');
  const isHeader = $derived(variant === 'header');

  const markClass = $derived(
    isSidebar ? 'brand-mark' : isHeader ? 'page-header-brand-mark' : 'appbar-brand-mark',
  );

  const copyClass = $derived(isSidebar ? 'brand-copy' : 'appbar-brand-copy');

  const wordmarkClass = $derived(
    isSidebar ? 'brand-name' : isHeader ? 'page-header-brand-name' : 'appbar-brand-name',
  );
</script>

<div
  class="brand {className}"
  class:appbar-brand={variant === 'appbar'}
  class:page-header-brand={isHeader}
  aria-label={ariaLabel || brand.fullName}
>
  <BrandMark
    size={markSize}
    class={markClass}
    lightSrc={brand.light}
    darkSrc={brand.dark}
    lightSrcSet={brand.lightSrcSet}
    darkSrcSet={brand.darkSrcSet}
  />
  <span class={copyClass}>
    <AppBrandWordmark
      base={brand.wordmarkBase}
      accent={brand.wordmarkAccent}
      class={wordmarkClass}
    />
    {#if tagline && isSidebar}
      <span class="brand-tag">{tagline}</span>
    {/if}
  </span>
</div>
