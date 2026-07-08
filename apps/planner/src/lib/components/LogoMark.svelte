<script>
  /** @type {{ size?: number, class?: string }} */
  let { size = 22, class: className = '' } = $props();
</script>

<span
  class="brand-icon-pair logo-mark {className}"
  style="--brand-icon-size: {size}px"
  aria-hidden="true"
>
  <img
    src="/brand-circle-light-96.png"
    srcset="/brand-circle-light-48.png 1x, /brand-circle-light-96.png 2x"
    alt=""
    class="brand-icon-light"
    width={size}
    height={size}
  />
  <img
    src="/brand-circle-dark-96.png"
    srcset="/brand-circle-dark-48.png 1x, /brand-circle-dark-96.png 2x"
    alt=""
    class="brand-icon-dark"
    width={size}
    height={size}
  />
</span>

<style>
  .logo-mark {
    display: block;
    flex-shrink: 0;
  }
</style>
