<script>
  import { t } from '$lib/i18n/index.js'
  import {
    S,
    applyTheme,
    setImmersiveViewMode,
    patchCloudSettings,
  } from '$lib/state.svelte.js'
  import {
    getCurrentTrack,
    player,
    refreshQueueMetadata,
    notifyPlaybackSettingsChanged,
  } from '$lib/player.svelte.js'
  import { refreshTrackAmbience } from '$lib/trackAmbience.js'
  import {
    exportLibraryJson,
    rescanTrackMetadata,
    ensureArtRepaired,
    ensureMetadataRepaired,
    repairMissingLyrics,
  } from '$lib/import.js'
  import { trackCount, countTracksWithoutLyrics } from '$lib/db.js'
  import { auth, signOut } from '$lib/auth.svelte.js'
  import { syncBidirectionalSafe } from '$lib/sync.js'
  import {
    cloudAudioStats,
    formatBytes,
    uploadPendingAudio,
  } from '$lib/cloudAudio.js'
  import {
    getAudioBlobCacheStats,
  } from '$lib/audioBlobStore.js'
  import {
    summarizePlayMetrics,
    clearPlayMetrics,
  } from '$lib/playMetrics.js'
  import {
    fetchPendingTagReviews,
    fetchRecommendationHealth,
    resolveTagReview,
  } from '$lib/tagReview.js'
  import { toast } from '$lib/ui.svelte.js'
  import { setLocale } from '$lib/i18n/index.js'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsSegment from '@life-os/platform-web/svelte/settings/segment'

  let count = $state(0)
  let missingLyrics = $state(0)
  let cloudPending = $state(0)
  let cloudStored = $state(0)
  let cloudLocalAudio = $state(0)
  let cloudPendingBytes = $state(0)
  let syncing = $state(false)
  let rescanning = $state(false)
  let rescanProgress = $state('')
  let fetchingLyrics = $state(false)
  let lyricsProgress = $state('')
  let uploading = $state(false)
  let uploadProgress = $state('')
  let uploadCurrent = $state('')
  /** @type {import('$lib/tagReview.js').TagReviewRow[]} */
  let tagReviews = $state([])
  let health = $state({ playEvents: 0, embeddings: 0, pendingReviews: 0 })
  let resolvingReviewId = $state('')
  let offlineCacheCount = $state(0)
  let offlineCacheBytes = $state(0)
  let playMetricsSummary = $state(summarizePlayMetrics())

  /** @param {unknown} proposed */
  function formatProposedTags(proposed) {
    if (!Array.isArray(proposed)) return ''
    return proposed
      .map((t) => (typeof t === 'string' ? t : t?.slug))
      .filter(Boolean)
      .join(', ')
  }

  /** @param {string} reason */
  function tagReviewReasonLabel(reason) {
    if (reason === 'llm_low_confidence') return t('settings.tagReviewReasonLlm')
    return t('settings.tagReviewReasonLow')
  }

  async function refreshCounts() {
    count = await trackCount()
    missingLyrics = await countTracksWithoutLyrics()
    const stats = await cloudAudioStats()
    cloudPending = stats.pending
    cloudStored = stats.cloud
    cloudLocalAudio = stats.localAudio
    cloudPendingBytes = stats.pendingBytes
    const offline = await getAudioBlobCacheStats()
    offlineCacheCount = offline.count
    offlineCacheBytes = offline.bytes
    playMetricsSummary = summarizePlayMetrics()
    if (auth.user) {
      ;[tagReviews, health] = await Promise.all([
        fetchPendingTagReviews(12),
        fetchRecommendationHealth(),
      ])
    } else {
      tagReviews = []
      health = { playEvents: 0, embeddings: 0, pendingReviews: 0 }
    }
  }

  function onClearPlayMetrics() {
    clearPlayMetrics()
    playMetricsSummary = summarizePlayMetrics()
  }

  /** @param {Record<string, number>} counts */
  function formatSourceCounts(counts) {
    const labels = {
      blob: '本地',
      idb: 'IDB',
      signed: '签名缓存',
      network: '网络',
      unknown: '未知',
    }
    return Object.entries(counts)
      .map(([k, n]) => `${labels[k] || k} ${n}`)
      .join(' · ')
  }

  /** @param {string} id @param {'approved' | 'rejected'} status */
  async function onResolveReview(id, status) {
    if (resolvingReviewId) return
    resolvingReviewId = id
    try {
      const ok = await resolveTagReview(id, status)
      if (ok) {
        tagReviews = tagReviews.filter((r) => r.id !== id)
        health = {
          ...health,
          pendingReviews: Math.max(0, health.pendingReviews - 1),
        }
      }
    } finally {
      resolvingReviewId = ''
    }
  }

  $effect(() => {
    refreshCounts()
  })

  function setTheme(theme) {
    patchCloudSettings({ theme })
    applyTheme()
  }

  /** @param {boolean} enabled */
  function setGapless(enabled) {
    patchCloudSettings({ gapless: enabled })
    notifyPlaybackSettingsChanged()
  }

  /** @param {number} ms */
  function setCrossfadeMs(ms) {
    patchCloudSettings({ crossfadeMs: ms, crossfade: ms > 0 })
    notifyPlaybackSettingsChanged()
  }

  /** @param {number} ms */
  function formatCrossfadeLabel(ms) {
    if (ms <= 0) return t('settings.crossfadeOff')
    if (ms < 1000) return `${ms} ms`
    return t('settings.crossfadeSeconds', {
      seconds: (ms / 1000).toFixed(1).replace(/\.0$/, ''),
    })
  }

  const crossfadeSteps = [0, 500, 1000, 2000, 3000, 5000, 8000, 12000]

  const localeOptions = $derived([
    { value: 'zh', label: t('settings.languageZh') },
    { value: 'en', label: t('settings.languageEn') },
  ])

  const themeOptions = $derived([
    { value: 'auto', label: t('settings.themeAuto') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
  ])

  const gaplessOptions = $derived([
    { value: 'on', label: t('settings.gaplessOn') },
    { value: 'off', label: t('settings.gaplessOff') },
  ])

  const albumAmbienceOptions = $derived([
    { value: 'on', label: t('settings.albumAmbienceOn') },
    { value: 'off', label: t('settings.albumAmbienceOff') },
  ])

  const autoContinueSimilarOptions = $derived([
    { value: 'on', label: t('settings.autoContinueSimilarOn') },
    { value: 'off', label: t('settings.autoContinueSimilarOff') },
  ])

  const immersiveViewModeOptions = $derived([
    { value: 'player', label: t('nowPlaying.modeCover') },
    { value: 'lyrics', label: t('nowPlaying.modeLyrics') },
    { value: 'queue', label: t('nowPlaying.modeQueue') },
  ])

  /** @param {string} value */
  function setGaplessFromSegment(value) {
    setGapless(value === 'on')
  }

  /** @param {string} value */
  function setAlbumAmbienceFromSegment(value) {
    setAlbumAmbience(value === 'on')
  }

  /** @param {string} value */
  function setAutoContinueSimilarFromSegment(value) {
    setAutoContinueSimilar(value === 'on')
  }

  /** @param {string} value */
  function setImmersiveViewModeFromSegment(value) {
    if (value === 'player' || value === 'lyrics' || value === 'queue') {
      setImmersiveViewMode(value)
    }
  }

  /** @param {boolean} enabled */
  function setAlbumAmbience(enabled) {
    patchCloudSettings({ albumAmbience: enabled })
    refreshTrackAmbience(
      getCurrentTrack() ?? player.queue[player.index] ?? null,
    )
  }

  /** @param {boolean} enabled */
  function setAutoContinueSimilar(enabled) {
    patchCloudSettings({ autoContinueSimilar: enabled })
  }

  /** @param {string} locale */
  function setLanguage(locale) {
    if (locale === 'zh' || locale === 'en') setLocale(locale)
  }

  async function exportMeta() {
    const data = await exportLibraryJson()
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'musicos-library-meta.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function onSync() {
    if (syncing) return
    syncing = true
    try {
      await syncBidirectionalSafe({ force: true })
      await refreshQueueMetadata()
      await refreshCounts()
    } finally {
      syncing = false
    }
  }

  async function onSignOut() {
    await signOut()
    toast(t('settings.signOut'))
  }

  async function onUploadAudio() {
    if (uploading || !auth.user) return
    if (cloudPending === 0) {
      toast(t('cloudAudio.empty'))
      return
    }
    uploading = true
    uploadProgress = t('cloudAudio.uploading', { done: 0, total: cloudPending })
    uploadCurrent = ''
    try {
      const result = await uploadPendingAudio(({ done, total, title }) => {
        uploadProgress = t('cloudAudio.uploading', { done, total })
        uploadCurrent = title ? t('cloudAudio.current', { title }) : ''
      })
      if (result.uploaded === 0 && result.failed === 0)
        toast(t('cloudAudio.empty'))
      else if (result.failed > 0) {
        toast(
          t('cloudAudio.doneWithFail', {
            uploaded: result.uploaded,
            failed: result.failed,
          }),
        )
      } else {
        toast(
          t('cloudAudio.done', {
            uploaded: result.uploaded,
            size: formatBytes(result.totalBytes),
          }),
        )
      }
      await refreshCounts()
    } finally {
      uploading = false
      uploadProgress = ''
      uploadCurrent = ''
    }
  }

  async function onFetchLyrics() {
    if (fetchingLyrics) return
    fetchingLyrics = true
    lyricsProgress = t('settings.fetchLyricsProgress', {
      done: 0,
      total: missingLyrics,
    })
    try {
      const result = await repairMissingLyrics(
        (done, total) => {
          lyricsProgress = t('settings.fetchLyricsProgress', { done, total })
        },
        undefined,
        { force: true },
      )
      if (!result.total) toast(t('settings.fetchLyricsEmpty'))
      else
        toast(
          t('settings.fetchLyricsDone', {
            total: result.total,
            repaired: result.repaired,
          }),
        )
      await refreshQueueMetadata()
      await refreshCounts()
    } finally {
      fetchingLyrics = false
      lyricsProgress = ''
    }
  }

  async function onRescan() {
    if (rescanning) return
    rescanning = true
    rescanProgress = t('settings.rescanning', { done: 0, total: count })
    try {
      const result = await rescanTrackMetadata((done, total) => {
        rescanProgress = t('settings.rescanning', { done, total })
      })
      if (!result.scanned) toast(t('settings.rescanEmpty'))
      else
        toast(
          t('settings.rescanDone', {
            scanned: result.scanned,
            updated: result.updated,
          }),
        )
      await ensureArtRepaired()
      await ensureMetadataRepaired()
      await refreshQueueMetadata()
      await refreshCounts()
    } finally {
      rescanning = false
      rescanProgress = ''
    }
  }
</script>

<div class="wrap settings-page">
  <section class="settings-block set-group" style="margin-top:0">
    <h3 class="block-title sg-title">{t('settings.account')}</h3>
    {#if auth.user}
      <div class="set-row settings-row">
        <div class="pref-copy">
          <div class="pref-label">{auth.user.email}</div>
          <div class="pref-desc">{t('auth.signedInDesc')}</div>
        </div>
      </div>
      <div class="settings-stack-block settings-stack-block--pad-x">
        <div class="settings-btn-group">
          <button
            class="btn-primary"
            type="button"
            disabled={syncing}
            onclick={onSync}
            >{syncing ? t('auth.pleaseWait') : t('sync.now')}</button
          >
          <button class="btn-secondary" type="button" onclick={onSignOut}
            >{t('settings.signOut')}</button
          >
        </div>
      </div>
    {:else}
      <div class="settings-stack-block settings-stack-block--pad-x">
        <p class="pref-desc" style="margin-bottom:12px">
          {t('sync.signInFirst')}
        </p>
        <a class="btn-primary" href="/auth" style="display:inline-flex"
          >{t('settings.signIn')}</a
        >
      </div>
    {/if}
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('sync.title')}</h3>
    <p class="block-desc block-desc--pad-bottom">
      {cloudStored > 0 ? t('sync.descCloud') : t('sync.desc')}
    </p>
  </section>

  {#if auth.user}
    <section class="settings-block set-group">
      <h3 class="block-title sg-title">{t('cloudAudio.title')}</h3>
      <p class="block-desc block-desc--pad-bottom-sm">
        {t('cloudAudio.desc')}
      </p>
      <div class="set-row settings-row">
        <div class="pref-copy">
          <div class="pref-desc">
            {t('cloudAudio.stats', {
              localAudio: cloudLocalAudio,
              pending: cloudPending,
              size: formatBytes(cloudPendingBytes),
              cloud: cloudStored,
            })}
          </div>
        </div>
      </div>
      <div class="settings-stack-block settings-stack-block--pad-x">
        <button
          class="btn-primary"
          type="button"
          disabled={uploading || cloudPending === 0}
          onclick={onUploadAudio}
        >
          {uploading ? t('auth.pleaseWait') : t('cloudAudio.upload')}
        </button>
        {#if uploadProgress}
          <p class="pref-desc" style="margin-top:12px">{uploadProgress}</p>
        {/if}
        {#if uploadCurrent}
          <p class="pref-desc" style="margin-top:4px;color:var(--t3)">
            {uploadCurrent}
          </p>
        {/if}
      </div>
    </section>

    <section class="settings-block set-group">
      <h3 class="block-title sg-title">{t('settings.recommendationHealth')}</h3>
      <p class="block-desc block-desc--pad-bottom-sm">
        {t('settings.recommendationHealthDesc')}
      </p>
      <div class="set-row settings-row">
        <div class="pref-copy">
          <div class="pref-desc">
            {t('settings.healthPlayEvents', { count: health.playEvents })}
          </div>
          <div class="pref-desc" style="margin-top:4px">
            {t('settings.healthEmbeddings', { count: health.embeddings })}
          </div>
          <div class="pref-desc" style="margin-top:4px">
            {t('settings.healthPendingReviews', {
              count: health.pendingReviews,
            })}
          </div>
        </div>
      </div>
    </section>

    <section class="settings-block set-group">
      <h3 class="block-title sg-title">{t('settings.tagReview')}</h3>
      <p class="block-desc block-desc--pad-bottom-sm">
        {t('settings.tagReviewDesc')}
      </p>
      {#if tagReviews.length === 0}
        <p class="block-desc block-desc--pad-bottom" style="color:var(--t3)">
          {t('settings.tagReviewEmpty')}
        </p>
      {:else}
        <ul class="tag-review-list">
          {#each tagReviews as row (row.id)}
            <li class="tag-review-item">
              <div class="tag-review-main">
                <div class="pref-label">{row.title}</div>
                {#if row.artist}
                  <div class="pref-desc">{row.artist}</div>
                {/if}
                <div class="pref-desc" style="margin-top:4px;color:var(--t3)">
                  {tagReviewReasonLabel(row.reason)}
                </div>
                {#if formatProposedTags(row.proposed_tags)}
                  <div class="pref-desc" style="margin-top:4px">
                    {t('settings.tagReviewTags', {
                      tags: formatProposedTags(row.proposed_tags),
                    })}
                  </div>
                {/if}
              </div>
              <div class="tag-review-actions">
                <button
                  class="btn-primary"
                  type="button"
                  disabled={resolvingReviewId === row.id}
                  onclick={() => onResolveReview(row.id, 'approved')}
                >
                  {t('settings.tagReviewApprove')}
                </button>
                <button
                  class="btn-secondary"
                  type="button"
                  disabled={resolvingReviewId === row.id}
                  onclick={() => onResolveReview(row.id, 'rejected')}
                >
                  {t('settings.tagReviewReject')}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.language')}</h3>
    <SettingsRow label={t('settings.languageLabel')} desc={t('settings.languageDesc')}>
      <SettingsSegment
        options={localeOptions}
        value={S.settings.locale}
        onchange={setLanguage}
        ariaLabel={t('settings.languageLabel')}
      />
    </SettingsRow>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.theme')}</h3>
    <SettingsRow label={t('settings.appearance')}>
      <SettingsSegment
        options={themeOptions}
        value={S.settings.theme}
        onchange={setTheme}
        ariaLabel={t('settings.appearance')}
      />
    </SettingsRow>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.playback')}</h3>
    <p class="block-desc block-desc--pad-bottom-sm">
      {t('settings.gaplessDesc')}
    </p>
    <SettingsRow label={t('settings.gapless')}>
      <SettingsSegment
        options={gaplessOptions}
        value={S.settings.gapless !== false ? 'on' : 'off'}
        onchange={setGaplessFromSegment}
        ariaLabel={t('settings.gapless')}
      />
    </SettingsRow>
    <SettingsRow label={t('settings.crossfade')} desc={t('settings.crossfadeDesc')}>
      <div
        class="seg seg--wrap"
        class:seg--disabled={S.settings.gapless === false}
        role="group"
        aria-label={t('settings.crossfade')}
      >
        {#each crossfadeSteps as ms (ms)}
          <button
            type="button"
            class:active={(S.settings.crossfadeMs ?? 0) === ms}
            disabled={S.settings.gapless === false && ms > 0}
            onclick={() => setCrossfadeMs(ms)}
          >
            {formatCrossfadeLabel(ms)}
          </button>
        {/each}
      </div>
    </SettingsRow>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.albumAmbience')}</h3>
    <p class="block-desc block-desc--pad-bottom-sm">
      {t('settings.albumAmbienceDesc')}
    </p>
    <div class="set-row settings-row settings-row--segment">
      <div class="pref-control">
        <SettingsSegment
          options={albumAmbienceOptions}
          value={S.settings.albumAmbience !== false ? 'on' : 'off'}
          onchange={setAlbumAmbienceFromSegment}
          ariaLabel={t('settings.albumAmbience')}
        />
      </div>
    </div>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.autoContinueSimilar')}</h3>
    <p class="block-desc block-desc--pad-bottom-sm">
      {t('settings.autoContinueSimilarDesc')}
    </p>
    <div class="set-row settings-row settings-row--segment">
      <div class="pref-control">
        <SettingsSegment
          options={autoContinueSimilarOptions}
          value={S.settings.autoContinueSimilar !== false ? 'on' : 'off'}
          onchange={setAutoContinueSimilarFromSegment}
          ariaLabel={t('settings.autoContinueSimilar')}
        />
      </div>
    </div>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.immersiveViewMode')}</h3>
    <p class="block-desc block-desc--pad-bottom-sm">
      {t('settings.immersiveViewModeDesc')}
    </p>
    <div class="set-row settings-row settings-row--segment">
      <div class="pref-control">
        <SettingsSegment
          options={immersiveViewModeOptions}
          value={S.settings.immersiveViewMode ?? 'player'}
          onchange={setImmersiveViewModeFromSegment}
          ariaLabel={t('settings.immersiveViewMode')}
        />
      </div>
    </div>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.playLoadDebug')}</h3>
    <p class="block-desc block-desc--pad-bottom-sm">
      {t('settings.playLoadDebugDesc')}
    </p>
    <div class="set-row settings-row">
      <div class="pref-copy">
        <div class="pref-desc">
          {t('settings.playLoadSamples', { count: playMetricsSummary.count })}
        </div>
        {#if playMetricsSummary.p50Canplay != null}
          <div class="pref-desc">
            {t('settings.playLoadP50', { ms: playMetricsSummary.p50Canplay })}
            ·
            {t('settings.playLoadP95', {
              ms: playMetricsSummary.p95Canplay ?? '—',
            })}
          </div>
        {/if}
        {#if Object.keys(playMetricsSummary.sourceCounts).length}
          <div class="pref-desc">
            {t('settings.playLoadSources', {
              summary: formatSourceCounts(playMetricsSummary.sourceCounts),
            })}
          </div>
        {/if}
        {#if playMetricsSummary.failCount}
          <div class="pref-desc" style="color:var(--danger, #e85d6a)">
            {t('settings.playLoadFails', { count: playMetricsSummary.failCount })}
          </div>
        {/if}
      </div>
      <button type="button" class="btn-ghost" onclick={onClearPlayMetrics}>
        {t('settings.playLoadClear')}
      </button>
    </div>
    <div class="set-row settings-row">
      <div class="pref-copy">
        <div class="pref-label">{t('settings.offlineCache')}</div>
        <div class="pref-desc">{t('settings.offlineCacheDesc')}</div>
        <div class="pref-desc">
          {t('settings.offlineCacheStats', {
            count: offlineCacheCount,
            size: formatBytes(offlineCacheBytes),
          })}
        </div>
      </div>
    </div>
  </section>

  <section class="settings-block set-group">
    <h3 class="block-title sg-title">{t('settings.privacy')}</h3>
    <p class="block-desc block-desc--pad-bottom-xs">
      {t('settings.privacyDesc')}
    </p>
    <p class="block-desc block-desc--pad-bottom" style="color:var(--text-2)">
      {t('settings.iosBackground')}
    </p>
    <div class="set-row settings-row">
      <div class="pref-copy">
        <div class="pref-label">{t('settings.library')}</div>
        <div class="pref-desc">{t('settings.libraryCount', { count })}</div>
        {#if missingLyrics > 0}
          <div
            class="pref-desc"
            style="margin-top:4px;color:var(--track-accent, var(--accent))"
          >
            {t('settings.missingLyrics', { count: missingLyrics })}
          </div>
        {/if}
      </div>
    </div>
    <div class="settings-stack-block settings-library-actions">
      <p class="pref-desc settings-action-hint">
        {t('settings.rescanMetaDesc')}
      </p>
      <div class="settings-btn-group">
        <button
          class="btn-primary"
          type="button"
          disabled={rescanning || count === 0}
          onclick={onRescan}
        >
          {rescanning ? t('auth.pleaseWait') : t('settings.rescanMeta')}
        </button>
      </div>
      {#if rescanProgress}
        <p class="pref-desc" style="margin-top:12px">{rescanProgress}</p>
      {/if}

      <p class="pref-desc settings-action-hint" style="margin-top:16px">
        {t('settings.fetchLyricsDesc')}
      </p>
      <div class="settings-btn-group">
        <button
          class="btn-secondary"
          type="button"
          disabled={fetchingLyrics || missingLyrics === 0}
          onclick={onFetchLyrics}
        >
          {fetchingLyrics ? t('auth.pleaseWait') : t('settings.fetchLyrics')}
        </button>
        <button class="btn-secondary" type="button" onclick={exportMeta}
          >{t('settings.export')}</button
        >
      </div>
      {#if lyricsProgress}
        <p class="pref-desc" style="margin-top:12px">{lyricsProgress}</p>
      {/if}
    </div>
  </section>

  <p class="set-note">{t('settings.version')}</p>
</div>
