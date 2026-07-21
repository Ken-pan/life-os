<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase.js'
  import {
    describeThisBrowser,
    deviceClassLabel,
    isThisDeviceSlot,
    listDevices,
    MAX_DEVICES,
    removeDevice,
  } from '$lib/devices'
  import { t } from '$lib/i18n.svelte.js'
  import { formatDateTimeForIntl } from '$lib/format.js'

  /** @type {import('$lib/devices').DeviceRow[]} */
  let devices = $state([])
  let email = $state('')
  let loading = $state(true)
  let err = $state(null)

  async function refresh() {
    loading = true
    err = null
    try {
      const [list, user] = await Promise.all([listDevices(), supabase.auth.getUser()])
      devices = list
      email = user.data.user?.email ?? ''
    } catch (e) {
      err = e instanceof Error ? e.message : t('device.loadFailed')
    } finally {
      loading = false
    }
  }

  onMount(() => {
    const timer = setTimeout(() => {
      void refresh()
    }, 0)
    return () => clearTimeout(timer)
  })

  /** @param {string} id */
  async function handleRemove(id) {
    const row = devices.find((d) => d.id === id)
    const thisSlot = row ? isThisDeviceSlot(row) : false
    const msg = thisSlot
      ? t('device.confirmThisSlot', {
          label: row ? deviceClassLabel(row.device_class) : t('device.thisDevice'),
        })
      : t('device.confirmOther')
    if (!window.confirm(msg)) return
    try {
      await removeDevice(id)
      if (thisSlot) {
        await supabase.auth.signOut()
        return
      }
      await refresh()
    } catch (e) {
      err = e instanceof Error ? e.message : t('device.removeFailed')
    }
  }

  /** @param {string | null} s */
  function fmt(s) {
    return s ? formatDateTimeForIntl(s) : '—'
  }
</script>

<div id="cloud" class="card">
  <div class="card-head">
    <h3 class="flush">{t('device.title')}</h3>
    <button type="button" class="icon-btn" onclick={() => supabase.auth.signOut()}>
      {t('device.signOut')}
    </button>
  </div>
  <p class="muted-note">
    {t('device.intro', {
      email: email || '—',
      max: String(MAX_DEVICES),
      used: String(devices.length),
    })}
  </p>
  <p class="muted-note">{t('device.ssoHint')}</p>

  {#if err}
    <p class="text-critical">{err}</p>
  {/if}
  {#if loading}
    <p class="muted-note">{t('device.loading')}</p>
  {:else}
    <div class="list">
      {#if devices.length === 0}
        <div class="kv">
          <span class="text-secondary">{t('device.empty')}</span>
        </div>
      {/if}
      {#each devices as d (d.id)}
        <div class="kv">
          <span class="k">
            {d.label}
            {#if isThisDeviceSlot(d)}
              <span class="tag accent">
                {t('device.current', { browser: describeThisBrowser() })}
              </span>
            {/if}
          </span>
          <span class="text-secondary device-meta">
            {t('device.authorized', {
              created: fmt(d.created_at),
              lastSeen: fmt(d.last_seen_at),
            })}
          </span>
          <button type="button" class="icon-btn" onclick={() => handleRemove(d.id)}>
            {t('device.remove')}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
