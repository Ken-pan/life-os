<script>
  // 云端扫描列表 + 拉取(设置页「当前户型」区内使用,登录后可见)。
  // 默认只并机位照片:手工量过的户型比 RoomPlan 准,不该被扫描覆盖。
  // 「摆家具」把实测家具映射进现有户型(墙体不动);「整包替换」才动户型,慎用。
  // 三种模式都可在会话内一键还原。
  import { listScans, pullScan } from '$lib/cloud-scan.js'
  import { describeFurniturePull, SEEN_SCAN_KEY, APPLIED_COPY_KEY, scanSeenValue } from '$lib/cloud-scan-report.js'
  import { mergeFurnitureWithIdentity } from '$lib/spatial/scan-merge.js'
  import {
    applyCloudScan,
    canUndoCloudScan,
    logScanIdentityEvents,
    undoCloudScan,
    getActiveProject,
    isStructureLocked,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import ScanMergeReview from './ScanMergeReview.svelte'

  /** @type {import('$lib/cloud-scan.js').ScanRow[] | null} */
  let scans = $state(null)
  let loading = $state(false)
  let pullingId = $state('')
  let progress = $state('')
  let error = $state('')
  let undoAvailable = $state(false)
  /** @type {import('$lib/cloud-scan.js').PullMode} */
  let mode = $state('furniture')
  /** 逐项确认:摆家具有实质修改时先弹清单({ res, scan }) */
  let review = $state(null)
  /** 结构锁定时「整包替换」不该出现 —— 它会拿扫描墙覆盖已确定的户型 */
  const structureLocked = $derived(isStructureLocked())
  const modes = $derived(
    structureLocked ? MODES.filter((m) => m.value !== 'replace') : MODES,
  )

  const MODES = [
    {
      value: 'furniture',
      label: '照片 + 摆家具',
      desc: '墙体不动；每处修改（挪动/新增/替换）逐项确认后才落地（日常用这个）',
    },
    {
      value: 'photos',
      label: '只加照片与状态',
      desc: '户型和家具都不动，只把这次拍的机位照片并进来',
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
    // 结构锁定时绝不整包替换 —— 户型已按实测确定,只更新搭在上面的家具
    if (structureLocked && mode === 'replace') mode = 'furniture'
    const name = scan.label || '未命名扫描'
    // 摆家具不再用一句话大包大揽地 confirm:拉取后每处修改逐项确认
    if (mode !== 'furniture') {
      const confirmMsg = {
        photos: `把「${name}」的机位照片并进来?户型与家具不变。`,
        replace: `⚠️ 将用「${name}」整包替换当前户型(墙体、家具、储物区全换)。\n扫描有漂移,量过的户型通常更准。务必先导出 JSON 备份。确定?`,
      }[mode]
      if (!confirm(confirmMsg)) return
    }

    pullingId = scan.id
    progress = '拉取中…'
    error = ''
    try {
      const res = await pullScan(getActiveProject(), scan.id, {
        mode,
        onProgress: (done, total) => {
          progress = `下载照片 ${done}/${total}…`
        },
      })
      if (mode === 'furniture') {
        // 有实质修改(挪动/新增/替换)先逐项确认,一件不落地
        const id = res.identity
        const actionable =
          (id?.moved?.length ?? 0) + (id?.addedItems?.length ?? 0) + (id?.replaced?.length ?? 0)
        if (actionable > 0) {
          review = { res, scan }
          return
        }
        applyFurniture(res, scan)
        return
      }
      applyCloudScan(res.project)
      undoAvailable = canUndoCloudScan()
      // 处理过就别再在 /plan 弹「新扫描」横幅了
      localStorage.setItem(SEEN_SCAN_KEY, scanSeenValue(scan))
      // 整包应用优化副本 = 订阅自动跟进
      if (mode === 'replace' && scan.device === 'server-optimized') {
        localStorage.setItem(APPLIED_COPY_KEY, scanSeenValue(scan))
      }
      if (res.photos.failed > 0) {
        toast(`${res.photos.failed} 张照片下载失败,对应机位保留为空视角`, 'error')
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      pullingId = ''
      progress = ''
    }
  }

  /** 摆家具落地(直接或逐项确认后) */
  function applyFurniture(res, scan) {
    applyCloudScan(res.project)
    undoAvailable = canUndoCloudScan()
    localStorage.setItem(SEEN_SCAN_KEY, scanSeenValue(scan))
    // 事件流(能力17):扫描确认/挪动/新增/消失都是事实,进追加日志
    logScanIdentityEvents(res.identity)
    const { main, warns } = describeFurniturePull(res)
    for (const w of warns) toast(w, 'error')
    toast(main)
    review = null
  }

  /** 逐项确认收尾:按勾选重算合并(照片已在本地,不重新下载) */
  function confirmReview(decisions) {
    if (!review) return
    const { res, scan } = review
    const hasReject =
      Object.keys(decisions.moves ?? {}).length ||
      Object.keys(decisions.adds ?? {}).length ||
      Object.keys(decisions.replaces ?? {}).length
    if (!hasReject) {
      applyFurniture(res, scan)
      return
    }
    const merged = mergeFurnitureWithIdentity(getActiveProject(), res.mapped, { decisions })
    applyFurniture({ ...res, project: merged.project, identity: merged.identity }, scan)
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

{#if review}
  <ScanMergeReview
    identity={review.res.identity}
    registration={review.res.report?.registration}
    onConfirm={confirmReview}
    onCancel={() => (review = null)}
  />
{/if}

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
      {#each modes as m (m.value)}
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
