/**
 * 平面图的视角(缩放 + 平移),**跨页面共享的一份**。
 *
 * 在此之前,zoom/panX/panY 是 FloorPlanViewer 的组件内部 $state —— 每挂一个实例就
 * 是全新的一份。而平面图挂在两个页面上(/plan 和 /storage),于是:在储藏页缩放
 * 定位到某个柜子,切到平面页,又回到默认全图;切回来,还得再找一次。同一个家、同一
 * 张图,两套互不相通的视角。
 *
 * 这里把它提成一份。是模块级 $state 而不是 context —— 它要跨的正是「组件被销毁、
 * 换一个页面重新挂载」这件事,而 context 活不过路由切换。
 *
 * ## touched 是这里唯一不显然的东西
 *
 * FloorPlanViewer 会在挂载、容器 resize、以及每次重绘时自动 fit(把整张图缩到看得
 * 全)。自动 fit 直接写 zoom/panX/panY —— 所以光把状态提出来共享是不够的:视角是恢
 * 复了,下一帧就被 fit 冲掉,人还是回到全图。
 *
 * 所以要分清两种视角,它们的期望完全相反:
 *   - **自动 fit 摆出来的**:没人要求过,随便覆盖 —— 换个容器就该重新 fit;
 *   - **用户自己捏出来的**:他正盯着那个柜子看,谁也不许动。
 *
 * touched 就是这条界线:用户一旦捏合/拖动过,它变 true,自动 fit 从此让路;点「看
 * 全图」「铺满宽」是显式请求,把它清回 false,自动 fit 重新接管。
 */

/**
 * @typedef {object} PlanView
 * @property {number} zoom
 * @property {number} panX
 * @property {number} panY
 * @property {'contain' | 'width'} fitMode
 * @property {boolean} touched 用户是否亲手调过视角 —— true 时自动 fit 不许覆盖
 */

/** @type {PlanView} */
const view = $state({
  zoom: 1,
  panX: 0,
  panY: 0,
  fitMode: 'contain',
  touched: false,
})

/** 读这份共享视角。返回的是 $state 代理本身,直接改属性即可。 */
export function getPlanView() {
  return view
}

/** 用户亲手调了视角 —— 从现在起自动 fit 不要再覆盖它。 */
export function markPlanViewTouched() {
  view.touched = true
}

/**
 * 交回给自动 fit(「看全图」/「铺满宽」这类显式请求)。
 * @param {'contain' | 'width'} [mode]
 */
export function releasePlanView(mode) {
  if (mode) view.fitMode = mode
  view.touched = false
}
