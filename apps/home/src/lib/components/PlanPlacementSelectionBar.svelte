<script>
  import {
    getActiveProject,
    removePlacement,
    rotatePlacementById,
    updatePlacement,
  } from '$lib/state.svelte.js'
  import { inchesToPx, pxToInches } from '$lib/spatial/placements.js'
  import { getPhotoBlob, getPhotoUrl } from '$lib/photo-store.js'
  import { probeVlm, describeFurniture } from '$lib/vlm.js'

  /** @type {{
   *   placement: import('$lib/spatial/types.js').SpatialPlacement,
   *   compact?: boolean,
   *   onClear?: () => void,
   * }} */
  let { placement, compact = false, onClear } = $props()

  let detailsOpen = $state(false)
  let wDraft = $state('')
  let hDraft = $state('')

  // Placements are stored in plan px; this bar talks inches throughout.
  // getActiveProject() rebuilds the whole plan, so bind it once.
  const project = $derived(getActiveProject())
  const pxPerFt = $derived(
    project.wallGraph?.pxPerFt ?? project.layoutConfig?.pxPerFt ?? 36,
  )
  const wIn = $derived(Math.round(pxToInches(placement.w, pxPerFt)))
  const hIn = $derived(Math.round(pxToInches(placement.h, pxPerFt)))

  // 扫描带来的外观信息(没有就整段不显示)
  const attrs = $derived(placement.attrs ?? null)
  const tallIn = $derived(
    attrs?.heightIn ? Math.round(attrs.heightIn) : null,
  )

  // LiDAR 实测脚印真值(英寸)。用户旋转过的话 w/h 已互换,
  // 按「哪个朝向更接近当前值」决定比对/恢复的方向。
  const measured = $derived.by(() => {
    const mW = attrs?.measuredWIn
    const mH = attrs?.measuredHIn
    if (!mW || !mH) return null
    const direct = Math.abs(wIn - mW) + Math.abs(hIn - mH)
    const swapped = Math.abs(wIn - mH) + Math.abs(hIn - mW)
    const [w, h] = swapped < direct ? [mH, mW] : [mW, mH]
    return { w, h, drifted: Math.abs(wIn - w) > 0.5 || Math.abs(hIn - h) > 0.5 }
  })
  const lowConfidence = $derived(attrs?.confidence === 'low')

  function restoreMeasured() {
    if (!measured) return
    updatePlacement(placement.id, {
      w: inchesToPx(measured.w, pxPerFt),
      h: inchesToPx(measured.h, pxPerFt),
    })
  }
  /** 外观一行话:样式 · 材质 · 颜色(有什么拼什么) */
  const lookText = $derived(
    [attrs?.styleZh, attrs?.material, attrs?.colorZh]
      .filter(Boolean)
      .join(' · '),
  )

  // 家具实拍缩略图(IndexedDB blob URL,换家具时换图)
  let photoUrl = $state('')
  $effect(() => {
    const ref = attrs?.photoRef
    photoUrl = ''
    if (!ref) return
    let alive = true
    getPhotoUrl(ref).then((url) => {
      if (alive) photoUrl = url
      else URL.revokeObjectURL(url)
    }).catch(() => {})
    return () => {
      alive = false
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  })

  // 本地 VLM 可用且有实拍图 → 提供「识别外观」
  let vlmReady = $state(false)
  let describing = $state(false)
  $effect(() => {
    probeVlm().then((ok) => (vlmReady = ok))
  })

  async function describeLook() {
    const ref = attrs?.photoRef
    if (!ref || describing) return
    describing = true
    try {
      const blob = await getPhotoBlob(ref)
      if (!blob) return
      const look = await describeFurniture(blob, placement.label)
      if (!look) return
      updatePlacement(placement.id, {
        attrs: {
          ...placement.attrs,
          ...(look.colorHex ? { colorHex: look.colorHex } : {}),
          ...(look.colorZh ? { colorZh: look.colorZh } : {}),
          ...(look.material ? { material: look.material } : {}),
          ...(look.styleZh ? { styleZh: look.styleZh } : {}),
          describedAt: new Date().toISOString(),
        },
      })
    } finally {
      describing = false
    }
  }

  function commitSize() {
    const wInNext = Math.max(4, Math.round(Number(wDraft)))
    const hInNext = Math.max(4, Math.round(Number(hDraft)))
    if (!Number.isFinite(wInNext) || !Number.isFinite(hInNext)) return
    if (wInNext === wIn && hInNext === hIn) return
    updatePlacement(placement.id, {
      w: inchesToPx(wInNext, pxPerFt),
      h: inchesToPx(hInNext, pxPerFt),
    })
  }
</script>

<div
  class="graph-sel-bar"
  class:graph-sel-bar-compact={compact}
  class:graph-sel-bar-details={compact && detailsOpen}
  role="toolbar"
  aria-label="家具快捷操作"
>
  {#if compact}
    <span class="graph-sel-title graph-sel-title-compact">
      {#if attrs?.colorHex}<span
          class="look-dot"
          style:background={attrs.colorHex}
          title={attrs.colorZh ?? attrs.colorHex}
        ></span>{/if}{placement.label} · {wIn}″×{hIn}″
    </span>
  {:else}
    <span class="graph-sel-title">
      {#if attrs?.colorHex}<span
          class="look-dot"
          style:background={attrs.colorHex}
          title={attrs.colorZh ?? attrs.colorHex}
        ></span>{/if}{placement.label}
    </span>
    {#if lookText || tallIn}
      <span class="look-line">
        {lookText}{lookText && tallIn ? ' · ' : ''}{tallIn ? `高 ${tallIn}″` : ''}
      </span>
    {/if}
  {/if}

  {#if (!compact || detailsOpen) && (photoUrl || (attrs?.photoRef && vlmReady))}
    <div class="look-row">
      {#if photoUrl}
        <img class="look-photo" src={photoUrl} alt="{placement.label} 实拍" />
      {/if}
      {#if compact && (lookText || tallIn)}
        <span class="look-line">
          {lookText}{lookText && tallIn ? ' · ' : ''}{tallIn ? `高 ${tallIn}″` : ''}
        </span>
      {/if}
      {#if attrs?.photoRef && vlmReady}
        <button
          type="button"
          class="graph-sel-btn graph-sel-accent"
          disabled={describing}
          onclick={describeLook}
        >{describing ? '识别中…' : '识别外观'}</button>
      {/if}
    </div>
  {/if}

  {#if lowConfidence}
    <span
      class="look-warn"
      title="扫描时识别置信度低,尺寸可能不准 —— 建议贴近这件家具补扫几秒"
    >⚠ 置信度低</span>
  {/if}

  {#if (!compact || detailsOpen) && measured}
    <span class="look-line" title="LiDAR 实测脚印,不随手动改尺寸变化">
      实测 {Math.round(measured.w)}″×{Math.round(measured.h)}″
    </span>
    {#if measured.drifted}
      <button
        type="button"
        class="graph-sel-btn graph-sel-accent"
        title="把宽/深恢复成 LiDAR 实测值"
        onclick={restoreMeasured}
      >恢复实测</button>
    {/if}
  {/if}

  {#if !compact || detailsOpen}
    <div class="placement-size-fields">
      <label class="size-field">
        <span class="size-label">宽</span>
        <input
          type="number"
          class="size-input"
          min="8"
          step="1"
          bind:value={wDraft}
          onchange={commitSize}
          onkeydown={(e) => e.key === 'Enter' && commitSize()}
          aria-label="宽度英寸"
        />
      </label>
      <label class="size-field">
        <span class="size-label">深</span>
        <input
          type="number"
          class="size-input"
          min="8"
          step="1"
          bind:value={hDraft}
          onchange={commitSize}
          onkeydown={(e) => e.key === 'Enter' && commitSize()}
          aria-label="深度英寸"
        />
      </label>
    </div>
  {/if}

  <div class="graph-sel-actions">
    {#if compact}
      <button
        type="button"
        class="graph-sel-btn graph-sel-accent"
        aria-expanded={detailsOpen}
        onclick={() => (detailsOpen = !detailsOpen)}
      >
        {detailsOpen ? '收起' : '尺寸'}
      </button>
    {/if}
    <button
      type="button"
      class="graph-sel-btn graph-sel-accent"
      onclick={() => rotatePlacementById(placement.id)}
    >旋转 90°</button>
    <button
      type="button"
      class="graph-sel-btn graph-sel-warn"
      onclick={() => {
        removePlacement(placement.id)
        onClear?.()
      }}
    >删除</button>
    <button type="button" class="graph-sel-btn" onclick={() => onClear?.()} aria-label="取消选中">
      ×
    </button>
  </div>
</div>

<style>
  .graph-sel-bar {
    position: absolute;
    left: 50%;
    bottom: var(--stack-tight);
    transform: translateX(-50%);
    z-index: 42;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    max-width: min(720px, calc(100% - 2 * var(--stack-tight)));
    padding: 10px 14px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--graph-accent) 35%, var(--border));
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.32);
  }

  .graph-sel-title {
    font-size: 13px;
    font-weight: 650;
    color: var(--graph-accent);
    white-space: nowrap;
  }

  .graph-sel-title-compact {
    max-width: min(160px, 38vw);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 扫描带来的家具主色 —— 名字前一个小色点 */
  .look-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 5px;
    border-radius: 50%;
    border: 1px solid var(--border);
    vertical-align: baseline;
  }

  /* 样式 · 材质 · 颜色 · 高 —— 一行小字 */
  .look-line {
    font-size: 12px;
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: min(280px, 60vw);
  }

  .look-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  /* 低置信度尺寸的黄牌 */
  .look-warn {
    font-size: 12px;
    font-weight: 600;
    color: #b45309;
    white-space: nowrap;
    cursor: help;
  }

  /* 扫描自动抓拍的实拍缩略图 */
  .look-photo {
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .placement-size-fields {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .size-field {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--t2);
  }

  .size-label {
    font-weight: 600;
    font-family: var(--mono);
  }

  .size-input {
    width: 56px;
    min-height: 36px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-family: var(--mono);
    font-size: 12px;
  }

  .graph-sel-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .graph-sel-btn {
    font-size: 12px;
    font-weight: 600;
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  .graph-sel-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .graph-sel-warn {
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  .graph-sel-accent {
    color: var(--graph-accent);
    border-color: color-mix(in srgb, var(--graph-accent) 35%, var(--border));
  }

  @media (max-width: 599px) {
    .graph-sel-bar {
      left: 0;
      right: 0;
      transform: none;
      max-width: none;
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 72px
      );
      padding: 8px 10px;
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .graph-sel-bar-details {
      flex-wrap: wrap;
      overflow-x: visible;
    }

    .graph-sel-bar::-webkit-scrollbar {
      display: none;
    }

    .graph-sel-bar-compact .graph-sel-actions {
      margin-left: auto;
      flex-wrap: nowrap;
      flex-shrink: 0;
    }

    .graph-sel-bar-details .placement-size-fields {
      order: 10;
      flex-basis: 100%;
      margin-top: 4px;
    }

    .graph-sel-btn {
      min-height: 44px;
      flex-shrink: 0;
    }

    .size-input {
      min-height: 44px;
      width: 64px;
    }
  }
</style>
