<script>
  /**
   * 专注模式 —— 一屏一件事,做完点「下一件」。
   *
   * 为什么单独一个路由而不是 /tidy 上加个开关:这两个页面回答的是不同的问题。
   * /tidy 是**决策台**(今天有多少时间?哪个区最乱?先干哪个?)——它必须把全局摊开;
   * 这里是**执行台**(现在,这一件,怎么做完)——它必须把全局藏起来。同一屏里既想
   * 让人纵览又想让人专注,结果是两件事都做不好:15 张卡片摊在那,人就是不知道从哪下手。
   *
   * 三样东西撑起「具体」,缺一不可:
   * - **图**:小地图圈出这件事发生在屋里哪(focus),外加整理前实拍 —— 「厨房的门」
   *   还得自己在脑子里找,一张圈好的图不用。
   * - **步骤**:一步一勾,进度存在 localStorage,放下手机回来接得上。
   * - **完成标准**(doneWhen):做到什么样算完。没有标准就只能靠感觉勾完,
   *   而「感觉差不多了」正是屋子第二天又乱的起点。
   *
   * 进度与 /tidy 共用同一套 API(isTidyStepDone/setTidyTaskDone)—— 两个页面是
   * 同一份数据的两个视图,不是两份数据。
   */
  import {
    getActiveProject,
    isTidyTaskDone,
    setTidyTaskDone,
    isTidyStepDone,
    setTidyStepDone,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import { logEvent } from '$lib/event-log.js'
  import { analyzeCirculation } from '$lib/spatial/circulation.js'
  import { renderFloorPlanSvg } from '$lib/spatial/render-svg.js'
  import { buildTidyPlan, EFFORT_LABEL } from '$lib/spatial/tidy-plan.js'
  import { getPhotoBlob } from '$lib/photo-store.js'
  import { ICONS } from '$lib/iconRegistry.js'

  const project = $derived(getActiveProject())
  const circ = $derived(analyzeCirculation(project))
  const plan = $derived(buildTidyPlan(project, circ))
  const tasks = $derived(plan.tasks)

  /** 当前停在第几件。null = 还没定位过,由 $effect 跳到第一件没做的 */
  let idx = $state(0)
  let jumped = false
  $effect(() => {
    if (jumped || !tasks.length) return
    jumped = true
    const first = tasks.findIndex((t) => !isTidyTaskDone(t.id))
    idx = first < 0 ? 0 : first
  })

  const task = $derived(tasks[idx] ?? null)
  const doneCount = $derived(tasks.filter((t) => isTidyTaskDone(t.id)).length)
  const allDone = $derived(tasks.length > 0 && doneCount === tasks.length)

  const KIND_TAGS = {
    prep: { zh: '准备', cls: 'tag-info' },
    blockedDoor: { zh: '通行', cls: 'tag-urgent' },
    bottleneck: { zh: '动线', cls: 'tag-urgent' },
    hygiene: { zh: '卫生', cls: 'tag-warn' },
    surfaces: { zh: '台面', cls: 'tag-warn' },
    floorClutter: { zh: '地面', cls: 'tag-warn' },
    overflow: { zh: '堆满', cls: 'tag-warn' },
    messy: { zh: '杂乱', cls: 'tag-warn' },
    storage: { zh: '储物', cls: 'tag-info' },
    floorClean: { zh: '清洁', cls: 'tag-info' },
    rescan: { zh: '复扫', cls: 'tag-info' },
  }

  /** @type {Record<string, string>} */
  let photoUrls = $state({})
  $effect(() => {
    const ref = task?.photoRef
    if (!ref || photoUrls[ref]) return
    getPhotoBlob(ref).then((blob) => {
      if (blob) photoUrls = { ...photoUrls, [ref]: URL.createObjectURL(blob) }
    })
  })

  /**
   * 步骤图标 —— 纯展示层的关键词映射,步骤文案仍是唯一事实(tidy-plan 出的字符串)。
   * 认不出就给中性箭头,不硬凑。
   * @param {string} s
   */
  function stepIcon(s) {
    if (s.includes('垃圾')) return '🗑️'
    if (/碗|餐具|水槽/.test(s)) return '🍽️'
    if (/洗衣篮|衣物|毛巾/.test(s)) return '🧺'
    if (/临时箱|待决定|箱|袋/.test(s)) return '📦'
    if (/归位|送回/.test(s)) return '📥'
    if (/擦/.test(s)) return '🧽'
    if (/扫|吸|拖/.test(s)) return '🧹'
    if (/取出/.test(s)) return '📤'
    if (/标签/.test(s)) return '🏷️'
    if (/挪|开口|挡|围栏/.test(s)) return '🛋️'
    if (/卷尺|量|确认|目标/.test(s)) return '📏'
    if (/重扫|拍|照片|上传/.test(s)) return '📷'
    return '▸'
  }

  const stepsDone = $derived(
    task ? task.steps.filter((_, i) => isTidyStepDone(task.id, i)).length : 0,
  )

  function finish() {
    if (!task) return
    setTidyTaskDone(task.id, true, { zoneId: task.zoneId, zoneName: task.zoneName })
    next()
  }

  /**
   * 「做不了」的原因。
   *
   * 在此之前,站在屋里做不动只有两条路:假装勾「完成」,或者干瞪眼 —— 前者会毒化
   * 事件流(系统以为这儿整好了,下次不再推荐,而纸箱还在原地),后者让计划卡死。
   * 两条都比「说出来」差。
   *
   * 原因不是给人出气的,是**数据**:太重 / 需要两个人 → 下次别在「只想轻的」里排它;
   * 目标位置放不下 → 那个柜子的容量估错了;建议不合理 → 这条规则本身有问题。
   * 所以每一条都落进事件流(只追加、不覆盖),跟扫描和整理记录同一本账。
   *
   * ⚠️ 现在只做到「记下来 + 跳过」。spec 要的是「系统根据原因重新规划」——
   * 那要 tidy-plan 认这些原因(把 effort 抬一档、把目标柜换一个、把规则降权),
   * 是求解器的活,不是这一页能糊出来的。先把账记上,重新规划才有依据。
   */
  const BLOCK_REASONS = [
    { id: 'tired', zh: '今天太累了' },
    { id: 'heavy', zh: '太重,搬不动' },
    { id: 'needHelp', zh: '得两个人' },
    { id: 'noTarget', zh: '找不到该放哪' },
    { id: 'targetFull', zh: '目标位置放不下' },
    { id: 'badAdvice', zh: '这个建议不合理' },
    { id: 'later', zh: '暂时不想处理' },
  ]

  let blockOpen = $state(false)

  /** @param {{ id: string, zh: string }} reason */
  async function block(reason) {
    if (!task) return
    blockOpen = false
    await logEvent(
      'tidy_blocked',
      { taskId: task.id, zoneId: task.zoneId ?? '', zoneName: task.zoneName ?? '' },
      { reason: reason.id, reasonZh: reason.zh, title: task.title, kind: task.kind },
    )
    toast(`记下了:${reason.zh} —— 这件先跳过`)
    next()
  }

  /**
   * 「做了一半」。不勾完成(它确实没完成),但把做到哪儿记下来 ——
   * 步骤勾选本来就存着,这里补的是「我主动停在这儿」这个事实,
   * 否则下次回来分不清「没开始」和「做了一半被打断」。
   */
  async function partial() {
    if (!task) return
    await logEvent(
      'tidy_partial',
      { taskId: task.id, zoneId: task.zoneId ?? '', zoneName: task.zoneName ?? '' },
      { stepsDone, stepsTotal: task.steps.length, title: task.title },
    )
    toast(`记下了:${task.title} 做到 ${stepsDone}/${task.steps.length} 步`)
    next()
  }

  /** 跳到下一件**没做完**的;没有了就停在最后一件(此时 allDone 接管画面) */
  function next() {
    const after = tasks.findIndex((t, i) => i > idx && !isTidyTaskDone(t.id))
    if (after >= 0) idx = after
    else if (idx < tasks.length - 1) idx = tasks.length - 1
  }

  function prev() {
    if (idx > 0) idx--
  }
</script>

<svelte:head><title>专注整理 · HOME.OS</title></svelte:head>

<div class="go">
  <header class="go-bar">
    <a class="exit" href="/tidy" aria-label="退出专注模式">
      <ICONS.x size={16} /> 退出
    </a>
    {#if tasks.length}
      <div class="prog" role="progressbar" aria-valuenow={doneCount} aria-valuemax={tasks.length}>
        <span class="prog-fill" style:width={`${(doneCount / tasks.length) * 100}%`}></span>
      </div>
      <span class="prog-txt">{doneCount} / {tasks.length}</span>
    {/if}
  </header>

  {#if !tasks.length}
    <div class="empty">
      <p class="empty-big">暂时没有要整理的</p>
      <p class="empty-sub">{plan.summary}</p>
      <a class="btn-go" href="/tidy">回整理页</a>
    </div>
  {:else if allDone}
    <div class="empty">
      <p class="empty-big">🎉 全部做完了</p>
      <p class="empty-sub">
        拿 iPhone 复扫一遍,新旧两版能直接比对 —— 那是今天的收据。
      </p>
      <a class="btn-go" href="/tidy">回整理页看结果</a>
    </div>
  {:else if task}
    {@const done = isTidyTaskDone(task.id)}
    <article class="card">
      <div class="card-head">
        <span class="card-n">第 {idx + 1} 件 · 共 {tasks.length}</span>
        {#if KIND_TAGS[task.kind]}
          <span class="tag {KIND_TAGS[task.kind].cls}">{KIND_TAGS[task.kind].zh}</span>
        {/if}
        <span class="card-eff">{EFFORT_LABEL[task.effort]} · 约 {task.estMinutes} 分钟</span>
        {#if done}<span class="tag tag-done">已完成</span>{/if}
      </div>

      <h1 class="card-title">{task.title}</h1>
      <p class="card-why">{task.reason}</p>

      <!-- 图先于字:「去哪」这件事,一张圈好的图顶一句话 -->
      {#if task.focus || (task.photoRef && photoUrls[task.photoRef])}
        <div class="visuals">
          {#if task.focus}
            <a class="viz" href="/plan" data-sveltekit-noscroll aria-label="在平面图上查看">
              <span class="viz-frame">
                {@html renderFloorPlanSvg(project, {
                  compact: true,
                  showFurniture: true,
                  hideStorageZones: true,
                  focus: task.focus,
                })}
              </span>
              <span class="viz-cap">📍 就是这里 · 点开大图</span>
            </a>
          {/if}
          {#if task.photoRef && photoUrls[task.photoRef]}
            <figure class="viz">
              <span class="viz-frame">
                <img src={photoUrls[task.photoRef]} alt="整理前实拍" />
              </span>
              <figcaption class="viz-cap">📷 整理前 · 你拍的</figcaption>
            </figure>
          {/if}
        </div>
      {/if}

      <section class="block">
        <h2 class="block-h">
          怎么做
          {#if stepsDone}<span class="block-n">{stepsDone}/{task.steps.length}</span>{/if}
        </h2>
        <ol class="steps">
          {#each task.steps as s, i}
            {@const sDone = isTidyStepDone(task.id, i)}
            <li class="step" class:step-done={sDone}>
              <label class="step-label">
                <input
                  type="checkbox"
                  checked={sDone}
                  onchange={(e) => setTidyStepDone(task.id, i, e.currentTarget.checked)}
                />
                <span class="step-ico" aria-hidden="true">{stepIcon(s)}</span>
                <span class="step-text">{s}</span>
              </label>
            </li>
          {/each}
        </ol>
      </section>

      {#if task.doneWhen?.length}
        <section class="block block-done">
          <h2 class="block-h">做到这样才算完</h2>
          <ul class="checks">
            {#each task.doneWhen as d}
              <li class="check"><span class="check-ico" aria-hidden="true">✓</span>{d}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <div class="actions">
        <button type="button" class="nav-btn" onclick={prev} disabled={idx === 0}>← 上一件</button>
        {#if done}
          <button type="button" class="btn-go btn-ghost" onclick={next}>下一件 →</button>
        {:else}
          <button type="button" class="btn-go" onclick={finish}>做完了,下一件 →</button>
        {/if}
        <!-- 「跳过」换成了「做不了」。跳过是把事情从屏幕上抹掉,系统什么也没学到,
             下次照样推荐同一件搬不动的箱子;做不了会问一句为什么,那句话是重新规划
             唯一的依据。「做了一半」同理:它和「没开始」是两回事,不该长得一样。 -->
        <button
          type="button"
          class="nav-btn"
          onclick={partial}
          disabled={!stepsDone || done}
          title={stepsDone ? '' : '还没勾任何步骤'}
        >
          做了一半
        </button>
        <button
          type="button"
          class="nav-btn"
          aria-expanded={blockOpen}
          onclick={() => (blockOpen = !blockOpen)}
        >
          做不了
        </button>
      </div>

      {#if blockOpen}
        <ul class="reasons" aria-label="做不了的原因">
          {#each BLOCK_REASONS as r (r.id)}
            <li>
              <button type="button" class="reason" onclick={() => block(r)}>{r.zh}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  {/if}
</div>

<style>
  .go {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 var(--space-4, 16px) 64px;
  }
  .go-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    background: var(--bg, #f7f9fb);
  }
  .exit {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    padding: 6px 11px;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 999px;
    color: var(--t2, #6a727c);
    text-decoration: none;
    font-size: 0.8rem;
  }
  .exit:hover {
    border-color: var(--accent, #5c758c);
    color: var(--t1, #1f2328);
  }
  .prog {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: var(--border, #d5dde5);
    overflow: hidden;
  }
  .prog-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--accent, #4a6278);
    transition: width 0.25s ease;
  }
  .prog-txt {
    flex: none;
    font: 600 0.78rem var(--mono, monospace);
    color: var(--t2, #6a727c);
  }

  /* 无边框 surface + 浅浮起,和 /tidy 一套卡片语言 */
  .card {
    padding: 24px;
    border-radius: 18px;
    background: var(--card, #fff);
    box-shadow:
      0 1px 2px rgba(12, 18, 24, 0.05),
      0 12px 32px -18px rgba(12, 18, 24, 0.22);
  }
  .card-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  .card-n {
    font: 600 0.76rem var(--mono, monospace);
    color: var(--t2, #6a727c);
  }
  .card-eff {
    margin-left: auto;
    font-size: 0.78rem;
    color: var(--t2, #6a727c);
  }
  .card-title {
    margin: 0 0 8px;
    font-size: 1.5rem;
    line-height: 1.35;
    font-weight: 700;
    color: var(--t1, #1f2328);
  }
  .card-why {
    margin: 0 0 16px;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--t2, #6a727c);
  }

  .visuals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }
  .viz {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    text-decoration: none;
  }
  .viz-frame {
    display: block;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 10px;
    background: var(--plan-paper, #eef1f4);
    overflow: hidden;
  }
  /* 内联 SVG 不吃 object-fit,`height:100%` 也撑不住 —— 它按自己的 viewBox 长,
     给个 height:auto + 上限才收得住(实测漏了这条会占满整屏)。img 才用 object-fit。 */
  .viz-frame :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    max-height: 220px;
  }
  .viz-frame img {
    display: block;
    width: 100%;
    height: 220px;
    object-fit: cover;
  }
  .viz-cap {
    font-size: 0.76rem;
    color: var(--t2, #6a727c);
  }
  a.viz:hover .viz-frame {
    border-color: var(--accent, #5c758c);
  }

  .block {
    margin-bottom: 18px;
  }
  .block-h {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--t2, #6a727c);
  }
  .block-n {
    font: 600 0.74rem var(--mono, monospace);
    color: var(--accent, #4a6278);
  }

  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .step + .step {
    margin-top: 2px;
  }
  .step-label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    /* 手指点得中:整理时人是站着的、手是脏的,小勾选框点不中 */
    padding: 11px 10px;
    border-radius: 9px;
    cursor: pointer;
  }
  .step-label:hover {
    background: var(--bg, #f7f9fb);
  }
  .step-label input {
    flex: none;
    width: 19px;
    height: 19px;
    margin-top: 1px;
    accent-color: var(--accent, #4a6278);
  }
  .step-ico {
    flex: none;
    font-size: 1rem;
    line-height: 1.45;
  }
  .step-text {
    font-size: 0.93rem;
    line-height: 1.55;
    color: var(--t1, #1f2328);
  }
  .step-done .step-text {
    color: var(--t3, #9aa2ab);
    text-decoration: line-through;
  }

  .block-done {
    padding: 14px 16px;
    border: 1px dashed var(--border, #d5dde5);
    border-radius: 12px;
    background: var(--bg, #f7f9fb);
  }
  .checks {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
    font-size: 0.86rem;
    line-height: 1.55;
    color: var(--t1, #1f2328);
  }
  .check-ico {
    flex: none;
    font-weight: 700;
    color: var(--accent, #4a6278);
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--border, #d5dde5);
  }

  /* 原因清单:出现在操作区正下方,选完即走 —— 它是一次点击的岔路,不是一个表单 */
  .reasons {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0 0;
    padding: 0;
  }
  .reason {
    padding: 7px 12px;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 999px;
    background: none;
    color: var(--t1);
    font-size: 13px;
    cursor: pointer;
  }
  .reason:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .btn-go {
    flex: 1;
    padding: 14px 18px;
    border: 1px solid var(--accent, #4a6278);
    border-radius: 12px;
    background: var(--accent, #4a6278);
    color: var(--on-accent, #fff);
    font: inherit;
    font-size: 0.95rem;
    font-weight: 700;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }
  .btn-go:hover {
    filter: brightness(1.08);
  }
  .btn-ghost {
    background: transparent;
    color: var(--accent, #4a6278);
  }
  .nav-btn {
    flex: none;
    padding: 12px 14px;
    border: 1px solid var(--border, #d5dde5);
    border-radius: 10px;
    background: var(--card, #fff);
    color: var(--t2, #6a727c);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .nav-btn:hover:not(:disabled) {
    border-color: var(--accent, #5c758c);
    color: var(--t1, #1f2328);
  }
  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tag {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    font: 600 0.7rem/1.6 var(--sans, system-ui, sans-serif);
  }
  .tag-urgent {
    background: var(--plan-danger-fill, #e9c4bc);
    color: var(--plan-danger, #a3341f);
  }
  .tag-warn {
    background: #fde9c8;
    color: #b45309;
  }
  .tag-info {
    background: var(--bg, #f7f9fb);
    color: var(--t2, #6a727c);
    border: 1px solid var(--border, #d5dde5);
  }
  .tag-done {
    background: var(--accent, #4a6278);
    color: var(--on-accent, #fff);
  }

  .empty {
    padding: 64px 16px;
    text-align: center;
  }
  .empty-big {
    margin: 0 0 8px;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--t1, #1f2328);
  }
  .empty-sub {
    margin: 0 0 22px;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--t2, #6a727c);
  }
  .empty .btn-go {
    display: inline-block;
    flex: none;
    padding: 12px 24px;
  }

  /* 组件 style 里不能用 @custom-media —— 会原样进产物被浏览器忽略,必须写字面量 */
  @media (max-width: 640px) {
    .card {
      padding: 16px;
      border-radius: 12px;
    }
    .card-title {
      font-size: 1.25rem;
    }
    .actions {
      flex-wrap: wrap;
    }
    .btn-go {
      order: -1;
      flex-basis: 100%;
    }
    .nav-btn {
      flex: 1;
    }
  }
</style>
