# Amazon Your Orders — Structure-Based Recipe

> **状态**：基于 Web State DevTools capture（2026-07-06）  
> **列表页**：`https://www.amazon.com/your-orders/orders?timeFilter=year-{year}`

## 页面结构（来自 extension capture）

| 区域 | selector | 用途 |
|------|----------|------|
| 订单卡片 | `.order-card.js-order-card` | **每笔订单唯一容器** — 必须在此 scope 内解析 |
| 订单头 | `.order-header` | Order placed / Total / Ship to / Order # |
| 配送块 | `.delivery-box` | 商品缩略图 + 状态；**line items 只从此处取** |
| 详情链接 | `a[href*="order-details"][href*="orderID="]` | View order details |
| 商品链接 | `.delivery-box a[href*="/dp/"][href*="fed_asin_title"]` | 列表页可见商品 |
| 商品图 | 同行 `img` — 优先 `data-a-hires`，其次 `data-src`/`src`；CDN 统一升到 `._SL500_.` | Finance OS 缩略图 |
| 分页 | `ul.a-pagination` + `startIndex` query | recipe 用 `startIndex` 步进 10 |

## 商品图片（最佳实践）

Amazon 2024 起订单 HTML 有客户端解密，**必须在浏览器 DOM 里读**（本扩展已满足）。参考社区做法（如 amazon-orders 库、`item-view-left-col-inner img`）：

1. 在同一商品行/缩略图列找 `img`
2. URL 优先级：`data-a-hires` > `data-src` > `currentSrc` > `src`
3. 过滤 nav sprite / pixel / logo
4. 缩略图 `_SS130_` / `_SX###_` 替换为 `._SL500_.` 供 Finance UI 显示
5. 存入 `lineItems[].imageUrl`，经 `purchase_enrichment` JSON 写入 Supabase

**注意**：Amazon CDN 外链需 `<img referrerPolicy="no-referrer">`；隐私模式下 Finance 不渲染图片。

## 常见错误（v2 已修复）

| 问题 | 原因 | 修复 |
|------|------|------|
| 每单都出现 6 个相同商品 | 在 `section` 级别扫 `/dp/` 链接 | 限定 `.delivery-box` |
| 状态全是 Cancelled | `section` 级 status 串单 | 只在 card / delivery-box 内取 status |
| 金额误匹配 | 全局 `[aria-label*="Total"]` | 只从 `.order-header` 解析 `Total $X.XX` |

## 详情页

- **URL**：`/your-orders/order-details?orderID={id}`
- **根容器**：`#orderDetails`（商品链接必须在此内）
- **商品链接**：`#orderDetails a[href*="fed_asin_title"]`（`hzod_title_dt_b_fed_asin_title` ref）
- **总额**：`#od-subtotals` → `Grand Total: $X.XX`
- **数量**：行内 `Qty: N`；或缩略图角标数字（列表 `.delivery-box li`、详情 `#orderDetails` 双列布局）；兜底用 `Subtotal ÷ unitPrice` 推算
- **例外**：已取消/无 Total 的订单，详情页可能无商品块 — 以列表页 `.delivery-box` 为准

## 退货 / 退款识别

| 信号 | 位置 | Finance 映射 |
|------|------|--------------|
| `Return window closed on …` | delivery-box 文案 | **忽略**（退货资格，非已退货） |
| `Return complete` / `Refund issued` | delivery-box status 或详情 status | `returnInfo.status = returned/refunded` |
| `Refund Total: $X.XX` | 详情 `#od-subtotals` | `returnInfo.refundAmount` |
| `Cancelled` | delivery-box status | `returnInfo.status = cancelled` |
| 卡上负向 Amazon 流水 | Supabase `finance_transactions` | `returnInfo.isRefundCredit = true`，并 `relatedOrderId` ↔ 原购买 |

Adapter 输出字段：`returnInfo: { status, label, eventDate, refundAmount }`  
关联脚本：`apps/finance/scripts/link-purchase-orders.mjs --source amazon`

## Supabase 缩略图

关联时加 `--upload-images`（默认随 `--apply` 开启）：从 `lineItems[].imageUrl` 拉取 `_SL96_` 小图，写入 Storage bucket `finance-purchase-images`，并把 `imageUrl` 换成公开 URL、`imageStoragePath` 存路径。

```bash
SUPABASE_SERVICE_ROLE_KEY=... node apps/finance/scripts/link-purchase-orders.mjs --source amazon --apply --replace
```

## Harvest 流程

1. 打开 `timeFilter=year-{year}` 列表
2. 等待 `.order-card.js-order-card` + 价格
3. 分页 `startIndex=0,10,20…` capture + merge
4. 对缺 lineItems / 多商品订单：`follow` 进 detailUrl
5. 导出 `bridge/data/amazon-export/`

## 运行

```bash
cd tools/web-state-devtools/bridge
WEB_STATE_ALLOW_AMAZON=1 node scripts/run-recipe.mjs amazon-orders
WEB_STATE_ALLOW_AMAZON=1 node scripts/verify-amazon-sample.mjs
```
