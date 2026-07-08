<script>
  /** @type {{ size?: number, class?: string, lightSrc?: string, darkSrc?: string, lightSrcSet?: string, darkSrcSet?: string }} */
  let {
    size = 28,
    class: className = '',
    lightSrc = '/brand-circle-light-96.png',
    darkSrc = '/brand-circle-dark-96.png',
    lightSrcSet = '/brand-circle-light-48.png 1x, /brand-circle-light-96.png 2x',
    darkSrcSet = '/brand-circle-dark-48.png 1x, /brand-circle-dark-96.png 2x',
  } = $props();
</script>

<span
  class="brand-icon-pair {className}"
  style="--brand-icon-size: {size}px"
  aria-hidden="true"
>
  <img
    src={lightSrc}
    srcset={lightSrcSet}
    alt=""
    class="brand-icon-light"
    width={size}
    height={size}
  />
  <img
    src={darkSrc}
    srcset={darkSrcSet}
    alt=""
    class="brand-icon-dark"
    width={size}
    height={size}
  />
</span>
