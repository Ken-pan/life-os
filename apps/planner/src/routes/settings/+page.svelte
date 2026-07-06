<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import { S, save } from '$lib/state.svelte.js';
  import { createList } from '$lib/domain/lists.js';
  import { exportBackup, importBackup } from '$lib/backup.js';
  import { t } from '$lib/i18n/index.js';
  import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
  import SettingsAppearanceRows from '$lib/components/settings/SettingsAppearanceRows.svelte';
  import SettingsNotificationsBlock from '$lib/components/settings/SettingsNotificationsBlock.svelte';
  import SettingsSyncBlock from '$lib/components/settings/SettingsSyncBlock.svelte';
  import SettingsBackupBlock from '$lib/components/settings/SettingsBackupBlock.svelte';
  import { toast } from '$lib/ui.svelte.js';
  import { userLists } from '$lib/state.svelte.js';
  import { listLabel } from '$lib/i18n/index.js';
  import { auth, signOut } from '$lib/auth.svelte.js';
  import { isSupabaseConfigured } from '$lib/supabase.js';
  import { pushToCloud, pullFromCloud, syncNow, lastSyncLabel } from '$lib/sync.js';
  import {
    notificationPermission,
    requestNotificationPermission,
    syncRemindersToServiceWorker
  } from '$lib/services/reminders.js';

  let listName = $state('');
  let syncBusy = $state(false);
  let importFileName = $state('');

  function permissionStatusLabel() {
    const perm = notificationPermission();
    if (perm === 'granted') return t('settings.permissionGranted');
    if (perm === 'denied') return t('settings.permissionDenied');
    return t('settings.permissionDefault');
  }

  function addList() {
    if (!listName.trim()) return;
    createList({ title: listName.trim() });
    listName = '';
    toast(t('toast.listCreated'));
  }

  async function onImport(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    importFileName = file.name;
    const text = await file.text();
    try {
      importBackup(text, 'merge');
      await syncRemindersToServiceWorker();
      toast(t('toast.imported'));
    } catch {
      toast(t('toast.importFailed'), 'error');
    }
    e.currentTarget.value = '';
  }

  async function enableNotifications() {
    const perm = await requestNotificationPermission();
    S.settings.notificationsEnabled = perm === 'granted';
    save();
    await syncRemindersToServiceWorker();
    toast(
      perm === 'granted'
        ? t('settings.notifyOn')
        : perm === 'denied'
          ? t('settings.notifyDenied')
          : t('settings.notifyUnsupported')
    );
  }

  async function doSync(mode = 'merge') {
    if (!auth.user || syncBusy) return;
    syncBusy = true;
    try {
      const { pushed, pulled } = await syncNow(mode);
      if (pushed && pulled) toast(t('sync.merged'));
      else if (pushed) toast(t('sync.uploaded'));
      else if (pulled) toast(t('sync.downloaded'));
      else toast(t('sync.upToDate'));
    } catch (e) {
      toast(e?.message || t('sync.failed'), 'error');
    } finally {
      syncBusy = false;
    }
  }

  async function doPush() {
    if (!auth.user || syncBusy) return;
    syncBusy = true;
    try {
      await pushToCloud();
      toast(t('sync.uploaded'));
    } catch (e) {
      toast(e?.message || t('sync.failed'), 'error');
    } finally {
      syncBusy = false;
    }
  }

  async function doPull() {
    if (!auth.user || syncBusy) return;
    syncBusy = true;
    try {
      await pullFromCloud('merge');
      toast(t('sync.downloaded'));
    } catch (e) {
      toast(e?.message || t('sync.failed'), 'error');
    } finally {
      syncBusy = false;
    }
  }

  async function logout() {
    await signOut();
    toast(t('auth.signedOut'));
  }
</script>

<AppBar title={t('settings.title')} />

<div class="wrap settings-page">
  <SettingsSection title={t('settings.appearance')} testId="settings-appearance">
    <SettingsAppearanceRows />
  </SettingsSection>

  <SettingsSyncBlock
    title={t('settings.sync')}
    unavailableDesc={t('settings.syncUnavailable')}
    signedOutDesc={t('settings.syncDesc')}
    email={auth.user?.email}
    signedInDesc={lastSyncLabel() ? t('sync.last', { time: lastSyncLabel() }) : ''}
    configured={isSupabaseConfigured}
    signedIn={!!auth.user}
    busy={syncBusy}
    autoSync={S.settings.syncAuto}
    autoSyncLabel={t('settings.syncAuto')}
    signInLabel={t('auth.signIn')}
    onAutoSyncChange={(checked) => {
      S.settings.syncAuto = checked;
      save();
    }}
  >
    {#snippet actions()}
      <button type="button" class="btn-primary" disabled={syncBusy} onclick={() => doSync()}>{t('sync.now')}</button>
      <button type="button" class="btn-secondary" disabled={syncBusy} onclick={doPush}>{t('sync.upload')}</button>
      <button type="button" class="btn-secondary" disabled={syncBusy} onclick={doPull}>{t('sync.download')}</button>
      <button type="button" class="btn-secondary" onclick={logout}>{t('auth.signOut')}</button>
    {/snippet}
  </SettingsSyncBlock>

  <SettingsNotificationsBlock
    title={t('settings.notifications')}
    desc={t('settings.notificationsDesc')}
    statusLabel={t('settings.notifyStatus', { status: permissionStatusLabel() })}
    enableLabel={t('settings.enableNotify')}
    toggleLabel={t('settings.notificationsEnabled')}
    permission={notificationPermission()}
    enabled={S.settings.notificationsEnabled}
    onEnable={enableNotifications}
    onToggle={async (checked) => {
      if (notificationPermission() !== 'granted') {
        await enableNotifications();
        return;
      }
      S.settings.notificationsEnabled = checked;
      save();
      await syncRemindersToServiceWorker();
    }}
  />

  <SettingsSection title={t('settings.newList')} testId="settings-lists">
    <div class="quick-add quick-add--mobile">
      <input bind:value={listName} placeholder={t('settings.listName')} />
      <button type="button" class="btn-primary" onclick={addList}>{t('common.add')}</button>
    </div>
    {#each userLists() as list}
      <div class="settings-row">
        <a href="/lists/{list.id}">{listLabel(list)}</a>
      </div>
    {/each}
  </SettingsSection>

  <SettingsBackupBlock
    title={t('settings.data')}
    desc={t('settings.dataDesc')}
    exportLabel={t('settings.export')}
    importLabel={t('settings.import')}
    fileLabel={importFileName || t('settings.chooseFile')}
    onExport={exportBackup}
    onImport={onImport}
  />
</div>
