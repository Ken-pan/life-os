<script>
  import { t } from '$lib/i18n/index.js'
</script>

<div class="wrap">
  <section class="card">
    <h2>{t('home.hello')}</h2>
    <p class="muted">{t('home.hint')}</p>
  </section>
</div>

<style>
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-5, 20px);
    margin-block: var(--space-4, 16px);
    display: grid;
    gap: var(--space-2, 8px);
  }
  .muted {
    color: var(--text-secondary, var(--muted, #888));
  }
</style>
