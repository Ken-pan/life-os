<script>
  import { onMount } from 'svelte'
  import {
    MAX_TRUSTED_DEVICES,
    deviceClassLabel,
    listTrustedDevices,
  } from '@life-os/sync'
  import { supabase } from '$lib/supabase.js'
  import { PORTAL_APPS } from '$lib/apps.js'

  /** @typedef {{
   *   id: string,
   *   label: string,
   *   device_class: 'desktop'|'mobile',
   *   platform?: string|null,
   *   paired_at?: string|null,
   *   last_seen_at?: string|null,
   *   public_key?: string|null,
   *   key_storage?: string|null,
   * }} TrustedDeviceRow */

  const plannerOrigin =
    PORTAL_APPS.find((a) => a.id === 'planner')?.url ?? 'https://plan.kenos.space'

  /** @type {TrustedDeviceRow[]} */
  let devices = $state([])
  let loading = $state(true)
  let err = $state(/** @type {string|null} */ (null))
  let busyId = $state(/** @type {string|null} */ (null))
  let hangupBusy = $state(false)

  async function refresh() {
    loading = true
    err = null
    try {
      devices = /** @type {TrustedDeviceRow[]} */ (await listTrustedDevices(supabase))
    } catch (e) {
      err = e instanceof Error ? e.message : '无法加载信任设备'
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

  /** @param {TrustedDeviceRow} row */
  function metaLine(row) {
    const parts = [
      deviceClassLabel(row.device_class),
      row.platform || null,
      row.key_storage === 'secure_enclave' ? 'Secure Enclave' : null,
      row.public_key ? '已配对（免登）' : '浏览器槽',
    ].filter(Boolean)
    return parts.join(' · ')
  }

  /** @param {string|null|undefined} iso */
  function fmt(iso) {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  async function authHeaders() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    const access = sessionData.session?.access_token
    if (!access) throw new Error('未登录')
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access}`,
    }
  }

  /** Lost-phone: revoke every slot + global sign-out. */
  async function handleHangupAll() {
    const ok = window.confirm(
      '挂失全部设备？将撤销 iPhone/Mac 配对、踢掉所有会话，你需要重新登录并重新配对。',
    )
    if (!ok) return
    hangupBusy = true
    err = null
    try {
      const res = await fetch(`${plannerOrigin}/api/device/hangup`, {
        method: 'POST',
        headers: await authHeaders(),
        body: '{}',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (payload?.error === 'step_up_required') {
          throw new Error(payload.message || '会话过旧，请重新登录后再挂失')
        }
        throw new Error(payload.message || payload.error || `挂失失败（HTTP ${res.status}）`)
      }
      // Global sign-out likely invalidates this tab — force local sign-out.
      await supabase.auth.signOut()
      devices = []
    } catch (e) {
      err = e instanceof Error ? e.message : '挂失失败'
    } finally {
      hangupBusy = false
    }
  }

  /**
   * Hardened revoke via Planner /api/device/revoke:
   * fresh session step-up + soft revoke + signOut others + audit.
   * @param {TrustedDeviceRow} row
   */
  async function handleRevoke(row) {
    const ok = window.confirm(
      `撤销「${row.label}」？该设备下次将无法免登换票，且其他会话会被踢下线（当前页保留）。若提示会话过旧，请重新登录后再试。`,
    )
    if (!ok) return
    busyId = row.id
    err = null
    try {
      const res = await fetch(`${plannerOrigin}/api/device/revoke`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ id: row.id }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (payload?.error === 'step_up_required') {
          throw new Error(payload.message || '会话过旧，请重新登录后再撤销设备')
        }
        throw new Error(payload.message || payload.error || `撤销失败（HTTP ${res.status}）`)
      }
      await refresh()
    } catch (e) {
      err = e instanceof Error ? e.message : '撤销失败'
    } finally {
      busyId = null
    }
  }
</script>

<section class="portal-devices" aria-labelledby="portal-devices-title">
  <h2 id="portal-devices-title" class="portal-section-label">信任设备</h2>
  <div class="settings-block portal-settings-block">
    <p class="portal-settings-hint">
      仅 iPhone 与 Mac 上的 Korben App 可配对免登（最多 {MAX_TRUSTED_DEVICES} 台：1
      手机 + 1 电脑）。撤销会失效该设备私钥换票，并踢掉其他会话。浏览器 / PWA
      仍需账号登录。手机丢失请用「挂失全部」。
    </p>
    <div class="portal-devices-actions">
      <button
        type="button"
        class="portal-devices-hangup"
        disabled={hangupBusy || loading}
        onclick={() => handleHangupAll()}
      >
        {hangupBusy ? '挂失中…' : '挂失全部设备'}
      </button>
    </div>
    {#if err}
      <p class="portal-devices-error" role="alert">{err}</p>
    {/if}
    {#if loading}
      <p class="portal-settings-hint">加载中…</p>
    {:else if devices.length === 0}
      <p class="portal-settings-hint">尚无信任设备。在 Korben App 登录一次即可配对本机。</p>
    {:else}
      <ul class="portal-devices-list">
        {#each devices as d (d.id)}
          <li class="portal-devices-row">
            <div class="portal-devices-main">
              <span class="portal-devices-label">{d.label}</span>
              <span class="portal-settings-hint">{metaLine(d)}</span>
              <span class="portal-settings-hint">
                配对 {fmt(d.paired_at)} · 最近 {fmt(d.last_seen_at)}
              </span>
            </div>
            <button
              type="button"
              class="portal-devices-revoke"
              disabled={busyId === d.id}
              onclick={() => handleRevoke(d)}
            >
              {busyId === d.id ? '撤销中…' : '撤销'}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .portal-settings-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .portal-devices-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .portal-devices-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .portal-devices-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .portal-devices-label {
    font-weight: 600;
  }

  .portal-devices-actions {
    display: flex;
    gap: var(--space-2);
  }

  .portal-devices-hangup,
  .portal-devices-revoke {
    flex-shrink: 0;
    border: 1px solid var(--border-subtle, currentColor);
    background: transparent;
    border-radius: var(--radius-2, 8px);
    padding: 0.35rem 0.75rem;
    cursor: pointer;
  }

  .portal-devices-hangup {
    border-color: var(--color-critical, #b91c1c);
    color: var(--color-critical, #b91c1c);
  }

  .portal-devices-revoke:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .portal-devices-error {
    color: var(--color-critical, #b91c1c);
    margin: 0;
  }
</style>
