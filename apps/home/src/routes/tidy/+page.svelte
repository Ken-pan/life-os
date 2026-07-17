<script>
  // 整理页 = Today(决策台):今天该做什么、从哪开始。真正动手在 /tidy/go(执行台)。
  // 数据来自当前户型 —— 扫描拉取后自动跟着变。
  //
  // 页面结构(自上而下就是信息优先级):
  //   1. 今日建议 hero —— 下一件事 + 一个主按钮,页面唯一的视觉主角
  //   2. 房屋热点 —— 杂乱榜前三,理由前置、分数退后
  //   3. 整理计划 —— 全部任务(方法条 + 阶段分组),hero 的展开态
  //   4. 拍照提醒 —— 轻量一条,它是「补证据」不是「待办工单」
  //   5. 更多洞察(默认折叠)—— 利用率/完整杂乱榜/动线/布局方案/长期观察
  // 之前 1–5 全是同级卡片平铺:页面在汇报「系统有什么」,不是「你现在干什么」。
  // 所有指标一个没删,只是把「凭什么」收进了折叠区 —— 想核对依据的人展开就在。
  import { applyLayoutProposal, getActiveProject, isTidyTaskDone, setTidyTaskDone, isTidyStepDone, setTidyStepDone, clearTidyProgress, togglePlacementLocked } from '$lib/state.svelte.js'
  import { analyzeCirculation, CLEARANCE } from '$lib/spatial/circulation.js'
  import { computeTaskRoutes } from '$lib/spatial/task-routes.js'
  import { renderFloorPlanSvg } from '$lib/spatial/render-svg.js'
  // layout-solve.js(~945 行几何求解器)只在折叠洞察区里点「算三套方案」才用得上,
  // 静态 import 会把它压进整理页首屏 JS。改成用到时才动态加载。
  import { listEvents, logEvent, syncEvents } from '$lib/event-log.js'
  import {
    recentlyMarkedCluttered,
    rejectedSignatures,
    summarizeEvents,
  } from '$lib/spatial/event-derive.js'
  import { buildTidyPlan, EFFORT_LABEL } from '$lib/spatial/tidy-plan.js'
  import { scoreClutter } from '$lib/spatial/clutter-score.js'
  import { assessPhotoCoverage } from '$lib/spatial/photo-coverage.js'
  import { getPhotoBlob } from '$lib/photo-store.js'
  import { onDestroy } from 'svelte'
  import HomeTopBar from '$lib/components/HomeTopBar.svelte'
  import InspectorPanel from '$lib/components/InspectorPanel.svelte'

  /** @type {number|null} 今天有多少时间(分钟);null = 不限 */
  let budgetMin = $state(null)
  /** @type {'light'|'medium'|'heavy'|null} 今天有多少力气;null = 不限 */
  let effortCap = $state(null)

  const TIME_OPTS = [
    { v: 15, label: '15 分钟' },
    { v: 30, label: '30 分钟' },
    { v: 60, label: '1 小时' },
    { v: null, label: '不限' },
  ]
  const EFFORT_OPTS = [
    { v: 'light', label: '只想轻的' },
    { v: 'medium', label: '中等' },
    { v: null, label: '不限' },
  ]

  /** 少于这个数就别显示筛选器 —— 理由见模板里 .budget 那段 */
  const FILTER_MIN_TASKS = 6
  /** 不超过这个数就平铺,不分阶段 —— 理由见 phaseGroups */
  const FLAT_MAX_TASKS = 4

  const project = $derived(getActiveProject())
  const circ = $derived(analyzeCirculation(project))
  /** 日常任务路径(常识频率估算;栅格 BFS 毫秒级,户型变了自动重算) */
  const taskRoutes = $derived(computeTaskRoutes(project))
  const clutter = $derived(scoreClutter(project, circ))
  /** 页面打开那一刻的时钟就够了 —— 过期判断按天算,不需要逐秒刷新 */
  const nowMs = Date.now()
  const coverage = $derived(assessPhotoCoverage(project, { now: nowMs }))
  const plan = $derived(
    buildTidyPlan(project, circ, { minutes: budgetMin, effort: effortCap }),
  )
  const doneCount = $derived(plan.tasks.filter((t) => isTidyTaskDone(t.id)).length)
  const remainMinutes = $derived(
    plan.tasks.filter((t) => !isTidyTaskDone(t.id)).reduce((s, t) => s + t.estMinutes, 0),
  )
  /** 顶栏副标题 —— 与页内「整理计划」卡片头部的 plan-sum 是同一句话 */
  const topbarSubtitle = $derived(
    plan.tasks.length ? `${doneCount}/${plan.tasks.length} 完成 · 剩 ${dur(remainMinutes)}` : '',
  )

  /** hero 的主角:第一件没做完的任务。整个页面围绕它一件事展开 */
  const nextTask = $derived(plan.tasks.find((t) => !isTidyTaskDone(t.id)) ?? null)
  const nextTaskId = $derived(nextTask?.id ?? null)
  const allDone = $derived(plan.tasks.length > 0 && !nextTask)

  /**
   * 房屋热点:杂乱榜前三(scoreClutter 已按分排序)。
   * 首屏只回答「哪最乱、为什么」—— 完整榜单(含未识别标记)在折叠的洞察区里。
   * 15 分以下不上榜:那是「状态良好」,不值得占首屏一张卡。
   */
  const hotspots = $derived(clutter.zones.filter((z) => z.score >= 15).slice(0, 3))

  /** 「更多洞察」折叠态 —— 依据默认收起,想核对的人一下就能展开 */
  let showInsights = $state(false)

  /** @type {Record<string, string>} */
  let photoUrls = $state({})

  /** 任务卡上的「整理前」缩略图:按需从 IndexedDB 取 */
  $effect(() => {
    for (const t of plan.tasks) {
      if (!t.photoRef || photoUrls[t.photoRef]) continue
      const ref = t.photoRef
      getPhotoBlob(ref).then((blob) => {
        if (blob) photoUrls = { ...photoUrls, [ref]: URL.createObjectURL(blob) }
      })
    }
  })

  // objectURL 不 revoke 就是内存泄漏:每次进整理页都新建一批,离开时浏览器不会自动回收。
  onDestroy(() => {
    for (const url of Object.values(photoUrls)) URL.revokeObjectURL(url)
  })

  /** @param {number} min */
  function dur(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h ? `${h} 小时 ${m ? `${m} 分` : ''}` : `${m} 分钟`
  }

  /** @param {number} ratio */
  function pct(ratio) {
    return `${Math.round(ratio * 100)}%`
  }

  /** @param {{ parts: { score: number, detail: string }[] }} z 热点/杂乱行的「为什么」*/
  function clutterWhy(z) {
    return z.parts.filter((p) => p.score > 2).map((p) => p.detail).join(' · ') || '状态良好'
  }

  const KIND_TAGS = {
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

  // 科学顺序流程条:KC Davis「五件事法」+ 保洁金律(地面最后)。常驻在计划顶上,
  // 方法学看得见,任务里的步骤顺序才不像是随机排的。
  const METHOD_FLOW = [
    { ico: '🗑️', zh: '垃圾' },
    { ico: '🍽️', zh: '碗盘' },
    { ico: '👕', zh: '衣物' },
    { ico: '📥', zh: '归位' },
    { ico: '🧽', zh: '擦拭' },
    { ico: '🧹', zh: '地面' },
  ]

  /**
   * METHOD_FLOW 描述的是「房间状态」那一类任务(垃圾/台面/地面…),它们要 VLM
   * 认过房间才算得出来。几何类任务(堵门/瓶颈/复扫)不走这套流程 —— 它们是
   * 「这条路走不通」,不是「这儿脏」。
   * 所以流程条跟着任务走:有它描述的活才亮出来,没有就不摆。
   */
  const METHOD_KINDS = new Set([
    'hygiene',
    'surfaces',
    'floorClutter',
    'floorClean',
    'messy',
    'overflow',
  ])

  // 阶段分组:任务本来就按这个优先级排好(tidy-plan 的 P 表),这里只是把
  // 同类套上编号标题 —— 人看的是「今天分三步走」,不是一条平铺的清单。
  const PHASES = [
    { zh: '先把路走通', desc: '被堵的门、过窄的通道 —— 不是整洁问题,是每天都要绕的问题', kinds: ['blockedDoor', 'bottleneck'] },
    { zh: '卫生隐患先出屋', desc: '垃圾、碗筷、衣物 —— 最快、最该先清,进度也立刻看得见', kinds: ['hygiene'] },
    { zh: '腾出平面', desc: '先台面后地面 —— 平面空了才有地方铺开分类', kinds: ['surfaces', 'floorClutter', 'overflow', 'messy'] },
    { zh: '梳理储物', desc: '柜子里的存量过一遍:留下 · 送人/卖 · 扔', kinds: ['storage'] },
    { zh: '最后才是地面清洁', desc: '保洁金律:先扫地,等会儿收拾时灰又落一地 —— 等于白扫', kinds: ['floorClean'] },
    { zh: '复扫对比', desc: '整理完拿证据看变化', kinds: ['rescan'] },
  ]
  // ⚠️ 兜底那一组不能省:PHASES 是按 kind 白名单分的,tidy-plan 新加一类而这里
  // 忘了跟,那类任务就从页面上**静默消失** —— 计划里明明有、屏幕上就是没有,
  // 而且不报错。宁可让它落在「其他」里显得丑,也不能让人少做一件事。
  const phaseGroups = $derived.by(() => {
    // 任务少就不分组:实测算出来 3 件,却被切成「先把路走通」(2 件)和「复扫对比」
    // (1 件)两段 —— 每段一个编号标题 + 一句解释,分组的开销比它组织的内容还大。
    // 分组和筛选器是同一个病:都是为「多」准备的工具,用在「少」上就是纯噪音
    // (留白已经把它们分开了,不需要再加一层标题)。任务真多起来时它自己会回来。
    if (plan.tasks.length <= FLAT_MAX_TASKS) {
      return [{ zh: '', desc: '', kinds: [], tasks: plan.tasks }]
    }
    const known = new Set(PHASES.flatMap((p) => p.kinds))
    const groups = PHASES.map((p) => ({
      ...p,
      tasks: plan.tasks.filter((t) => p.kinds.includes(t.kind)),
    }))
    const orphans = plan.tasks.filter((t) => !known.has(t.kind))
    if (orphans.length) {
      groups.push({ zh: '其他', desc: '还没归类的任务', kinds: [], tasks: orphans })
    }
    return groups.filter((g) => g.tasks.length)
  })

  /** 流程条只在下面真有它描述的那类任务时才亮 —— 见 METHOD_KINDS */
  const showMethodFlow = $derived(plan.tasks.some((t) => METHOD_KINDS.has(t.kind)))

  /**
   * 展开哪张卡。null = 跟着「下一件」走(默认只摊开那一张)。
   *
   * 之前是每张卡全摊开:3 件任务 × (2–3 个步骤 + 一张小地图 + 进度条) 摞成一堵墙,
   * 而顶上那个 CTA 刚说完「不用自己找从哪开始」—— 说完就把全部摊开让人自己找。
   * 收起来不是为了好看,是因为 progressive disclosure 的正题:此刻只有一件事能动手,
   * 其余的步骤细节都是干扰(NN/G:只呈现当前这一步需要的东西)。
   * 标题、耗时、标签仍然留在外面 —— 收起的是「怎么做」,不是「有什么」。
   */
  let openTask = $state(/** @type {string | null} */ (null))
  const taskOpen = (/** @type {string} */ id) =>
    openTask === null ? id === nextTaskId : openTask === id
  /** @param {string} id */
  function toggleTask(id) {
    openTask = taskOpen(id) ? '' : id
  }

  /**
   * 步骤图标:纯展示层的关键词映射,步骤文案仍是唯一事实(tidy-plan 出的字符串)。
   * 认不出就给个中性箭头,不硬凑。
   * @param {string} s
   */
  function stepIcon(s) {
    if (s.includes('垃圾')) return '🗑️'
    if (/碗|餐具|水槽|洗衣篮|衣物/.test(s)) return '🧺'
    if (/临时箱/.test(s)) return '📦'
    if (/归位|送回/.test(s)) return '📥'
    if (/擦/.test(s)) return '🧽'
    if (/扫\/吸|吸地|拖地|扫地/.test(s)) return '🧹'
    if (/三个袋/.test(s)) return '🛍️'
    if (/取出/.test(s)) return '📤'
    if (/标签/.test(s)) return '🏷️'
    if (/挪|开口|挡/.test(s)) return '🛋️'
    if (/确认|目标/.test(s)) return '✅'
    if (/重扫|拍|照片|上传/.test(s)) return '📷'
    return '▸'
  }

  // ---- 事件流(能力17:追加日志,不覆盖历史) ----
  /** @type {any[] | null} */
  let events = $state(null)
  const insights = $derived(events ? summarizeEvents(events) : null)
  const rejected = $derived(events ? rejectedSignatures(events) : new Map())

  $effect(() => {
    if (events === null) {
      listEvents().then(async (list) => {
        events = list
        // 云同步(append-only 镜像):拉到别的设备的事件就刷新洞察;
        // 未登录/离线静默跳过,不挡本地
        const res = await syncEvents()
        if (res.pulled > 0) events = await listEvents()
      })
    }
  })

  // 杂乱越线 → 记事件(7 天去抖:分数在阈值上方波动不刷屏)。
  // 「反复变乱」的时间线就是这么攒出来的。
  const CLUTTER_EVENT_THRESHOLD = 60
  let clutterLogged = false
  $effect(() => {
    if (clutterLogged || events === null || !clutter.zones.length) return
    clutterLogged = true
    const now = Date.now()
    const entries = clutter.zones
      .filter(
        (z) =>
          z.score >= CLUTTER_EVENT_THRESHOLD &&
          !recentlyMarkedCluttered(events, z.zoneId, now),
      )
      .map((z) => ({ zoneId: z.zoneId, nameZh: z.nameZh, score: z.score }))
    for (const e of entries) {
      void logEvent('zone_cluttered', { zoneId: e.zoneId }, { nameZh: e.nameZh, score: e.score })
    }
  })

  /** 忽略一套布局方案:记事件,同款签名以后不再推 */
  function rejectProposal(prop) {
    void logEvent(
      'layout_rejected',
      { signature: prop.signature ?? '' },
      { profile: prop.profile.nameZh, moves: prop.moves.length },
    )
    events = [
      ...(events ?? []),
      { id: `local-${Date.now()}`, ts: Date.now(), type: 'layout_rejected', subject: { signature: prop.signature ?? '' }, data: {}, v: 1 },
    ]
  }

  // ---- 布局方案(能力14:约束求解,几何裁决) ----
  /** @type {Awaited<ReturnType<typeof solveAllProfiles>> | null} */
  let proposals = $state(null)
  let solving = $state(false)
  let solveProgress = $state('')
  let solveError = $state('')

  const PROFILE_COUNT = 3

  async function runSolver() {
    if (solving) return
    solving = true
    solveError = ''
    proposals = null
    try {
      const { solveAllProfiles } = await import('$lib/spatial/layout-solve.js')
      // 分块异步:每 16 次迭代让出事件循环 —— 真实户型一套要几秒,
      // 同步跑会把整个页面(和被节流的定时器)一起冻住。
      // 静态底图缓存(buildCirculationBase)8× 提速后,把省下的时间换成
      // 更多迭代 = 更优解:400×3 实测 ~9s,仍比原来的 160×3(30s)快
      proposals = await solveAllProfiles(getActiveProject(), {
        iterations: 400,
        seed: 42,
        yieldFn: () => new Promise((r) => setTimeout(r)),
        onProgress: (pi, frac) => {
          solveProgress = `${Math.round(((pi + frac) / PROFILE_COUNT) * 100)}%`
        },
      })
    } catch (e) {
      solveError = e instanceof Error ? e.message : String(e)
    } finally {
      solving = false
      solveProgress = ''
    }
  }

  /** @param {any} prop */
  function applyProposal(prop) {
    applyLayoutProposal(prop.moves, prop.profile.nameZh)
    proposals = null // 布局变了,旧方案作废 —— 想再看重新算
  }

  /** 用户锁定的家具数(方案不会挪它们;在平面图选中家具可锁/解锁) */
  const lockedCount = $derived(
    (project.placements ?? []).filter((p) => p.locked).length,
  )

  /**
   * 「这件不动」:锁在**现在的位置**(方案还没应用,家具没挪过),
   * 然后立刻重算 —— 其余家具围绕它重新优化。TestFit 式局部重算的入口。
   * @param {{ id: string }} mv
   */
  async function lockAndResolve(mv) {
    togglePlacementLocked(mv.id)
    await runSolver()
  }

  /**
   * 方案缩略图:方案后的摆法 + 搬动示意(幽灵框 = 原位置,箭头指新位置)。
   * 全部数据取自方案自身(moves.from + 方案 placements),不依赖当前户型 ——
   * 算完之后用户又编辑过别的,缩略图也不会画错。
   * @param {any} prop
   */
  function proposalSvg(prop) {
    const nextById = new Map(prop.project.placements.map((p) => [p.id, p]))
    const moveOverlay = prop.moves
      .map((m) => {
        const next = nextById.get(m.id)
        if (!next) return null
        // 转过 90° 的件,原脚印的宽深与现在互换
        const fw = m.rotated ? next.h : next.w
        const fh = m.rotated ? next.w : next.h
        return {
          from: { x: m.from.x, y: m.from.y, w: fw, h: fh },
          to: { x: next.x, y: next.y, w: next.w, h: next.h },
        }
      })
      .filter(Boolean)
    return renderFloorPlanSvg(prop.project, {
      compact: true,
      hideStorageZones: true,
      moveOverlay,
    })
  }

  /** @param {any} prop 方案的前后对比人话 */
  function proposalDelta(prop) {
    const parts = []
    const { before: b, after: a } = prop
    if (a.blocked < b.blocked) parts.push(`解开 ${b.blocked - a.blocked} 道堵住的门`)
    if (a.minWidthIn > b.minWidthIn) parts.push(`最窄通道 ${b.minWidthIn}→${a.minWidthIn} in`)
    else if (a.bottlenecks < b.bottlenecks) parts.push(`瓶颈 ${b.bottlenecks}→${a.bottlenecks} 处`)
    if (Math.round(a.tight * 100) < Math.round(b.tight * 100))
      parts.push(`紧张通道 ${pct(b.tight)}→${pct(a.tight)}`)
    if (a.wallFt > b.wallFt) parts.push(`可用贴墙 ${b.wallFt}→${a.wallFt} ft`)
    if (a.freeSqft > b.freeSqft + 1) parts.push(`可活动 +${Math.round(a.freeSqft - b.freeSqft)} sqft`)
    if (Math.round(a.openIn) > Math.round(b.openIn) + 2)
      parts.push(`开阔区 ${Math.round(b.openIn)}→${Math.round(a.openIn)} in`)
    // 设计规范偏差(配对/贴墙/使用净空/门扇/窗前/视线):英寸,降 = 更专业
    if (a.affinityIn < b.affinityIn - 2)
      parts.push(`更符合设计规范(偏差 ${b.affinityIn}→${a.affinityIn} in)`)
    // 日常步行:求解器不优化它,所以变好变坏都如实说(>5% 才值得提)
    if (a.walkFtPerDay != null && b.walkFtPerDay != null) {
      const diff = a.walkFtPerDay - b.walkFtPerDay
      if (Math.abs(diff) > b.walkFtPerDay * 0.05) {
        parts.push(
          `日常步行 ${b.walkFtPerDay}→${a.walkFtPerDay} ft/天(${diff < 0 ? '省' : '多'} ${Math.abs(Math.round((diff / b.walkFtPerDay) * 100))}%)`,
        )
      }
    }
    return parts.length ? parts.join(' · ') : '与现状指标接近'
  }
</script>

<svelte:head><title>整理 · HOME.OS</title></svelte:head>

<div class="tidy-page plan-top">
  <!-- 统一页面顶栏(与 /plan /storage 同一个 HomeTopBar)。此前 /tidy 没有页内
       header,靠全局 AppBar 顶着标题(居中样式),是三页顶栏不统一的根源之一。 -->
  <HomeTopBar title="整理" ariaLabel="整理工具栏" subtitle={topbarSubtitle} />

  <!-- 桌面双栏:主列(下面全部内容)+ 右侧情境列(当前空间小平面图,sticky)。
       窄屏(<1080px)时右列收起,起点定位图回到 hero 内部原来的位置 —— 两处各自
       渲染一次 renderFloorPlanSvg,靠 CSS 切换显示哪个,不让同一个 {@html} 节点
       跨断点在 DOM 里搬家。 -->
  <div class="tidy-layout">
  <div class="tidy-main">
  <!-- ① 今日建议 hero —— 页面唯一的主角。回答的是「我现在最该做什么」,
       不是「系统分析了什么」。视觉上比其余一切都大、都松。 -->
  <section class="hero">
    <div class="hero-main">
      {#if !plan.tasks.length}
        <p class="hero-eyebrow">今日建议</p>
        <h2 class="hero-title">暂时没有要整理的</h2>
        <p class="hero-sub">{plan.summary}</p>
      {:else if allDone}
        <p class="hero-eyebrow">今日建议</p>
        <h2 class="hero-title">今天的计划都做完了 🎉</h2>
        <p class="hero-sub">拿 iPhone 复扫一遍,新旧两版直接比对 —— 那是今天的收据。</p>
        <div class="hero-actions">
          <a class="hero-cta" href="/plan">去平面图复扫</a>
          <button type="button" class="hero-quiet" onclick={clearTidyProgress}>重置勾选</button>
        </div>
      {:else if nextTask}
        <p class="hero-eyebrow">今日建议 · 从这件开始</p>
        <h2 class="hero-title">{nextTask.title}</h2>
        <p class="hero-sub">{nextTask.reason}</p>
        <p class="hero-meta">
          这件约 {nextTask.estMinutes} 分钟 · {EFFORT_LABEL[nextTask.effort]}{#if plan.tasks.length > 1}
            &nbsp;·&nbsp; 全部 {plan.tasks.length} 件约 {dur(remainMinutes)}{/if}
        </p>
        <div class="hero-actions">
          <a class="hero-cta" href="/tidy/go">开始整理</a>
          <span class="hero-note">一屏一件事,做完点下一件</span>
        </div>
      {/if}
    </div>
    <!-- 空间是主媒介:起点在屋里哪,一张圈好的图顶一句话 -->
    {#if nextTask?.focus}
      <a class="hero-map" href="/plan" data-sveltekit-noscroll aria-label="在平面图上查看起点">
        <span class="hero-map-frame">
          {@html renderFloorPlanSvg(project, {
            compact: true,
            showFurniture: true,
            hideStorageZones: true,
            focus: nextTask.focus,
          })}
        </span>
        <span class="hero-map-cap">📍 从这里开始</span>
      </a>
    {/if}
  </section>

  <!-- ② 房屋热点:前三名,理由前置、分数退后 —— 分数只是佐证,不是主角 -->
  {#if hotspots.length}
    <section class="hot">
      <h2 class="sec-title">房屋热点</h2>
      <div class="hot-grid">
        {#each hotspots as z (z.zoneId)}
          <article class="hot-card" class:hot-high={z.score >= 60}>
            <div class="hot-top">
              <span class="hot-name">{z.nameZh}</span>
              <span class="hot-score" class:score-high={z.score >= 60} class:score-mid={z.score >= 35 && z.score < 60}>{z.score}</span>
            </div>
            <p class="hot-why">{clutterWhy(z)}</p>
            <div class="hot-bar" aria-hidden="true">
              <span
                class="hot-bar-fill"
                class:fill-high={z.score >= 60}
                class:fill-mid={z.score >= 35 && z.score < 60}
                style:width={`${Math.min(z.score, 100)}%`}
              ></span>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ③ 整理计划 —— hero 的展开态:全部任务、方法条、阶段分组 -->
  <section class="plan-card">
    <div class="plan-head">
      <h2 class="sec-title sec-title-in">整理计划</h2>
      {#if plan.tasks.length}
        <span class="plan-sum">
          {doneCount}/{plan.tasks.length} 完成 · 剩 {dur(remainMinutes)}
        </span>
      {/if}
    </div>

    <!-- 筛选器只在真的挑不过来时才出现。
         实测这个家算出来 3 件任务,而这排 chip 有 7 个 —— 筛选器比它要筛的东西还多。
         筛选存在的意义是「从多里挑少」(NN/G: providing tools for narrowing down
         choices),3 件任务没有多可挑,于是它自己变成了要做的第一个决定:
         选择过载(Hick's Law —— 选项越多,决策越慢)。
         门槛取 6:少于这个数,一眼扫完比筛快;超过了,筛选才开始还本。 -->
    {#if plan.allCount > FILTER_MIN_TASKS}
      <div class="budget">
        <span class="budget-label">今天有</span>
        {#each TIME_OPTS as o (o.label)}
          <button
            type="button"
            class="chip"
            class:chip-on={budgetMin === o.v}
            onclick={() => (budgetMin = o.v)}>{o.label}</button
          >
        {/each}
        <span class="budget-label budget-gap">力气</span>
        {#each EFFORT_OPTS as o (o.label)}
          <button
            type="button"
            class="chip"
            class:chip-on={effortCap === o.v}
            onclick={() => (effortCap = o.v)}>{o.label}</button
          >
        {/each}
      </div>
    {/if}

    {#if !plan.tasks.length}
      <p class="empty">{plan.summary}</p>
    {:else}
      {#if plan.needsVlm}
        <p class="hint-line">
          <a href="/plan">给房间跑一遍识别</a> → 还能算出「哪里堆满了、堆的是什么」
        </p>
      {/if}

      <!-- 方法条:每间屋都按这个顺序走。垃圾先出屋(卫生隐患 + 进度立刻可见),
           地面永远最后(先扫地等于白扫)。摆在最上面,下面每张卡的步骤顺序才不像
           是随机排的 —— 那是同一套方法在不同房间的展开。
           ——
           但它只在**下面真有这类任务**时才成立。还没跑 VLM 识别时,算得出的只有
           几何类任务(堵门/瓶颈/复扫),一件都不属于垃圾→碗盘→衣物→归位→擦拭→地面。
           那时候它就不是方法学,是一条宣称「按这个顺序走」却没有一步对得上的装饰条 ——
           比没有更糟:它让人以为自己漏看了什么。 -->
      {#if showMethodFlow}
      <ol class="flow" aria-label="每间屋的通用顺序">
        {#each METHOD_FLOW as f, i (f.zh)}
          <li class="flow-step">
            <span class="flow-ico" aria-hidden="true">{f.ico}</span>
            <span class="flow-zh">{f.zh}</span>
            {#if i < METHOD_FLOW.length - 1}<span class="flow-arrow" aria-hidden="true">→</span>{/if}
          </li>
        {/each}
      </ol>
      {/if}

      {#each phaseGroups as g, gi (g.zh)}
        <section class="phase" class:phase-flat={!g.zh}>
          <!-- 任务少时 phaseGroups 只给一个无名组(见那儿的注释):没有标题、没有解释,
               卡片直接平铺 —— 顶上的进度「0/3 完成」已经说明了总量。 -->
          {#if g.zh}
            <h3 class="phase-head">
              <span class="phase-num" aria-hidden="true">{gi + 1}</span>
              <span class="phase-zh">{g.zh}</span>
              <span class="phase-count">{g.tasks.filter((t) => isTidyTaskDone(t.id)).length}/{g.tasks.length}</span>
            </h3>
            <p class="phase-desc">{g.desc}</p>
          {/if}
          <ul class="task-list">
            {#each g.tasks as t (t.id)}
              {@const done = isTidyTaskDone(t.id)}
              {@const stepsDone = t.steps.filter((_, i) => isTidyStepDone(t.id, i)).length}
              <li class="task" class:task-done={done} class:task-next={t.id === nextTaskId}>
                <label class="task-head">
                  <input
                    type="checkbox"
                    checked={done}
                    onchange={(e) =>
                      setTidyTaskDone(t.id, e.currentTarget.checked, {
                        zoneId: t.zoneId,
                        zoneName: t.zoneName,
                      })}
                  />
                  <span class="task-title">{t.title}</span>
                  {#if t.id === nextTaskId}<span class="tag tag-next">从这开始</span>{/if}
                  {#if KIND_TAGS[t.kind]}
                    <span class="tag {KIND_TAGS[t.kind].cls}">{KIND_TAGS[t.kind].zh}</span>
                  {/if}
                  <span class="task-min">{EFFORT_LABEL[t.effort]} · {t.estMinutes} 分</span>
                </label>
                <p class="task-reason">{t.reason}</p>
                <button
                  type="button"
                  class="task-toggle"
                  aria-expanded={taskOpen(t.id)}
                  onclick={() => toggleTask(t.id)}
                >
                  {taskOpen(t.id) ? '收起步骤' : `怎么做 · ${t.steps.length} 步`}
                </button>
                {#if taskOpen(t.id)}
                <div class="task-body">
                  <div class="task-main">
                    {#if !done && stepsDone}
                      <div class="step-bar" role="progressbar" aria-valuenow={stepsDone} aria-valuemax={t.steps.length} aria-label="步骤进度">
                        <span class="step-bar-fill" style:width={`${(stepsDone / t.steps.length) * 100}%`}></span>
                      </div>
                    {/if}
                    <ol class="task-steps">
                      {#each t.steps as s, i}
                        {@const sDone = isTidyStepDone(t.id, i)}
                        <li class="step" class:step-done={sDone}>
                          <label class="step-label">
                            <input
                              type="checkbox"
                              checked={sDone}
                              onchange={(e) => setTidyStepDone(t.id, i, e.currentTarget.checked)}
                            />
                            <span class="step-ico" aria-hidden="true">{stepIcon(s)}</span>
                            <span class="step-text">{s}</span>
                          </label>
                        </li>
                      {/each}
                    </ol>
                  </div>

                  <div class="task-aside">
                    <!-- 「去哪」这件事,一张图顶一句话:取景框对准这道门/这个柜,
                         周围的墙和家具都在,人一眼认得出是屋里哪 —— 光写「厨房的门」
                         还得自己在脑子里找。 -->
                    {#if t.focus}
                      <a class="mini-map" href="/plan" data-sveltekit-noscroll aria-label="在平面图上查看{t.title}">
                        <span class="mini-frame">
                          {@html renderFloorPlanSvg(project, {
                            compact: true,
                            showFurniture: true,
                            hideStorageZones: true,
                            focus: t.focus,
                          })}
                        </span>
                        <span class="mini-cap">在这 · 打开平面图 →</span>
                      </a>
                    {/if}
                    {#if t.photoRef && photoUrls[t.photoRef]}
                      <figure class="before">
                        <img src={photoUrls[t.photoRef]} alt="整理前" />
                        <figcaption>整理前</figcaption>
                      </figure>
                    {/if}
                  </div>
                </div>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
      {#if doneCount && !allDone}
        <button type="button" class="btn-secondary reset" onclick={clearTidyProgress}>
          重置勾选
        </button>
      {/if}
    {/if}
  </section>

  <!-- ④ 拍照提醒 —— 它是「补齐空间证据」,不是待办工单:一条轻提醒,不占主叙事 -->
  {#if coverage.needs.length}
    <section class="shoot-strip">
      <span class="shoot-ico" aria-hidden="true">📷</span>
      <div class="shoot-body">
        <span class="shoot-lead">有 {coverage.needs.length} 个分区还看不清 —— 补拍后,热点和计划自动变准</span>
        <span class="shoot-chips">
          {#each coverage.needs as n (n.zoneId)}
            <a
              class="shoot-chip"
              class:chip-blind={n.status === 'missing' || n.status === 'noPhoto'}
              href={`/plan?shoot=${encodeURIComponent(n.zoneId)}`}
              title={n.reason}
            >{n.nameZh}</a>
          {/each}
        </span>
      </div>
    </section>
  {/if}

  <!-- ⑤ 更多洞察 —— 「凭什么这么排」。指标一个没删,只是默认收起:
       依据服务于计划,不该和计划抢首屏。 -->
  <button
    type="button"
    class="insights-toggle"
    aria-expanded={showInsights}
    onclick={() => (showInsights = !showInsights)}
  >
    <span class="insights-toggle-zh">更多洞察</span>
    <span class="insights-toggle-hint">空间利用率 · 完整杂乱榜 · 动线实测 · 布局方案 · 长期记录</span>
    <span class="insights-toggle-arrow" aria-hidden="true">{showInsights ? '收起 ↑' : '展开 ↓'}</span>
  </button>

  {#if showInsights}
  <div class="insights">
    {#if clutter.zones.length}
      <section class="block">
        <h2 class="block-title">杂乱指数(全部分区)</h2>
        <ul class="clutter-list">
          {#each clutter.zones as z (z.zoneId)}
            <li class="clutter-row" class:clutter-worst={z.zoneId === clutter.worst?.zoneId && z.score >= 40}>
              <span class="clutter-score" class:score-high={z.score >= 60} class:score-mid={z.score >= 35 && z.score < 60}>
                {z.score}
              </span>
              <div class="clutter-body">
                <span class="clutter-name">
                  {z.nameZh}
                  {#if !z.described}<span class="clutter-blind" title="这一区还没做照片识别,分数只含几何指标">未识别</span>{/if}
                </span>
                <span class="clutter-why">{clutterWhy(z)}</span>
              </div>
            </li>
          {/each}
        </ul>
        <p class="block-desc">
          分数由可解释指标合成:家具占地 + 通道紧张 + 动线受阻 + 照片识别的现场状态,不是模型凭感觉。
        </p>
      </section>
    {/if}

    <section class="block">
      <h2 class="block-title">空间利用率</h2>
      {#if !circ.ok}
        <p class="empty">{circ.reason}</p>
      {:else}
        <div class="totals">
          <div class="stat">
            <span class="stat-num">{circ.totals.areaSqft}</span>
            <span class="stat-label">总面积 sqft</span>
          </div>
          <div class="stat">
            <span class="stat-num">{pct(circ.totals.usedRatio)}</span>
            <span class="stat-label">家具占地</span>
          </div>
          <div class="stat">
            <span class="stat-num">{circ.totals.freeSqft}</span>
            <span class="stat-label">可活动 sqft</span>
          </div>
        </div>
        <ul class="zone-list">
          {#each circ.zoneStats as z (z.zoneId)}
            <li class="zone-row">
              <span class="zone-name">{z.nameZh}</span>
              <div class="bar" title="家具占 {pct(z.usedRatio)}">
                <div class="bar-fill" style="width: {pct(z.usedRatio)}"></div>
              </div>
              <span class="zone-num">{z.areaSqft} sqft · 占 {pct(z.usedRatio)}</span>
            </li>
          {/each}
        </ul>
        <p class="block-desc">
          家具占地率超过 60% 的区域通常已经转不开身;窄处占比高说明得侧身走。
        </p>
      {/if}
    </section>

    {#if circ.ok && (circ.bottlenecks.length || circ.blockedDoors.length || circ.isolatedZones.length)}
      <section class="block">
        <h2 class="block-title">动线实测</h2>
        <ul class="issue-list">
          {#each circ.blockedDoors as d (d.id)}
            <li class="issue issue-urgent">
              🚪 {d.nameZh ?? '有一道门'}:{d.reason}{#if d.blockers?.length}（{d.blockers.map((b) => `「${b.label}」`).join('')}挡着）{/if}
            </li>
          {/each}
          {#each circ.isolatedZones as z (z.zoneId)}
            <li class="issue issue-urgent">🧱 {z.nameZh}从主通道走不进去</li>
          {/each}
          {#each circ.bottlenecks as b (b.zoneId ?? b.x)}
            <li class="issue" class:issue-urgent={b.widthIn < CLEARANCE.minimum}>
              ↔️ {b.nameZh ?? '通道'}最窄处只有 {b.widthIn} 英寸
              <span class="issue-hint">
                (舒适 {CLEARANCE.comfortable} · 单人 {CLEARANCE.tight})
              </span>
            </li>
          {/each}
        </ul>
        <p class="block-desc">这些问题已经折算进上面的整理计划 —— 这里是原始实测,供核对。</p>
      </section>
    {/if}

    {#if taskRoutes.ok && taskRoutes.routes.length}
      <section class="block">
        <h2 class="block-title">日常路径</h2>
        <ul class="issue-list">
          {#each taskRoutes.routes as r (r.key)}
            <li class="issue" class:issue-urgent={r.lengthFt === null}>
              {r.lengthFt === null ? '🚧' : '👣'} {r.zh}:{r.lengthFt === null
                ? '走不通 —— 路被家具堵死了'
                : `${r.lengthFt} ft`}
              <span class="issue-hint">约 {r.perDay} 次/天</span>
            </li>
          {/each}
        </ul>
        <p class="block-desc">
          按常识频率估算的高频任务链,合计约 {taskRoutes.dailyWalkFt ?? '—'} ft/天(含往返)。
          布局方案对比里的「日常步行」就来自这套链路;等使用记录攒够后会换成你家的实测频率。
        </p>
      </section>
    {/if}

    {#if circ.ok}
      <section class="block">
        <div class="plan-head">
          <h2 class="block-title">布局方案</h2>
          <button type="button" class="solve-btn" onclick={runSolver} disabled={solving}>
            {solving ? `计算中 ${solveProgress}` : proposals ? '重新计算' : '算三套方案'}
          </button>
        </div>
        {#if solveError}
          <p class="proposal-none">求解失败:{solveError}</p>
        {/if}
        {#if !proposals && !solving && !solveError}
          <p class="block-desc">
            想从根本上改善?用现有家具求解更好的摆法(几何引擎裁决:不重叠、不堵门、动线只许更好)。
            三个目标:最少折腾 / 最佳动线 / 最大收纳。
            不想被挪的家具,在平面图选中它点「锁定」—— 方案会围绕锁定件优化其余家具。
          </p>
        {/if}
        {#if lockedCount > 0}
          <p class="locked-hint">
            🔒 已锁定 {lockedCount} 件 —— 方案不会挪它们(平面图选中家具可解锁)
          </p>
        {/if}
        {#if proposals}
          <div class="proposal-grid">
            {#each proposals as prop (prop.profile.key)}
              <article class="proposal" class:proposal-idle={!prop.ok}>
                <header class="proposal-head">
                  <b>{prop.profile.nameZh}</b>
                  <span class="proposal-desc">{prop.profile.desc}</span>
                </header>
                {#if !prop.ok}
                  <p class="proposal-none">{prop.reason}</p>
                {:else if prop.signature && rejected.has(prop.signature)}
                  <!-- 能力17:你否决过的方案不再重复推销 -->
                  <p class="proposal-none">这套方案你之前忽略过,不再推荐(重新计算可能给出新解)</p>
                {:else if prop.duplicateOfZh}
                  <p class="proposal-none">与「{prop.duplicateOfZh}」方案完全相同</p>
                {:else}
                  <!-- 一眼看懂方案:虚线框 = 现在在哪,箭头指向建议的新位置 -->
                  <div class="proposal-thumb" aria-label="方案平面预览">
                    {@html proposalSvg(prop)}
                  </div>
                  <p class="proposal-delta">{proposalDelta(prop)}</p>
                  {#if prop.fragile}
                    <p class="proposal-warn">
                      ⚠ 最窄通道距侧身极限只剩 {prop.slackIn} in —— 尺寸稍有实测误差就可能不够,执行前建议现场量一下
                    </p>
                  {/if}
                  {#if prop.status === 'provisional'}
                    <div class="proposal-warn">
                      <b>⏳ 暂定方案 —— 建议先补确认再照着搬:</b>
                      <ul class="warn-list">
                        {#each prop.provisionalReasons ?? [] as r (r.code + r.label)}
                          <li>{r.zh}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                  {#if prop.unmetRelations?.length}
                    <div class="proposal-note">
                      🎯 你的家规,这套尽力了但没完全满足:
                      <ul class="warn-list">
                        {#each prop.unmetRelations as u (u.label + u.targetLabel + u.type)}
                          <li>{u.zh}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                  <ul class="move-list">
                    {#each prop.moves as mv (mv.id)}
                      <li class="move-row">
                        <span class="move-name">{mv.label}</span>
                        <span class="move-how">
                          {mv.directionZh}挪 {mv.movedFt} ft{#if mv.rotated}
                            · 转 90°{/if}{#if mv.withZh}
                            · 跟着{mv.withZh}{/if}{#if mv.heavy}
                            · <b class="move-heavy">建议两人</b>{/if}
                        </span>
                        <button
                          type="button"
                          class="move-lock-btn"
                          disabled={solving}
                          title="不想挪这件?锁在现在的位置,立刻重算 —— 其余家具围绕它优化"
                          onclick={() => lockAndResolve(mv)}
                        >🔒 不挪它</button>
                      </li>
                    {/each}
                  </ul>
                  <div class="proposal-actions">
                    <button type="button" class="apply-btn" onclick={() => applyProposal(prop)}>
                      应用此方案({prop.moves.length} 件,可撤销)
                    </button>
                    <button
                      type="button"
                      class="reject-btn"
                      title="记住这个偏好:同款方案以后不再推荐"
                      onclick={() => rejectProposal(prop)}
                    >
                      忽略
                    </button>
                  </div>
                {/if}
              </article>
            {/each}
          </div>
          <p class="block-desc">
            应用后家具位置立即更新(平面页可一步撤销);搬完实物后重扫一次,
            跨扫描身份会把「真挪了」确认下来。
          </p>
        {/if}
      </section>
    {/if}

    {#if insights && insights.total > 0}
      <section class="block">
        <h2 class="block-title">长期观察</h2>
        <ul class="insight-list">
          {#each insights.recurrence as r (r.zoneId)}
            <li class="insight insight-warn">
              🔁 <b>{r.nameZh}</b> 近 30 天变乱 {r.times} 次{#if r.afterTidy > 0},其中
                {r.afterTidy} 次发生在整理完成后一周内 ——
                问题可能不是「没整理」,而是这里的收纳位置不符合使用习惯{/if}
            </li>
          {/each}
          {#each insights.frequentMovers as m (m.placementId)}
            <li class="insight">
              📦 「{m.label}」被挪动 {m.count} 次(累计 {Math.round(m.totalFt)} ft)——
              它可能还没有真正合适的固定位置
            </li>
          {/each}
          {#if insights.rejectedCount > 0}
            <li class="insight">
              🚫 已记住 {insights.rejectedCount} 套被你忽略的布局方案,不再重复推荐
            </li>
          {/if}
          {#if !insights.recurrence.length && !insights.frequentMovers.length && insights.rejectedCount === 0}
            <li class="insight">
              📈 已记录 {insights.total} 条事件(扫描确认/整理/收纳),还没攒出模式 ——
              继续正常使用,反复变乱的区域和总在漂的家具会在这里现形
            </li>
          {/if}
        </ul>
        <p class="block-desc">
          每次扫描、整理和收纳修改都会成为事件,只追加不覆盖 ——
          系统学的是行为事实(哪里反复变乱、什么总被挪),不是凭感觉画像。
          共 {insights.total} 条,{insights.sinceDays} 天。
        </p>
      </section>
    {/if}
  </div>
  {/if}
  </div>

  {#if nextTask?.focus}
    <aside class="tidy-aside">
      <InspectorPanel title="当前空间" bodyPad="0">
        <a
          class="aside-map"
          href="/plan"
          data-sveltekit-noscroll
          aria-label="在平面图上查看起点"
        >
          <span class="aside-map-frame">
            {@html renderFloorPlanSvg(project, {
              compact: true,
              showFurniture: true,
              hideStorageZones: true,
              focus: nextTask.focus,
            })}
          </span>
          <span class="aside-map-cap">📍 从这里开始</span>
        </a>
      </InspectorPanel>
    </aside>
  {/if}
  </div>
</div>

<style>
  /* ============ 视觉系统 ============
     从「深色后台」改成「安静的生活工作台」:
     - 分层靠 surface(卡浮在 bg 上)+ 阴影,不靠描边 —— 从「框起来」改为「摆出来」
     - 一种主强调色(品牌 --accent 蓝灰),状态色只出现在小标签和细条上
     - 大圆角统一 18px,section 之间 24px 呼吸
     - 分数退后(小号、灰),理由和行动前置 */
  .tidy-page {
    display: flex;
    flex-direction: column;
  }

  /* 主列(下面全部内容)+ 右侧情境列的外层容器。默认单列;≥1080px 才变双栏
     (见下方媒体查询) —— 桌面内容宽度这才从原来居中的 880px 单列跨过去。 */
  .tidy-layout {
    width: 100%;
    max-width: 880px;
    margin: 0 auto;
    padding: 20px 16px 56px;
  }

  .tidy-main {
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  }

  /* 桌面双栏时的右侧情境列;窄屏下即使渲染了也不显示 —— 见 hero-map 那份
     mini-map 承担窄屏展示,两处各自渲染,不共用一个跨断点搬家的 DOM 节点。 */
  .tidy-aside {
    display: none;
  }

  .aside-map {
    display: block;
    text-decoration: none;
    background: var(--plan-paper, #eef1f4);
  }

  .aside-map:hover {
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .aside-map-frame {
    display: block;
    pointer-events: none;
  }

  .aside-map-frame :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .aside-map-cap {
    display: block;
    padding: 9px 12px;
    background: var(--card);
    border-top: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }

  @media (min-width: 1080px) {
    .tidy-layout {
      max-width: 1180px;
      display: grid;
      grid-template-columns: 1fr 360px;
      align-items: start;
      gap: 24px;
    }

    .tidy-aside {
      display: block;
      position: sticky;
      top: 20px;
    }

    /* 起点定位图已经挪到右侧常驻列,hero 内的那份收起,避免重复。 */
    .hero-map {
      display: none;
    }
  }

  /* 卡片的公共语言:无边框,浅浮起。暗色下 --card(#1f252b)本身就比 --bg 亮一档,
     不需要描边也拉得开;亮色下靠阴影。 */
  .hero,
  .plan-card,
  .hot-card,
  .shoot-strip,
  .block {
    background: var(--card);
    border-radius: 18px;
    box-shadow:
      0 1px 2px rgba(12, 18, 24, 0.05),
      0 12px 32px -18px rgba(12, 18, 24, 0.22);
  }

  /* 页面内 section 标题(卡外的小引导),比正文退后、比 meta 有存在感 */
  .sec-title {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--t3);
  }
  .sec-title-in {
    margin: 0;
  }

  /* ---------- ① hero ---------- */
  .hero {
    display: flex;
    align-items: stretch;
    gap: 24px;
    padding: 28px 28px 26px;
  }

  .hero-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .hero-eyebrow {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .hero-title {
    margin: 0 0 8px;
    font-size: 1.5rem;
    line-height: 1.3;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--t1);
  }

  .hero-sub {
    margin: 0 0 6px;
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--t2);
  }

  .hero-meta {
    margin: 0;
    font-size: 0.8rem;
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }

  .hero-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 18px;
  }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    padding: 12px 26px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.95rem;
    font-weight: 700;
    text-decoration: none;
    transition: filter 0.15s;
  }
  .hero-cta:hover {
    filter: brightness(1.08);
  }
  .hero-cta:active {
    transform: scale(0.98);
  }

  .hero-note {
    font-size: 0.78rem;
    color: var(--t3);
  }

  .hero-quiet {
    padding: 10px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: none;
    color: var(--t2);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .hero-quiet:hover {
    color: var(--t1);
    border-color: var(--border-l);
  }

  /* hero 右侧:起点定位图 —— 空间是这页的主媒介,不是表格 */
  .hero-map {
    flex: none;
    width: 218px;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    overflow: hidden;
    background: var(--plan-paper, #eef1f4);
    text-decoration: none;
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .hero-map:hover {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .hero-map-frame {
    display: block;
    flex: 1;
    min-height: 0;
    pointer-events: none;
  }
  .hero-map-frame :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    max-height: 150px;
  }
  .hero-map-cap {
    display: block;
    padding: 7px 10px;
    background: var(--card);
    border-top: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
  }

  /* ---------- ② 房屋热点 ---------- */
  .hot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .hot-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 18px 14px;
  }

  .hot-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .hot-name {
    font-size: 0.95rem;
    font-weight: 650;
    color: var(--t1);
  }

  /* 分数是佐证:小号、灰底,不再是一列大红数字 */
  .hot-score {
    flex: none;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 700;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent-bg);
    color: var(--t2);
  }
  .hot-score.score-mid {
    background: rgba(180, 83, 9, 0.12);
    color: #b45309;
  }
  .hot-score.score-high {
    background: rgba(163, 52, 31, 0.12);
    color: #a3341f;
  }

  .hot-why {
    margin: 0;
    flex: 1;
    font-size: 0.8rem;
    line-height: 1.55;
    color: var(--t2);
  }

  .hot-bar {
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--t4) 24%, transparent);
    overflow: hidden;
    margin-top: 4px;
  }
  .hot-bar-fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
  }
  .hot-bar-fill.fill-mid {
    background: #b45309;
  }
  .hot-bar-fill.fill-high {
    background: #a3341f;
  }

  /* ---------- ③ 整理计划 ---------- */
  .plan-card {
    padding: 22px 24px 24px;
  }

  .plan-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .plan-sum {
    font-size: 12px;
    color: var(--t2);
    font-variant-numeric: tabular-nums;
  }

  /* 一行旁注,不是一段说明 */
  .hint-line {
    margin: 14px 0 0;
    font-size: 12px;
    color: var(--t2);
  }
  .hint-line a {
    color: var(--accent);
  }

  .budget {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin: 12px 0 0;
  }

  .budget-label {
    font-size: 12px;
    color: var(--t3);
  }

  .budget-gap {
    margin-left: 8px;
  }

  .chip {
    font-size: 12px;
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }

  .chip-on {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent);
    font-weight: 600;
  }

  /* 方法条 —— 每间屋的通用顺序,常驻在计划顶上。tint 分层,不描边 */
  .flow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    list-style: none;
    margin: 14px 0 4px;
    padding: 9px 14px;
    border-radius: 999px;
    background: var(--accent-bg);
  }

  .flow-step {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--t2);
    white-space: nowrap;
  }

  .flow-ico {
    font-size: 13px;
    line-height: 1;
  }

  .flow-zh {
    font-weight: 600;
  }

  .flow-arrow {
    margin: 0 4px 0 6px;
    color: var(--t3);
    opacity: 0.6;
  }

  /* 阶段分组 —— 今天分几步走,而不是一条平铺的清单 */
  .phase {
    margin-top: 20px;
  }

  /* 平铺(无阶段标题)时,任务和上面的头部之间要有呼吸 */
  .phase-flat {
    margin-top: 14px;
  }

  .phase-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--t1);
  }

  .phase-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 11px;
    font-weight: 700;
    flex: none;
  }

  .phase-zh {
    flex: 1;
  }

  .phase-count {
    font-size: 11px;
    font-weight: 600;
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }

  .phase-desc {
    margin: 3px 0 4px 26px;
    font-size: 11px;
    line-height: 1.6;
    color: var(--t3);
  }

  /* 任务:摆出来,不框起来 —— 行间靠 hairline 分隔;
     只有「下一件」有一块 tint 底,它是清单里唯一被点亮的 */
  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .task {
    padding: 16px 2px;
  }
  .task + .task {
    border-top: 1px solid var(--border);
  }

  .task-next {
    background: var(--accent-bg);
    border-radius: 14px;
    padding: 16px 14px;
    margin: 4px 0;
  }
  /* tint 块自己就是分隔,贴着它的 hairline 会撞圆角 */
  .task-next + .task,
  .task-next {
    border-top: 0;
  }

  .task-done {
    opacity: 0.5;
  }

  .task-done .task-title {
    text-decoration: line-through;
  }

  .task-head {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .task-head input {
    accent-color: var(--accent);
  }

  .task-title {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--t1);
    flex: 1;
  }

  .task-min {
    font-size: 11px;
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }

  .tag {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 999px;
  }

  .tag-urgent {
    background: rgba(163, 52, 31, 0.13);
    color: #a3341f;
  }

  .tag-warn {
    background: rgba(180, 83, 9, 0.13);
    color: #b45309;
  }

  .tag-info {
    background: var(--accent-bg);
    color: var(--t2);
  }

  .tag-next {
    background: var(--accent);
    color: var(--on-accent);
  }

  .task-reason {
    font-size: 12px;
    color: var(--t2);
    margin: 6px 0 0 26px;
    line-height: 1.55;
  }

  /* 展开「怎么做」的把手。低调:它不是行动召唤 —— 真正的行动是上面那个复选框
     和 hero 的开始整理,这个只是「让我先看看这件要干嘛」。 */
  .task-toggle {
    margin: 6px 0 0 26px;
    padding: 2px 0;
    background: none;
    border: 0;
    color: var(--t2);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .task-toggle:hover {
    color: var(--t1);
  }

  .task-body {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin: 8px 0 0 26px;
  }

  .task-main {
    flex: 1;
    min-width: 0;
  }

  .step-bar {
    height: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--t4) 24%, transparent);
    overflow: hidden;
    margin-bottom: 8px;
  }

  .step-bar-fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }

  /* 竖排任务步骤清单。类名不能叫 .steps —— 那是 lifeOS 设计系统保留给
     「向导步骤」横向 stepper 的组件类(theme/components.css),全局 display:flex
     会漏进来把这份竖清单压成横向多列(2026-07 踩过)。 */
  .task-steps {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  .step-label {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 3px 0;
    cursor: pointer;
    font-size: 12px;
    color: var(--t2);
    line-height: 1.6;
  }

  .step-label input {
    flex: none;
    margin: 0;
    align-self: center;
    accent-color: var(--accent);
  }

  .step-ico {
    flex: none;
    width: 15px;
    text-align: center;
    font-size: 12px;
  }

  .step-text {
    flex: 1;
    min-width: 0;
  }

  .step-done .step-text {
    text-decoration: line-through;
    opacity: 0.55;
  }

  .task-aside {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  /* 定位小图 —— 「去哪」一张图顶一句话 */
  .mini-map {
    display: block;
    width: 148px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--plan-paper, #eef1f4);
    text-decoration: none;
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .mini-map:hover {
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .mini-frame {
    display: block;
    pointer-events: none;
  }

  .mini-frame :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    max-height: 110px;
  }

  .mini-cap {
    display: block;
    padding: 5px 8px;
    border-top: 1px solid var(--border);
    background: var(--card);
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
  }

  .before {
    margin: 0;
    flex-shrink: 0;
  }

  .before img {
    width: 84px;
    height: 112px;
    object-fit: cover;
    border-radius: 8px;
  }

  .before figcaption {
    font-size: 10px;
    color: var(--t3);
    text-align: center;
    margin-top: 2px;
  }

  .reset {
    margin-top: 14px;
  }

  .empty {
    font-size: 13px;
    color: var(--t2);
    margin: 12px 0 0;
  }

  /* ---------- ④ 拍照提醒 ---------- */
  .shoot-strip {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 18px;
  }

  .shoot-ico {
    flex: none;
    font-size: 1.05rem;
    line-height: 1.5;
  }

  .shoot-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .shoot-lead {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--t2);
  }

  .shoot-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .shoot-chip {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--accent-bg);
    color: var(--accent);
    text-decoration: none;
  }
  .shoot-chip:hover {
    filter: brightness(1.06);
  }
  /* 完全没拍过的分区(盲区)比「照片过期」更急一点 */
  .shoot-chip.chip-blind {
    background: rgba(180, 83, 9, 0.12);
    color: #b45309;
  }

  /* ---------- ⑤ 更多洞察 ---------- */
  .insights-toggle {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 12px 6px;
    background: none;
    border: 0;
    border-top: 1px solid var(--border);
    color: var(--t2);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .insights-toggle:hover .insights-toggle-zh {
    color: var(--t1);
  }

  .insights-toggle-zh {
    flex: none;
    font-size: 13px;
    font-weight: 700;
    color: var(--t2);
  }

  .insights-toggle-hint {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--t4, var(--t3));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .insights-toggle-arrow {
    flex: none;
    font-size: 12px;
    color: var(--t3);
  }

  .insights {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .block {
    padding: 16px 18px;
  }

  .block-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--t3);
    margin: 0 0 12px;
    text-transform: uppercase;
  }

  .block-desc {
    font-size: 12px;
    color: var(--t3);
    margin: 10px 0 0;
    line-height: 1.5;
  }

  /* 折叠区里的杂乱榜:行不再各自描边,靠间距分开 */
  .clutter-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .clutter-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 4px;
  }
  .clutter-row + .clutter-row {
    border-top: 1px solid var(--border);
  }

  .clutter-worst .clutter-name {
    color: #b45309;
  }

  .clutter-score {
    min-width: 40px;
    text-align: center;
    font-family: var(--mono);
    font-size: 16px;
    font-weight: 700;
    color: var(--t3);
  }

  .clutter-score.score-mid {
    color: #b45309;
  }

  .clutter-score.score-high {
    color: #a3341f;
  }

  .clutter-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .clutter-name {
    font-size: 14px;
    font-weight: 650;
    color: var(--t1);
  }

  .clutter-blind {
    margin-left: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--t2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
    cursor: help;
  }

  .clutter-why {
    font-size: 12px;
    color: var(--t2);
  }

  .totals {
    display: flex;
    gap: 24px;
    margin-bottom: 14px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-num {
    font-size: 20px;
    font-weight: 700;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: 11px;
    color: var(--t3);
  }

  .zone-list,
  .issue-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .zone-row {
    display: grid;
    grid-template-columns: 5.5em 1fr auto;
    align-items: center;
    gap: 10px;
  }

  .zone-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--t1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar {
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--t4) 24%, transparent);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--accent);
  }

  .zone-num {
    font-size: 11px;
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }

  .issue {
    font-size: 13px;
    color: var(--t1);
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(180, 83, 9, 0.08);
  }

  .issue-urgent {
    background: rgba(163, 52, 31, 0.1);
  }

  .issue-hint {
    font-size: 11px;
    color: var(--t3);
  }

  .solve-btn,
  .apply-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 12px;
    color: var(--t1);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
  }

  .solve-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .solve-btn:hover:not(:disabled),
  .apply-btn:hover {
    border-color: var(--accent);
  }

  .proposal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    margin: 10px 0 8px;
  }

  .proposal {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--bg);
    border-radius: 12px;
  }

  .proposal-idle {
    opacity: 0.75;
  }

  .proposal-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .proposal-desc {
    font-size: 11px;
    color: var(--t3);
  }

  .proposal-none {
    margin: 0;
    font-size: 12px;
    color: var(--t3);
  }

  .proposal-delta {
    margin: 0;
    font-size: 12px;
    color: var(--t2);
  }

  .move-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .move-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
  }

  .move-name {
    font-weight: 600;
  }

  .move-how {
    color: var(--t3);
    text-align: right;
  }

  .move-heavy {
    color: #b45309;
    font-weight: 600;
  }

  /* 「不挪它」:锁定这件并立刻重算 —— 与「忽略整套方案」是两个粒度 */
  .move-lock-btn {
    flex-shrink: 0;
    font: inherit;
    font-size: var(--text-xs);
    padding: 2px 8px;
    color: var(--t3);
    background: none;
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
  }

  .move-lock-btn:hover:not(:disabled) {
    color: var(--t1);
    border-color: var(--t3);
  }

  .move-lock-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .locked-hint {
    margin: 0 0 8px;
    font-size: var(--text-sm);
    color: var(--t2);
  }

  /* 方案缩略平面图:虚线幽灵框 = 原位置,箭头 = 搬去哪。等比缩进卡片宽度 */
  .proposal-thumb {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg);
  }

  .proposal-thumb :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  /* 方案的诚实注脚:通过≠稳妥。脆弱余量 / 低置信度输入 / 关系缺口都要说出来 */
  .proposal-warn {
    margin: 0;
    padding: 6px 8px;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 8%, transparent);
    border-radius: 8px;
  }

  /* 家规没满足的取舍附言:比暂定弱一档,灰底不是黄底 —— 它不是「别信」,是「知情」 */
  .proposal-note {
    margin: 0;
    padding: 6px 8px;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--t2);
    background: color-mix(in srgb, var(--t4) 10%, transparent);
    border-radius: 8px;
  }

  .warn-list {
    margin: 4px 0 0;
    padding-left: 18px;
  }

  .warn-list li {
    margin-top: 2px;
  }

  .proposal-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: auto;
  }

  .apply-btn {
    align-self: flex-start;
    background: var(--card);
  }

  .reject-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    color: var(--t3);
    background: none;
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
  }

  .reject-btn:hover {
    color: var(--t1);
  }

  .insight-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
  }

  .insight {
    font-size: 13px;
    line-height: 1.5;
    color: var(--t2);
  }

  .insight b {
    color: var(--t1);
  }

  .insight-warn {
    color: var(--t1);
  }

  /* 组件 style 里不能用 @custom-media —— 会原样进产物被浏览器忽略,必须写字面量 */
  @media (max-width: 640px) {
    .tidy-layout {
      padding: 14px 12px 56px;
    }

    .tidy-main {
      gap: 18px;
    }

    /* hero 竖排:文字在上,定位图铺满宽度在下 */
    .hero {
      flex-direction: column;
      gap: 18px;
      padding: 22px 20px 20px;
    }

    .hero-title {
      font-size: 1.3rem;
    }

    .hero-map {
      width: 100%;
    }

    .hero-map-frame :global(svg) {
      max-height: 130px;
    }

    .hero-actions {
      flex-wrap: wrap;
      gap: 10px;
    }

    .hero-cta {
      flex: 1;
      justify-content: center;
    }

    .plan-card {
      padding: 18px 16px 20px;
    }

    .totals {
      gap: 16px;
    }

    /* 竖排且 reverse:定位小图和「整理前」照片走到步骤上方 ——
       先看清「去哪、长什么样」,再往下读要做什么。
       ⚠️ 这里是 .task-body 方向的唯一权威:别在别处再开一个断点改它,
       两个断点抢同一个属性,中间那段宽度就会是第三种行为。 */
    .task-body {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .task-aside {
      flex-direction: row;
      flex-wrap: wrap;
      width: 100%;
    }

    .mini-map {
      flex: 1;
      min-width: 160px;
      max-width: 260px;
    }

    .before img {
      width: 100%;
      height: 140px;
    }
  }
</style>
