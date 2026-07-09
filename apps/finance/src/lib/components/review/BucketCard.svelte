<script>
  import { t } from '$lib/i18n.svelte.js'

  /** @type {{ title: string, lines: string[] }} */
  let { title, lines } = $props()
</script>

<div class="card card-compact">
  <h3>{title}</h3>
  {#if lines.length === 0}
    <p class="muted-note">{t('review.bucketEmpty')}</p>
  {:else}
    <ul class="muted-note">
      {#each lines as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
  {/if}
</div>
