<script>
  import { t } from '$lib/i18n/index.js';
  import { importAudioFiles } from '$lib/import.js';
  import { toast } from '$lib/ui.svelte.js';
  import { goto } from '$app/navigation';

  let dragging = $state(false);
  let progress = $state('');

  /** @param {FileList | File[]} files */
  async function handleFiles(files) {
    if (!files?.length) return;
    progress = t('import.importing', { done: 0, total: files.length });
    const count = await importAudioFiles(files, (done, total) => {
      progress = t('import.importing', { done, total });
    });
    toast(t('import.done', { count }));
    progress = '';
    await goto('/library');
  }

  /** @param {Event} e */
  function onFileChange(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    handleFiles(input.files || []);
  }

  /** @param {DragEvent} e */
  function onDrop(e) {
    e.preventDefault();
    dragging = false;
    handleFiles(e.dataTransfer?.files || []);
  }
</script>

<div class="wrap">
  <h2 class="page-title">{t('import.title')}</h2>
  <p class="page-sub" style="margin-bottom:20px">{t('import.hint')}</p>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="import-drop"
    class:dragover={dragging}
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <p style="font-size:var(--text-xl);font-weight:600;margin-bottom:8px">{t('import.drop')}</p>
    <p style="color:var(--t3);margin-bottom:16px">{t('import.or')}</p>
    <label class="btn-primary file-input-btn">
      {t('common.import')}
      <input type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg" multiple onchange={onFileChange} />
    </label>
  </div>

  {#if progress}
    <p style="text-align:center;margin-top:16px;color:var(--t2)">{progress}</p>
  {/if}
</div>
