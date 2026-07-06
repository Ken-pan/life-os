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
  import { unlockAudio } from '$lib/audio.js';
  import { exportBackup, importBackup } from '$lib/backup.js';
  import { auth, signOut, authErrorMessage } from '$lib/auth.svelte.js';
  import { pushToCloud, pullFromCloud, withSyncNotify } from '$lib/sync.js';
  import { reveal } from '$lib/actions/reveal.js';
  import { t } from '$lib/i18n/index.js';
  import Icon from '$lib/components/Icon.svelte';
  import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
  import SettingsAppearanceRows from '$lib/components/settings/SettingsAppearanceRows.svelte';
  import SettingsRow from '$lib/components/settings/SettingsRow.svelte';
  import SettingsToggle from '$lib/components/settings/SettingsToggle.svelte';
  import SettingsStackBlock from '$lib/components/settings/SettingsStackBlock.svelte';
  import SettingsButtonGroup from '$lib/components/settings/SettingsButtonGroup.svelte';

  let importInput;
  let syncing = $state(false);

  const rec = $derived(todayDayId());
  const program = $derived(getProgram());
  const catalog = $derived(listPrograms().map((tpl) => localizeProgram(tpl)));
  const currentProgramId = $derived(activeProgramId());
  const rotLabel = $derived(rotationLabel(program));

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

  function toggleSound() {
    S.settings.sound = !S.settings.sound;
    save();
    if (S.settings.sound) previewTimerChime();
  }

  function toggleNotify() {
    S.settings.notifyRest = !S.settings.notifyRest;
    save();
  }

  async function enableNotifications() {
    unlockAudio();
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
  <div class="wrap">

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

    <SettingsSection title={t('settings.notifications')} testId="settings-notifications">
      <SettingsRow label={t('settings.notifications')} desc={notifyDesc()}>
        {#if notifyPerm === 'granted'}
          <SettingsToggle
            checked={S.settings.notifyRest !== false}
            ariaLabel={t('settings.notifyAria')}
            onchange={toggleNotify}
          />
        {:else if notifyPerm === 'default'}
          <button type="button" class="btn-secondary" onclick={enableNotifications}>{t('settings.enableNotify')}</button>
        {/if}
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title={t('settings.account')} testId="settings-sync">
      {#if auth.user}
        <SettingsStackBlock label={auth.user.email} desc={t('settings.accountDesc')}>
          <SettingsButtonGroup>
            <button type="button" class="btn-secondary" disabled={syncing} onclick={onPush}>{t('settings.upload')}</button>
            <button type="button" class="btn-secondary" disabled={syncing} onclick={() => onPull('merge')}>{t('settings.mergeCloud')}</button>
            <button type="button" class="btn-secondary" disabled={syncing} onclick={() => onPull('replace')}>{t('settings.replaceCloud')}</button>
          </SettingsButtonGroup>
        </SettingsStackBlock>
        <div class="settings-row set-row settings-stack-block">
          <button type="button" class="btn-danger" onclick={onSignOut}>{t('settings.signOut')}</button>
        </div>
      {:else}
        <SettingsStackBlock label={t('settings.notSignedIn')} desc={t('settings.signInDesc')}>
          <a class="btn-link" href="/auth">{t('settings.signInLink')} <Icon name="chevron-right" size={11} /></a>
        </SettingsStackBlock>
      {/if}
    </SettingsSection>

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('settings.programTemplate')}</div>
      <div class="set-row" style="display:block">
        <div class="sr-label" style="margin-bottom:6px">{t('settings.currentProgram', { name: program.meta.name })}</div>
        <div class="sr-desc" style="margin-bottom:12px">{program.meta.description}</div>
        <div class="seg seg--wrap">
          {#each catalog as tpl (tpl.id)}
            <button class:on={tpl.id === currentProgramId} onclick={() => chooseProgram(tpl.id)}>
              {tpl.meta.shortName || tpl.meta.name}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('settings.rotation')}</div>
      <div class="set-row">
        <div>
          <div class="sr-label">{t('settings.todayWhichDay')}</div>
          <div class="sr-desc">{t('settings.rotationDesc', { label: rotLabel })}</div>
        </div>
        <div class="seg">
          {#each ORDER() as did (did)}
            <button class:on={did === rec} onclick={() => setRotation(did)}>{getProgram().days[did].cn}</button>
          {/each}
        </div>
      </div>
    </div>

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('settings.unitFeedback')}</div>
      <div class="set-row">
        <div>
          <div class="sr-label">{t('settings.weightUnit')}</div>
          <div class="sr-desc">{t('settings.weightUnitDesc')}</div>
        </div>
        <div class="seg">
          <button class:on={S.settings.unit === 'lbs'} onclick={() => setUnit('lbs')}>LBS</button>
          <button class:on={S.settings.unit === 'kg'} onclick={() => setUnit('kg')}>KG</button>
        </div>
      </div>
      <SettingsRow label={t('settings.timerSound')} desc={t('settings.timerSoundDesc')}>
        <SettingsToggle
          checked={S.settings.sound}
          ariaLabel={t('settings.timerSoundAria')}
          onchange={(checked) => {
            S.settings.sound = checked;
            save();
            if (checked) previewTimerChime();
          }}
        />
      </SettingsRow>
    </div>

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('settings.logging')}</div>
      <div class="set-row">
        <div>
          <div class="sr-label">{t('settings.logDetail')}</div>
          <div class="sr-desc">{t('settings.logDetailDesc')}</div>
        </div>
        <div class="seg">
          <button class:on={(S.settings.logDetail || 'quick') === 'off'} onclick={() => setLogDetail('off')}>{t('settings.logOff')}</button>
          <button class:on={(S.settings.logDetail || 'quick') === 'quick'} onclick={() => setLogDetail('quick')}>{t('settings.logQuick')}</button>
          <button class:on={S.settings.logDetail === 'always'} onclick={() => setLogDetail('always')}>{t('settings.logAlways')}</button>
        </div>
      </div>
    </div>

    <SettingsSection title={t('settings.data')} testId="settings-backup">
      <SettingsStackBlock label={t('settings.customProgram')} desc={t('settings.customProgramDesc')}>
        <a class="btn-link" href="/program/edit">{t('settings.customProgramLink')} <Icon name="chevron-right" size={11} /></a>
      </SettingsStackBlock>
      <SettingsStackBlock label={t('settings.backup')} desc={t('settings.backupDesc')}>
        <SettingsButtonGroup>
          <button type="button" class="btn-secondary" onclick={onExport}>{t('settings.exportJson')}</button>
          <button type="button" class="btn-secondary" onclick={() => onImportClick('replace')}>{t('settings.importReplace')}</button>
          <button type="button" class="btn-secondary" onclick={() => onImportClick('merge')}>{t('settings.importMerge')}</button>
        </SettingsButtonGroup>
      </SettingsStackBlock>
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
