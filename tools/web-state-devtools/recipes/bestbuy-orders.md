# Best Buy Purchase History — Structure-Based Recipe

> **状态**：基于 Web State DevTools capture（2026-07-06）  
> **列表页**：`https://www.bestbuy.com/purchasehistory/purchases`

## 页面结构（来自 extension capture）

| 区域 | `data-testid` / selector | 用途 |
|------|--------------------------|------|
| 订单列表根 | `OrderList-TestID` | 限定抓取范围 |
| 虚拟列表 | `virtuoso-item-list` | Virtuoso 渲染，需滚动 + Load More |
| 订单卡片 | `order-item` | 每笔订单容器 |
| 字段标签 | `OrderItemHeader` | 顺序 label/value（Order placed → 日期 → Total → 金额 → …） |
| 状态标题 | `OrderStatusTitle-None-TestID` | Delivered / Purchased in Store |
| 状态日期 | `OrderStatusDescription-None-TestID` | 送达/购买日期 |
| 查看详情 | `order-item > div:nth-of-type(1) > div:nth-of-type(2) > button` | 点击进入详情（非 `<a>`） |
| 加载更多 | `OrderList-LoadMore-TestID` | 分页，优先点击而非盲滚 |
| 年份筛选 | `YearDate-Filter-TestID-select-select-button` | 默认 Past 3 Years |
| 状态筛选 | `OrderStatus-Filter-TestID-select-select-button` | 默认 In progress and complete |

## 详情页

- **URL 模式**：`/profile/ss/orders/order-details/{orderId}/view`  
  ❌ 错误：`/profile/ss/orders/{orderId}` → 404
- **商品行**：`.order-details-page a[id^="line-item-header-"]`（含 title + `/site/` 链接）
- **容器**：`.order-details-page` — 必须限定 scope，避免抓到 footer/nav 推荐

## 退货 / 退款识别

| 信号 | 位置 | Finance 映射 |
|------|------|--------------|
| `Returned` | `OrderStatusTitle-None-TestID` | `returnInfo.status = returned`，`eventDate` ← status 描述行 |
| `Canceled` | 同上 | `returnInfo.status = cancelled` |
| `Delivered` / `Purchased in Store` | 同上 | 无 `returnInfo` |
| 卡上负向 Best Buy 流水 | Supabase | `returnInfo.isRefundCredit = true`，`relatedTxnId` ↔ 原购买 txn |

示例（已导出）：`BBY01-807146090954` — Returned，$287.42，2026-02-15  
关联脚本：`apps/finance/scripts/link-purchase-orders.mjs --source bestbuy`

## 商品图片

| 位置 | selector | 字段 |
|------|----------|------|
| 详情页 line item 行 | `img[src*="bbystatic.com"]` | `lineItems[].imageUrl` |
| 商品链接 | `a[id^="line-item-header-"]` | title + `/product/` detailUrl |

列表页通常无缩略图；harvest `follow` 进详情页补齐。  
写入 Supabase：`link-purchase-orders.mjs --apply --upload-images`（需 `SUPABASE_SERVICE_ROLE_KEY`）→ bucket `finance-purchase-images`。

## Harvest 流程

1. 打开列表页，等待 `[data-testid="order-item"]`
2. 循环：capture → merge → 点击 `OrderList-LoadMore-TestID`（若可见）→ 滚动 virtuoso / window
3. 过滤过去 365 天
4. 对缺 lineItems 的订单：`navigate` 到 `order-details/{id}/view` 或点击 View order details
5. 导出 raw + redacted JSON/CSV

## 运行

```bash
cd tools/web-state-devtools/bridge
WEB_STATE_ALLOW_BESTBUY=1 node scripts/bestbuy-harvest-past-year.mjs
```
