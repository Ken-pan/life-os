<script>
  /** @type {{ artUrl?: string }} */
  let { artUrl = '' } = $props();

  let artFailed = $state(false);

  $effect(() => {
    artUrl;
    artFailed = false;
  });
</script>

<div class="np-ambient-back" aria-hidden="true">
  {#if artUrl && !artFailed}
    <img
      class="np-ambient-back-art"
      src={artUrl}
      alt=""
      decoding="async"
      crossorigin="anonymous"
      onerror={() => {
        artFailed = true;
      }}
    />
  {/if}
  <div class="np-ambient-back-mesh"></div>
  <div class="np-ambient-back-scrim"></div>
</div>
