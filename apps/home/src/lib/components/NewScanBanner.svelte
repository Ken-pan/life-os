<script>
  // /plan 顶部的「新扫描」横幅 —— 扫完手机上传后,打开网页第一眼就能
  // 一键把实测家具摆进户型,不用钻进设置页选模式。
  // 只在登录后出现;拉过/忽略过的扫描(SEEN_SCAN_KEY)不再提示。
  import { auth } from '$lib/auth.svelte.js'
  import { listScans, pullScan } from '$lib/cloud-scan.js'
  import { describeFurniturePull, SEEN_SCAN_KEY, APPLIED_COPY_KEY, scanSeenValue } from '$lib/cloud-scan-report.js'
  import { mergeFurnitureWithIdentity } from '$lib/spatial/scan-merge.js'
  import {
    applyCloudScan,
    getActiveProject,
    logScanIdentityEvents,
    undoCloudScan,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import ScanMergeReview from './ScanMergeReview.svelte'

  /** @type {import('$lib/cloud-scan.js').ScanRow | null} */
  let scan = $state(null)
  let pulling = $state(false)
  let progress = $state('')
  /** 逐项确认:摆家具前把每处修改摆出来等用户勾选(res = pullScan 全接受结果) */
  let review = $state(null)

  /** 本次页面已尝试过自动跟进(失败也不再重试,防循环) */
  let autoTried = false

  $effect(() => {
    if (!auth.user) {
      scan = null
      return
    }
    let alive = true
    listScans()
      .then((rows) => {
        if (!alive || !rows?.length) return
        const newest = rows[0]
        const seen = localStorage.getItem(SEEN_SCAN_KEY)
        const applied = localStorage.getItem(APPLIED_COPY_KEY)
        // 强制推送:应用过任意一版优化副本(= 订阅)的设备,云端副本
        // 一更新就自动整包跟进 —— 不用每台设备逐次点「应用」。可撤销。
        const subscribed =
          applied ||
          /server-optimized/.test(getActiveProject()?.meta?.sourceNote ?? '')
        if (
          newest.device === 'server-optimized' &&
          subscribed &&
          scanSeenValue(newest) !== applied &&
          !autoTried
        ) {
          autoTried = true
          scan = newest
          place({ auto: true })
          return
        }
        if (scanSeenValue(newest) !== seen) scan = newest
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
    if (scan) localStorage.setItem(SEEN_SCAN_KEY, scanSeenValue(scan))
    scan = null
  }

  /** 优化副本是「整包」性质(含墙体/储藏区),摆家具式合并会做出两套户型的乱炖 */
  const isOptimizedCopy = $derived(scan?.device === 'server-optimized')

  async function place({ auto = false } = {}) {
    if (!scan || pulling) return
    const mode = isOptimizedCopy ? 'replace' : 'furniture'
    // 自动跟进(订阅态)不弹确认 —— 用户已在首次应用时给过授权;可撤销
    if (!auto && mode === 'replace' && !confirm(
      `应用「${scan.label || '优化副本'}」将整包替换当前户型(墙体、家具、储藏区)。可撤销。继续?`,
    )) return
    pulling = true
    progress = '拉取中…'
    try {
      const res = await pullScan(getActiveProject(), scan.id, {
        mode,
        onProgress: (done, total) => {
          progress = `下载照片 ${done}/${total}…`
        },
      })
      // 摆家具必须建立在配准成功之上 —— 对不齐时拒绝合并,
      // 而不是让比例回退把家具摆出两套坐标系的乱炖(实测撞过)
      const reg = res.report?.registration
      if (mode === 'furniture' && reg && reg.status !== 'ok') {
        localStorage.setItem(SEEN_SCAN_KEY, scanSeenValue(scan))
        scan = null
        toast(
          `这次扫描与当前户型对不上(${reg.reason ?? '配准未过门'}),已取消自动摆入。` +
            '如果要整包换成这次扫描,去 设置 → 云端扫描。',
          'error',
        )
        return
      }
      if (mode === 'replace') {
        applyCloudScan(res.project)
        localStorage.setItem(SEEN_SCAN_KEY, scanSeenValue(scan))
        // 订阅标记:此后云端每次更新副本,本设备自动跟进
        localStorage.setItem(APPLIED_COPY_KEY, scanSeenValue(scan))
        toast(auto ? '户型已自动更新到最新优化副本' : '已应用优化副本(户型+家具+储藏区)', {
          actionLabel: '撤销',
          onAction: () => undoCloudScan(),
          duration: 10000,
        })
        scan = null
        return
      }
      // 摆家具:有实质修改(挪动/新增/替换)先逐项确认,一件不落地;
      // 只有照片/原位确认这类无争议更新才直接应用
      const id = res.identity
      const actionable =
        (id?.moved?.length ?? 0) + (id?.addedItems?.length ?? 0) + (id?.replaced?.length ?? 0)
      if (actionable > 0) {
        review = res
        return
      }
      applyFurniture(res)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      pulling = false
      progress = ''
    }
  }

  /** 摆家具落地(直接应用或逐项确认后):@param res pullScan 结果(或重算后的等价物) */
  function applyFurniture(res) {
    applyCloudScan(res.project)
    if (scan) localStorage.setItem(SEEN_SCAN_KEY, scanSeenValue(scan))
    // 事件流(能力17):这次扫描确认/发现了什么,进追加日志
    logScanIdentityEvents(res.identity)
    const { main, warns } = describeFurniturePull(res)
    for (const w of warns) toast(w, 'error')
    toast(main, {
      actionLabel: '撤销',
      onAction: () => undoCloudScan(),
      duration: 10000,
    })
    scan = null
    review = null
  }

  /** 逐项确认收尾:按用户勾选重算合并(照片已在本地,不重新下载) */
  function confirmReview(decisions) {
    if (!review) return
    const hasReject =
      Object.keys(decisions.moves ?? {}).length ||
      Object.keys(decisions.adds ?? {}).length ||
      Object.keys(decisions.replaces ?? {}).length
    if (!hasReject) {
      applyFurniture(review)
      return
    }
    const merged = mergeFurnitureWithIdentity(getActiveProject(), review.mapped, { decisions })
    applyFurniture({ ...review, project: merged.project, identity: merged.identity })
  }
</script>

{#if review}
  <ScanMergeReview
    identity={review.identity}
    registration={review.report?.registration}
    onConfirm={confirmReview}
    onCancel={() => (review = null)}
  />
{/if}

{#if scan}
  <div class="new-scan-banner" role="note">
    <div class="new-scan-copy">
      <strong>{isOptimizedCopy ? '优化副本' : '新扫描'}{when ? ` · ${when}` : ''}</strong>
      <span>
        {isOptimizedCopy
          ? '整包应用:墙体、家具、储藏区一起换成整备好的版本,可撤销。'
          : '实测家具与照片还没进这张图 —— 墙体不动,每处修改过目确认后摆进来,可撤销。'}
      </span>
    </div>
    <div class="new-scan-actions">
      <button type="button" class="new-scan-cta" disabled={pulling} onclick={place}>
        {pulling ? progress || '拉取中…' : isOptimizedCopy ? '应用优化副本' : '摆进户型'}
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
