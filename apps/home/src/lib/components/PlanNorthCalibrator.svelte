<script>
  import { getPlanNorth, setPlanNorth } from '$lib/state.svelte.js'
  import {
    compassSupported,
    requestCompassPermission,
    watchCompass,
  } from '$lib/compass.js'

  /** @type {{ onClose?: () => void }} */
  let { onClose } = $props()

  const current = $derived(getPlanNorth())
  const canCompass = compassSupported()

  /** @type {number | null} */
  let live = $state(null)
  let accurate = $state(true)
  let manual = $state('')
  /** @type {(() => void) | null} */
  let stop = null

  $effect(() => {
    manual = current == null ? '' : String(Math.round(current))
    return () => {
      stop?.()
      stop = null
    }
  })

  async function startLive() {
    const ok = await requestCompassPermission()
    if (!ok) return
    stop?.()
    stop = watchCompass((h, acc) => {
      live = h
      accurate = acc
    })
  }

  function commitLive() {
    if (live == null) return
    setPlanNorth(live)
    onClose?.()
  }

  function commitManual() {
    const v = Number(manual)
    if (!Number.isFinite(v)) return
    setPlanNorth(v)
    onClose?.()
  }
</script>

<div class="cal" role="dialog" aria-label="校准平面图北向">
  <div class="cal-head">
    <strong>校准平面图北向</strong>
    <button type="button" class="cal-x" onclick={() => onClose?.()} aria-label="关闭">×</button>
  </div>

  <p class="cal-why">
    平面图的「上」不等于真北。校准之后，照片 EXIF 里的罗盘方位角和手机实时朝向才能
    换算成图上的朝向。
  </p>

  {#if canCompass}
    <div class="cal-block">
      <p class="cal-step">
        <strong>手机校准</strong>：站在屋里，让手机<em>朝向平面图上「向上」的那个方向</em>（比如图上朝上的那面外墙），然后点下面的按钮。
      </p>
      {#if live == null}
        <button type="button" class="cal-btn cal-primary" onclick={startLive}>
          读取手机朝向
        </button>
      {:else}
        <div class="cal-live">
          <span class="cal-live-num">{Math.round(live)}°</span>
          {#if !accurate}
            <span class="cal-warn">罗盘未校准 · 请握手机画几个 8 字</span>
          {/if}
        </div>
        <button type="button" class="cal-btn cal-primary" onclick={commitLive}>
          就用这个方向（{Math.round(live)}°）
        </button>
      {/if}
    </div>
  {:else}
    <p class="cal-note">这台设备没有罗盘 —— 用下面的手动输入，或换手机打开本页校准。</p>
  {/if}

  <div class="cal-block">
    <label class="cal-manual">
      <span>手动填方位角</span>
      <input
        type="number"
        min="0"
        max="359"
        step="1"
        bind:value={manual}
        placeholder="0 = 图上方朝正北"
        onkeydown={(e) => e.key === 'Enter' && commitManual()}
      />
      <button type="button" class="cal-btn" onclick={commitManual}>保存</button>
    </label>
    <p class="cal-hint">
      朝北的户型填 0；图上方朝东填 90，朝南 180，朝西 270。
    </p>
  </div>

  <div class="cal-foot">
    {#if current == null}
      <span class="cal-state cal-state-off">未校准 · EXIF/罗盘朝向不可用</span>
    {:else}
      <span class="cal-state">已校准：图上方 = {Math.round(current)}°</span>
      <button type="button" class="cal-btn cal-warn" onclick={() => { setPlanNorth(null); onClose?.() }}>
        清除
      </button>
    {/if}
  </div>
</div>

<style>
  .cal {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 60;
    width: min(420px, calc(100% - 2 * var(--stack-tight)));
    padding: 16px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--graph-accent) 35%, var(--border));
    background: var(--card);
    box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    color: var(--graph-accent);
  }

  .cal-x {
    border: 0;
    background: none;
    color: var(--t2);
    font-size: 18px;
    cursor: pointer;
    min-height: 32px;
    min-width: 32px;
  }

  .cal-why,
  .cal-hint,
  .cal-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--t2);
  }

  .cal-step {
    margin: 0 0 8px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--t1);
  }

  .cal-block {
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .cal-live {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .cal-live-num {
    font-family: var(--mono);
    font-size: 24px;
    font-weight: 700;
    color: var(--graph-accent);
  }

  .cal-warn {
    font-size: 11px;
    color: #b45309;
  }

  .cal-btn {
    min-height: 38px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t2);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .cal-primary {
    width: 100%;
    color: var(--graph-accent);
    border-color: color-mix(in srgb, var(--graph-accent) 40%, var(--border));
  }

  .cal-warn {
    color: #b45309;
  }

  .cal-manual {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--t2);
    margin-bottom: 6px;
  }

  .cal-manual input {
    flex: 1;
    min-width: 0;
    min-height: 38px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
    font-family: var(--mono);
    font-size: 12px;
  }

  .cal-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .cal-state {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--graph-accent);
  }

  .cal-state-off {
    color: var(--t2);
  }

  @media (max-width: 599px) {
    .cal-btn {
      min-height: 44px;
    }
    .cal-manual input {
      min-height: 44px;
    }
  }
</style>
