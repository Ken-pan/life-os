<script>
  /** @type {{ size?: number, class?: string }} */
  let { size = 22, class: className = '' } = $props();
</script>

<img
  src="/logo-mark.svg"
  alt=""
  width={size}
  height={size}
  aria-hidden="true"
  class="logo-mark {className}"
/>

<style>
  .logo-mark {
    display: block;
    flex-shrink: 0;
  }
</style>
