# Amazon Orders — Visible Page Adapter（Recipe）

> **状态**：设计备忘，未实现  
> **原则**：只读用户已登录、已可见的订单页 DOM；不绕过登录、CAPTCHA 或 hidden API。

---

## 数据来源优先级

| 优先级 | 路径 | 说明 |
|--------|------|------|
| 1 | [Amazon Request Your Data](https://www.amazon.com/gp/help/customer/display.html?nodeId=TP1zlemejtTn6pwYKS) | 官方个人数据导出，基线来源 |
| 2 | **amazon-orders adapter** | 官方字段不够细时，读可见订单列表/详情页 DOM |
| 3 | 手动 | 用户复制 / CSV |

**不做**：绕过登录、抓 hidden API、高频自动翻页、规避风控。

---

## 目标输出格式

```json
{
  "site": "amazon",
  "entity": "orders",
  "capturedAt": "2026-07-06T…",
  "items": [
    {
      "orderId": "123-4567890-1234567",
      "orderDate": "2026-06-15",
      "orderTotal": "$42.99",
      "status": "Delivered",
      "detailUrl": "https://www.amazon.com/gp/your-account/order-details?orderID=…",
      "items": [
        {
          "title": "Product name",
          "price": "$21.49",
          "quantity": 1,
          "detailUrl": "https://www.amazon.com/dp/…"
        }
      ]
    }
  ]
}
```

---

## Adapter 架构（与 generic snapshot 分离）

```
adapters/
  generic.js          ← 现有 content.js（任意页）
  amazon-orders.js    ← 仅匹配 amazon.* 订单相关 URL
```

触发方式：

1. 用户在 Amazon 订单页点击 **Capture** → generic snapshot 照常生成  
2. Popup 可选 **Run Amazon adapter** → 额外写入 `latest-snapshot.json` 的 `adapter` 字段  
3. 或 Cursor 调用 MCP：`get_latest_web_snapshot` 后由 Agent 解析 generic JSON；adapter 成熟后增加 `get_amazon_orders` tool

---

## 页面识别

| 页面 | URL 特征 | 提取目标 |
|------|----------|----------|
| 订单列表 | `/gp/your-account/order-history` 或 `/your-orders` | orderId、date、total、status、详情链接 |
| 订单详情 | `order-details?orderID=` | line items：title、price、qty |

选择器应写在 adapter 顶部常量区，**不要**写进 generic `content.js`。

---

## 安全与合规

- 默认 **localhost only**，snapshot 含订单信息时不在日志打印全文  
- 敏感输入已在 generic capture 中 `[redacted]`  
- 站点白名单：Amazon adapter 仅在用户显式启用时运行  
- 翻页导出（如 100 单）：低频、用户确认、只读可见页；建议单次上限 + 间隔

---

## MVP 验证步骤（adapter v0 实现后）

1. 登录 Amazon，打开订单历史页  
2. Capture → Send to localhost  
3. Cursor: `get_latest_web_snapshot`  
4. 检查 `adapter.items` 是否与页面可见订单一致  

---

## 与 Web State DevTools 主线的关系

Generic snapshot（headings / links / controls / domTree）**已足够**让 Cursor 理解订单页结构并辅助写 adapter。

Amazon adapter 是 **P1 站点插件**，不影响 Extension → Bridge → MCP 主链路。
