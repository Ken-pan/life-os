<script>
  /** @type {{ label: string, value: string }} */
  let { label, value } = $props()
</script>

<div class="item">
  <div class="grow">
    <div class="meta">{label}</div>
    <div class="name">{value}</div>
  </div>
</div>
