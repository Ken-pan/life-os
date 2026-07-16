<script>
  import AppBrand from '@life-os/platform-web/svelte/brand'
  import BrandMark from '@life-os/platform-web/svelte/brand/mark'
  import AppBrandWordmark from '@life-os/platform-web/svelte/brand/wordmark'
  import { getLifeOsBrand } from '@life-os/theme/brand'

  const apps = ['planner', 'fitness', 'finance', 'music', 'portal']
  const variants = ['sidebar', 'appbar', 'header']
  const musicBrand = getLifeOsBrand('music')
</script>

<section class="catalog-section" data-testid="showcase-brand">
  <h2 class="catalog-section__title">Brand components</h2>
  <div class="catalog-panel catalog-grid" style="gap: 20px;">
    {#each apps as appId}
      <div>
        <h3 class="block-title sg-title">{appId}</h3>
        <div class="catalog-grid" style="gap: 8px;">
          {#each variants as variant}
            <AppBrand {appId} {variant} />
          {/each}
        </div>
      </div>
    {/each}
    <div class="catalog-row">
      <BrandMark
        size={48}
        lightSrc={musicBrand.light}
        darkSrc={musicBrand.dark}
        lightSrcSet={musicBrand.lightSrcSet}
        darkSrcSet={musicBrand.darkSrcSet}
      />
      <AppBrandWordmark
        base={musicBrand.wordmarkBase}
        accent={musicBrand.wordmarkAccent}
      />
    </div>
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
</style>
