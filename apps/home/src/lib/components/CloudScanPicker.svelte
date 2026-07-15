<script>
  // 云端扫描列表 + 拉取(设置页「当前户型」区内使用,登录后可见)。
  // 拉取 = 破坏性整包替换,confirm 提示先导出 JSON;会话内可一键还原。
  import { listScans, pullScan } from '$lib/cloud-scan.js'
  import {
    applyCloudScan,
    canUndoCloudScan,
    undoCloudScan,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'

  /** @type {import('$lib/cloud-scan.js').ScanRow[] | null} */
  let scans = $state(null)
  let loading = $state(false)
  let pullingId = $state('')
  let progress = $state('')
  let error = $state('')
  let undoAvailable = $state(false)

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
    if (
      !confirm(
        `将用「${name}」替换当前户型与家具布局(储物区将清空)。\n建议先在下方「布局备份」导出 JSON。继续?`,
      )
    ) {
      return
    }
    pullingId = scan.id
    progress = '拉取中…'
    error = ''
    try {
      const { project, photos } = await pullScan(scan.id, (done, total) => {
        progress = `下载照片 ${done}/${total}…`
      })
      applyCloudScan(project)
      undoAvailable = canUndoCloudScan()
      if (photos.failed > 0) {
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
