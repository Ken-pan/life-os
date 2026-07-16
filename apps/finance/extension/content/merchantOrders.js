// 商家订单页定向抓取（Amazon / Target / Best Buy）→ merchant_orders envelope。
// 解析复用 vendor/ 里的 Web State DevTools adapter（注册在 window.__WSD_ADAPTERS__，
// 本脚本与 adapter 同属本扩展的隔离世界）。
//
// 两种触发：
// 1. 被动：用户自己浏览订单页时自动抓当前渲染出的订单。
// 2. 定向：popup「抓取最新订单」→ background 后台开订单页（Amazon 用 last30
//    过滤 URL）→ 本脚本抓到后回报 FOS_MERCHANT_ORDERS_CAPTURED，background 关页。
//
// 只抓列表页/详情页当前可见的订单（最新的在最上面），不做深度滚动 ——
// 「最新购买标注」只需要最近一两页；全量历史仍走 WST harvest 管线。

;(() => {
  const { extAlive, makeEnvelope, enqueue, captureWhenStable } = window.FOS ?? {}
  if (!window.FOS) {
    console.error('[FOS] common.js 未加载')
    return
  }

  const HOST_SOURCE = [
    [/(^|\.)amazon\.com$/i, 'amazon'],
    [/(^|\.)target\.com$/i, 'target'],
    [/(^|\.)bestbuy\.com$/i, 'bestbuy'],
  ]

  function currentSource() {
    const host = location.hostname
    for (const [re, source] of HOST_SOURCE) {
      if (re.test(host)) return source
    }
    return null
  }

  const source = currentSource()
  if (!source) return

  function findAdapter() {
    const adapters = window.__WSD_ADAPTERS__ ?? []
    return adapters.find((a) => {
      try {
        return a.site === source && a.matches(location.href)
      } catch {
        return false
      }
    })
  }

  /** adapter.run() → 有 orderId 的订单数组；解析不出返回 null。 */
  function probeOrders() {
    const adapter = findAdapter()
    if (!adapter) return null
    let result
    try {
      result = adapter.run()
    } catch (e) {
      console.debug('[FOS] 订单 adapter 解析失败（渲染中途容错）', e)
      return null
    }
    const items = (result?.items ?? []).filter((o) => o && o.orderId)
    return items.length > 0 ? items : null
  }

  let lastSig = null
  let lastOrderCount = 0

  async function captureOrders(orders) {
    lastOrderCount = orders.length
    await enqueue(
      makeEnvelope(source, 'merchant_orders', { merchant: source, orders }),
    )
    console.info(`[FOS] ${source} 订单已抓取：${orders.length} 单`)
    if (!extAlive()) return
    try {
      // 通知 background（定向抓取模式在等这个信号；被动模式没人听，忽略错误）
      await chrome.runtime.sendMessage({
        type: 'FOS_MERCHANT_ORDERS_CAPTURED',
        merchant: source,
        orders: orders.length,
      })
    } catch {
      /* 无人监听或扩展已重载 */
    }
  }

  captureWhenStable({
    probe: probeOrders,
    capture: (orders) => {
      const sig = JSON.stringify(
        orders.map((o) => [o.orderId, o.orderTotal, o.status]),
      )
      if (sig === lastSig) return
      lastSig = sig
      void captureOrders(orders)
    },
  })

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'FOS_MERCHANT_ORDERS_PROBE') {
      // background 定向抓取的兜底探询：当前解析到多少单、是否已入队。
      const orders = probeOrders()
      sendResponse({
        ok: true,
        merchant: source,
        visible: orders?.length ?? 0,
        captured: lastOrderCount,
      })
    }
    return false
  })
})()
