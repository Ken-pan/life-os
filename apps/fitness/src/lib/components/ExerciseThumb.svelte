<script>
  import { exerciseImage } from '$lib/data/program.js';
  import CoverMedia from '$lib/components/CoverMedia.svelte';

  /** @type {{ exId: string }} */
  let { exId } = $props();
</script>

<div class="ex-thumb">
  <CoverMedia src={exerciseImage(exId)} size="sm" />
</div>
