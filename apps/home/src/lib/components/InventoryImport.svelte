<script>
  /**
   * FinanceOS 清单导入 —— 粘贴 JSON,先看清要发生什么,再决定落不落库。
   *
   * 为什么是粘贴而不是读仓库里的文件:这份数据是购买记录(订单号、金额、商品图),
   * 放进 static/ 或打进 bundle 都会被 Netlify 公开托管出去。粘贴让它只经过内存
   * 和你自己的 localStorage。
   *
   * 为什么强制预览:导入是批量写,一次能动几十条。不给人看一眼就改完是不礼貌的,
   * 而且自动归区是**猜**的,不给核对的机会就等于替用户瞎决定。
   */
  import { previewInventoryImport, applyInventoryImport } from '$lib/state.svelte.js'
  import { ICONS } from '$lib/iconRegistry.js'

  let open = $state(false)
  let text = $state('')
  /** @type {ReturnType<typeof previewInventoryImport> | null} */
  let plan = $state(null)
  let error = $state('')

  function preview() {
    error = ''
    plan = null
    const raw = text.trim()
    if (!raw) {
      error = '先贴点东西进来'
      return
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      error = `JSON 解析不了:${e instanceof Error ? e.message : e}`
      return
    }
    try {
      plan = previewInventoryImport(parsed)
    } catch (e) {
      error = `算不出导入方案:${e instanceof Error ? e.message : e}`
      return
    }
    if (!plan.items.length && !plan.claims.length && !plan.creates.length) {
      error = plan.skipped.length
        ? '这批里没有新东西 —— 全都导入过了或都认不出来。'
        : '这份 JSON 里没找到「有」的条目。'
    }
  }

  function apply() {
    if (!plan) return
    applyInventoryImport(plan)
    plan = null
    text = ''
    open = false
  }

  function reset() {
    plan = null
    text = ''
    error = ''
  }

  const total = $derived(
    plan ? plan.items.length + plan.claims.length + plan.creates.length : 0,
  )
</script>

<div class="import-wrap">
  <button
    type="button"
    class="import-toggle"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    <ICONS.plus size={14} />
    从 Korben Money 导入清单
  </button>

  {#if open}
    <div class="import-panel">
      <p class="hint">
        贴入分拣好的 JSON（<code>有</code> / <code>没有</code>，或 Korben Money 的
        <code>items</code>）。带 <code>kind</code> 的进平面图当家具，其余按类型自动归到
        储藏区 —— 归区是猜的，导入后会标「待核对」。标了 <code>disp: returned /
        cancelled</code> 的已退货、不导入；<code>maybe</code> 照导但标「退货存疑」。
      </p>

      <textarea
        class="json-input"
        bind:value={text}
        rows="5"
        spellcheck="false"
        placeholder={'{ "有": [ { "kind": null, "name": "Instant Pot 压力锅", "purchase": { … } } ], "没有": [] }'}
        aria-label="清单 JSON"
      ></textarea>

      <div class="actions">
        <button type="button" class="btn" onclick={preview} disabled={!text.trim()}>
          预览
        </button>
        {#if plan || error}
          <button type="button" class="btn btn-ghost" onclick={reset}>清空</button>
        {/if}
      </div>

      {#if error}
        <p class="err" role="alert">{error}</p>
      {/if}

      {#if plan && total > 0}
        <div class="preview" role="status">
          <p class="sum">
            将导入 <strong>{total}</strong> 件：{plan.items.length} 件杂物进储藏区{#if plan.claims.length}，认领 {plan.claims.length} 件平面图上已有的家具{/if}{#if plan.creates.length}，新建 {plan.creates.length} 件家具（摆在画布左上暂存，拖到位即可）{/if}
          </p>

          {#if plan.claims.length}
            <details open>
              <summary>认领已有家具 · {plan.claims.length}</summary>
              <ul>
                {#each plan.claims as c (c.id)}
                  <li>
                    <span class="tag tag-claim">认领</span>{c.name} → 图上的「{c.label}」
                    {#if c.purchase?.disp === 'maybe'}<span class="guess">退货存疑</span>{/if}
                  </li>
                {/each}
              </ul>
            </details>
          {/if}

          {#if plan.items.length}
            <details open>
              <summary>杂物归区 · {plan.items.length}</summary>
              <ul>
                {#each plan.items as it (it.item.id)}
                  <li>
                    <span class="tag">{it.zoneCode}</span>{it.item.name}
                    <span class="zone-name">{it.zoneNameZh}</span>
                    {#if it.item.purchase?.disp === 'maybe'}<span class="guess">退货存疑</span>{/if}
                    {#if it.guessed}<span class="guess">待核对</span>{/if}
                  </li>
                {/each}
              </ul>
            </details>
          {/if}

          {#if plan.creates.length}
            <details>
              <summary>新建家具 · {plan.creates.length}</summary>
              <ul>
                {#each plan.creates as c (c.id)}
                  <li>
                    <span class="tag tag-new">新</span>{c.label}
                    {#if c.attrs?.purchase?.disp === 'maybe'}<span class="guess">退货存疑</span>{/if}
                  </li>
                {/each}
              </ul>
            </details>
          {/if}

          {#if plan.skipped.length}
            <details>
              <summary>跳过 · {plan.skipped.length}</summary>
              <ul>
                {#each plan.skipped as s (s.name)}
                  <li class="skip">{s.name} — {s.why}</li>
                {/each}
              </ul>
            </details>
          {/if}

          <button type="button" class="btn btn-go" onclick={apply}>
            确认导入 {total} 件
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .import-wrap {
    margin: 0 0 var(--space-4, 16px);
  }
  .import-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 999px;
    background: var(--card, #fff);
    color: var(--t1, #1f2328);
    font: inherit;
    font-size: 0.86rem;
    cursor: pointer;
  }
  .import-toggle:hover {
    border-color: var(--accent, #5c758c);
  }
  .import-panel {
    margin-top: 10px;
    padding: 14px;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 12px;
    background: var(--card, #fff);
  }
  .hint {
    margin: 0 0 10px;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--t2, #6a727c);
  }
  code {
    font-family: var(--mono, monospace);
    font-size: 0.94em;
  }
  .json-input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 11px;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 8px;
    background: var(--bg, #f7f9fb);
    color: var(--t1, #1f2328);
    font: 12px/1.5 var(--mono, monospace);
    resize: vertical;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .btn {
    padding: 7px 14px;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 8px;
    background: var(--card, #fff);
    color: var(--t1, #1f2328);
    font: inherit;
    font-size: 0.84rem;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-ghost {
    border-color: transparent;
    color: var(--t2, #6a727c);
  }
  .btn-go {
    margin-top: 12px;
    border-color: var(--graph-accent, #1d6b42);
    background: var(--graph-accent, #1d6b42);
    color: #fff;
    font-weight: 600;
  }
  .err {
    margin: 10px 0 0;
    font-size: 0.82rem;
    color: var(--plan-danger, #a3341f);
  }
  .preview {
    margin-top: 12px;
    border-top: 1px solid var(--border, #d5dde5);
    padding-top: 12px;
  }
  .sum {
    margin: 0 0 8px;
    font-size: 0.84rem;
    line-height: 1.6;
  }
  details {
    margin-bottom: 6px;
  }
  summary {
    font-size: 0.8rem;
    color: var(--t2, #6a727c);
    cursor: pointer;
  }
  ul {
    margin: 6px 0 0;
    padding: 0 0 0 2px;
    list-style: none;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 0;
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .tag {
    flex: none;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--storage-accent, #5c758c);
    color: #fff;
    font: 600 0.7rem/1.5 var(--mono, monospace);
  }
  .tag-claim {
    background: var(--graph-accent, #1d6b42);
  }
  .tag-new {
    background: var(--plan-accent, #5c758c);
  }
  .zone-name {
    color: var(--t2, #6a727c);
    font-size: 0.74rem;
  }
  .guess {
    color: #b45309;
    font-size: 0.72rem;
  }
  .skip {
    color: var(--t2, #6a727c);
  }
</style>
