<script>
  import { t } from '$lib/i18n/index.js';
  import { importMediaFiles } from '$lib/import.js';
  import { refreshQueueMetadata } from '$lib/player.svelte.js';
  import { toast } from '$lib/ui.svelte.js';
  import { goto } from '$app/navigation';

  let dragging = $state(false);
  let progress = $state('');

  /** @param {FileList | File[]} files */
  async function handleFiles(files) {
    if (!files?.length) return;
    progress = t('import.importing', { done: 0, total: files.length });
    const { audioCount, lrcCount, total } = await importMediaFiles(files, (done, tot) => {
      progress = t('import.importing', { done, total: tot });
    });
    if (lrcCount > 0) {
      await refreshQueueMetadata();
      toast(t('import.doneMixed', { audio: audioCount, lrc: lrcCount }));
    } else toast(t('import.done', { count: total }));
    progress = '';
    if (audioCount > 0) await goto('/library');
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
      <input type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.lrc,text/plain" multiple onchange={onFileChange} />
    </label>
  </div>

  {#if progress}
    <p style="text-align:center;margin-top:16px;color:var(--t2)">{progress}</p>
  {/if}
</div>
