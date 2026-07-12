<script>
  import { getProgram, listPrograms, setActiveProgram, rotationLabel } from '$lib/programRuntime.js';
  import { localizeProgram } from '$lib/i18n/programLabels.js';
  import {
    S,
    save,
    resetAll,
    clearToday,
    todayDayId,
    applyTheme,
    ORDER,
    activeProgramId
  } from '$lib/state.svelte.js';
  import { toast } from '$lib/ui.svelte.js';
  import { notificationCapability, requestNotificationPermission, previewTimerChime } from '$lib/timer.svelte.js';
  import { exportBackup, importBackup } from '$lib/backup.js';
  import { auth, signOut, authErrorMessage } from '$lib/auth.svelte.js';
  import { pushToCloud, pullFromCloud, withSyncNotify } from '$lib/sync.js';
  import { t } from '$lib/i18n/index.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import SettingsSection from '@life-os/platform-web/svelte/settings/section';
  import SettingsAppearanceRows from '$lib/components/settings/SettingsAppearanceRows.svelte';
  import SettingsRow from '@life-os/platform-web/svelte/settings/row';
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row';
  import SettingsSegment from '@life-os/platform-web/svelte/settings/segment';
  import SettingsToggle from '@life-os/platform-web/svelte/settings/toggle';
  import SettingsStackBlock from '@life-os/platform-web/svelte/settings/stack-block';
  import SettingsButtonGroup from '@life-os/platform-web/svelte/settings/button-group';

  let importInput;
  let syncing = $state(false);

  const rec = $derived(todayDayId());
  const program = $derived(getProgram());
  const catalog = $derived(listPrograms().map((tpl) => localizeProgram(tpl)));
  const currentProgramId = $derived(activeProgramId());
  const rotLabel = $derived(rotationLabel(program));

  const programOptions = $derived(
    catalog.map((tpl) => ({
      value: tpl.id,
      label: tpl.meta.shortName || tpl.meta.name
    }))
  );

  const rotationOptions = $derived(
    ORDER().map((did) => ({
      value: did,
      label: getProgram().days[did].cn
    }))
  );

  const unitOptions = [
    { value: 'lbs', label: 'LBS' },
    { value: 'kg', label: 'KG' }
  ];

  const logDetailOptions = $derived([
    { value: 'off', label: t('settings.logOff') },
    { value: 'quick', label: t('settings.logQuick') },
    { value: 'always', label: t('settings.logAlways') }
  ]);

  function chooseProgram(id) {
    if (id === currentProgramId) return;
    const next = setActiveProgram(id);
    toast(t('settings.toastProgram', { name: next.meta.name }));
  }

  function setRotation(did) {
    S.rotation.next = ORDER().indexOf(did);
    save();
    toast(t('settings.toastRotation', { day: getProgram().days[did].cn }));
  }

  function setUnit(unit) {
    S.settings.unit = unit;
    save();
  }

  function setNotifyRest(checked) {
    S.settings.notifyRest = checked;
    save();
  }

  async function enableNotifications() {
    const result = await requestNotificationPermission();
    if (result === true || result === 'granted') {
      S.settings.notifyRest = true;
      save();
      toast(t('settings.toastNotifyOn'));
    } else if (result === 'denied') {
      toast(t('settings.toastNotifyDenied'));
    }
  }

  const notifyCap = $derived(notificationCapability());
  const notifyPerm = $derived(notifyCap.kind);

  function notifyDesc() {
    if (notifyPerm === 'granted') return t('settings.notifyGranted');
    if (notifyPerm === 'denied') return t('settings.notifyDenied');
    if (notifyPerm === 'ios-browser') return t('settings.notifyIos');
    if (notifyPerm === 'in-app') return t('settings.notifyInApp');
    if (notifyPerm === 'unsupported') return t('settings.notifyUnsupported');
    return t('settings.notifyDefault');
  }

  function setLogDetail(mode) {
    S.settings.logDetail = mode;
    save();
    const key =
      mode === 'off' ? 'settings.toastLogOff' : mode === 'always' ? 'settings.toastLogAlways' : 'settings.toastLogQuick';
    toast(t(key));
  }

  function onExport() {
    exportBackup();
    toast(t('settings.toastBackup'));
  }

  function onResetToday() {
    if (confirm(t('settings.confirmClearToday'))) {
      clearToday();
      toast(t('settings.toastClearToday'));
    }
  }

  function onResetAll() {
    if (confirm(t('settings.confirmResetAll'))) {
      resetAll();
      applyTheme();
      toast(t('settings.toastResetAll'));
    }
  }

  function onImportClick(mode) {
    importInput.dataset.mode = mode;
    importInput.click();
  }

  async function onPush() {
    if (syncing) return;
    syncing = true;
    try {
      const { sessions, logs } = await withSyncNotify(() => pushToCloud());
      toast(t('settings.toastUploaded', { sessions, logs }), 'success', { key: 'sync-uploaded' });
    } catch {
      /* withSyncNotify → SyncErrorBanner */
    } finally {
      syncing = false;
    }
  }

  async function onPull(mode) {
    if (syncing) return;
    if (mode === 'replace' && !confirm(t('settings.confirmCloudReplace'))) return;
    syncing = true;
    try {
      const { sessions } = await withSyncNotify(() => pullFromCloud(mode));
      applyTheme();
      toast(
        mode === 'merge'
          ? t('settings.toastCloudMerge', { sessions })
          : t('settings.toastCloudRestore', { sessions }),
        'success',
        { key: mode === 'merge' ? 'sync-merged' : 'sync-downloaded' }
      );
    } catch {
      /* withSyncNotify → SyncErrorBanner */
    } finally {
      syncing = false;
    }
  }

  async function onSignOut() {
    try {
      await signOut();
      toast(t('settings.toastSignOut'));
    } catch (err) {
      toast(authErrorMessage(err));
    }
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mode = e.target.dataset.mode || 'replace';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importBackup(String(reader.result), mode);
        applyTheme();
        toast(mode === 'merge' ? t('settings.toastImportMerge') : t('settings.toastImportReplace'));
      } catch (err) {
        toast(err.message || t('settings.importFailed'), 'error');
      }
    };
    reader.readAsText(file);
  }
</script>

<input
  bind:this={importInput}
  type="file"
  accept="application/json,.json"
  hidden
  onchange={onImportFile}
/>

<section class="view">
  <div class="wrap settings-page">

    <SettingsSection title={t('settings.appearance')}>
      <SettingsAppearanceRows
        onThemeChange={(theme) => {
          const key =
            theme === 'auto'
              ? 'settings.toastThemeAuto'
              : theme === 'light'
                ? 'settings.toastThemeLight'
                : 'settings.toastThemeDark';
          toast(t(key));
        }}
        onLocaleChange={(locale) => {
          toast(locale === 'en' ? t('settings.toastLocaleEn') : t('settings.toastLocaleZh'));
        }}
      />
    </SettingsSection>

    <SettingsSection
      title={t('settings.notifications')}
      testId="settings-notifications"
      collapsible
      collapseOnMobile
    >
      <SettingsRow label={t('settings.notifyToggleLabel')} desc={notifyDesc()} rowClass="settings-row--toggle">
        {#if notifyPerm === 'granted'}
          <SettingsToggle
            checked={S.settings.notifyRest !== false}
            ariaLabel={t('settings.notifyAria')}
            onchange={setNotifyRest}
          />
        {:else if notifyPerm === 'default'}
          <button type="button" class="btn-secondary" onclick={enableNotifications}>{t('settings.enableNotify')}</button>
        {/if}
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title={t('settings.account')} testId="settings-sync">
      {#if auth.user}
        <SettingsStackBlock>
          <p class="settings-account-email">{auth.user.email}</p>
          <p class="sr-desc pref-desc settings-account-desc">{t('settings.accountDesc')}</p>
          <SettingsButtonGroup>
            <button type="button" class="btn-secondary" disabled={syncing} onclick={onPush}>{t('settings.upload')}</button>
            <button type="button" class="btn-secondary" disabled={syncing} onclick={() => onPull('merge')}>{t('settings.mergeCloud')}</button>
          </SettingsButtonGroup>
        </SettingsStackBlock>
        <div class="settings-row set-row settings-stack-block">
          <button type="button" class="btn-danger" disabled={syncing} onclick={() => onPull('replace')}>{t('settings.replaceCloud')}</button>
        </div>
        <div class="settings-row set-row settings-stack-block">
          <button type="button" class="btn-secondary settings-sign-out" onclick={onSignOut}>{t('settings.signOut')}</button>
        </div>
      {:else}
        <SettingsStackBlock label={t('settings.notSignedIn')} desc={t('settings.signInDesc')}>
          <a class="btn-link" href="/auth">{t('settings.signInLink')} <Icon name="chevron-right" size={11} /></a>
        </SettingsStackBlock>
      {/if}
    </SettingsSection>

    <SettingsSection title={t('settings.programTemplate')}>
      <SettingsStackBlock
        label={t('settings.currentProgram', { name: program.meta.name })}
        desc={program.meta.description}
      />
      <SettingsRow label={t('settings.programPick')}>
        <SettingsSegment
          options={programOptions}
          value={currentProgramId}
          onchange={chooseProgram}
          ariaLabel={t('settings.programPick')}
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title={t('settings.rotation')}>
      <SettingsRow label={t('settings.todayWhichDay')} desc={t('settings.rotationDesc', { label: rotLabel })}>
        <SettingsSegment
          options={rotationOptions}
          value={rec}
          onchange={setRotation}
          ariaLabel={t('settings.todayWhichDay')}
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title={t('settings.unitFeedback')}>
      <SettingsRow label={t('settings.weightUnit')} desc={t('settings.weightUnitDesc')}>
        <SettingsSegment
          options={unitOptions}
          value={S.settings.unit}
          onchange={setUnit}
          ariaLabel={t('settings.weightUnit')}
        />
      </SettingsRow>
      <SettingsToggleRow
        label={t('settings.timerSound')}
        desc={t('settings.timerSoundDesc')}
        checked={S.settings.sound}
        ariaLabel={t('settings.timerSoundAria')}
        onchange={(checked) => {
          S.settings.sound = checked;
          save();
          if (checked) previewTimerChime();
        }}
      />
    </SettingsSection>

    <SettingsSection title={t('settings.logging')}>
      <SettingsRow label={t('settings.logDetail')} desc={t('settings.logDetailDesc')}>
        <SettingsSegment
          options={logDetailOptions}
          value={S.settings.logDetail || 'quick'}
          onchange={setLogDetail}
          ariaLabel={t('settings.logDetail')}
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title={t('settings.data')} testId="settings-backup">
      <SettingsStackBlock label={t('settings.customProgram')} desc={t('settings.customProgramDesc')}>
        <a class="btn-link" href="/program/edit">{t('settings.customProgramLink')} <Icon name="chevron-right" size={11} /></a>
      </SettingsStackBlock>
      <SettingsStackBlock label={t('settings.backup')} desc={t('settings.backupDesc')}>
        <SettingsButtonGroup>
          <button type="button" class="btn-secondary" onclick={onExport}>{t('settings.exportJson')}</button>
          <button type="button" class="btn-secondary" onclick={() => onImportClick('merge')}>{t('settings.importMerge')}</button>
        </SettingsButtonGroup>
      </SettingsStackBlock>
      <div class="settings-row set-row settings-stack-block">
        <button type="button" class="btn-danger" onclick={() => onImportClick('replace')}>{t('settings.importReplace')}</button>
      </div>
      <div class="settings-row set-row settings-stack-block">
        <button type="button" class="btn-danger" onclick={onResetToday}>{t('settings.clearToday')}</button>
      </div>
      <div class="settings-row set-row settings-stack-block">
        <button type="button" class="btn-danger" onclick={onResetAll}>{t('settings.resetAll')}</button>
      </div>
    </SettingsSection>

    <div class="set-note">
      {t('settings.footnote')}
      <span class="app-version">{t('common.brand')} · v3.0</span>
    </div>
  </div>
</section>

<style>
  .settings-sign-out {
    width: 100%;
  }

  .settings-account-desc {
    margin-bottom: 12px;
  }
</style>
