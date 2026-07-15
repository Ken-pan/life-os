<script>
  import {
    attachViewpointPhoto,
    detachViewpointPhoto,
    getPlanNorth,
    describeViewpoint,
    removeViewpoint,
    updateViewpoint,
  } from '$lib/state.svelte.js'
  import { getPhotoUrl } from '$lib/photo-store.js'
  import { DEFAULT_FOV_DEG, MAX_FOV_DEG, MIN_FOV_DEG } from '$lib/spatial/viewpoints.js'
  import { probeVlm } from '$lib/vlm.js'
  import {
    compassSupported,
    requestCompassPermission,
    watchCompass,
  } from '$lib/compass.js'

  /** @type {{
   *   viewpoint: import('$lib/spatial/types.js').SpatialViewpoint,
   *   compact?: boolean,
   *   onClear?: () => void,
   *   onCalibrateNorth?: () => void,
   *   onPreview?: (patch: Partial<import('$lib/spatial/types.js').SpatialViewpoint> | null) => void,
   * }} */
  let { viewpoint, compact = false, onClear, onCalibrateNorth, onPreview } = $props()

  let detailsOpen = $state(false)
  let busy = $state(false)
  let vlmBusy = $state(false)
  let vlmReady = $state(false)
  /** @type {string | null} */
  let photoUrl = $state(null)
  let lightboxOpen = $state(false)
  /** @type {HTMLInputElement | null} */
  let fileInput = $state(null)
  /** @type {HTMLInputElement | null} */
  let camInput = $state(null)
  let compassOn = $state(false)
  /** @type {(() => void) | null} */
  let compassStop = null
  /** @type {number | null} */
  let pendingHeading = null
  let compassTargetId = ''
  let rafId = 0
  /** 跟随期间给数字框显示用；只在 rAF 里更新，故意不复用 pendingHeading —— 那个每秒被写 60 次，
   *  一旦是 $state 就会把整条选中条也带成 60Hz 重渲染。 */
  let liveHeading = $state(/** @type {number | null} */ (null))
  /** 滑杆拖动期间的本地值；null 表示没在拖。 */
  let fovDraft = $state(/** @type {number | null} */ (null))

  const planNorth = $derived(getPlanNorth())
  const canCompass = compassSupported()

  $effect(() => {
    probeVlm().then((ok) => (vlmReady = ok))
  })

  // 换选中目标才重置面板状态 —— 必须读 viewpoint.id，否则 effect 无依赖只跑一次。
  $effect(() => {
    viewpoint.id
    detailsOpen = false
    lightboxOpen = false
  })

  // 换选中目标就停掉跟随，否则会把罗盘朝向写到新机位上。
  $effect(() => {
    viewpoint.id
    return () => stopCompass()
  })

  function stopCompass() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    compassStop?.()
    compassStop = null
    // 松手时把最后的朝向落一次盘 —— 跟随期间只走预览，store 里还是旧值。
    if (compassOn && pendingHeading != null) {
      updateViewpoint(compassTargetId, {
        heading: pendingHeading,
        headingSource: 'compass',
      })
    }
    onPreview?.(null)
    pendingHeading = null
    liveHeading = null
    compassOn = false
  }

  async function toggleCompass() {
    if (compassOn) {
      stopCompass()
      return
    }
    const ok = await requestCompassPermission()
    if (!ok) return
    if (planNorth == null) {
      onCalibrateNorth?.()
      return
    }
    compassTargetId = viewpoint.id
    compassOn = true
    compassStop = watchCompass((heading) => {
      const h = (((heading - planNorth) % 360) + 360) % 360
      // 死区 + rAF 节流：罗盘 ~60Hz，直连 store 会每秒 pushGraphUndo 60 次
      // 把真实编辑history冲出 24 格撤销栈，并烧掉 ~137ms/s 做全量 hydrate+落盘。
      if (pendingHeading != null && Math.abs(shortestDelta(pendingHeading, h)) < 0.5) return
      pendingHeading = h
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        if (pendingHeading != null) {
          liveHeading = pendingHeading
          onPreview?.({ heading: pendingHeading, headingSource: 'compass' })
        }
      })
    })
  }

  /** 两个角度间的最短夹角，跨 0/360 不会算出 ~360 的假差值。 */
  function shortestDelta(a, b) {
    return ((((b - a) % 360) + 540) % 360) - 180
  }

  // object URL 只跟 photoRef 走：viewpoint 对象每次拖动/转向都会换新引用，
  // 若直接依赖它，会不停 revoke + 重读 IndexedDB，缩略图闪烁。
  const photoRef = $derived(viewpoint.photoRef)

  $effect(() => {
    const ref = photoRef
    if (!ref) {
      photoUrl = null
      return
    }
    let url = /** @type {string | null} */ (null)
    let cancelled = false
    getPhotoUrl(ref).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      url = u
      photoUrl = u
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      photoUrl = null
    }
  })

  /** @param {Event} e */
  async function onPick(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget)
    const file = input.files?.[0]
    if (!file) return
    busy = true
    const id = viewpoint.id
    const res = await attachViewpointPhoto(id, file)
    busy = false
    input.value = ''
    // 挂上就顺手让 VLM 认房间 —— 这是它唯一能补上的东西（EXIF 给不了位置）。
    if (res && vlmReady) {
      vlmBusy = true
      await describeViewpoint(id)
      vlmBusy = false
    }
  }

  async function runGuess() {
    vlmBusy = true
    await describeViewpoint(viewpoint.id)
    vlmBusy = false
  }

  /** 拖动中：只走预览，不碰 store（否则每一像素一次 pushGraphUndo）。 */
  function previewFov(v) {
    const fov = Math.round(Number(v))
    if (!Number.isFinite(fov)) return
    fovDraft = fov
    onPreview?.({ fovDeg: fov })
  }

  /** 松手：落一次盘，这一步才进撤销栈。 */
  function commitFov(v) {
    const fov = Math.round(Number(v))
    fovDraft = null
    onPreview?.(null)
    if (!Number.isFinite(fov)) return
    updateViewpoint(viewpoint.id, { fovDeg: fov })
  }

  function commitHeading(v) {
    const h = Math.round(Number(v))
    if (!Number.isFinite(h)) return
    updateViewpoint(viewpoint.id, { heading: ((h % 360) + 360) % 360 })
  }
</script>

<input
  type="file"
  accept="image/*"
  bind:this={fileInput}
  onchange={onPick}
  hidden
/>
<!-- capture=environment：手机上直接调起后摄，省掉「相册→找图」这一步 -->
<input
  type="file"
  accept="image/*"
  capture="environment"
  bind:this={camInput}
  onchange={onPick}
  hidden
/>

<div
  class="graph-sel-bar"
  class:graph-sel-bar-compact={compact}
  class:graph-sel-bar-details={compact && detailsOpen}
  role="toolbar"
  aria-label="视角快捷操作"
>
  {#if photoUrl}
    <button
      type="button"
      class="vp-thumb"
      onclick={() => (lightboxOpen = true)}
      aria-label="放大查看照片"
    >
      <img src={photoUrl} alt="该视角的实拍照片" />
    </button>
  {/if}

  <span class="graph-sel-title" class:graph-sel-title-compact={compact}>
    {viewpoint.label ?? '视角'}
    {#if !viewpoint.photoRef}<span class="vp-empty-tag">· 未挂照片</span>
    {:else if viewpoint.headingSource === 'arkit'}
      <span class="vp-exact-tag" title="来自 iOS 扫描时的 ARKit 相机位姿，与墙体同一坐标系 — 最可信"
        >· AR 姿态</span
      >
    {:else if viewpoint.headingSource === 'anchor'}
      <span class="vp-exact-tag" title="朝向由 VLM 认出的家具几何解出，未经罗盘 — 最可信"
        >· 朝向已定位</span
      >
    {:else if viewpoint.headingSource === 'exif' || viewpoint.headingSource === 'compass'}
      <span class="vp-approx-tag" title="室内罗盘受钢结构/家电磁铁干扰，偏 20–40° 常见 — 请拧一下确认"
        >· 朝向粗估</span
      >
    {/if}
  </span>

  {#if viewpoint.state}
    <span class="vp-state" data-state={viewpoint.state} title={viewpoint.items?.join('、')}>
      {viewpoint.state}
    </span>
  {/if}
  {#if viewpoint.note && !compact}
    <span class="vp-note" title={viewpoint.items?.join('、')}>{viewpoint.note}</span>
  {/if}

  {#if !compact || detailsOpen}
    <div class="vp-fields">
      <label class="size-field">
        <span class="size-label">朝向</span>
        <input
          type="number"
          class="size-input"
          min="0"
          max="359"
          step="1"
          value={Math.round(liveHeading ?? viewpoint.heading)}
          disabled={compassOn}
          onchange={(e) => commitHeading(e.currentTarget.value)}
          aria-label="朝向角度"
        />
      </label>
      <label class="size-field vp-fov">
        <span class="size-label">视角</span>
        <input
          type="range"
          min={MIN_FOV_DEG}
          max={MAX_FOV_DEG}
          step="1"
          value={fovDraft ?? viewpoint.fovDeg ?? DEFAULT_FOV_DEG}
          oninput={(e) => previewFov(e.currentTarget.value)}
          onchange={(e) => commitFov(e.currentTarget.value)}
          aria-label="视锥张角"
        />
        <span class="size-label vp-fov-num"
          >{Math.round(fovDraft ?? viewpoint.fovDeg ?? DEFAULT_FOV_DEG)}°</span
        >
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
        {detailsOpen ? '收起' : '角度'}
      </button>
    {/if}
    <button
      type="button"
      class="graph-sel-btn graph-sel-accent"
      disabled={busy}
      onclick={() => camInput?.click()}
      title="调起后摄直接拍"
    >
      {busy ? '存入中…' : '拍照'}
    </button>
    <button
      type="button"
      class="graph-sel-btn"
      disabled={busy}
      onclick={() => fileInput?.click()}
    >
      {viewpoint.photoRef ? '换图' : '选图'}
    </button>
    {#if canCompass}
      <button
        type="button"
        class="graph-sel-btn"
        class:graph-sel-accent={compassOn}
        aria-pressed={compassOn}
        onclick={toggleCompass}
        title={planNorth == null
          ? '需先校准平面图北向'
          : '开启后转动手机，视锥跟着转'}
      >
        {compassOn ? '罗盘跟随中' : '罗盘'}
      </button>
    {/if}
    {#if vlmReady && viewpoint.photoRef}
      <button
        type="button"
        class="graph-sel-btn"
        disabled={vlmBusy}
        onclick={runGuess}
        title="本机 VLM：定分区 · 按家具定朝向 · 记录状态"
      >
        {vlmBusy ? '识别中…' : '识别'}
      </button>
    {/if}
    {#if viewpoint.photoRef}
      <button
        type="button"
        class="graph-sel-btn"
        onclick={() => detachViewpointPhoto(viewpoint.id)}
      >移除照片</button>
    {/if}
    <button
      type="button"
      class="graph-sel-btn graph-sel-warn"
      onclick={() => {
        removeViewpoint(viewpoint.id)
        onClear?.()
      }}
    >删除</button>
    <button
      type="button"
      class="graph-sel-btn"
      onclick={() => onClear?.()}
      aria-label="取消选中"
    >×</button>
  </div>
</div>

{#if lightboxOpen && photoUrl}
  <div
    class="vp-lightbox"
    role="button"
    tabindex="0"
    aria-label="关闭照片"
    onclick={() => (lightboxOpen = false)}
    onkeydown={(e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')
        lightboxOpen = false
    }}
  >
    <img src={photoUrl} alt="{viewpoint.label ?? '视角'} 的实拍照片" />
  </div>
{/if}

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
    max-width: min(760px, calc(100% - 2 * var(--stack-tight)));
    padding: 10px 14px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--graph-accent) 35%, var(--border));
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.32);
  }

  .vp-thumb {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 8px;
    border: 1px solid var(--border);
    overflow: hidden;
    cursor: zoom-in;
    background: var(--bg);
  }

  .vp-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .graph-sel-title {
    font-size: 13px;
    font-weight: 650;
    color: var(--graph-accent);
    white-space: nowrap;
  }

  .graph-sel-title-compact {
    max-width: min(150px, 34vw);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vp-empty-tag {
    font-weight: 500;
    color: var(--t2);
  }

  .vp-approx-tag {
    font-weight: 500;
    color: #b45309;
    cursor: help;
  }

  .vp-exact-tag {
    font-weight: 500;
    color: var(--graph-accent);
    cursor: help;
  }

  /* 状态色阶：整洁→堆满 由冷到暖，一眼看出哪块该收拾了 */
  .vp-state {
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 650;
    cursor: help;
    border: 1px solid transparent;
  }
  .vp-state[data-state='整洁'] {
    color: #1d6b42;
    background: color-mix(in srgb, #1d6b42 12%, transparent);
    border-color: color-mix(in srgb, #1d6b42 30%, transparent);
  }
  .vp-state[data-state='一般'] {
    color: var(--t2);
    background: color-mix(in srgb, var(--t2) 10%, transparent);
    border-color: var(--border);
  }
  .vp-state[data-state='杂乱'] {
    color: #b45309;
    background: color-mix(in srgb, #b45309 12%, transparent);
    border-color: color-mix(in srgb, #b45309 30%, transparent);
  }
  .vp-state[data-state='堆满'] {
    color: #a3341f;
    background: color-mix(in srgb, #a3341f 14%, transparent);
    border-color: color-mix(in srgb, #a3341f 35%, transparent);
  }
  .vp-state[data-state='空置'] {
    color: #5c758c;
    background: color-mix(in srgb, #5c758c 12%, transparent);
    border-color: color-mix(in srgb, #5c758c 30%, transparent);
  }

  .vp-note {
    font-size: 12px;
    color: var(--t2);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
  }

  .vp-fields {
    display: inline-flex;
    align-items: center;
    gap: 10px;
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
    width: 60px;
    min-height: 36px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-family: var(--mono);
    font-size: 12px;
  }

  .vp-fov input[type='range'] {
    width: 90px;
    accent-color: var(--graph-accent);
  }

  .vp-fov-num {
    min-width: 32px;
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

  .vp-lightbox {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(4px);
    cursor: zoom-out;
    border: 0;
  }

  .vp-lightbox img {
    max-width: 100%;
    max-height: 100%;
    border-radius: 10px;
    box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.6);
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

    .graph-sel-bar-details .vp-fields {
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
    }
  }
</style>
