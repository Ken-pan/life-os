<script>
  import { ICONS } from '$lib/iconRegistry.js'
  import { formatTagInput, parseTagInput } from '$lib/spatial/storage-items.js'
  import {
    containerSummary,
    levelLabel,
    levelOptions,
  } from '$lib/spatial/container-scan.js'

  /** @typedef {import('$lib/spatial/types.js').SpatialStorageItem} SpatialStorageItem */

  /**
   * @type {{
   *   code: string,
   *   nameZh: string,
   *   locationZh: string,
   *   formZh: string,
   *   items: SpatialStorageItem[],
   *   inferred?: boolean,
   *   container?: import('$lib/spatial/types.js').ContainerScanInfo,
   *   selected?: boolean,
   *   onSelect?: () => void,
   *   id?: string,
   *   editable?: boolean,
   *   moveTargets?: { code: string, nameZh: string }[],
   *   highlightItemId?: string,
   *   matchedItemIds?: string[],
   *   onAddItem?: (name: string) => void,
   *   onUpdateItem?: (itemId: string, patch: Partial<SpatialStorageItem> & { level?: number | null }) => void,
   *   onRemoveItem?: (itemId: string) => void,
   *   onMoveItem?: (itemId: string, toCode: string) => void,
   * }}
   */
  let {
    code,
    nameZh,
    locationZh,
    formZh,
    items,
    inferred = false,
    container = undefined,
    selected = false,
    onSelect,
    id = undefined,
    editable = false,
    moveTargets = [],
    highlightItemId = '',
    matchedItemIds = [],
    onAddItem,
    onUpdateItem,
    onRemoveItem,
    onMoveItem,
  } = $props()

  let editingId = $state('')
  let draftName = $state('')
  let draftQty = $state(1)
  let draftTags = $state('')
  let draftNote = $state('')
  /** 编辑中的层号;'' = 未分层(提交时转 null 清除) */
  let draftLevel = $state('')
  let newName = $state('')

  const levels = $derived(levelOptions(container))

  const matched = $derived(new Set(matchedItemIds))

  /**
   * 商品图来自远端公开桶(FinanceOS),链接会失效、离线也拉不到。
   * 拉不到就把 img 摘掉 —— 浏览器的碎图图标比干脆没有图更难看,也更让人以为坏了。
   * @param {Event} e
   */
  function hideBrokenThumb(e) {
    const img = /** @type {HTMLImageElement} */ (e.currentTarget)
    img.remove()
  }

  /** @param {SpatialStorageItem} item */
  function startEdit(item) {
    editingId = item.id
    draftName = item.name
    draftQty = item.qty ?? 1
    draftTags = formatTagInput(item)
    draftNote = item.note ?? ''
    draftLevel = item.level === undefined ? '' : String(item.level)
  }

  function cancelEdit() {
    editingId = ''
  }

  function commitEdit() {
    if (!draftName.trim()) return
    onUpdateItem?.(editingId, {
      name: draftName,
      qty: draftQty,
      tags: parseTagInput(draftTags),
      note: draftNote,
      // '' = 未分层 → null 显式清除(undefined 会被 patch 当「不动」)
      level: draftLevel === '' ? null : Number(draftLevel),
    })
    editingId = ''
  }

  function commitAdd() {
    const name = newName.trim()
    if (!name) return
    onAddItem?.(name)
    newName = ''
  }

  /** @param {KeyboardEvent} e */
  function onEditKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }
</script>

<article class="storage-card" class:selected {id}>
  <header>
    {#if onSelect}
      <button type="button" class="zone-toggle" onclick={() => onSelect()}>
        <span class="tag">{code}</span>
        <h3>{nameZh}</h3>
      </button>
    {:else}
      <span class="tag">{code}</span>
      <h3>{nameZh}</h3>
    {/if}
    {#if inferred}<span class="badge">推测</span>{/if}
    <span class="count" title={`${items.length} 件物品`}>{items.length}</span>
  </header>
  <p class="meta"><b>位置</b> {locationZh} · <b>形式</b> {formZh}</p>
  {#if container}
    <!-- iOS 柜内扫描量出来的真实内腔 —— 有它,「放进柜子」才能说成「放进第几层」 -->
    <p class="meta container-meta">
      <b>柜内实测</b>
      {containerSummary(container)}
      {#if container.compartments.length > 1}
        <span class="container-levels"
          >(每层高 {container.compartments
            .map((lv) => `${Math.round(lv.heightIn * 2.54)}`)
            .join('/')} cm)</span
        >
      {/if}
    </p>
  {/if}

  <ul>
    {#each items as item (item.id)}
      <li
        class:highlight={item.id === highlightItemId}
        class:matched={matched.has(item.id)}
      >
        {#if editingId === item.id}
          <div class="edit-form">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="field"
              bind:value={draftName}
              onkeydown={onEditKey}
              placeholder="名称"
              aria-label="名称"
              autofocus
            />
            <div class="edit-row">
              <label class="qty-label">
                数量
                <input
                  class="field qty"
                  type="number"
                  min="1"
                  bind:value={draftQty}
                  onkeydown={onEditKey}
                />
              </label>
              <input
                class="field"
                bind:value={draftTags}
                onkeydown={onEditKey}
                placeholder="标签(空格分隔)"
                aria-label="标签"
              />
            </div>
            <input
              class="field"
              bind:value={draftNote}
              onkeydown={onEditKey}
              placeholder="备注"
              aria-label="备注"
            />
            {#if levels.length > 1}
              <label class="level-label">
                哪一层
                <select
                  class="field level-select"
                  bind:value={draftLevel}
                  aria-label={`「${item.name}」在柜内哪一层`}
                >
                  <option value="">未分层</option>
                  {#each levels as lv (lv.value)}
                    <option value={String(lv.value)}>{lv.label}</option>
                  {/each}
                </select>
              </label>
            {/if}
            <div class="edit-actions">
              <button type="button" class="mini primary" onclick={commitEdit}>
                保存
              </button>
              <button type="button" class="mini" onclick={cancelEdit}>
                取消
              </button>
              <div class="spacer"></div>
              {#if moveTargets.length}
                <select
                  class="move-select"
                  aria-label={`把「${item.name}」移到其他储藏区`}
                  value=""
                  onchange={(e) => {
                    const to = e.currentTarget.value
                    e.currentTarget.value = ''
                    if (to) {
                      editingId = ''
                      onMoveItem?.(item.id, to)
                    }
                  }}
                >
                  <option value="">移动到…</option>
                  {#each moveTargets as t (t.code)}
                    <option value={t.code}>{t.code} · {t.nameZh}</option>
                  {/each}
                </select>
              {/if}
              <button
                type="button"
                class="icon-btn danger"
                title="删除"
                aria-label={`删除 ${item.name}`}
                onclick={() => {
                  editingId = ''
                  onRemoveItem?.(item.id)
                }}
              >
                <ICONS.trash size={14} />
              </button>
            </div>
          </div>
        {:else if editable}
          <button
            type="button"
            class="item-row"
            aria-label={`编辑 ${item.name}`}
            onclick={() => startEdit(item)}
          >
            {#if item.purchase?.imageUrl}
              <!-- 装饰性:名字就在旁边,alt 再念一遍等于让读屏听两遍。
                   加载失败就把自己摘掉 —— 一个碎图图标比没有图更糟。 -->
              <img
                class="thumb"
                src={item.purchase.imageUrl}
                alt=""
                loading="lazy"
                onerror={hideBrokenThumb}
              />
            {/if}
            <span class="item-name">{item.name}</span>
            {#if item.level !== undefined}
              <span class="level-chip">{levelLabel(item.level)}</span>
            {/if}
            {#if item.qty && item.qty > 1}
              <span class="qty-badge">×{item.qty}</span>
            {/if}
            {#each item.tags ?? [] as tag (tag)}
              <span class="chip">{tag}</span>
            {/each}
            {#if item.note}
              <span class="item-note">{item.note}</span>
            {/if}
          </button>
        {:else}
          <div class="item-row static">
            {#if item.purchase?.imageUrl}
              <img
                class="thumb"
                src={item.purchase.imageUrl}
                alt=""
                loading="lazy"
                onerror={hideBrokenThumb}
              />
            {/if}
            <span class="item-name">{item.name}</span>
            {#if item.level !== undefined}
              <span class="level-chip">{levelLabel(item.level)}</span>
            {/if}
            {#if item.qty && item.qty > 1}
              <span class="qty-badge">×{item.qty}</span>
            {/if}
            {#each item.tags ?? [] as tag (tag)}
              <span class="chip">{tag}</span>
            {/each}
            {#if item.note}
              <span class="item-note">{item.note}</span>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
    {#if !items.length}
      <li class="empty">还没有登记物品</li>
    {/if}
  </ul>

  {#if editable}
    <form
      class="add-row"
      onsubmit={(e) => {
        e.preventDefault()
        commitAdd()
      }}
    >
      <input
        class="field"
        bind:value={newName}
        placeholder={`添加物品到 ${code}`}
        aria-label={`添加物品到 ${code}`}
      />
      <button
        type="submit"
        class="icon-btn add"
        title="添加"
        aria-label={`添加物品到 ${code}`}
      >
        <ICONS.plus size={14} />
      </button>
    </form>
  {/if}
</article>

<style>
  .storage-card {
    /* column + margin-top:auto on .add-row keeps every card's 添加 input
       aligned along the row, since the grid stretches cards to equal height */
    display: flex;
    flex-direction: column;
    width: 100%;
    text-align: left;
    font: inherit;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .storage-card.selected {
    border-color: var(--storage-accent, #5c758c);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--storage-accent, #5c758c) 40%, transparent);
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .zone-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .tag {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 12px;
    color: #f5f8fa;
    background: var(--storage-accent, #5c758c);
    padding: 3px 8px;
    border-radius: 6px;
    flex: none;
  }

  h3 {
    font-size: 15px;
    margin: 0;
    font-weight: 650;
    color: var(--t1);
  }

  .badge {
    font-size: 10px;
    font-family: var(--mono);
    color: var(--t3);
    border: 1px solid var(--border);
    padding: 2px 6px;
    border-radius: 999px;
  }

  .count {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
  }

  .meta {
    font-size: 12px;
    color: var(--t3);
    margin: 0 0 9px;
  }

  .meta b {
    color: var(--t2);
    font-weight: 600;
  }

  .container-meta {
    margin-top: -5px;
  }

  .container-meta b {
    color: var(--storage-accent);
  }

  .container-levels {
    color: var(--t3);
  }

  .level-chip {
    font-size: 10px;
    font-weight: 600;
    color: var(--storage-accent);
    border: 1px solid var(--storage-accent);
    padding: 1px 6px;
    border-radius: 999px;
    flex: none;
  }

  .level-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--t3);
  }

  .level-select {
    flex: 1;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
    color: var(--t2);
  }

  li {
    border-radius: 7px;
  }

  li.matched {
    background: color-mix(
      in srgb,
      var(--storage-accent, #5c758c) 9%,
      transparent
    );
  }

  li.highlight {
    background: color-mix(
      in srgb,
      var(--storage-accent, #5c758c) 22%,
      transparent
    );
  }

  li.empty {
    color: var(--t3);
    font-style: italic;
    padding: 4px 2px;
  }

  .item-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
    width: 100%;
    padding: 5px 6px;
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--t2);
    background: none;
    border: 0;
    border-radius: 7px;
  }

  button.item-row {
    cursor: pointer;
  }

  button.item-row:hover {
    background: color-mix(in srgb, var(--t1) 7%, transparent);
  }

  .item-name {
    /* 长型号 / URL 没有断点，不打断就会顶破卡片 */
    overflow-wrap: anywhere;
    min-width: 0;
  }

  /* 买来的东西的商品图。刻意小：它是帮你认出「哦是那个」的线索，不是画廊。
     flex: none —— 不给缩，被压扁的缩略图既认不出东西又白占一行。 */
  .thumb {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 5px;
    border: 1px solid var(--border, #d5dde5);
    object-fit: cover;
    background: var(--bg, #f2f4f7);
  }

  .qty-badge {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t1);
    background: var(--border);
    padding: 1px 5px;
    border-radius: 4px;
    flex: none;
  }

  .chip {
    font-size: 10px;
    color: var(--t3);
    border: 1px solid var(--border);
    padding: 1px 6px;
    border-radius: 999px;
    flex: none;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .item-note {
    flex-basis: 100%;
    font-size: 11px;
    color: var(--t3);
    overflow-wrap: anywhere;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex: none;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--t3);
    cursor: pointer;
  }

  .icon-btn:hover {
    border-color: var(--border);
    color: var(--t1);
  }

  .icon-btn.danger:hover {
    color: #d4553f;
    border-color: #d4553f;
  }

  .icon-btn.add {
    border-color: var(--border);
  }

  .move-select {
    font: inherit;
    font-size: 12px;
    max-width: 108px;
    padding: 3px 4px;
    color: var(--t2);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .field {
    font: inherit;
    font-size: 13px;
    width: 100%;
    min-width: 0;
    padding: 6px 8px;
    color: var(--t1);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .field:focus-visible {
    outline: 2px solid var(--storage-accent, #5c758c);
    outline-offset: -1px;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px;
  }

  .edit-row {
    display: flex;
    gap: 5px;
  }

  .qty-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--t3);
    flex: none;
  }

  .field.qty {
    width: 60px;
  }

  .edit-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .mini {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--t1);
    cursor: pointer;
  }

  .mini.primary {
    background: var(--storage-accent, #5c758c);
    border-color: var(--storage-accent, #5c758c);
    color: #f5f8fa;
  }

  .add-row {
    display: flex;
    gap: 5px;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px dashed var(--border);
  }

  /* 手机上整行是「编辑」的点击目标，桌面的 30px 行高够不上拇指。
     599px = @life-os/theme 的 --life-os-phone；此处必须写字面值：Svelte 的
     <style> 单独过 PostCSS，看不到 layout.css @import 进来的 @custom-media
     定义，写 (--life-os-phone) 会原样输出、被浏览器整块忽略。 */
  @media (max-width: 599px) {
    .item-row {
      padding-top: 9px;
      padding-bottom: 9px;
    }

    .icon-btn {
      width: 40px;
      height: 40px;
    }

    .field {
      padding: 9px 10px;
    }

    .move-select {
      font-size: 13px;
      padding: 8px 6px;
      max-width: 132px;
    }

    .mini {
      padding: 8px 14px;
    }
  }
</style>
