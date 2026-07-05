<script>
  import Icon from '$lib/components/Icon.svelte';

  /** @type {{ src?: string | null; alt?: string; loading?: 'lazy' | 'eager'; size?: 'sm' | 'lg' }} */
  let { src = null, alt = '', loading = 'lazy', size = 'sm' } = $props();

  let broken = $state(false);

  $effect(() => {
    src;
    broken = false;
  });

  const iconSize = $derived(size === 'lg' ? 36 : 18);
</script>

{#if src && !broken}
  <img {src} alt={alt} {loading} onerror={() => (broken = true)} />
{:else}
  <div class="cover-ph" class:cover-ph--lg={size === 'lg'} aria-hidden={!alt}>
    <Icon name="image" size={iconSize} />
  </div>
{/if}
