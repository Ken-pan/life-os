<script>
  import { createTask } from '$lib/domain/tasks.js';
  import { S } from '$lib/state.svelte.js';
  import { SYSTEM_LIST_INBOX } from '$lib/types.js';
  import { t } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { toast } from '$lib/ui.svelte.js';

  /** @type {{ placeholder?: string, listId?: string, dueDate?: string|null, showOnMobile?: boolean, toastOnAdd?: string }} */
  let {
    placeholder = t('home.quickAdd'),
    listId,
    dueDate = todayKey(),
    showOnMobile = false,
    toastOnAdd = '',
  } = $props();

  let text = $state('');

  const canSubmit = $derived(text.trim().length > 0);

  function submit() {
    const title = text.trim();
    if (!title) return;
    createTask({
      title,
      listId: listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
      dueDate
    });
    text = '';
    if (toastOnAdd) toast(toastOnAdd);
  }
</script>

<form class="quick-add" class:quick-add--mobile={showOnMobile} onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <input bind:value={text} {placeholder} aria-label={placeholder} />
  <button type="submit" class="btn-primary" disabled={!canSubmit}>{t('common.add')}</button>
</form>
