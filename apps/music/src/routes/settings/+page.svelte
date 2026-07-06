<script>
  import { t } from '$lib/i18n/index.js';
  import { S, save, applyTheme } from '$lib/state.svelte.js';
  import { exportLibraryJson, rescanTrackMetadata } from '$lib/import.js';
  import { trackCount, countTracksWithoutLyrics } from '$lib/db.js';
  import { refreshQueueMetadata } from '$lib/player.svelte.js';
  import { auth, signOut } from '$lib/auth.svelte.js';
  import { syncBidirectionalSafe } from '$lib/sync.js';
  import { toast } from '$lib/ui.svelte.js';

  let count = $state(0);
  let missingLyrics = $state(0);
  let syncing = $state(false);
  let rescanning = $state(false);
  let rescanProgress = $state('');

  async function refreshCounts() {
    count = await trackCount();
    missingLyrics = await countTracksWithoutLyrics();
  }

  $effect(() => {
    refreshCounts();
  });

  function setTheme(theme) {
    S.settings.theme = theme;
    save();
    applyTheme();
  }

  async function exportMeta() {
    const data = await exportLibraryJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'musicos-library-meta.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onSync() {
    if (syncing) return;
    syncing = true;
    try {
      await syncBidirectionalSafe();
      await refreshQueueMetadata();
      await refreshCounts();
    } finally {
      syncing = false;
    }
  }

  async function onSignOut() {
    await signOut();
    toast(t('settings.signOut'));
  }

  async function onRescan() {
    if (rescanning) return;
    rescanning = true;
    rescanProgress = t('settings.rescanning', { done: 0, total: count });
    try {
      const result = await rescanTrackMetadata((done, total) => {
        rescanProgress = t('settings.rescanning', { done, total });
      });
      if (!result.scanned) toast(t('settings.rescanEmpty'));
      else toast(t('settings.rescanDone', { scanned: result.scanned, updated: result.updated }));
      await refreshQueueMetadata();
      await refreshCounts();
    } finally {
      rescanning = false;
      rescanProgress = '';
    }
  }
</script>

<div class="wrap">
  <h2 class="page-title">{t('settings.title')}</h2>

  <section class="settings-block set-group" style="margin-top:24px">
    <h3 class="block-title sg-title">{t('settings.account')}</h3>
    {#if auth.user}
      <div class="set-row settings-row">
        <div class="pref-copy">
          <div class="pref-label">{auth.user.email}</div>
          <div class="pref-desc">{t('auth.signedInDesc')}</div>
        </div>
      </div>
      <div class="settings-stack-block" style="padding:0 18px 16px">
        <div class="settings-btn-group">
          <button class="btn-primary" type="button" disabled={syncing} onclick={onSync}>{syncing ? t('auth.pleaseWait') : t('sync.now')}</button>
          <button class="btn-secondary" type="button" onclick={onSignOut}>{t('settings.signOut')}</button>
        </div>
      </div>
    {:else}
      <div class="settings-stack-block" style="padding:0 18px 16px">
        <p class="pref-desc" style="margin-bottom:12px">{t('sync.signInFirst')}</p>
        <a class="btn-primary" href="/auth" style="display:inline-flex">{t('settings.signIn')}</a>
      </div>
    {/if}
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('sync.title')}</h3>
    <p class="block-desc" style="padding:0 18px 16px">{t('sync.desc')}</p>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.theme')}</h3>
    <div class="set-row settings-row">
      <div class="pref-copy">
        <div class="pref-label">外观</div>
      </div>
      <div class="pref-control seg">
        <button type="button" class:active={S.settings.theme === 'auto'} onclick={() => setTheme('auto')}>{t('settings.themeAuto')}</button>
        <button type="button" class:active={S.settings.theme === 'light'} onclick={() => setTheme('light')}>{t('settings.themeLight')}</button>
        <button type="button" class:active={S.settings.theme === 'dark'} onclick={() => setTheme('dark')}>{t('settings.themeDark')}</button>
      </div>
    </div>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.privacy')}</h3>
    <p class="block-desc" style="padding:0 18px 16px">{t('settings.privacyDesc')}</p>
    <div class="set-row settings-row">
      <div class="pref-copy">
        <div class="pref-label">{t('settings.library')}</div>
        <div class="pref-desc">{t('settings.libraryCount', { count })}</div>
        {#if missingLyrics > 0}
          <div class="pref-desc" style="margin-top:4px;color:var(--track-accent, var(--accent))">
            {t('settings.missingLyrics', { count: missingLyrics })}
          </div>
        {/if}
      </div>
    </div>
    <div class="settings-stack-block" style="padding:0 18px 16px">
      <div class="settings-btn-group">
        <button class="btn-primary" type="button" disabled={rescanning || count === 0} onclick={onRescan}>
          {rescanning ? t('auth.pleaseWait') : t('settings.rescanMeta')}
        </button>
        <button class="btn-secondary" type="button" onclick={exportMeta}>{t('settings.export')}</button>
      </div>
      {#if rescanProgress}
        <p class="pref-desc" style="margin-top:12px">{rescanProgress}</p>
      {/if}
    </div>
  </section>

  <p class="set-note">{t('settings.version')}</p>
</div>
