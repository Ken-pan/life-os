<script>
  // 云端扫描列表 + 拉取(设置页「当前户型」区内使用,登录后可见)。
  // 默认只并机位照片:手工量过的户型比 RoomPlan 准,不该被扫描覆盖。
  // 「摆家具」把实测家具映射进现有户型(墙体不动);「整包替换」才动户型,慎用。
  // 三种模式都可在会话内一键还原。
  import { listScans, pullScan } from '$lib/cloud-scan.js'
  import { describeFurniturePull, SEEN_SCAN_KEY } from '$lib/cloud-scan-report.js'
  import {
    applyCloudScan,
    canUndoCloudScan,
    undoCloudScan,
    getActiveProject,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'

  /** @type {import('$lib/cloud-scan.js').ScanRow[] | null} */
  let scans = $state(null)
  let loading = $state(false)
  let pullingId = $state('')
  let progress = $state('')
  let error = $state('')
  let undoAvailable = $state(false)
  /** @type {import('$lib/cloud-scan.js').PullMode} */
  let mode = $state('photos')

  const MODES = [
    {
      value: 'photos',
      label: '只加照片与状态',
      desc: '户型和家具都不动，只把这次拍的机位照片并进来（日常用这个）',
    },
    {
      value: 'furniture',
      label: '照片 + 摆家具',
      desc: '墙体仍不动；把实测家具摆进现有户型，位置重合的手录家具让位给实测的',
    },
    {
      value: 'replace',
      label: '整包换成扫描户型',
      desc: '连墙体一起替换。扫描有漂移，量过的户型通常更准 —— 除非你想重来',
    },
  ]

  async function refresh() {
    loading = true
    error = ''
    try {
      scans = await listScans()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      scans = null
    } finally {
      loading = false
    }
  }

  /** @param {import('$lib/cloud-scan.js').ScanRow} scan */
  async function onPull(scan) {
    if (pullingId) return
    const name = scan.label || '未命名扫描'
    const confirmMsg = {
      photos: `把「${name}」的机位照片并进来?户型与家具不变。`,
      furniture: `把「${name}」的实测家具摆进当前户型?墙体不动;位置重合的手录家具会让位给实测的。\n建议先在下方「布局备份」导出 JSON。`,
      replace: `⚠️ 将用「${name}」整包替换当前户型(墙体、家具、储物区全换)。\n扫描有漂移,量过的户型通常更准。务必先导出 JSON 备份。确定?`,
    }[mode]
    if (!confirm(confirmMsg)) return

    pullingId = scan.id
    progress = '拉取中…'
    error = ''
    try {
      const { project, photos, report, replaced, identity } = await pullScan(
        getActiveProject(),
        scan.id,
        {
          mode,
          onProgress: (done, total) => {
            progress = `下载照片 ${done}/${total}…`
          },
        },
      )
      applyCloudScan(project)
      undoAvailable = canUndoCloudScan()
      // 处理过就别再在 /plan 弹「新扫描」横幅了
      localStorage.setItem(SEEN_SCAN_KEY, scan.id)
      if (mode === 'furniture' && report) {
        const { main, warns } = describeFurniturePull({ report, replaced, identity, photos })
        for (const w of warns) toast(w, 'error')
        toast(main)
      } else if (photos.failed > 0) {
        toast(`${photos.failed} 张照片下载失败,对应机位保留为空视角`, 'error')
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      pullingId = ''
      progress = ''
    }
  }

  function onUndo() {
    undoCloudScan()
    undoAvailable = canUndoCloudScan()
  }

  /** @param {number} ms */
  function dateLabel(ms) {
    try {
      return new Date(ms).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }
</script>

<div class="scan-picker">
  {#if scans === null}
    <button
      type="button"
      class="btn-secondary"
      onclick={refresh}
      disabled={loading}
    >
      {loading ? '加载中…' : '查看云端扫描'}
    </button>
  {:else if scans.length === 0}
    <p class="scan-empty">云端还没有扫描。用 iPhone 上的 HomeScan 扫一次再来。</p>
    <button type="button" class="btn-secondary" onclick={refresh}>刷新</button>
  {:else}
    <fieldset class="modes">
      <legend class="modes-legend">拉取方式</legend>
      {#each MODES as m (m.value)}
        <label class="mode" class:mode-on={mode === m.value}>
          <input type="radio" name="pullmode" value={m.value} bind:group={mode} />
          <span class="mode-text">
            <span class="mode-label">{m.label}</span>
            <span class="mode-desc">{m.desc}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    <ul class="scan-list">
      {#each scans as scan (scan.id)}
        <li class="scan-item">
          <div class="scan-info">
            <span class="scan-name">{scan.label || '未命名扫描'}</span>
            <span class="scan-meta">
              {dateLabel(scan.updated_at)}{scan.device ? ` · ${scan.device}` : ''}
            </span>
          </div>
          <button
            type="button"
            class="btn-primary scan-pull"
            disabled={Boolean(pullingId)}
            onclick={() => onPull(scan)}
          >
            {pullingId === scan.id ? progress || '拉取中…' : '拉取'}
          </button>
        </li>
      {/each}
    </ul>
    <button type="button" class="btn-secondary" onclick={refresh} disabled={loading}>
      刷新
    </button>
  {/if}

  {#if undoAvailable}
    <button type="button" class="btn-secondary" onclick={onUndo}>
      还原扫描前的户型
    </button>
  {/if}

  {#if error}
    <p class="scan-error">{error}</p>
  {/if}
</div>

<style>
  .scan-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .scan-list {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .modes {
    border: 1px solid var(--line, rgba(128, 128, 128, 0.25));
    border-radius: 8px;
    padding: 8px 10px 10px;
    margin: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .modes-legend {
    font-size: 11px;
    font-weight: 700;
    color: var(--t3, var(--t2));
    padding: 0 4px;
  }

  .mode {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
  }

  .mode-on {
    background: rgba(128, 128, 128, 0.1);
  }

  .mode-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .mode-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--t1);
  }

  .mode-desc {
    font-size: 11px;
    color: var(--t3, var(--t2));
    line-height: 1.4;
  }

  .scan-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid var(--line, rgba(128, 128, 128, 0.25));
    border-radius: 8px;
  }

  .scan-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .scan-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--t1);
  }

  .scan-meta {
    font-size: 12px;
    color: var(--t3, var(--t2));
  }

  .scan-pull {
    flex-shrink: 0;
  }

  .scan-empty {
    font-size: 13px;
    color: var(--t2);
    margin: 0;
  }

  .scan-error {
    font-size: 13px;
    color: var(--danger, #c0392b);
    margin: 0;
  }
</style>
