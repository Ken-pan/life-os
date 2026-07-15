<script>
  // /plan 顶部的「新扫描」横幅 —— 扫完手机上传后,打开网页第一眼就能
  // 一键把实测家具摆进户型,不用钻进设置页选模式。
  // 只在登录后出现;拉过/忽略过的扫描(SEEN_SCAN_KEY)不再提示。
  import { auth } from '$lib/auth.svelte.js'
  import { listScans, pullScan } from '$lib/cloud-scan.js'
  import { describeFurniturePull, SEEN_SCAN_KEY } from '$lib/cloud-scan-report.js'
  import {
    applyCloudScan,
    getActiveProject,
    undoCloudScan,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'

  /** @type {import('$lib/cloud-scan.js').ScanRow | null} */
  let scan = $state(null)
  let pulling = $state(false)
  let progress = $state('')

  $effect(() => {
    if (!auth.user) {
      scan = null
      return
    }
    let alive = true
    listScans()
      .then((rows) => {
        if (!alive || !rows?.length) return
        const seen = localStorage.getItem(SEEN_SCAN_KEY)
        if (rows[0].id !== seen) scan = rows[0]
      })
      .catch(() => {}) // 网络/权限问题不打扰画图
    return () => {
      alive = false
    }
  })

  const when = $derived.by(() => {
    if (!scan?.updated_at) return ''
    const d = new Date(scan.updated_at)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  function dismiss() {
    if (scan) localStorage.setItem(SEEN_SCAN_KEY, scan.id)
    scan = null
  }

  async function place() {
    if (!scan || pulling) return
    pulling = true
    progress = '拉取中…'
    try {
      const res = await pullScan(getActiveProject(), scan.id, {
        mode: 'furniture',
        onProgress: (done, total) => {
          progress = `下载照片 ${done}/${total}…`
        },
      })
      applyCloudScan(res.project)
      localStorage.setItem(SEEN_SCAN_KEY, scan.id)
      const { main, warns } = describeFurniturePull(res)
      for (const w of warns) toast(w, 'error')
      toast(main, {
        actionLabel: '撤销',
        onAction: () => undoCloudScan(),
        duration: 10000,
      })
      scan = null
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      pulling = false
      progress = ''
    }
  }
</script>

{#if scan}
  <div class="new-scan-banner" role="note">
    <div class="new-scan-copy">
      <strong>新扫描{when ? ` · ${when}` : ''}</strong>
      <span>实测家具与照片还没进这张图 —— 墙体不动,一键摆进来,可撤销。</span>
    </div>
    <div class="new-scan-actions">
      <button type="button" class="new-scan-cta" disabled={pulling} onclick={place}>
        {pulling ? progress || '拉取中…' : '摆进户型'}
      </button>
      <button
        type="button"
        class="new-scan-dismiss"
        disabled={pulling}
        onclick={dismiss}
        aria-label="忽略这次扫描"
      >
        忽略
      </button>
    </div>
  </div>
{/if}

<style>
  .new-scan-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 8px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--graph-accent, #4f7c66) 45%, var(--border));
    background: color-mix(in srgb, var(--graph-accent, #4f7c66) 8%, var(--card));
  }

  .new-scan-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .new-scan-copy strong {
    font-size: 13px;
    color: var(--t1);
  }

  .new-scan-copy span {
    font-size: 12px;
    color: var(--t2);
  }

  .new-scan-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .new-scan-cta {
    font-size: 13px;
    font-weight: 650;
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--graph-accent, #4f7c66) 55%, var(--border));
    background: color-mix(in srgb, var(--graph-accent, #4f7c66) 18%, var(--bg));
    color: var(--t1);
    cursor: pointer;
  }

  .new-scan-cta:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .new-scan-dismiss {
    font-size: 12px;
    min-height: 36px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }
</style>
