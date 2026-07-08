<script>
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
    { value: 'c', label: 'Option C' },
  ]
  let value = $state('a')
</script>

<section class="catalog-section" data-testid="showcase-segments">
  <h2 class="catalog-section__title">Segments (.seg)</h2>
  <div class="catalog-panel">
    <div class="seg seg--wrap" role="group" aria-label="Demo segment">
      {#each options as opt}
        <button
          type="button"
          class:on={value === opt.value}
          class:active={value === opt.value}
          aria-pressed={value === opt.value}
          onclick={() => (value = opt.value)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 20px;
    font-size: 22px;
  }
</style>
