<script>
  import {
    addPlacementRelation,
    getActiveProject,
    recordPlacementFunction,
    removePlacement,
    removePlacementRelation,
    rotatePlacementById,
    togglePlacementLocked,
    updatePlacement,
  } from '$lib/state.svelte.js'
  import {
    inchesToPx,
    pxToInches,
    PLACEMENT_KINDS,
    canonicalPlacementKind,
  } from '$lib/spatial/placements.js'
  import {
    resolveFunction,
    observedDrift,
    isUserConfirmed,
    FUNCTION_KEYS,
  } from '$lib/spatial/function-truth.js'
  import { FUNCTION_LABELS_ZH, FUNCTION_SOURCE_LABELS_ZH } from '$lib/function-labels.js'
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

  // 家规关系:布局求解会照此优化(near/far_from 另一件家具)。
  const relations = $derived(placement.relations ?? [])
  const labelById = $derived(
    new Map((project.placements ?? []).map((p) => [p.id, p.label])),
  )
  // 可作为关系目标的其它家具(排掉自己;暂存件不算)
  const relationTargets = $derived(
    (project.placements ?? []).filter(
      (p) => p.id !== placement.id && !p.attrs?.staged,
    ),
  )
  let relOpen = $state(false)
  let relType = $state(/** @type {'near'|'far_from'} */ ('far_from'))
  let relTargetId = $state('')

  // 真实用途(规范 §1.1)。effective 只由用户/文档/扫描/猜测解析,**照片不参与**。
  const fnResolved = $derived(resolveFunction(placement))
  const fnConfirmed = $derived(isUserConfirmed(placement))
  const fnDrift = $derived(observedDrift(placement))
  let fnOpen = $state(false)
  let fnDraft = $state('')
  function commitFunction() {
    if (!fnDraft) return
    recordPlacementFunction(placement.id, fnDraft)
    fnOpen = false
    fnDraft = ''
  }

  function commitRelation() {
    if (!relTargetId) return
    addPlacementRelation(placement.id, relType, relTargetId)
    relTargetId = ''
  }

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

  // 多视角证据包的 ref 列表(旧数据只有单张 photoRef 也兼容)
  const photoRefs = $derived.by(() => {
    const list = (attrs?.photos ?? [])
      .map((p) => p.photoRef)
      .filter(Boolean)
    if (list.length) return list.slice(0, 4)
    return attrs?.photoRef ? [attrs.photoRef] : []
  })

  // 家具实拍缩略图组(IndexedDB blob URL,换家具时换图)
  let photoUrls = $state(/** @type {string[]} */ ([]))
  const photoUrl = $derived(photoUrls[0] ?? '')
  $effect(() => {
    const refs = photoRefs
    photoUrls = []
    if (!refs.length) return
    let alive = true
    Promise.all(refs.map((r) => getPhotoUrl(r).catch(() => ''))).then((urls) => {
      const got = urls.filter(Boolean)
      if (alive) photoUrls = got
      else got.forEach((u) => URL.revokeObjectURL(u))
    })
    return () => {
      alive = false
      photoUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  })

  // 本地 VLM 可用且有实拍图 → 提供「识别外观」
  let vlmReady = $state(false)
  let describing = $state(false)
  $effect(() => {
    probeVlm().then((ok) => (vlmReady = ok))
  })

  async function describeLook() {
    if (!photoRefs.length || describing) return
    describing = true
    try {
      // 多视角证据一起喂:一张照片看不出 L 形沙发的另一侧
      const blobs = (
        await Promise.all(photoRefs.map((r) => getPhotoBlob(r).catch(() => null)))
      ).filter(Boolean)
      if (!blobs.length) return
      const look = await describeFurniture(blobs, placement.label)
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

  // 纠正扫描误检的类型。canonicalPlacementKind 过别名拿当前规范 kind。
  const curKind = $derived(canonicalPlacementKind(placement.kind))
  /** 按 group 分组的 kind 选项 */
  const kindGroups = $derived.by(() => {
    /** @type {Map<string, Array<{ value: string, label: string }>>} */
    const groups = new Map()
    for (const [value, spec] of Object.entries(PLACEMENT_KINDS)) {
      const g = spec.group ?? '其它'
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g).push({ value, label: spec.label })
    }
    return [...groups]
  })
  /**
   * 用户改类型 → updatePlacement 带 userEdit:盖 provenance 章(重扫不打回)
   * 并把旧 kind 记进 scanAliases(下次扫描仍报旧 kind 时靠 alias 认回是同一件)。
   * @param {Event & { currentTarget: HTMLSelectElement }} e
   */
  function commitKind(e) {
    const next = e.currentTarget.value
    if (!next || next === curKind) return
    updatePlacement(placement.id, { kind: next }, { userEdit: true })
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

  {#if (!compact || detailsOpen) && (photoUrls.length || (photoRefs.length && vlmReady))}
    <div class="look-row">
      {#each photoUrls as url, i (url)}
        <img
          class="look-photo"
          src={url}
          alt="{placement.label} 实拍视角 {i + 1}"
          title={attrs?.photos?.[i]?.azimuthDeg != null ? `方位 ${Math.round(attrs.photos[i].azimuthDeg)}°` : ''}
        />
      {/each}
      {#if compact && (lookText || tallIn)}
        <span class="look-line">
          {lookText}{lookText && tallIn ? ' · ' : ''}{tallIn ? `高 ${tallIn}″` : ''}
        </span>
      {/if}
      {#if photoRefs.length && vlmReady}
        <button
          type="button"
          class="graph-sel-btn graph-sel-accent"
          disabled={describing}
          onclick={describeLook}
          title={photoRefs.length > 1 ? `综合 ${photoRefs.length} 个视角识别` : ''}
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

  {#if !compact || detailsOpen}
    <!-- 纠正扫描误检的类型:用户改是权威,盖 provenance 章、重扫不被打回 -->
    <label class="kind-field">
      <span class="size-label">类型</span>
      <select
        class="kind-select"
        value={curKind}
        onchange={commitKind}
        aria-label="家具类型(纠正扫描误检)"
      >
        {#each kindGroups as [group, opts] (group)}
          <optgroup label={group}>
            {#each opts as o (o.value)}
              <option value={o.value}>{o.label}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </label>
  {/if}

  {#if !compact || detailsOpen}
    <!-- 真实用途(规范 §1.1):用户确认是最高真源,归位/布局照此校对。照片只提示不重定义 -->
    <div class="rel-block">
      <div class="rel-head">
        <span class="rel-title">用途</span>
        <span class="fn-chip" class:fn-chip-confirmed={fnConfirmed}>
          {FUNCTION_LABELS_ZH[fnResolved.key] ?? fnResolved.key}
          <span class="fn-src">· {FUNCTION_SOURCE_LABELS_ZH[fnResolved.source] ?? fnResolved.source}</span>
        </span>
      </div>
      {#if fnDrift.drift}
        <p class="fn-drift">
          照片里看到的更像「{FUNCTION_LABELS_ZH[fnDrift.params.observedKey] ?? fnDrift.params.observedKey}」——
          只是提示,不会改动你确认的用途。
        </p>
      {/if}
      {#if fnOpen}
        <div class="rel-add">
          <select class="rel-select rel-target" bind:value={fnDraft} aria-label="真实用途">
            <option value="" disabled>选一个用途…</option>
            {#each FUNCTION_KEYS as k (k)}
              <option value={k}>{FUNCTION_LABELS_ZH[k] ?? k}</option>
            {/each}
          </select>
          <button
            type="button"
            class="graph-sel-btn graph-sel-accent"
            disabled={!fnDraft}
            onclick={commitFunction}
          >确认</button>
          <button type="button" class="graph-sel-btn" onclick={() => (fnOpen = false)}>取消</button>
        </div>
      {:else}
        <button
          type="button"
          class="rel-add-btn"
          title="确认这件家具/表面实际做什么 —— 归位与布局建议会照此校对"
          onclick={() => { fnDraft = fnResolved.key; fnOpen = true }}
        >{fnConfirmed ? '改用途' : '确认用途'}</button>
      {/if}
    </div>

    <!-- 家规关系:布局求解照此优化。词表猜不出「鸟笼远离床」这类家规,只能用户说 -->
    <div class="rel-block">
      <div class="rel-head">
        <span class="rel-title">家规</span>
        {#if relations.length}
          <div class="rel-chips">
            {#each relations as rel, i (rel.type + rel.targetId)}
              <span class="rel-chip" class:rel-chip-far={rel.type === 'far_from'}>
                {rel.type === 'near' ? '靠近' : '远离'}
                {labelById.get(rel.targetId) ?? '(已删)'}
                <button
                  type="button"
                  class="rel-chip-x"
                  aria-label="删除这条关系"
                  onclick={() => removePlacementRelation(placement.id, i)}
                >×</button>
              </span>
            {/each}
          </div>
        {/if}
      </div>
      {#if relationTargets.length}
        {#if relOpen}
          <div class="rel-add">
            <select class="rel-select" bind:value={relType} aria-label="关系类型">
              <option value="far_from">远离</option>
              <option value="near">靠近</option>
            </select>
            <select class="rel-select rel-target" bind:value={relTargetId} aria-label="目标家具">
              <option value="" disabled>选一件家具…</option>
              {#each relationTargets as t (t.id)}
                <option value={t.id}>{t.label}</option>
              {/each}
            </select>
            <button
              type="button"
              class="graph-sel-btn graph-sel-accent"
              disabled={!relTargetId}
              onclick={commitRelation}
            >添加</button>
            <button type="button" class="graph-sel-btn" onclick={() => (relOpen = false)}>取消</button>
          </div>
        {:else}
          <button
            type="button"
            class="rel-add-btn"
            title="让求解器知道这件该靠近或远离谁"
            onclick={() => (relOpen = true)}
          >+ 加一条</button>
        {/if}
      {/if}
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
    {#if !placement.fixed}
      <button
        type="button"
        class="graph-sel-btn"
        class:graph-sel-locked={placement.locked}
        aria-pressed={!!placement.locked}
        title={placement.locked
          ? '已锁定:布局方案不会挪它(你自己仍可拖动)。点击解锁'
          : '锁定位置:摆到满意后锁住,重算方案时其余家具围绕它优化'}
        onclick={() => togglePlacementLocked(placement.id)}
      >{placement.locked ? '🔒 已锁定' : '锁定'}</button>
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

  .kind-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--t2);
  }

  .kind-select {
    min-height: 36px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-size: 12px;
    max-width: 160px;
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

  /* 锁定态:实底强调 —— 这是一个「已生效的约束」,不是普通按钮 */
  .graph-sel-locked {
    color: var(--card);
    background: var(--graph-accent);
    border-color: var(--graph-accent);
    font-weight: 700;
  }

  /* 家规关系块 */
  .rel-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-basis: 100%;
  }

  .rel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .rel-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--t2);
  }

  .rel-chips {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .rel-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    padding: 3px 4px 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--graph-accent) 12%, transparent);
    color: var(--graph-accent);
    border: 1px solid color-mix(in srgb, var(--graph-accent) 30%, var(--border));
  }

  .rel-chip-far {
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, var(--border));
  }

  .rel-chip-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: none;
    color: inherit;
    font-size: var(--text-base);
    line-height: 1;
    cursor: pointer;
  }

  .fn-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: var(--text-xs);
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    color: var(--warning);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, var(--border));
  }

  /* 已确认 = 稳态,用 accent(不是警示色) */
  .fn-chip-confirmed {
    background: color-mix(in srgb, var(--graph-accent) 12%, transparent);
    color: var(--graph-accent);
    border-color: color-mix(in srgb, var(--graph-accent) 30%, var(--border));
  }

  .fn-src {
    font-size: var(--text-xs);
    opacity: 0.75;
  }

  .fn-drift {
    margin: 4px 0 0;
    font-size: var(--text-xs);
    color: var(--t2);
    line-height: 1.4;
  }

  .rel-add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .rel-select {
    min-height: 36px;
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-size: var(--text-sm);
  }

  .rel-target {
    max-width: 140px;
  }

  .rel-add-btn {
    align-self: flex-start;
    font-size: var(--text-sm);
    padding: 4px 10px;
    color: var(--t2);
    background: none;
    border: 1px dashed var(--border);
    border-radius: 8px;
    cursor: pointer;
  }

  @media (max-width: 599px) {
    .rel-select {
      min-height: 44px;
    }
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
