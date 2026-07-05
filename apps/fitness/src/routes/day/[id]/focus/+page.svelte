<script>
  import { page } from '$app/state';
  import { getDay } from '$lib/programRuntime.js';
  import FocusSession from '$lib/components/FocusSession.svelte';
  import BackButton from '$lib/components/BackButton.svelte';
  import { t } from '$lib/i18n/index.js';

  const id = $derived(page.params.id);
  const day = $derived(getDay(id));
</script>

{#if day}
  <FocusSession dayId={id} {day} />
{:else}
  <section class="view">
    <div class="wrap">
      <div class="page-head">
        <BackButton href="/program" label={t('day.backToProgram')} />
        <h1 class="day-title">{t('day.notFound')}</h1>
      </div>
    </div>
  </section>
{/if}
